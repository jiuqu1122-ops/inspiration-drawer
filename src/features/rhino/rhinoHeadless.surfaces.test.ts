import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { executeHeadlessRhinoTool, getHeadlessRhinoTools, prepareBackgroundRhinoTurn, RHINO_HEADLESS_BUILD_TOOL } from './rhinoHeadless';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
const rpc = vi.mocked(invoke);
const release: Array<() => void> = [];
const smooth = { operation: 'loft', profileCurve: 'smooth' };
const probes = { operation: 'difference', removedMaterialPoints: [[1, 2, 3]] };
const send = (conversation: string, args: Record<string, unknown>) => executeHeadlessRhinoTool(conversation, 'canvas', RHINO_HEADLESS_BUILD_TOOL, args);
async function prepare(id: string, context: Record<string, unknown>, major: 8 | 9) {
  rpc.mockResolvedValueOnce({ rhinoVersion: `${major}.0`, ...context });
  const turn = await prepareBackgroundRhinoTurn(id, 'canvas', major);
  release.push(turn.release);
  expect(rpc).toHaveBeenLastCalledWith('rhino_headless_mcp_call', expect.objectContaining({ conversationId: id, tool: 'context', requestedMajor: major }));
}
beforeEach(() => {
  rpc.mockReset().mockResolvedValue({ committed: true });
  vi.stubGlobal('localStorage', { getItem: () => '00000000-0000-0000-0000-000000000001' });
});
afterEach(() => { while (release.length) release.pop()!(); vi.unstubAllGlobals(); });

describe('headless surface capabilities', () => {
  it.each([{}, { capabilities: null }, { capabilities: ['smoothLoftProfiles'] },
    { capabilities: { smoothLoftProfiles: 'true', removedMaterialPoints: 1 } }])('rejects missing/malformed flags without sending a build: %j', async context => {
    await prepare('old', context, 9);
    for (const args of [smooth, probes, { operation: 'loft', profileCurve: 'polyline' }, { operation: 'box', removedMaterialPoints: null }]) {
      await expect(send('old', args)).rejects.toMatchObject({ dispatched: false });
    }
    expect(rpc).toHaveBeenCalledTimes(1);
    for (const operation of ['loft', 'difference']) await expect(send('old', { operation })).resolves.toEqual({ committed: true });
    expect(rpc).toHaveBeenCalledTimes(3);
  });
  it('checks each bit on the selected session, not the Rhino major, and refreshes it on re-prepare', async () => {
    await prepare('a', { capabilities: { smoothLoftProfiles: true } }, 8);
    await prepare('b', { capabilities: { removedMaterialPoints: true } }, 9);
    await expect(send('a', probes)).rejects.toMatchObject({ dispatched: false });
    await expect(send('b', smooth)).rejects.toMatchObject({ dispatched: false });
    for (const [id, args] of [['a', smooth], ['b', probes]] as const) {
      await send(id, args);
      expect(rpc).toHaveBeenLastCalledWith('rhino_headless_mcp_call', { conversationId: id, workspaceId: expect.any(String), tool: 'build', arguments: args });
    }
    await prepare('a', {}, 8);
    await expect(send('a', smooth)).rejects.toMatchObject({ dispatched: false });
    expect(rpc).toHaveBeenCalledTimes(5);
  });
  it('requires a separate preserveIds capability and never manufactures a materialRemoval receipt', async () => {
    const args = { ...probes, preserveIds: ['part'] };
    await prepare('cut', { capabilities: { removedMaterialPoints: true } }, 9);
    await expect(send('cut', args)).rejects.toMatchObject({ dispatched: false, message: expect.stringContaining('preserveIds') });
    expect(rpc).toHaveBeenCalledTimes(1);
    await prepare('keep', { capabilities: { preserveIds: true } }, 8);
    await expect(send('keep', args)).rejects.toMatchObject({ dispatched: false, message: expect.stringContaining('removedMaterialPoints') });
    await expect(send('keep', { operation: 'difference', preserveIds: ['part'] })).resolves.toEqual({ committed: true });
    await prepare('both', { capabilities: { removedMaterialPoints: true, preserveIds: true } }, 8);
    const receipt = { committed: true, materialRemoval: { status: 'passed', witnessCount: 1, targetId: 'target', resultIds: ['result'], preservedIds: ['part'] } };
    rpc.mockResolvedValueOnce(receipt);
    await expect(send('both', args)).resolves.toBe(receipt);
    expect(rpc).toHaveBeenLastCalledWith('rhino_headless_mcp_call', expect.objectContaining({ tool: 'build', arguments: args }));
  });
  it('publishes bounded opt-in arguments without changing required arguments', () => {
    const build = getHeadlessRhinoTools().find(t => t.function.name === RHINO_HEADLESS_BUILD_TOOL)!;
    expect(build.function.parameters).toMatchObject({ required: ['operation'], properties: {
      profileCurve: { enum: ['polyline', 'smooth'] },
      sections: { minItems: 2, maxItems: 12, items: { maxItems: 80 } },
      preserveIds: { minItems: 1, maxItems: 16, uniqueItems: true },
      removedMaterialPoints: { minItems: 1, maxItems: 32, items: { minItems: 3, maxItems: 3 } },
    } });
  });
});
