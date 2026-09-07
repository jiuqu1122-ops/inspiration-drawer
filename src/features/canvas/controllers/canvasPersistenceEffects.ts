import { CANVAS_AI_COLLAPSED_OUTPUT_PREVIEW_LIMIT } from '../../canvasAiOutputs';
import { isCanvasAiGeneratorType } from '../../canvasAiRuntime';
import { type CanvasImageItem } from '../../canvasModel';

type canvasPersistenceEffectContext = { isCanvasMode: boolean; canvasAiCompactOutputNodeSignature: string; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; canvasAiExpandedOutputNodeIds: Set<string>; canvasAiPromptEditingId: string | null; getCanvasAiNodeDesignSizeForItem: (canvasItem: CanvasImageItem, promptExpanded?: boolean, outputsExpanded?: boolean) => { width: number; height: number; }; };

export const runCanvasPersistenceEffect01 = (ctx: Pick<canvasPersistenceEffectContext, 'canvasAiCompactOutputNodeSignature' | 'canvasAiExpandedOutputNodeIds' | 'canvasAiPromptEditingId' | 'getCanvasAiNodeDesignSizeForItem' | 'isCanvasMode' | 'updateCanvasItemsImmediate'>) => {
  const { canvasAiCompactOutputNodeSignature, canvasAiExpandedOutputNodeIds, canvasAiPromptEditingId, getCanvasAiNodeDesignSizeForItem, isCanvasMode, updateCanvasItemsImmediate } = ctx;
    if (!isCanvasMode || !canvasAiCompactOutputNodeSignature) return;
    updateCanvasItemsImmediate(previous => {
      let changed = false;
      const next = previous.map(item => {
        if (canvasAiExpandedOutputNodeIds.has(item.id)
          || (!isCanvasAiGeneratorType(item.ai?.type) && item.ai?.type !== 'workflow')
          || (item.ai?.outputs?.length || 0) <= CANVAS_AI_COLLAPSED_OUTPUT_PREVIEW_LIMIT) return item;
        const promptExpanded = canvasAiPromptEditingId === item.id;
        const compactSize = getCanvasAiNodeDesignSizeForItem(item, promptExpanded, false);
        const scale = Math.max(0.1, item.width / Math.max(1, compactSize.width));
        const compactHeight = compactSize.height * scale;
        if (item.height <= compactHeight + 8) return item;
        changed = true;
        return { ...item, height: compactHeight };
      });
      return changed ? next : previous;
    });

};
