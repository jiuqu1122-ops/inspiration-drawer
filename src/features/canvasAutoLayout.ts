export type CanvasAutoLayoutItem = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  inputs?: string[];
  layoutRole?: 'generator' | 'output';
  outputOf?: string;
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
  maxReferenceColumns?: number;
  maxGroupColumns?: number;
  looseGroupSize?: number;
  groupColumnGap?: number;
  groupRowGap?: number;
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

type CanvasLayoutBlock = {
  placements: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
};

const layoutCompactGrid = (
  items: CanvasAutoLayoutItem[],
  maxColumns: number,
  columnGap: number,
  rowGap: number,
): CanvasLayoutBlock => {
  const placements = new Map<string, { x: number; y: number }>();
  if (items.length === 0) return { placements, width: 0, height: 0 };

  const columnCount = Math.max(1, Math.min(maxColumns, Math.ceil(Math.sqrt(items.length))));
  const rowCount = Math.ceil(items.length / columnCount);
  const columnWidths = Array.from({ length: columnCount }, () => 0);
  const rowHeights = Array.from({ length: rowCount }, () => 0);

  items.forEach((item, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    columnWidths[column] = Math.max(columnWidths[column]!, positiveSize(item.width));
    rowHeights[row] = Math.max(rowHeights[row]!, positiveSize(item.height));
  });

  const columnXs: number[] = [];
  const rowYs: number[] = [];
  columnWidths.forEach((_, index) => {
    columnXs[index] = index === 0
      ? 0
      : columnXs[index - 1]! + columnWidths[index - 1]! + columnGap;
  });
  rowHeights.forEach((_, index) => {
    rowYs[index] = index === 0
      ? 0
      : rowYs[index - 1]! + rowHeights[index - 1]! + rowGap;
  });

  items.forEach((item, index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    placements.set(item.id, {
      x: columnXs[column]!,
      y: rowYs[row]!,
    });
  });

  return {
    placements,
    width: columnWidths.reduce((total, width) => total + width, 0) + columnGap * (columnCount - 1),
    height: rowHeights.reduce((total, height) => total + height, 0) + rowGap * (rowCount - 1),
  };
};

