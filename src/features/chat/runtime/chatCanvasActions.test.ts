import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import {
  addChatMediaToCanvasImpl,
  createChatBatchCanvasGroupImpl,
  fillChatBatchCanvasSlotImpl,
} from './chatCanvasActions';

describe('Chat batch canvas grouping', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('patches a newly added Chat image with persistent generation provenance', async () => {
    const canvasItemsRef = { current: [] as CanvasImageItem[] };
    const added: CanvasImageItem = {
      id: 'canvas-chat-image',
      item: { id: 'canvas-copy', sourceItemId: 'drawer-asset', type: 'image', content: 'result', createdAt: 1 },
      x: 0, y: 0, width: 320, height: 240,
    };
    const updateCanvasItemsImmediate = (updater: (items: CanvasImageItem[]) => CanvasImageItem[]) => {
      canvasItemsRef.current = updater(canvasItemsRef.current);
      return canvasItemsRef.current;
    };
    await addChatMediaToCanvasImpl({
      canvasItemsRef,
      isCanvasModeRef: { current: true },
      enterCanvasMode: vi.fn(),
      scheduleCanvasFocusItemById: vi.fn(),
      showToast: vi.fn(),
      updateCanvasItemsImmediate,
      canvasAgent: {
        executeExternalTool: vi.fn(async () => {
          canvasItemsRef.current = [added];
          return { added: 1 };
        }),
      } as never,
    }, {
      id: 'chat-media',
      assetId: 'drawer-asset',
      type: 'image',
      prompt: '产品图',
    }, { autoFocus: true });

    expect(canvasItemsRef.current[0]?.chatGeneratedMedia).toMatchObject({
      mediaId: 'chat-media',
      assetId: 'drawer-asset',
      mediaType: 'image',
      prompt: '产品图',
    });
  });

  it('keeps independently completed variants in one stable ordered group', async () => {
    vi.stubGlobal('window', {
      setTimeout: (callback: () => void) => {
        callback();
        return 1;
      },
    });
    const canvasItemsRef = { current: [] as CanvasImageItem[] };
    const selected: string[][] = [];
    await createChatBatchCanvasGroupImpl({
      canvasItemsRef,
      isCanvasModeRef: { current: true },
      enterCanvasMode: vi.fn(),
      getCanvasDropPosition: () => ({ x: 100, y: 80 }),
      canvasRectsIntersect: () => false,
      createAssetId: () => crypto.randomUUID(),
      appendCanvasItems: items => {
        canvasItemsRef.current = [...canvasItemsRef.current, ...items];
        return items.length;
      },
      updateCanvasSelection: ids => selected.push(ids),
      fitCanvasViewToItems: () => true,
    }, {
      batchId: 'variant-batch-1',
      name: '四个独立方案',
      instruction: '分别生成四个方案',
      attachmentIds: ['variant-0', 'variant-1', 'variant-2', 'variant-3'],
      total: 4,
      outputCountPerImage: 1,
      aspectRatio: '4:3',
    });

    expect(canvasItemsRef.current).toHaveLength(4);
    expect(canvasItemsRef.current.map(item => item.chatBatchSlot?.sourceIndex)).toEqual([0, 1, 2, 3]);
    expect(new Set(canvasItemsRef.current.map(item => item.canvasGroup?.id))).toEqual(
      new Set(['canvas_group_variant-batch-1']),
    );
    expect(selected).toEqual([canvasItemsRef.current.map(item => item.id)]);

    let nextAsset = 0;
    const fillContext = {
      canvasItemsRef,
      itemsRef: { current: [] },
      canvasImageSourceCacheRef: { current: new Map() },
      canvasItemsPatchCommitRef: { current: false },
      createAssetId: () => `00000000-0000-4000-8000-${String(++nextAsset).padStart(12, '0')}` as `${string}-${string}-${string}-${string}-${string}`,
      updateCanvasItemsImmediate: (updater: (items: CanvasImageItem[]) => CanvasImageItem[]) => {
        canvasItemsRef.current = updater(canvasItemsRef.current);
        return canvasItemsRef.current;
      },
      markCanvasNodesChanged: vi.fn(),
      scheduleCanvasChangedNodesPatchSave: vi.fn(),
      scheduleCanvasStateSave: vi.fn(),
    };

    // Simulate concurrent generation finishing out of order.
    await fillChatBatchCanvasSlotImpl(fillContext, {
      batchId: 'variant-batch-1',
      media: { id: 'output-4', type: 'image', path: 'data:image/png;base64,output4', name: '方案 4' },
      attachmentId: 'variant-3',
      sourceIndex: 3,
      outputIndex: 0,
      slotIndex: 3,
      total: 4,
    });
    await fillChatBatchCanvasSlotImpl(fillContext, {
      batchId: 'variant-batch-1',
      media: { id: 'output-1', type: 'image', path: 'data:image/png;base64,output1', name: '方案 1' },
      attachmentId: 'variant-0',
      sourceIndex: 0,
      outputIndex: 0,
      slotIndex: 0,
      total: 4,
    });

    expect(canvasItemsRef.current.map(item => item.chatBatchSlot?.sourceIndex)).toEqual([0, 1, 2, 3]);
    expect(canvasItemsRef.current[0].item.name).toBe('方案 1');
    expect(canvasItemsRef.current[3].item.name).toBe('方案 4');
    expect(canvasItemsRef.current[0].canvasGroup).toEqual(canvasItemsRef.current[3].canvasGroup);
    expect(canvasItemsRef.current[0].chatBatchSlot?.status).toBe('completed');
    expect(canvasItemsRef.current[3].chatBatchSlot?.status).toBe('completed');
  });
});
