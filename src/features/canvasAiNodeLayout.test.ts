import { describe, expect, it } from 'vitest';
import { getCanvasAiNodeAutoSize, getCanvasImageGeneratorMainColumnWidth } from './canvasAiNodeLayout';
import { applyCanvasAiGeneratorDataPatchImpl } from './canvas/controllers/canvasWorkflowEditorActions';
import type { CanvasImageItem } from './canvasModel';

const designSize = (item: CanvasImageItem) => getCanvasAiNodeAutoSize({
  type: item.ai?.type as 'image-generator',
  imageControlsWidth: item.ai?.imageControlsWidth,
  imageRulePanelExpanded: item.ai?.imagePolicy?.panelExpanded !== false,
});

describe('image node intrinsic control width', () => {
  it.each([false, true])('fits the toolbar with the rule panel expanded=%s', imageRulePanelExpanded => {
    const options = { type: 'image-generator' as const, imageControlsWidth: 928, imageRulePanelExpanded };
    expect(getCanvasAiNodeAutoSize(options).width).toBe(928);
    const baseline = getCanvasAiNodeAutoSize({ ...options, imageControlsWidth: undefined });
    expect(getCanvasImageGeneratorMainColumnWidth(options)).toBe(560 + 928 - baseline.width);
  });

  it.each([0.5, 1, 1.5])('retains the user size ratio %s while growing and shrinking controls', scale => {
    const original: CanvasImageItem = {
      id: 'image-node', x: 25, y: 40, width: 0, height: 0,
      item: { id: 'prompt', type: 'text', content: '', createdAt: 0 },
      ai: { type: 'image-generator', imagePolicy: { panelExpanded: false } },
    };
    const initial = designSize(original);
    original.width = initial.width * scale;
    original.height = initial.height * scale;
    const context = {
      canvasAiPromptEditingId: null, canvasGroupResizeRef: { current: null }, canvasResizeRef: { current: null },
      getCanvasAiNodeDesignSizeForItem: designSize,
    };
    const dragging = { ...context, canvasResizeRef: { current: {
      id: original.id, corner: 'se' as const, startClientX: 0, startClientY: 0,
      startX: original.x, startY: original.y, startWidth: original.width, startHeight: original.height,
      aspect: original.width / original.height, latestBox: null, hasResized: true,
    } } };
    expect(applyCanvasAiGeneratorDataPatchImpl(dragging, original, { imageControlsWidth: 928 })).toBe(original);
    const wider = applyCanvasAiGeneratorDataPatchImpl(context, original, { imageControlsWidth: 928 });
    expect(wider.width).toBe(928 * scale);
    expect(wider.height).toBe(designSize(wider).height * scale);
    expect([wider.x, wider.y]).toEqual([25, 40]);
    const smaller = applyCanvasAiGeneratorDataPatchImpl(context, wider, { imageControlsWidth: 600 });
    expect(smaller.width).toBe(initial.width * scale);
    expect(smaller.height).toBe(initial.height * scale);
  });

  it('keeps video and workflow dimensions independent of the image toolbar', () => {
    for (const type of ['video-generator', 'workflow'] as const) {
      expect(getCanvasAiNodeAutoSize({ type, imageControlsWidth: 1400 }))
        .toEqual(getCanvasAiNodeAutoSize({ type }));
    }
  });
});