const layoutGeneratorGroups = (
  items: CanvasAutoLayoutItem[],
  startX: number,
  startY: number,
  options: Required<Pick<
    CanvasAutoLayoutOptions,
    | 'columnGap'
    | 'masonryColumnGap'
    | 'rowGap'
    | 'maxReferenceColumns'
    | 'maxGroupColumns'
    | 'looseGroupSize'
    | 'groupColumnGap'
    | 'groupRowGap'
  >>,
) => {
  const placements = new Map<string, { x: number; y: number }>();
  const itemById = new Map(items.map(item => [item.id, item]));
  const order = new Map(items.map((item, index) => [item.id, index]));
  const generators = items.filter(item => item.layoutRole === 'generator');
  const generatorIds = new Set(generators.map(item => item.id));

  const upstreamGeneratorCache = new Map<string, Set<string>>();
  const findUpstreamGenerators = (itemId: string, visiting = new Set<string>()): Set<string> => {
    const cached = upstreamGeneratorCache.get(itemId);
    if (cached) return cached;
    if (visiting.has(itemId)) return new Set();
    const item = itemById.get(itemId);
    if (!item) return new Set();
    const nextVisiting = new Set(visiting).add(itemId);
    const found = new Set<string>();
    (item.inputs || []).forEach(inputId => {
      if (generatorIds.has(inputId)) {
        found.add(inputId);
        return;
      }
      findUpstreamGenerators(inputId, nextVisiting).forEach(id => found.add(id));
    });
    upstreamGeneratorCache.set(itemId, found);
    return found;
  };

  const depthCache = new Map<string, number>();
  const getGeneratorDepth = (generatorId: string, visiting = new Set<string>()): number => {
    const cached = depthCache.get(generatorId);
    if (cached !== undefined) return cached;
    if (visiting.has(generatorId)) return 0;
    const upstream = Array.from(findUpstreamGenerators(generatorId));
    if (upstream.length === 0) {
      depthCache.set(generatorId, 0);
      return 0;
    }
    const nextVisiting = new Set(visiting).add(generatorId);
    const depth = Math.max(...upstream.map(id => getGeneratorDepth(id, nextVisiting))) + 1;
    depthCache.set(generatorId, depth);
    return depth;
  };

  const sortedGenerators = [...generators].sort((left, right) => (
    getGeneratorDepth(left.id) - getGeneratorDepth(right.id)
    || (order.get(left.id) || 0) - (order.get(right.id) || 0)
  ));
  const groups = sortedGenerators.map(generator => ({
    generator,
    inputs: [] as CanvasAutoLayoutItem[],
    outputs: [] as CanvasAutoLayoutItem[],
  }));
  const groupByGeneratorId = new Map(groups.map(group => [group.generator.id, group]));
  const assigned = new Set(sortedGenerators.map(item => item.id));

  const collectReferenceInputs = (
    itemId: string,
    collected: CanvasAutoLayoutItem[],
    visiting: Set<string>,
  ) => {
    if (visiting.has(itemId) || generatorIds.has(itemId)) return;
    const item = itemById.get(itemId);
    if (!item) return;
    visiting.add(itemId);
    if (!assigned.has(itemId)) {
      assigned.add(itemId);
      collected.push(item);
    }
    (item.inputs || []).forEach(inputId => collectReferenceInputs(inputId, collected, visiting));
  };

  groups.forEach(group => {
    (group.generator.inputs || []).forEach(inputId => (
      collectReferenceInputs(inputId, group.inputs, new Set([group.generator.id]))
    ));
    group.inputs.sort((left, right) => (
      (order.get(left.id) || 0) - (order.get(right.id) || 0)
    ));
  });

  items.forEach(item => {
    if (assigned.has(item.id) || item.layoutRole !== 'output' || !item.outputOf) return;
    const group = groupByGeneratorId.get(item.outputOf);
    if (!group) return;
    assigned.add(item.id);
    group.outputs.push(item);
  });

  const blocks: CanvasLayoutBlock[] = groups.map(group => {
    const inputGrid = layoutCompactGrid(
      group.inputs,
      options.maxReferenceColumns,
      options.masonryColumnGap,
      options.rowGap,
    );
    const outputGrid = layoutCompactGrid(
      group.outputs,
      Math.min(2, options.maxReferenceColumns),
      options.masonryColumnGap,
      options.rowGap,
    );
    const generatorWidth = positiveSize(group.generator.width);
    const generatorHeight = positiveSize(group.generator.height);
    const contentHeight = Math.max(inputGrid.height, generatorHeight, outputGrid.height);
    const generatorX = inputGrid.width > 0 ? inputGrid.width + options.columnGap : 0;
    const outputX = generatorX + generatorWidth + (outputGrid.width > 0 ? options.columnGap : 0);
    const blockPlacements = new Map<string, { x: number; y: number }>();
    const inputY = Math.max(0, (contentHeight - inputGrid.height) / 2);
    const generatorY = Math.max(0, (contentHeight - generatorHeight) / 2);
    const outputY = Math.max(0, (contentHeight - outputGrid.height) / 2);
    inputGrid.placements.forEach((position, id) => blockPlacements.set(id, {
      x: position.x,
      y: position.y + inputY,
    }));
    blockPlacements.set(group.generator.id, { x: generatorX, y: generatorY });
    outputGrid.placements.forEach((position, id) => blockPlacements.set(id, {
      x: position.x + outputX,
      y: position.y + outputY,
    }));
    return {
      placements: blockPlacements,
      width: outputGrid.width > 0 ? outputX + outputGrid.width : generatorX + generatorWidth,
      height: contentHeight,
    };
  });

  const looseItems = items.filter(item => !assigned.has(item.id));
  for (let index = 0; index < looseItems.length; index += options.looseGroupSize) {
    blocks.push(layoutCompactGrid(
      looseItems.slice(index, index + options.looseGroupSize),
      options.maxReferenceColumns,
      options.masonryColumnGap,
      options.rowGap,
    ));
  }

  const averageBlockWidth = blocks.reduce((total, block) => total + block.width, 0) / Math.max(1, blocks.length);
  const averageBlockHeight = blocks.reduce((total, block) => total + block.height, 0) / Math.max(1, blocks.length);
  const groupColumnCount = Math.max(1, Math.min(
    options.maxGroupColumns,
    Math.ceil(Math.sqrt(
      blocks.length * positiveSize(averageBlockHeight) * 1.6 / positiveSize(averageBlockWidth),
    )),
  ));
  const groupRowCount = Math.ceil(blocks.length / groupColumnCount);
  const groupColumnWidths = Array.from({ length: groupColumnCount }, () => 0);
  const groupRowHeights = Array.from({ length: groupRowCount }, () => 0);
  blocks.forEach((block, index) => {
    const column = index % groupColumnCount;
    const row = Math.floor(index / groupColumnCount);
    groupColumnWidths[column] = Math.max(groupColumnWidths[column]!, block.width);
    groupRowHeights[row] = Math.max(groupRowHeights[row]!, block.height);
  });
  const groupColumnXs: number[] = [];
  const groupRowYs: number[] = [];
  groupColumnWidths.forEach((_, index) => {
    groupColumnXs[index] = index === 0
      ? startX
      : groupColumnXs[index - 1]! + groupColumnWidths[index - 1]! + options.groupColumnGap;
  });
  groupRowHeights.forEach((_, index) => {
    groupRowYs[index] = index === 0
      ? startY
      : groupRowYs[index - 1]! + groupRowHeights[index - 1]! + options.groupRowGap;
  });

  blocks.forEach((block, index) => {
    const column = index % groupColumnCount;
    const row = Math.floor(index / groupColumnCount);
    const offsetX = groupColumnXs[column]! + (groupColumnWidths[column]! - block.width) / 2;
    const offsetY = groupRowYs[row]! + (groupRowHeights[row]! - block.height) / 2;
    block.placements.forEach((position, id) => placements.set(id, {
      x: offsetX + position.x,
      y: offsetY + position.y,
    }));
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
    maxReferenceColumns: rawOptions.maxReferenceColumns ?? 3,
    maxGroupColumns: rawOptions.maxGroupColumns ?? 3,
    looseGroupSize: rawOptions.looseGroupSize ?? 9,
    groupColumnGap: rawOptions.groupColumnGap ?? 160,
    groupRowGap: rawOptions.groupRowGap ?? 144,
    gridSize: rawOptions.gridSize ?? 8,
  };
  const snap = (value: number) => Math.max(24, Math.round(value / options.gridSize) * options.gridSize);
  const items = sourceItems.map(item => ({
    ...item,
    width: positiveSize(item.width),
    height: positiveSize(item.height),
  }));
  let placements: Map<string, { x: number; y: number }>;
  if (items.some(item => item.layoutRole === 'generator')) {
    placements = layoutGeneratorGroups(items, options.startX, options.startY, options);
  } else {
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
    placements = layoutDag(connected, options.startX, options.startY, options);
    const connectedBounds = getBounds(connected, placements);
    const isolatedStartY = connectedBounds
      ? connectedBounds.y + connectedBounds.height + options.sectionGap
      : options.startY;
    const masonry = layoutMasonry(isolated, options.startX, isolatedStartY, options);
    masonry.forEach((position, id) => placements.set(id, position));
  }
  placements.forEach((position, id) => placements.set(id, {
    x: snap(position.x),
    y: snap(position.y),
  }));
  return { placements, bounds: getBounds(items, placements) };
};
