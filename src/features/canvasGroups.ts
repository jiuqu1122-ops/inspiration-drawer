import type { CanvasImageItem, CanvasItemBox } from './canvasModel';

export type CanvasGroupOutline = {
  id: string;
  name: string;
  itemIds: string[];
  bounds: CanvasItemBox;
};

const normalizeGroupName = (name: unknown) => (
  typeof name === 'string' && name.trim() ? name.trim() : '未命名编组'
);

export const getCanvasGroupId = (item?: CanvasImageItem | null) => (
  typeof item?.canvasGroup?.id === 'string' ? item.canvasGroup.id.trim() : ''
);

export const expandCanvasGroupSelectionIds = (
  ids: string[],
  items: CanvasImageItem[],
) => {
  const expanded = new Set(ids.filter(Boolean));
  const selectedGroupIds = new Set<string>();

  items.forEach((item) => {
    if (!expanded.has(item.id)) return;
    const groupId = getCanvasGroupId(item);
    if (groupId) selectedGroupIds.add(groupId);
  });
  if (selectedGroupIds.size === 0) return Array.from(expanded);

  items.forEach((item) => {
    if (selectedGroupIds.has(getCanvasGroupId(item))) expanded.add(item.id);
  });
  return Array.from(expanded);
};

export const getCommonCanvasGroup = (
  ids: string[],
  items: CanvasImageItem[],
) => {
  const selectedIds = new Set(ids.filter(Boolean));
  const selectedItems = items.filter(item => selectedIds.has(item.id));
  if (selectedItems.length === 0) return null;
  const firstGroupId = getCanvasGroupId(selectedItems[0]);
  if (!firstGroupId || selectedItems.some(item => getCanvasGroupId(item) !== firstGroupId)) return null;
  return {
    id: firstGroupId,
    name: normalizeGroupName(selectedItems[0].canvasGroup?.name),
  };
};

export const createDefaultCanvasGroupName = (items: CanvasImageItem[]) => {
  const usedNames = new Set(
    items
      .map(item => item.canvasGroup?.name?.trim())
      .filter((name): name is string => !!name),
  );
  let index = 1;
  while (usedNames.has(`编组 ${index}`)) index += 1;
  return `编组 ${index}`;
};

export const remapCanvasGroupsForPaste = (
  items: CanvasImageItem[],
  createGroupId: () => string,
) => {
  const groupIdMap = new Map<string, string>();
  return items.map((item) => {
    const sourceGroupId = getCanvasGroupId(item);
    if (!sourceGroupId) return item;
    let nextGroupId = groupIdMap.get(sourceGroupId);
    if (!nextGroupId) {
      nextGroupId = createGroupId();
      groupIdMap.set(sourceGroupId, nextGroupId);
    }
    return {
      ...item,
      canvasGroup: {
        id: nextGroupId,
        name: normalizeGroupName(item.canvasGroup?.name),
      },
    };
  });
};

export const getCanvasGroupOutlines = (
  items: CanvasImageItem[],
  getItemBox: (item: CanvasImageItem) => CanvasItemBox,
  padding = 16,
): CanvasGroupOutline[] => {
  const groupedItems = new Map<string, { name: string; items: CanvasImageItem[] }>();
  items.forEach((item) => {
    const groupId = getCanvasGroupId(item);
    if (!groupId) return;
    const existing = groupedItems.get(groupId);
    if (existing) {
      existing.items.push(item);
      return;
    }
    groupedItems.set(groupId, {
      name: normalizeGroupName(item.canvasGroup?.name),
      items: [item],
    });
  });

  return Array.from(groupedItems, ([id, group]) => {
    const boxes = group.items.map(getItemBox);
    const left = Math.min(...boxes.map(box => box.x));
    const top = Math.min(...boxes.map(box => box.y));
    const right = Math.max(...boxes.map(box => box.x + box.width));
    const bottom = Math.max(...boxes.map(box => box.y + box.height));
    return {
      id,
      name: group.name,
      itemIds: group.items.map(item => item.id),
      bounds: {
        x: left - padding,
        y: top - padding,
        width: right - left + padding * 2,
        height: bottom - top + padding * 2,
      },
    };
  });
};
