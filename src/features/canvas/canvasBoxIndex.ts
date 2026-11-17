import type { CanvasItemBox } from '../canvasModel';

type Entry<T> = { item: T; box: CanvasItemBox };
const contains = (box: CanvasItemBox, x: number, y: number) => (
  x >= box.x && x <= box.x + box.width && y >= box.y && y <= box.y + box.height
);
const intersects = (a: CanvasItemBox, b: CanvasItemBox) => (
  a.x <= b.x + b.width && a.x + a.width >= b.x
  && a.y <= b.y + b.height && a.y + a.height >= b.y
);

// Rebuilt from the current rendered boxes. Very large nodes have a bounded
// fallback list rather than occupying thousands of grid cells.
export class CanvasBoxIndex<T> {
  private readonly cells = new Map<string, Entry<T>[]>();
  private readonly large: Entry<T>[] = [];
  private readonly entries: Entry<T>[] = [];
  private readonly entryByItem = new Map<T, Entry<T>>();
  private readonly order = new Map<Entry<T>, number>();
  constructor(entries: Iterable<Entry<T>>, private readonly cellSize = 512) {
    for (const entry of entries) {
      this.order.set(entry, this.entries.length);
      this.entries.push(entry);
      this.entryByItem.set(entry.item, entry);
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

  /** Return intersecting items in their original canvas stacking order. */
  intersecting(box: CanvasItemBox, additional: readonly T[] = []): T[] {
    const left = Math.floor(box.x / this.cellSize), right = Math.floor((box.x + box.width) / this.cellSize);
    const top = Math.floor(box.y / this.cellSize), bottom = Math.floor((box.y + box.height) / this.cellSize);
    const forced = new Set<Entry<T>>();
    for (const item of additional) {
      const entry = this.entryByItem.get(item);
      if (entry) forced.add(entry);
    }
    const cellCount = (right - left + 1) * (bottom - top + 1);
    // At very low zoom the viewport can span most of the world. Avoid walking
    // tens of thousands of empty grid cells when a bounded full scan is cheaper.
    if (!Number.isFinite(cellCount) || cellCount > 4096) {
      return this.entries
        .filter(entry => forced.has(entry) || intersects(entry.box, box))
        .map(entry => entry.item);
    }
    const candidates = new Set<Entry<T>>();
    for (let x = left; x <= right; x++) for (let y = top; y <= bottom; y++) {
      for (const entry of this.cells.get(`${x},${y}`) || []) candidates.add(entry);
    }
    for (const entry of this.large) candidates.add(entry);
    for (const entry of forced) candidates.add(entry);
    if (!candidates.size) return [];
    return Array.from(candidates)
      .filter(entry => forced.has(entry) || intersects(entry.box, box))
      .sort((a, b) => this.order.get(a)! - this.order.get(b)!)
      .map(entry => entry.item);
  }

  /** Highest scene-order point hit; selected/raised nodes have priority without
   * sorting or scanning every node in a zoomed-out document. */
  topAtPoint(x: number, y: number, raised: (item: T) => boolean = () => false): T | null {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    let top: Entry<T> | null = null;
    let topRaised = false;
    const visit = (entry: Entry<T>) => {
      if (!contains(entry.box, x, y)) return;
      const isRaised = raised(entry.item);
      if (!top || (isRaised && !topRaised) || (isRaised === topRaised && this.order.get(entry)! > this.order.get(top)!)) {
        top = entry; topRaised = isRaised;
      }
    };
    for (const entry of this.cells.get(`${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`) || []) visit(entry);
    for (const entry of this.large) visit(entry);
    return (top as Entry<T> | null)?.item ?? null;
  }

  someAtPoint(x: number, y: number, predicate: (item: T) => boolean): boolean {
    const matches = (entry: Entry<T>) => contains(entry.box, x, y) && predicate(entry.item);
    return !!this.cells.get(`${Math.floor(x / this.cellSize)},${Math.floor(y / this.cellSize)}`)?.some(matches)
      || this.large.some(matches);
  }
}
