import { describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import { pasteCanvasItemsImpl } from './canvasMediaActions';
import { appendCanvasItemsImpl } from './canvasPersistenceActions';

describe('canvas paste selection behavior', () => {
  it('places the center of copied nodes at the pointer world position', () => {
    const source = {
      id: 'source-node',
      x: 100,
      y: 200,
      width: 200,
      height: 100,
      item: { id: 'source-item', type: 'text', content: 'copy', createdAt: 1 },
    } as CanvasImageItem;
    const appendCanvasItems = vi.fn((
      _items: CanvasImageItem[],
      _label: string,
      _select?: boolean,
      _options?: { focusSelection?: boolean },
    ) => 1);

    pasteCanvasItemsImpl({
      CANVAS_PASTE_OFFSET: 54,
      appendCanvasItems,
      canvasClipboardRef: { current: [source] },
      createAssetId: vi.fn(() => 'new-item'),
      getCanvasBoundsFromItems: vi.fn(() => ({ x: 100, y: 200, width: 200, height: 100 })),
      getCanvasPointFromClient: vi.fn(() => ({ x: 500, y: 400 })),
      isCanvasModeRef: { current: true },
      makeCanvasNodeId: vi.fn(() => 'new-node'),
      showToast: vi.fn(),
    } as any, { x: 460, y: 300 });

    const pasted = appendCanvasItems.mock.calls[0][0][0] as CanvasImageItem;
    expect({
      x: pasted.x + pasted.width / 2,
      y: pasted.y + pasted.height / 2,
    }).toEqual({ x: 500, y: 400 });
    expect(appendCanvasItems).toHaveBeenCalledWith(
      expect.any(Array),
      '粘贴画布元素',
      true,
      { focusSelection: false },
    );
  });

  it('selects pasted nodes without scheduling a viewport-centering focus', () => {
    const item = {
      id: 'pasted-node',
      x: 240,
      y: 180,
      width: 200,
      height: 120,
      item: { id: 'pasted-item', type: 'text', content: 'copy', createdAt: 1 },
    } as CanvasImageItem;
    const updateCanvasSelection = vi.fn();
    const scheduleCanvasFocusItemById = vi.fn();

    const count = appendCanvasItemsImpl({
      canvasImageSourceCacheRef: { current: new Map() },
      canvasItemsPatchCommitRef: { current: false },
      growCanvasToFit: vi.fn(),
      isCanvasModeRef: { current: true },
      pushCanvasUndoSnapshot: vi.fn(),
      scheduleCanvasChangedNodesPatchSave: vi.fn(),
      scheduleCanvasFocusItemById,
      updateCanvasItemsDeferred: vi.fn(updater => updater([])),
      updateCanvasSelection,
    } as any, [item], 'paste', true, { focusSelection: false });

    expect(count).toBe(1);
    expect(updateCanvasSelection).toHaveBeenCalledWith(['pasted-node']);
    expect(scheduleCanvasFocusItemById).not.toHaveBeenCalled();
  });
});
