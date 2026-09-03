export type ChatBatchCanvasSlot = {
  index: number;
  row: number;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ChatBatchCanvasLayout = {
  columns: number;
  rows: number;
  width: number;
  height: number;
  slots: ChatBatchCanvasSlot[];
};

export const getChatBatchCanvasSlotSize = (
  aspectRatio?: string | null,
  longEdge = 240,
) => {
  const [rawWidth, rawHeight] = String(aspectRatio || '')
    .split(/[:x×]/i)
    .map(value => Number(value.trim()));
  const ratio = rawWidth > 0 && rawHeight > 0 ? rawWidth / rawHeight : 1;
  const edge = Math.max(1, Number(longEdge) || 240);
  return ratio >= 1
    ? { width: edge, height: Math.max(1, Math.round(edge / ratio)) }
    : { width: Math.max(1, Math.round(edge * ratio)), height: edge };
};

export const createChatBatchCanvasLayout = (input: {
  total: number;
  originX?: number;
  originY?: number;
  slotWidth?: number;
  slotHeight?: number;
  gap?: number;
}): ChatBatchCanvasLayout => {
  const total = Math.max(0, Math.floor(input.total));
  const originX = Number.isFinite(input.originX) ? Number(input.originX) : 0;
  const originY = Number.isFinite(input.originY) ? Number(input.originY) : 0;
  const slotWidth = Math.max(1, Number(input.slotWidth) || 240);
  const slotHeight = Math.max(1, Number(input.slotHeight) || 240);
  const gap = Math.max(0, Number(input.gap) || 24);
  if (total === 0) {
    return { columns: 0, rows: 0, width: 0, height: 0, slots: [] };
  }

  const columns = Math.ceil(Math.sqrt(total));
  const rows = Math.ceil(total / columns);
  const width = columns * slotWidth + Math.max(0, columns - 1) * gap;
  const height = rows * slotHeight + Math.max(0, rows - 1) * gap;
  const slots = Array.from({ length: total }, (_, index) => {
    const row = Math.floor(index / columns);
    const column = index % columns;
    const itemsInRow = row === rows - 1
      ? total - row * columns
      : columns;
    const rowWidth = itemsInRow * slotWidth + Math.max(0, itemsInRow - 1) * gap;
    const rowOffset = (width - rowWidth) / 2;
    return {
      index,
      row,
      column,
      x: originX + rowOffset + column * (slotWidth + gap),
      y: originY + row * (slotHeight + gap),
      width: slotWidth,
      height: slotHeight,
    };
  });

  return { columns, rows, width, height, slots };
};
