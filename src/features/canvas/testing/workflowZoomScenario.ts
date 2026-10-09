import type { CanvasAiGeneratedOutput, CanvasImageItem } from '../../canvasModel';
import type { CanvasWorkflowTemplate } from '../../canvasTemplates';
import { runCanvasWorkflowModuleNodeImpl } from '../controllers/canvasWorkflowRuntimeActions';

// Uses the real workflow controller. Only the provider boundary is deferred;
// this fixture never calls an API, bills an account or writes a user canvas.
export const createWorkflowZoomScenario = (result: CanvasAiGeneratedOutput) => {
  const workflow: CanvasWorkflowTemplate = {
    id: 'zoom-probe', label: '缩放交错测试', hint: 'One workflow / one request',
    nodes: [{ id: 'image', x: 0, y: 0, width: 560, height: 500,
      item: { type: 'text', content: 'fixture', name: '生图' },
      ai: { type: 'image-generator', count: 1, aspectRatio: '1:1' } }],
  };
  const initial: CanvasImageItem = {
    id: 'probe-module', x: 20, y: 20, width: 590, height: 600,
    item: { id: 'probe-item', type: 'text', content: 'fixture', createdAt: 1 },
    ai: { type: 'workflow', workflow, workflowOutputMode: 'all' },
  };
  const itemsRef = { current: [initial] };
  let resolveResult!: () => void;
  const pendingResult = new Promise<void>(resolve => { resolveResult = resolve; });
  let submissions = 0;
  let instances = 0;
  const listeners = new Set<() => void>();
  const runTokens = new Map<string, string>();
  const activeNodes = new Set<string>();
  const ctx: Parameters<typeof runCanvasWorkflowModuleNodeImpl>[0] = {
    activeCanvasIdRef: { current: 'probe-canvas' }, canvasAiRunTokensRef: { current: runTokens },
    canvasItemsRef: itemsRef, canvasSessionItemsRef: { current: new Map() },
    commitCanvasAiPromptDraft: () => {}, foldersRef: { current: [] }, itemsRef: { current: [] },
    getCanvasAiErrorSummary: () => 'fixture error', getCanvasSessionItems: () => itemsRef.current,
    hydrateCanvasWorkflowSlotAssetsFromDrawer: items => items,
    instantiateCanvasWorkflowTemplateItems: template => {
      instances += 1;
      return { workflow: template, idMap: new Map([['image', 'runtime-image']]), items: template.nodes.map(node => ({
        ...node, id: 'runtime-image', item: { ...node.item, id: 'runtime-item', createdAt: 1 },
      })) as CanvasImageItem[] };
    },
    isCanvasModeRef: { current: true },
    markCanvasRunNodeActive: (_canvasId, id) => { activeNodes.add(id); },
    markCanvasRunNodeSettled: (_canvasId, id) => { activeNodes.delete(id); },
    notifyCanvasAiGenerationResult: () => {},
    runCanvasAiGeneratorTarget: async (_target, options) => {
      submissions += 1;
      options?.updateAi?.({ status: 'working', outputs: [{ id: 'fixture-output', status: 'working', width: 320, height: 320 }] });
      await pendingResult;
      options?.updateAi?.({ status: 'success', outputs: [result] });
      return [result];
    },
    runCanvasTextAgentTarget: async () => { throw new Error('Unexpected text request'); },
    showToast: () => {}, updateCanvasSelection: () => {},
    updateCanvasAiGeneratorDataForCanvas: (_canvasId, id, patch, content) => {
      itemsRef.current = itemsRef.current.map(item => item.id === id ? {
        ...item, ai: { ...item.ai!, ...patch },
        item: content === undefined ? item.item : { ...item.item, content },
      } : item);
      listeners.forEach(listener => listener());
      return itemsRef.current.find(item => item.id === id);
    },
    waitForCanvasBackgroundPatches: async () => {}, workflowResultPublisherRef: { current: () => {} },
  };
  return {
    itemsRef, get item() { return itemsRef.current[0]; },
    get submissions() { return submissions; }, get instances() { return instances; },
    activeNodes, runTokens,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    start: () => runCanvasWorkflowModuleNodeImpl(ctx, initial.id), injectResult: () => resolveResult(),
  };
};
