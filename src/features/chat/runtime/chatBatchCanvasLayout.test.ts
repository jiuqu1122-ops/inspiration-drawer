import { describe, expect, it } from 'vitest';
import { createChatBatchCanvasLayout, getChatBatchCanvasSlotSize } from './chatBatchCanvasLayout';

describe('Chat batch canvas layout', () => {
  it.each([
    ['16:9', { width: 240, height: 135 }],
    ['9:16', { width: 135, height: 240 }],
    ['4:3', { width: 240, height: 180 }],
    ['3:4', { width: 180, height: 240 }],
    ['2048x1152', { width: 240, height: 135 }],
    ['', { width: 240, height: 240 }],
  ])('sizes %s placeholders without letterboxing', (aspectRatio, expected) => {
    expect(getChatBatchCanvasSlotSize(aspectRatio)).toEqual(expected);
  });

  it.each([
    [4, 2, 2],
    [5, 3, 2],
    [6, 3, 2],
    [9, 3, 3],
  ])('lays out %i results as %i columns by %i rows', (total, columns, rows) => {
    const layout = createChatBatchCanvasLayout({ total, slotWidth: 200, slotHeight: 180, gap: 20 });
    expect(layout.columns).toBe(columns);
    expect(layout.rows).toBe(rows);
    expect(layout.slots).toHaveLength(total);
  });

  it('centers an incomplete final row while keeping source order', () => {
    const layout = createChatBatchCanvasLayout({
      total: 5,
      originX: 100,
      originY: 80,
      slotWidth: 200,
      slotHeight: 180,
      gap: 20,
    });
    expect(layout.slots.map(slot => slot.index)).toEqual([0, 1, 2, 3, 4]);
    expect(layout.slots.slice(0, 3).map(slot => slot.x)).toEqual([100, 320, 540]);
    expect(layout.slots.slice(3).map(slot => slot.x)).toEqual([210, 430]);
  });
});
