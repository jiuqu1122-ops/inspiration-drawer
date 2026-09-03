import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from './canvasModel';
import {
  createDefaultCanvasGroupName,
  expandCanvasGroupSelectionIds,
  getCanvasGroupOutlines,
  getCommonCanvasGroup,
  remapCanvasGroupsForPaste,
} from './canvasGroups';

const createItem = (
  id: string,
  patch: Partial<CanvasImageItem> = {},
): CanvasImageItem => ({
  id,
  item: {
    id: `asset-${id}`,
    type: 'text',
    name: id,
    content: '',
    createdAt: 1,
  },
  x: 0,
  y: 0,
  width: 100,
  height: 80,
  ...patch,
} as CanvasImageItem);

describe('canvas groups', () => {
  it('expands a selection to every member in the same group', () => {
    const items = [
      createItem('a', { canvasGroup: { id: 'group-a', name: '参考图' } }),
      createItem('b', { canvasGroup: { id: 'group-a', name: '参考图' } }),
      createItem('c'),
    ];

    expect(expandCanvasGroupSelectionIds(['a'], items)).toEqual(['a', 'b']);
    expect(getCommonCanvasGroup(['a', 'b'], items)).toEqual({ id: 'group-a', name: '参考图' });
  });

  it('creates a unique default name', () => {
    const items = [
      createItem('a', { canvasGroup: { id: 'a', name: '编组 1' } }),
      createItem('b', { canvasGroup: { id: 'b', name: '编组 3' } }),
    ];
    expect(createDefaultCanvasGroupName(items)).toBe('编组 2');
  });

  it('remaps copied groups without linking them back to the originals', () => {
    const items = [
      createItem('a', { canvasGroup: { id: 'old', name: '素材' } }),
      createItem('b', { canvasGroup: { id: 'old', name: '素材' } }),
      createItem('c', { canvasGroup: { id: 'other', name: '文案' } }),
    ];
    let index = 0;
    const pasted = remapCanvasGroupsForPaste(items, () => `new-${++index}`);

    expect(pasted[0].canvasGroup).toEqual({ id: 'new-1', name: '素材' });
    expect(pasted[1].canvasGroup).toEqual({ id: 'new-1', name: '素材' });
    expect(pasted[2].canvasGroup).toEqual({ id: 'new-2', name: '文案' });
    expect(pasted[0].canvasGroup?.id).not.toBe(items[0].canvasGroup?.id);
  });

  it('calculates one padded outline for each group', () => {
    const items = [
      createItem('a', { x: 20, y: 30, width: 100, height: 80, canvasGroup: { id: 'group-a', name: '素材' } }),
      createItem('b', { x: 180, y: 70, width: 60, height: 90, canvasGroup: { id: 'group-a', name: '素材' } }),
    ];
    expect(getCanvasGroupOutlines(items, item => item, 10)).toEqual([{
      id: 'group-a',
      name: '素材',
      itemIds: ['a', 'b'],
      bounds: { x: 10, y: 20, width: 240, height: 150 },
    }]);
  });
});
