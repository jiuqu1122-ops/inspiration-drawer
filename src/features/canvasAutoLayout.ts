export type CanvasAutoLayoutItem = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs?: string[];
};

export type CanvasAutoLayoutOptions = {
  startX?: number;
  startY?: number;
  columnGap?: number;
  masonryColumnGap?: number;
  rowGap?: number;
  sectionGap?: number;
  maxLayerHeight?: number;
  maxMasonryWidth?: number;
  maxMasonryColumns?: number;
  gridSize?: number;
};

export type CanvasAutoLayoutResult = {
  placements: Map<string, { x: number; y: number }>;
  bounds: { x: number; y: number; width: number; height: number } | null;
};

const positiveSize = (value: number) => Math.max(1, Number.isFinite(value) ? value : 1);

const getBounds = (
  items: CanvasAutoLayoutItem[],
  placements: Map<string, { x: number; y: number }>,
) => {
  if (items.length === 0) return null;
  const boxes = items.map(item => ({
    x: placements.get(item.id)?.x ?? item.x,
    y: placements.get(item.id)?.y ?? item.y,
    width: positiveSize(item.width),
    height: positiveSize(item.height),
  }));
  const left = Math.min(...boxes.map(box => box.x));
  const top = Math.min(...boxes.map(box => box.y));
  const right = Math.max(...boxes.map(box => box.x + box.width));
  const bottom = Math.max(...boxes.map(box => box.y + box.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
};

const layoutMasonry = (
  items: CanvasAutoLayoutItem[],
  startX: number,
  startY: number,
  options: Required<Pick<CanvasAutoLayoutOptions, 'rowGap' | 'masonryColumnGap' | 'maxMasonryWidth' | 'maxMasonryColumns'>>,
) => {
  const placements = new Map<string, { x: number; y: number }>();
  if (items.length === 0) return placements;

  const averageWidth = items.reduce((total, item) => total + positiveSize(item.width), 0) / items.length;
  const widthLimitedColumns = Math.max(1, Math.floor(
    (options.maxMasonryWidth + options.masonryColumnGap) / (averageWidth + options.masonryColumnGap),
  ));
  const columnCount = Math.max(1, Math.min(
    options.maxMasonryColumns,
    widthLimitedColumns,
    Math.ceil(Math.sqrt(items.length * 1.35)),
  ));
  const buildColumns = (count: number) => {
    const columns = Array.from({ length: count }, () => ({
      height: 0,
      width: 0,
      items: [] as Array<{ item: CanvasAutoLayoutItem; y: number }>,
    }));
    items.forEach(item => {
      const column = columns.reduce((best, candidate) => (
        candidate.height < best.height ? candidate : best
      ), columns[0]!);
      const y = startY + column.height;
      column.items.push({ item, y });
      column.width = Math.max(column.width, positiveSize(item.width));
      column.height += positiveSize(item.height) + options.rowGap;
    });
    return columns;
  };
  let columns = buildColumns(columnCount);
  while (columns.length > 1) {
    const totalWidth = columns.reduce((total, column) => total + column.width, 0)
      + options.masonryColumnGap * (columns.length - 1);
    if (totalWidth <= options.maxMasonryWidth) break;
    columns = buildColumns(columns.length - 1);
  }

  let x = startX;
  columns.forEach(column => {
    column.items.forEach(({ item, y }) => placements.set(item.id, { x, y }));
    x += column.width + options.masonryColumnGap;
  });
  return placements;
};

const getDagLevels = (items: CanvasAutoLayoutItem[]) => {
  const itemById = new Map(items.map(item => [item.id, item]));
  const order = new Map(items.map((item, index) => [item.id, index]));
  const indegree = new Map(items.map(item => [item.id, 0]));
  const children = new Map(items.map(item => [item.id, [] as string[]]));
  const levels = new Map(items.map(item => [item.id, 0]));

  items.forEach(item => {
    (item.inputs || []).forEach(parentId => {
      if (!itemById.has(parentId) || parentId === item.id) return;
      indegree.set(item.id, (indegree.get(item.id) || 0) + 1);
      children.get(parentId)!.push(item.id);
    });
  });

  const queue = items.filter(item => (indegree.get(item.id) || 0) === 0);
  const visited = new Set<string>();
  while (queue.length > 0) {
    queue.sort((left, right) => (order.get(left.id) || 0) - (order.get(right.id) || 0));
    const item = queue.shift()!;
    if (visited.has(item.id)) continue;
    visited.add(item.id);
    (children.get(item.id) || []).forEach(childId => {
      levels.set(childId, Math.max(levels.get(childId) || 0, (levels.get(item.id) || 0) + 1));
      indegree.set(childId, (indegree.get(childId) || 0) - 1);
      if ((indegree.get(childId) || 0) === 0) queue.push(itemById.get(childId)!);
    });
  }

  // Cycles are invalid DAG fragments, but they should still be arranged safely.
  // Keep them in a deterministic final layer instead of recursing forever.
  const finalLevel = Math.max(0, ...Array.from(levels.values())) + (visited.size < items.length ? 1 : 0);
  items.forEach(item => {
    if (!visited.has(item.id)) levels.set(item.id, finalLevel);
  });
  return levels;
};

const layoutDag = (
  items: CanvasAutoLayoutItem[],
  startX: number,
  startY: number,
  options: Required<Pick<CanvasAutoLayoutOptions, 'rowGap' | 'columnGap' | 'maxLayerHeight'>>,
) => {
  const placements = new Map<string, { x: number; y: number }>();
  if (items.length === 0) return placements;
  const levels = getDagLevels(items);
  const itemById = new Map(items.map(item => [item.id, item]));
  const order = new Map(items.map((item, index) => [item.id, index]));
  const grouped = new Map<number, CanvasAutoLayoutItem[]>();
  items.forEach(item => grouped.set(levels.get(item.id) || 0, [
    ...(grouped.get(levels.get(item.id) || 0) || []),
    item,
  ]));

  let layerX = startX;
  Array.from(grouped.keys()).sort((left, right) => left - right).forEach(level => {
    const layerItems = [...(grouped.get(level) || [])].sort((left, right) => {
      const parentCenter = (item: CanvasAutoLayoutItem) => {
        const centers = (item.inputs || []).flatMap(parentId => {
          const parent = itemById.get(parentId);
          const position = placements.get(parentId);
          return parent && position ? [position.y + positiveSize(parent.height) / 2] : [];
        });
        return centers.length > 0
          ? centers.reduce((total, value) => total + value, 0) / centers.length
          : Number.POSITIVE_INFINITY;
      };
      return parentCenter(left) - parentCenter(right)
        || (order.get(left.id) || 0) - (order.get(right.id) || 0);
    });
    const lanes: Array<{
      height: number;
      width: number;
      items: Array<{ item: CanvasAutoLayoutItem; y: number }>;
    }> = [];
    layerItems.forEach(item => {
      const itemHeight = positiveSize(item.height);
      let lane = lanes[lanes.length - 1];
      if (!lane || (lane.items.length > 0 && lane.height + itemHeight > options.maxLayerHeight)) {
        lane = { height: 0, width: 0, items: [] };
        lanes.push(lane);
      }
      const y = startY + lane.height;
      lane.items.push({ item, y });
      lane.width = Math.max(lane.width, positiveSize(item.width));
      lane.height += itemHeight + options.rowGap;
    });

    let laneX = layerX;
    lanes.forEach(lane => {
      lane.items.forEach(({ item, y }) => placements.set(item.id, { x: laneX, y }));
      laneX += lane.width + options.columnGap;
    });
    layerX = laneX;
  });
  return placements;
};

export const layoutCanvasItems = (
  sourceItems: CanvasAutoLayoutItem[],
  rawOptions: CanvasAutoLayoutOptions = {},
): CanvasAutoLayoutResult => {
  const options = {
    startX: rawOptions.startX ?? 120,
    startY: rawOptions.startY ?? 120,
    columnGap: rawOptions.columnGap ?? 104,
    masonryColumnGap: rawOptions.masonryColumnGap ?? 56,
    rowGap: rawOptions.rowGap ?? 46,
    sectionGap: rawOptions.sectionGap ?? 120,
    maxLayerHeight: rawOptions.maxLayerHeight ?? 1800,
    maxMasonryWidth: rawOptions.maxMasonryWidth ?? 2400,
    maxMasonryColumns: rawOptions.maxMasonryColumns ?? 5,
    gridSize: rawOptions.gridSize ?? 8,
  };
  const snap = (value: number) => Math.max(24, Math.round(value / options.gridSize) * options.gridSize);
  const items = sourceItems.map(item => ({
    ...item,
    width: positiveSize(item.width),
    height: positiveSize(item.height),
  }));
  const ids = new Set(items.map(item => item.id));
  const connectedIds = new Set<string>();
  items.forEach(item => {
    (item.inputs || []).forEach(parentId => {
      if (!ids.has(parentId) || parentId === item.id) return;
      connectedIds.add(parentId);
      connectedIds.add(item.id);
    });
  });
  const connected = items.filter(item => connectedIds.has(item.id));
  const isolated = items.filter(item => !connectedIds.has(item.id));
  const placements = layoutDag(connected, options.startX, options.startY, options);
  const connectedBounds = getBounds(connected, placements);
  const isolatedStartY = connectedBounds
    ? connectedBounds.y + connectedBounds.height + options.sectionGap
    : options.startY;
  const masonry = layoutMasonry(isolated, options.startX, isolatedStartY, options);
  masonry.forEach((position, id) => placements.set(id, position));
  placements.forEach((position, id) => placements.set(id, {
    x: snap(position.x),
    y: snap(position.y),
  }));
  return { placements, bounds: getBounds(items, placements) };
};
