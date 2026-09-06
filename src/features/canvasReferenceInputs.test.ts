import { describe, expect, it } from 'vitest';
import { reorderCanvasInputs, replaceCanvasInputAt } from './canvasReferenceInputs';

describe('canvas reference inputs', () => {
  it('moves one reference while preserving every input id', () => {
    expect(reorderCanvasInputs(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
  });

  it('returns the original array for an invalid or unchanged move', () => {
    const inputs = ['a', 'b'];
    expect(reorderCanvasInputs(inputs, 1, 1)).toBe(inputs);
    expect(reorderCanvasInputs(inputs, -1, 1)).toBe(inputs);
  });

  it('replaces at the original slot and removes a duplicate input', () => {
    expect(replaceCanvasInputAt(['a', 'b', 'c', 'd'], 'b', 'd')).toEqual(['a', 'd', 'c']);
  });

  it('does not change inputs when the old id is missing or unchanged', () => {
    const inputs = ['a', 'b'];
    expect(replaceCanvasInputAt(inputs, 'missing', 'c')).toBe(inputs);
    expect(replaceCanvasInputAt(inputs, 'a', 'a')).toBe(inputs);
  });
});
