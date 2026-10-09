import { getCanvasAiMediaType } from '../canvasAiRuntime';
import type { CanvasImageItem } from '../canvasModel';
import { shouldMountThreeSceneRenderer } from '../three/model/threeSceneInteraction';

type Scope = Record<string, any>;

// Expanded slots/bridges and pending/error cards retain their full dependencies.
// A standalone image's pixels/geometry do not depend on canvas zoom or AI menus.
export const isStandaloneCanvasImage = (item: CanvasImageItem) => (
  item.item.type === 'image'
  && !item.workflowGroup && !item.workflowBridge && !item.workflowTemplateNodeId
  && !item.workflowSlotAssets
  && (!item.ai || (item.ai.type === 'generated-image' && item.ai.status === 'success'))
);

export const getCanvasNodeRenderDependencies = (scope: Scope, item: CanvasImageItem): unknown[] => {
  const image = isStandaloneCanvasImage(item);
  return [
    item,
    item.item.type === 'video' || getCanvasAiMediaType(item.ai) === 'video'
      || item.ai?.outputs?.some(output => output.mediaType === 'video')
      ? scope.canvasSelectedIdsSet.has(item.id) : null,
    scope.canvasTextAgentRunningIds.includes(item.id),
    shouldMountThreeSceneRenderer(item.id, scope.activeThreeSceneId),
    scope.threeSceneAnalyzingIds.includes(item.id),
    scope.canvasAiPromptEditingId === item.id,
    scope.canvasPromptOptimizingId === item.id,
    scope.canvasInputMenuForId === item.id,
    scope.canvasInputPickTargetId === item.id,
    Boolean(scope.canvasConnectionDraft),
    scope.canvasAiExpandedOutputNodeIds.has(item.id),
    image ? null : scope.canvasRenderScale,
    scope.canvasScaledNodeRadius,
    image ? null : scope.canvasAiProvider,
    image ? null : scope.canvasAiCredentialSource,
    image ? null : scope.canvasAiCloudImageModels,
    image ? null : scope.canvasAiUnifiedImageModelOptions,
    image ? null : scope.canvasAgent.settings,
    image ? null : scope.canvasWorkflowTemplates,
    image ? null : scope.canvasWorkflowSingleEditGroupIds,
    item.ai?.status === 'working' ? scope.canvasWorkingTimerTick : null,
    ...(item.inputs || []).map(id => scope.canvasItemsById.get(id)),
  ];
};

// Cached nodes must still call the current actions after zoom, selection or a
// sibling update. Data remains a render snapshot; event actions read live scope.
export const createCanvasNodeRenderScope = (
  scope: Scope,
  latest: { current: Scope },
  actions: Map<string, (...args: any[]) => any>,
): Scope => Object.fromEntries(Object.entries(scope).map(([key, value]) => {
  // Render getters must use this render's data, including a transition that
  // has not committed yet. Only imperative actions go through the live ref.
  if (typeof value !== 'function' || /^(get|can|is|should|format|normalize|find|build|resolve|compute)/.test(key)) return [key, value];
  let action = actions.get(key);
  if (!action) {
    action = (...args: any[]) => Reflect.apply(latest.current[key], undefined, args);
    actions.set(key, action);
  }
  return [key, action];
}));
