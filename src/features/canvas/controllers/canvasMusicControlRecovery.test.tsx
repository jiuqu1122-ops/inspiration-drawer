import type { ComponentProps, ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { CanvasNode } from '../components/CanvasNode';
import { CanvasMusicNode } from '../../canvasMusic';
import type { CanvasAiItemData, CanvasImageItem } from '../../canvasModel';
import { cloneCanvasAiGeneratorForRerunImpl, generateCanvasAiGeneratorNodeImpl, runCanvasAiGeneratorNodeImpl, runCanvasAiGeneratorTargetImpl } from './canvasGenerationActions';
import { handleCanvasAiRunClickImpl, runCanvasAiNodeFromControlImpl } from '../../snip/windowSnipActions';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), convertFileSrc: (path: string) => `asset://${path}` }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn() }));
vi.mock('../../drawerPrefs', () => ({ MIN_DRAWER_WIDTH: 880, MAX_DRAWER_WIDTH: 1920, MIN_DRAWER_HEIGHT: 560, MAX_DRAWER_HEIGHT: 1080 }));
beforeEach(() => {
  vi.mocked(invoke).mockReset();
  vi.stubGlobal('window', { setTimeout, clearTimeout, performance: { now: () => 0 } });
  vi.stubGlobal('localStorage', { getItem: () => null });
});
afterEach(() => vi.unstubAllGlobals());

const receipt = 'pending-music-request';
const oldUrl = 'https://audio.example.test/previous.mp3';
const newUrls = ['https://audio.example.test/restored-1.mp3', 'https://audio.example.test/restored-2.mp3'];

function controlScenario() {
  const target: CanvasImageItem = { id: 'music-node', x: 0, y: 0, width: 400, height: 320,
    item: { id: 'music-asset', type: 'text', content: '', createdAt: 1 },
    ai: { type: 'music-generator', model: 'suno', prompt: 'Ambient piano', status: 'recovery', musicClientRequestId: receipt,
      musicChargedCredits: '12', outputs: [{ id: 'old-track', status: 'success', assetType: 'audio', url: oldUrl }] } };
  const ref = { current: [target] };
  const tokens = { current: new Map<string, string>() };
  const sessions = { current: new Map<string, CanvasImageItem[]>() };
  const activeCanvasIdRef = { current: 'canvas' };
  const pending: Promise<void>[] = [];
  const update = (_canvas: string, id: string, patch: Partial<CanvasAiItemData>) => {
    const node = ref.current.find(item => item.id === id);
    if (node?.ai) node.ai = { ...node.ai, ...patch };
    return node;
  };
  const runTargetContext = { canvasItemsRef: ref } as Parameters<typeof runCanvasAiGeneratorTargetImpl>[0];
  const runNode = (id: string) => runCanvasAiGeneratorNodeImpl({
    activeCanvasIdRef, canvasItemsRef: ref, canvasAiRunTokensRef: tokens,
    canvasSessionItemsRef: sessions, getCanvasSessionItems: () => ref.current,
    isCanvasModeRef: { current: true }, commitCanvasAiPromptDraft: vi.fn(),
    markCanvasRunNodeActive: vi.fn(), markCanvasRunNodeSettled: vi.fn(),
    updateCanvasAiGeneratorDataForCanvas: update, updateCanvasSelection: vi.fn(),
    waitForCanvasBackgroundPatches: async () => {}, showToast: vi.fn(),
    runCanvasAiGeneratorTarget: (node, options) => runCanvasAiGeneratorTargetImpl(runTargetContext, node, options),
  }, id);
  const append = vi.fn((items: CanvasImageItem[]) => { ref.current = [...ref.current, ...items]; return items.length; });
  const clone = vi.fn((source: CanvasImageItem) => cloneCanvasAiGeneratorForRerunImpl({
    createAssetId: () => 'new-music-asset-test-id', makeCanvasNodeId: () => 'new-music-node',
    getCanvasAiRerunNodePosition: item => ({ x: item.x + item.width + 64, y: item.y }),
  }, source));
  const generate = (id: string) => generateCanvasAiGeneratorNodeImpl({
    activeCanvasIdRef, canvasItemsRef: ref, canvasAiRunTokensRef: tokens,
    appendCanvasItems: append, cloneCanvasAiGeneratorForRerun: clone,
    commitCanvasAiPromptDraft: vi.fn(), runCanvasAiGeneratorNode: runNode,
    runCanvasEnhancementNode: vi.fn(), runCanvasExpandedWorkflowFromNode: vi.fn(),
    runCanvasFrameInterpolationNode: vi.fn(), runCanvasTextAgentNode: vi.fn(), showToast: vi.fn(),
  }, id);
  const control = {
    canvasRunButtonPointerRef: { current: null as { targetId: string; at: number } | null },
    runCanvasAiNodeFromControl: (id: string) => runCanvasAiNodeFromControlImpl({
      canvasItemsRef: ref, generateCanvasWorkflowModuleNode: vi.fn(),
      generateCanvasAiGeneratorNode: id => { const promise = generate(id); pending.push(promise); return promise; },
    }, id),
  };
  const node = () => CanvasNode({ canvasItem: target, canvasItemsRef: ref, scope: {
    canvasItemsRef: ref, canvasAiCloudImageModels: { catalog: [{ id: 'suno', displayName: 'Suno', modality: 'audio' }] },
    handleCanvasAiRunClick: (event: Parameters<typeof handleCanvasAiRunClickImpl>[1], id: string) => handleCanvasAiRunClickImpl(control, event, id),
  } }) as ReactElement<ComponentProps<typeof CanvasMusicNode>>;
  const click = async () => {
    node().props.onRun({ preventDefault: vi.fn(), stopPropagation: vi.fn(), currentTarget: { disabled: false } } as unknown as Parameters<ComponentProps<typeof CanvasMusicNode>['onRun']>[0]);
    await Promise.all(pending.splice(0));
  };
  return { target, ref, tokens, append, clone, click, html: () => renderToStaticMarkup(node()) };
}

