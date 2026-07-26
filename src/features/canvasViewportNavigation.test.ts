import { describe, expect, it } from 'vitest';
import { findNearestCanvasItemIdForEmptyViewport } from './canvasViewportNavigation';

const item = (id: string, x: number, y: number, width = 100, height = 100) => ({
  id,
  x,
  y,
  width,
  height,
});

describe('findNearestCanvasItemIdForEmptyViewport', () => {
  it('keeps the current view when an item is already visible', () => {
    expect(findNearestCanvasItemIdForEmptyViewport(
      [item('visible', 80, 70), item('far', 900, 900)],
      { x: 0, y: 0, width: 200, height: 160 },
    )).toBeNull();
  });

  it('selects the item with the shortest gap from an empty viewport', () => {
    expect(findNearestCanvasItemIdForEmptyViewport(
      [item('left', -500, 40), item('right-nearest', 260, 60), item('below', 80, 500)],
      { x: 0, y: 0, width: 200, height: 160 },
    )).toBe('right-nearest');
  });

  it('uses center distance to break equal edge-distance ties', () => {
    expect(findNearestCanvasItemIdForEmptyViewport(
      [item('diagonal', 250, 140), item('straight', 250, 30)],
      { x: 0, y: 0, width: 200, height: 160 },
    )).toBe('straight');
  });

  it('returns no target for an empty canvas or unavailable viewport', () => {
    expect(findNearestCanvasItemIdForEmptyViewport(
      [],
      { x: 0, y: 0, width: 200, height: 160 },
    )).toBeNull();
    expect(findNearestCanvasItemIdForEmptyViewport(
      [item('node', 300, 300)],
      null,
    )).toBeNull();
  });
});
