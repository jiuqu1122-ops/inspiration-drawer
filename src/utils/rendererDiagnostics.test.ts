import { afterEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { beginWorkflowDiagnostic, diagnosticErrorName, recordCanvasZoomDiagnostic, shouldPromoteCanvasZoomLayer } from './rendererDiagnostics';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke: vi.fn(() => Promise.resolve()) }));
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });

it('records safe context and permits reverting canvas layer promotion without logging payloads', () => {
  vi.stubGlobal('document', { visibilityState: 'visible' });
  vi.stubGlobal('localStorage', { getItem: () => 'true' });
  expect(shouldPromoteCanvasZoomLayer()).toBe(true);
  const finish = beginWorkflowDiagnostic('run-123');
  recordCanvasZoomDiagnostic();
  finish();
  const calls = vi.mocked(invoke).mock.calls.map(call => call[1]);
  expect(calls[0]).toMatchObject({ sample: { workflowRunIds: ['run-123'], event: 'workflow_start' } });
  expect(calls[calls.length - 1]).toMatchObject({ sample: { workflowRunIds: [], event: 'workflow_end' } });
  const sensitive = { name: 'secret prompt/token/full-user-path', message: 'private content' };
  expect(diagnosticErrorName(sensitive)).toBe('OtherError');
  expect(diagnosticErrorName(new TypeError('private content'))).toBe('TypeError');
  expect(diagnosticErrorName({ get name() { throw new Error('private content'); } })).toBe('OtherError');
  expect(JSON.stringify(calls)).not.toContain('private');
  vi.stubGlobal('localStorage', { getItem: () => null });
  expect(shouldPromoteCanvasZoomLayer()).toBe(false);
});
