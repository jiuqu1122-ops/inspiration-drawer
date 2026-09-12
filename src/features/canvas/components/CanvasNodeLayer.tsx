import { CanvasNodeRenderGate } from '../../../components/CanvasNodeRenderGate';
import { getCanvasAiMediaType } from '../../canvasAiRuntime';
import { shouldMountThreeSceneRenderer } from '../../three/model/threeSceneInteraction';
import { CanvasNode } from './CanvasNode';
import type { CanvasAiGeneratedOutput,CanvasImageItem } from '../../canvasModel';

export type CanvasNodeLayerScope = Record<string, any>;

export function CanvasNodeLayer({ scope, canvasItemsRef }: { scope: CanvasNodeLayerScope; canvasItemsRef: { current: any[] } }) {
  const { activeThreeSceneId, canvasAgent, canvasAiCloudImageModels, canvasAiCredentialSource, canvasAiExpandedOutputNodeIds, canvasAiPromptEditingId, canvasAiProvider, canvasAiUnifiedImageModelOptions, canvasConnectionDraft, canvasInputMenuForId, canvasInputPickTargetId, canvasItemsById, canvasPromptOptimizingId, canvasRenderableItems, canvasRenderScale, canvasScaledNodeRadius, canvasSelectedIdsSet, canvasTextAgentRunningIds, canvasWorkflowSingleEditGroupIds, canvasWorkflowTemplates, canvasWorkingTimerTick, threeSceneAnalyzingIds } = scope;
  return (
<>
{canvasRenderableItems.map((canvasItem: CanvasImageItem) => (
                          <CanvasNodeRenderGate
                            key={canvasItem.id}
                            dependencies={[
                              canvasItem,
                              canvasItem.item.type === 'video'
                                || getCanvasAiMediaType(canvasItem.ai) === 'video'
                                || canvasItem.ai?.outputs?.some((output: CanvasAiGeneratedOutput) => output.mediaType === 'video')
                                ? canvasSelectedIdsSet.has(canvasItem.id)
                                : null,
                              canvasTextAgentRunningIds.includes(canvasItem.id),
                              shouldMountThreeSceneRenderer(canvasItem.id, activeThreeSceneId),
                              threeSceneAnalyzingIds.includes(canvasItem.id),
                              canvasAiPromptEditingId === canvasItem.id,
                              canvasPromptOptimizingId === canvasItem.id,
                              canvasInputMenuForId === canvasItem.id,
                              canvasInputPickTargetId === canvasItem.id,
                              Boolean(canvasConnectionDraft),
                              canvasAiExpandedOutputNodeIds.has(canvasItem.id),
                              canvasRenderScale,
                              canvasScaledNodeRadius,
                              canvasAiProvider,
                              canvasAiCredentialSource,
                              canvasAiCloudImageModels,
                              canvasAiUnifiedImageModelOptions,
                              canvasAgent.settings,
                              canvasWorkflowTemplates,
                              canvasWorkflowSingleEditGroupIds,
                              canvasItem.ai?.status === 'working' ? canvasWorkingTimerTick : null,
                              ...(canvasItem.inputs || []).map((inputId: string) => canvasItemsById.get(inputId)),
                            ]}
                            render={() => <CanvasNode scope={scope} canvasItem={canvasItem} canvasItemsRef={canvasItemsRef} />}
                          />
                        ))}
</>
  );
}
