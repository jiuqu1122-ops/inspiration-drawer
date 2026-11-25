import { describe, expect, it, vi } from 'vitest';
import * as bundled from './runtime/entry';
import { invoke } from '@tauri-apps/api/core';
import { assertRhinoScriptPreflight, buildRhinoWorkflowInstruction, ensureRhinoRuntimeLoaded, guardRhinoGeometryStageScript, rhinoRuntimeStatus, validateRhinoRuntimeModule } from './rhinoRuntime';
import { RhinoNativeScriptPreflightError } from './rhinoArgumentRecovery';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => path }));

describe('independent Rhino runtime contract and bundled fallback', () => {
  it('rejects incompatible/incomplete modules before exposing their functions', () => {
    expect(() => validateRhinoRuntimeModule(bundled)).not.toThrow();
    expect(() => validateRhinoRuntimeModule({ ...bundled, apiVersion: 2 })).toThrow('incompatible');
    expect(() => validateRhinoRuntimeModule({ ...bundled, guardRhinoGhScript: undefined })).toThrow('incompatible');
    expect(() => validateRhinoRuntimeModule({ ...bundled, inspectRhinoScript: vi.fn(() => null) })).toThrow('self-check');
  });
  it('retains host error identities and the corrected enum preflight', () => {
    expect(() => assertRhinoScriptPreflight('rhino_native_run_python', { script: 'import Rhino.Geometry as rg\ncap=rg.PipeCapMode.None' })).toThrow(RhinoNativeScriptPreflightError);
    expect(() => assertRhinoScriptPreflight('rhino_native_run_python', { script: 'import Rhino.Geometry as rg\ncap=rg.PipeCapMode.NONE' })).not.toThrow();
    expect(() => assertRhinoScriptPreflight('rhino_native_run_python', { script: 'import Rhino.Geometry as rg\ncap=rg.PipeCapMode.ROUND' })).toThrow(/PipeCapMode\.Round/);
    expect(buildRhinoWorkflowInstruction()).toContain('PipeCapMode.NONE');
    expect(guardRhinoGeometryStageScript('stage=DrawerGeometryStage()')).toContain('<drawer-geometry-stage>');
  });
  it('retains the host enum checks when an older cached runtime lacks them', async () => {
    const oldRuntime = Object.keys(bundled).map(name => `export const ${name} = ${name === 'apiVersion' ? '1' : '() => []'};`).join('\n');
    vi.mocked(invoke).mockResolvedValueOnce({ path: `data:text/javascript,${encodeURIComponent(oldRuntime)}`, version: 'cached-fixture', sha256: '' });
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    try {
      await ensureRhinoRuntimeLoaded();
      expect(rhinoRuntimeStatus().version).toBe('cached-fixture');
      expect(() => assertRhinoScriptPreflight('rhino_native_run_python', { script: 'import Rhino.Geometry as rg\ncap=rg.PipeCapMode.ROUND' })).toThrow(/PipeCapMode\.Round/);
    } finally { vi.unstubAllGlobals(); }
  });
});
