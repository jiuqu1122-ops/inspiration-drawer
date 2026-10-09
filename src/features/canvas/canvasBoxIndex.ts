import type { CanvasItemBox } from '../canvasModel';

type Entry<T> = { item: T; box: CanvasItemBox };
const contains = (box: CanvasItemBox, x: number, y: number) => (
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
);

// Rebuilt from the current rendered boxes. Very large nodes have a bounded
// fallback list rather than occupying thousands of grid cells.
export class CanvasBoxIndex<T> {
  private readonly cells = new Map<string, Entry<T>[]>();
  private readonly large: Entry<T>[] = [];
  constructor(entries: Iterable<Entry<T>>, private readonly cellSize = 512) {
    for (const entry of entries) {
      const box = entry.box;
      const left = Math.floor(box.x / cellSize), right = Math.floor((box.x + box.width) / cellSize);
      const top = Math.floor(box.y / cellSize), bottom = Math.floor((box.y + box.height) / cellSize);
      const count = (right - left + 1) * (bottom - top + 1);
      if (!Number.isFinite(count) || count > 64) { this.large.push(entry); continue; }
      for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
        const key = `${x},${y}`;
        const cell = this.cells.get(key);
        if (cell) cell.push(entry); else this.cells.set(key, [entry]);
      }
    }
  }
  someAtPoint(x: number, y: number, predicate: (item: T) => boolean): boolean {
    const matches = (entry: Entry<T>) => contains(entry.box, x, y) && predicate(entry.item);
    return !!this.cells.get(`${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`)?.some(matches)
      || this.large.some(matches);
  }
}