it.each(['recovery', 'error'] as const)('recovers the existing %s music node through its actual control without cloning or resubmitting', async status => {
  const scenario = controlScenario();
  scenario.target.ai!.status = status;
  vi.mocked(invoke).mockResolvedValue({ audioUrls: newUrls, chargedCredits: '50' });
  expect(scenario.html()).toContain('恢复结果');
  await scenario.click();
  expect(scenario.ref.current).toEqual([scenario.target]);
  expect(scenario.clone).not.toHaveBeenCalled();
  expect(scenario.append).not.toHaveBeenCalled();
  expect(invoke).toHaveBeenCalledExactlyOnceWith('get_cloud_music_generation_by_request', { clientRequestId: receipt });
  expect(scenario.target.ai).toMatchObject({ status: 'success', musicClientRequestId: undefined, musicChargedCredits: '50' });
  expect(scenario.target.ai?.outputs?.map(output => output.url)).toEqual(newUrls);
  expect(scenario.html()).toContain('2 首已完成');
  expect(scenario.tokens.current.size).toBe(0);
});

it.each(['processing', 'not_found'])('keeps the same node and receipt after %s, then restores it on another actual click', async outcome => {
  const scenario = controlScenario();
  if (outcome === 'not_found') vi.mocked(invoke).mockRejectedValueOnce(new Error('not_found: Music request not found'));
  else vi.mocked(invoke).mockResolvedValueOnce({ status: 'processing' });
  await scenario.click();
  expect(scenario.ref.current).toEqual([scenario.target]);
  expect(scenario.target.ai).toMatchObject({ status: 'recovery', musicClientRequestId: receipt, musicChargedCredits: '12' });
  expect(scenario.target.ai?.outputs?.[0].url).toBe(oldUrl);
  expect(scenario.html()).toContain('结果待确认');
  vi.mocked(invoke).mockResolvedValueOnce({ audioUrls: newUrls, chargedCredits: '50' });
  await scenario.click();
  expect(scenario.ref.current).toHaveLength(1);
  expect(scenario.target.ai?.outputs?.map(output => output.url)).toEqual(newUrls);
  expect(scenario.clone).not.toHaveBeenCalled();
  expect(scenario.append).not.toHaveBeenCalled();
  expect(vi.mocked(invoke).mock.calls).toEqual([
    ['get_cloud_music_generation_by_request', { clientRequestId: receipt }],
    ['get_cloud_music_generation_by_request', { clientRequestId: receipt }],
  ]);
});

it('retains the existing clone contract when a completed music node generates again', async () => {
  const scenario = controlScenario();
  scenario.target.ai = { ...scenario.target.ai!, status: 'success', musicClientRequestId: undefined };
  vi.mocked(invoke).mockResolvedValue({ audioUrls: newUrls, chargedCredits: '50' });
  expect(scenario.html()).toContain('再次生成');
  await scenario.click();
  expect(scenario.clone).toHaveBeenCalledOnce();
  expect(scenario.append).toHaveBeenCalledOnce();
  expect(scenario.ref.current).toHaveLength(2);
  expect(scenario.target.ai?.outputs?.[0].url).toBe(oldUrl);
  expect(scenario.ref.current[1].ai?.outputs?.map(output => output.url)).toEqual(newUrls);
  const calls = vi.mocked(invoke).mock.calls;
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe('generate_cloud_music');
  expect(calls[0][1]).toMatchObject({ request: { model: 'suno', prompt: 'Ambient piano' } });
  expect((calls[0][1] as { request: { clientRequestId: string } }).request.clientRequestId).not.toBe(receipt);
  expect(scenario.tokens.current.size).toBe(0);
});
