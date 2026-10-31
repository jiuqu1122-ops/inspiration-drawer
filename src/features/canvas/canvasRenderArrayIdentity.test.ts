import { describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem } from '../canvasModel';
import { haveSameCanvasConnectionEndpoints, reuseCanvasRenderArray } from './canvasRenderArrayIdentity';

const image = (id: string, x = 0): CanvasImageItem => ({
  id, x, y: 0, width: 100, height: 80,
  item: { id: `asset-${id}`, type: 'image', content: '', createdAt: 1 },
});

const a = image('a');
const b = image('b', 200);
const c = image('c', 400);

describe('canvas render array identity', () => {
  it('returns the candidate when there is no committed array', () => {
    const next = [a, b];
    expect(reuseCanvasRenderArray(null, next)).toBe(next);
  });

  it('reuses an already identical array without walking entries', () => {
    const committed = [a, b];
    const compare = vi.fn(() => true);
    expect(reuseCanvasRenderArray(committed, committed, compare)).toBe(committed);
    expect(compare).not.toHaveBeenCalled();
  });

  it('reuses committed empty membership', () => {
    const committed: CanvasImageItem[] = [];
    expect(reuseCanvasRenderArray(committed, [])).toBe(committed);
  });

  it('reuses a filtered array with the same ordered node references', () => {
    const committed = [a, b];
    expect(reuseCanvasRenderArray(committed, [a, b])).toBe(committed);
  });

  it('keeps the same array over 100 viewport updates inside unchanged membership', () => {
    const items = [a, b, c];
    const committed = items.filter(item => item.x < 300);
    for (let step = 0; step < 100; step += 1) {
      const candidate = items.filter(item => item.x < 300 + step / 10);
      expect(reuseCanvasRenderArray(committed, candidate)).toBe(committed);
    }
  });

  it('invalidates when viewport membership crosses a node boundary', () => {
    const items = [a, b, c];
    const committed = items.filter(item => item.x < 300);
    const candidate = items.filter(item => item.x < 500);
    expect(reuseCanvasRenderArray(committed, candidate)).toBe(candidate);
  });

  it('invalidates on reordered nodes rather than treating membership as a set', () => {
    const candidate = [b, a];
    expect(reuseCanvasRenderArray([a, b], candidate)).toBe(candidate);
  });

  it.each([
    { label: 'insertion', previous: [a], next: [a, b] },
    { label: 'removal', previous: [a, b], next: [a] },
  ])('invalidates on $label', ({ previous, next }) => {
    expect(reuseCanvasRenderArray(previous, next)).toBe(next);
  });

  it.each([
    { label: 'geometry', replacement: { ...a, x: 25 } },
    { label: 'asset data', replacement: { ...a, item: { ...a.item, thumbnail: 'updated' } } },
    { label: 'same-ID object replacement', replacement: { ...a } },
  ])('invalidates on $label even though the node ID is unchanged', ({ replacement }) => {
    const candidate = [replacement, b];
    expect(reuseCanvasRenderArray([a, b], candidate)).toBe(candidate);
  });

  it('preserves the visible prefix and ordered offscreen selection suffix', () => {
    const committed = [a, c, b];
    const candidate = [a, c, b];
    expect(reuseCanvasRenderArray(committed, candidate)).toBe(committed);
    const reversedSelection = [a, b, c];
    expect(reuseCanvasRenderArray(committed, reversedSelection)).toBe(reversedSelection);
  });

  it('invalidates when an always-rendered node is added or removed', () => {
    const committed = [a];
    const withEditor = [a, c];
    expect(reuseCanvasRenderArray(committed, withEditor)).toBe(withEditor);
    const afterEditor = [a];
    expect(reuseCanvasRenderArray(withEditor, afterEditor)).toBe(afterEditor);
  });

  it('does not mutate inputs or carry a speculative render into a later comparison', () => {
    const committed = [a, b];
    const speculative = [a, c];
    expect(reuseCanvasRenderArray(committed, speculative)).toBe(speculative);
    const next = [a, b];
    expect(reuseCanvasRenderArray(committed, next)).toBe(committed);
    expect(committed).toEqual([a, b]);
    expect(speculative).toEqual([a, c]);
    expect(next).toEqual([a, b]);
  });
});

describe('canvas connection render identity', () => {
  const committed = [{ source: a, target: b }, { source: b, target: c }];

  it('reuses connection arrays when wrappers change but ordered endpoint references do not', () => {
    const candidate = committed.map(edge => ({ ...edge }));
    expect(reuseCanvasRenderArray(committed, candidate, haveSameCanvasConnectionEndpoints)).toBe(committed);
  });

  it('reuses connection membership across 100 equivalent filtered updates', () => {
    for (let step = 0; step < 100; step += 1) {
      const candidate = committed.map(edge => ({ ...edge })).filter(() => true);
      expect(reuseCanvasRenderArray(committed, candidate, haveSameCanvasConnectionEndpoints)).toBe(committed);
    }
  });

  it.each(['source', 'target'] as const)('invalidates if the %s has a new same-ID node reference', endpoint => {
    const candidate = committed.map(edge => ({ ...edge }));
    candidate[0] = { ...candidate[0], [endpoint]: { ...candidate[0][endpoint] } };
    expect(reuseCanvasRenderArray(committed, candidate, haveSameCanvasConnectionEndpoints)).toBe(candidate);
  });

  it('invalidates when endpoint direction changes', () => {
    const candidate = [{ source: b, target: a }, committed[1]];
    expect(reuseCanvasRenderArray(committed, candidate, haveSameCanvasConnectionEndpoints)).toBe(candidate);
  });

  it('invalidates when edge order changes', () => {
    const candidate = [committed[1], committed[0]];
    expect(reuseCanvasRenderArray(committed, candidate, haveSameCanvasConnectionEndpoints)).toBe(candidate);
  });

  it.each([
    { label: 'insertion', previous: committed.slice(0, 1), next: [...committed] },
    { label: 'removal', previous: committed, next: committed.slice(0, 1) },
  ])('invalidates on edge $label', ({ previous, next }) => {
    expect(reuseCanvasRenderArray(previous, next, haveSameCanvasConnectionEndpoints)).toBe(next);
  });

  it('keeps empty connection membership stable', () => {
    const previous: typeof committed = [];
    expect(reuseCanvasRenderArray(previous, [], haveSameCanvasConnectionEndpoints)).toBe(previous);
  });
});
