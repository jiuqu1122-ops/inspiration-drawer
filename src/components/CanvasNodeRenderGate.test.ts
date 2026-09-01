import { describe, expect, it } from 'vitest';
import { areCanvasRenderDependenciesEqual } from './CanvasNodeRenderGate';

describe('CanvasNodeRenderGate', () => {
  it('keeps an unchanged node render cached', () => {
    const item = { id: 'node-a' };
    expect(areCanvasRenderDependenciesEqual(
      [item, false, 'model-a'],
      [item, false, 'model-a'],
    )).toBe(true);
  });

  it('rerenders only when a node dependency changes', () => {
    const item = { id: 'node-a' };
    expect(areCanvasRenderDependenciesEqual([item, false], [item, true])).toBe(false);
    expect(areCanvasRenderDependenciesEqual([item], [{ id: 'node-a' }])).toBe(false);
  });
});
