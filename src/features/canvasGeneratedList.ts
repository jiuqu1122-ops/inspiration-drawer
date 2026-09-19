import type { CanvasGeneratedListEntry } from '../types/canvasMedia';
import { createCanvasAiOutputBufferItem } from '../utils/canvasItemSelectors';
import { isCanvasAiGeneratedType, isCanvasAiGeneratorType } from './canvasAiRuntime';
import type { CanvasImageItem } from './canvasModel';

const getGeneratedMediaIdentity = (canvasItem: CanvasImageItem, item = canvasItem.item) => (
  canvasItem.chatGeneratedMedia?.mediaId
  || item.sourceItemId
  || item.id
  || canvasItem.id
);

export const buildCanvasGeneratedItemsForList = (
  canvasItems: CanvasImageItem[],
): CanvasGeneratedListEntry[] => {
  const entries: CanvasGeneratedListEntry[] = [];
  const seenMedia = new Set<string>();
  const append = (entry: CanvasGeneratedListEntry) => {
    const identity = getGeneratedMediaIdentity(entry.canvasItem, entry.item);
    if (seenMedia.has(identity)) return;
    seenMedia.add(identity);
    entries.push(entry);
  };

  canvasItems
    .filter(item => isCanvasAiGeneratedType(item.ai?.type))
    .forEach(item => append({
      id: item.id,
      canvasItem: item,
      item: item.item,
      ai: item.ai,
      source: item.chatGeneratedMedia ? 'chat' : 'canvas',
    }));

  canvasItems.forEach(canvasItem => {
    if (!isCanvasAiGeneratorType(canvasItem.ai?.type) && canvasItem.ai?.type !== 'workflow') return;
    (canvasItem.ai.outputs || []).forEach((output, outputIndex) => {
      const outputItem = createCanvasAiOutputBufferItem(canvasItem, output, outputIndex);
      if (!outputItem) return;
      append({
        id: `${canvasItem.id}:${output.id || outputIndex}`,
        canvasItem,
        item: outputItem,
        source: canvasItem.ai?.type === 'workflow' ? 'workflow' : 'canvas',
        ai: {
          type: outputItem.type === 'video' ? 'generated-video' : 'generated-image',
          prompt: output.prompt || canvasItem.ai?.prompt,
          status: output.status,
          error: output.error,
          generatedAt: output.generatedAt || canvasItem.ai?.generatedAt,
        },
      });
    });
  });

  canvasItems
    .filter(item => !!item.chatGeneratedMedia)
    .forEach(canvasItem => {
      const provenance = canvasItem.chatGeneratedMedia!;
      append({
        id: `chat:${provenance.mediaId}`,
        canvasItem,
        item: canvasItem.item,
        source: 'chat',
        ai: {
          type: provenance.mediaType === 'video' ? 'generated-video' : 'generated-image',
          status: 'success',
          prompt: provenance.prompt,
          generatedAt: provenance.generatedAt,
        },
      });
    });

  return entries.sort((a, b) => (
    (b.ai?.generatedAt || b.item.createdAt || 0) - (a.ai?.generatedAt || a.item.createdAt || 0)
  ));
};
