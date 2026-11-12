import { describe, expect, it } from 'vitest';
import { assertRhinoCanvas, getRhinoNativeTool, getRhinoNativeTools, isRhinoCanvasLocked, isRhinoNativeTool, isRhinoReadTool, lockRhinoCanvas, registerRhinoNativeTools, RhinoCommandLedger, validateRhinoConnection } from './rhinoProtocol';
const valid = { protocol: 1, url: 'http://127.0.0.1:15000/', token: 'a'.repeat(64), instanceId: 'b'.repeat(32) };
describe('Rhino Beta protocol', () => {
  it('accepts only an authenticated numeric loopback endpoint', () => {
    expect(validateRhinoConnection(valid)).toEqual(valid);
    for (const url of ['https://example.org/', 'http://127.0.0.1.evil:15000/', 'http://127.0.0.1:15000/mcp', 'http://user@127.0.0.1:15000/', 'http://localhost:15000/', 'file:///C:/token']) {
      expect(() => validateRhinoConnection({ ...valid, url })).toThrow();
    }
    expect(() => validateRhinoConnection({ ...valid, token: 'short' })).toThrow();
    expect(() => validateRhinoConnection({ ...valid, protocol: 2 })).toThrow();
  });
  it('never claims the same command twice or an invalid command ID', () => {
    const ledger = new RhinoCommandLedger();
    expect(ledger.claim('request-123')).toBe(true);
    expect(ledger.claim('request-123')).toBe(false);
    expect(ledger.claim('../request')).toBe(false);
  });
  it('rejects a changed canvas and keeps the canvas locked until all runs finish', () => {
    const binding = { connection: valid, documentId: 12, canvasId: 'original' };
    expect(() => assertRhinoCanvas(binding, 'original')).not.toThrow();
    expect(() => assertRhinoCanvas(binding, 'changed')).toThrow('画布已切换');
    const first = lockRhinoCanvas('one'), second = lockRhinoCanvas('two');
    first(); expect(isRhinoCanvasLocked()).toBe(true);
    second(); expect(isRhinoCanvasLocked()).toBe(false);
  });
  it('registers native MCP tools per conversation and keeps them separate from read-only tools', () => {
    registerRhinoNativeTools('native-conversation', [{
      name: 'rhino_native_run_command', description: 'Run Rhino command', inputSchema: { type: 'object' }, readOnly: false, destructive: true,
    }, {
      name: 'rhino_native_get_context', description: 'Get Rhino context', inputSchema: { type: 'object' }, readOnly: true, destructive: false,
    }]);
    expect(getRhinoNativeTools('native-conversation')).toHaveLength(2);
    expect(isRhinoNativeTool('rhino_native_run_command', 'native-conversation')).toBe(true);
    expect(getRhinoNativeTool('rhino_native_run_command', 'native-conversation')?.destructive).toBe(true);
    expect(isRhinoNativeTool('rhino_native_run_command', 'other-conversation')).toBe(false);
    registerRhinoNativeTools('native-conversation', []);
  });
  it('never exposes arbitrary Rhino writes through the read-tool gate', () => {
    expect(isRhinoReadTool('rhino_list_objects')).toBe(true);
    expect(isRhinoReadTool('rhino_list_parts')).toBe(true);
    for (const name of ['rhino_run_python', 'rhino_delete_objects', 'rhino_capture_viewport', 'rhino_unknown']) expect(isRhinoReadTool(name)).toBe(false);
  });
});
