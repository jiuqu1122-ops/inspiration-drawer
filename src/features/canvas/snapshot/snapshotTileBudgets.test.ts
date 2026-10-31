import { describe, expect, it } from 'vitest';
import { allocateSnapshotTileBudgets, SNAPSHOT_TOTAL_TILE_PIXELS } from './snapshotTileBudgets';
const sum = (values: ReadonlyMap<string, number>) => [...values.values()].reduce((a, b) => a + b, 0);
describe('incremental world tile admission', () => {
  it('does not resize old tiles just because a fifth tile crosses a power-of-two boundary', () => {
    const keys = ['a', 'b', 'c', 'd']; const old = allocateSnapshotTileBudgets(keys, new Map());
    const next = allocateSnapshotTileBudgets([...keys, 'new'], old);
    for (const key of keys) expect(next.get(key)).toBe(old.get(key));
    expect(sum(next)).toBeLessThanOrEqual(SNAPSHOT_TOTAL_TILE_PIXELS);
  });
  it('when full, changes only the minimum number of large allocations, not all nine tiles', () => {
    const keys = Array.from({ length: 8 }, (_, i) => String(i));
    const old = new Map(keys.map(key => [key, 1_500_000]));
    const next = allocateSnapshotTileBudgets([...keys, 'new'], old);
    expect(keys.filter(key => next.get(key) !== old.get(key))).toHaveLength(1);
    expect(sum(next)).toBeLessThanOrEqual(SNAPSHOT_TOTAL_TILE_PIXELS);
    expect(next.get('new')).toBe(750_000);
  });
  it('keeps 288 mixed-run tiles bounded during repeated insertion/removal', () => {
    let budgets = new Map<string, number>();
    for (let count = 1; count <= 288; count++) {
      const keys = Array.from({ length: count }, (_, i) => String(i));
      budgets = allocateSnapshotTileBudgets(keys, budgets);
      expect(budgets.size).toBe(count); expect(sum(budgets)).toBeLessThanOrEqual(SNAPSHOT_TOTAL_TILE_PIXELS);
      expect([...budgets.values()].every(value => Number.isInteger(value) && value >= 1)).toBe(true);
    }
    const same = allocateSnapshotTileBudgets([...budgets.keys()], budgets);
    expect(same).toEqual(budgets);
    expect(allocateSnapshotTileBudgets(['100'], same).get('100')).toBe(same.get('100'));
    expect(allocateSnapshotTileBudgets([], same).size).toBe(0);
  });
});
