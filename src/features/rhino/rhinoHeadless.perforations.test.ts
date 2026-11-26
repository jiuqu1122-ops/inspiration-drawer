import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { executeHeadlessRhinoTool, getHeadlessRhinoTools, prepareBackgroundRhinoTurn, RHINO_HEADLESS_BUILD_TOOL } from './rhinoHeadless';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const rpc = vi.mocked(invoke);
const releases: (() => void)[] = [];
const extrude = { operation: 'extrude', points: [[0,0,0],[125,0,0],[125,62,0],[0,62,0]], vector: [0,0,0.5] };
const plate = { ...extrude, perforations: { rows: 20, columns: 40, firstCenter: [2,2], pitch: [3,3], radii: [0.8,0.6], oddRowOffset: 1.5 } };
async function bind(id: string, capabilities: unknown) {
  rpc.mockResolvedValueOnce({ capabilities });
  releases.push((await prepareBackgroundRhinoTurn(id, 'canvas')).release);
}
function send(id: string, args: Record<string, unknown>) { return executeHeadlessRhinoTool(id, 'canvas', RHINO_HEADLESS_BUILD_TOOL, args); }
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ committed: true });
  vi.stubGlobal('localStorage', { getItem: () => '00000000-0000-0000-0000-000000000001' });
});
afterEach(() => { while (releases.length) releases.pop()!(); vi.unstubAllGlobals(); });

describe('optional extrude perforations', () => {
  it('requires an own exact true flag on this turn; no fallback to a solid plate', async () => {
    for (const cap of [undefined, null, [], {}, { other: true }, { planarPerforations: false }, { planarPerforations: 'true' }, { planarPerforations: 1 }, Object.create({ planarPerforations: true })]) {
      await bind('old', cap);
      const count = rpc.mock.calls.length;
      for (const value of [plate.perforations, {}, null])
        await expect(send('old', { ...extrude, perforations: value })).rejects.toMatchObject({ dispatched: false });
      expect(rpc.mock.calls.length).toBe(count);
      await send('old', extrude);
      expect(rpc).toHaveBeenLastCalledWith('rhino_headless_mcp_call', expect.objectContaining({ tool: 'build', arguments: extrude }));
    }
  });
  it('sends one exact build for 800 holes only to the capable session', async () => {
    await bind('enabled', { planarPerforations: true }); await bind('other', {});
    await expect(send('other', plate)).rejects.toMatchObject({ dispatched: false });
    await expect(send('enabled', plate)).resolves.toEqual({ committed: true });
    expect(rpc.mock.calls.filter(([,p]) => (p as {tool:string}).tool === 'build')).toHaveLength(1);
    expect(rpc).toHaveBeenLastCalledWith('rhino_headless_mcp_call', expect.objectContaining({ conversationId: 'enabled', arguments: plate }));
  });
  it('advertises an optional bounded schema', () => {
    const tool = getHeadlessRhinoTools().find(t => t.function.name === RHINO_HEADLESS_BUILD_TOOL)!;
    expect(tool.function.parameters).toMatchObject({ required:['operation'], properties: { perforations: {
      additionalProperties:false, required:['rows','columns','firstCenter','pitch','radii'], properties: {
        rows:{type:'integer',maximum:800}, columns:{type:'integer',maximum:800}, radii:{minItems:2,maxItems:2},
      },
    } } });
  });
});
