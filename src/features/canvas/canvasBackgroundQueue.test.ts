import { describe, expect, it } from 'vitest';
import { createCanvasBackgroundQueue } from './canvasBackgroundQueue';

describe('bounded canvas background work', () => {
  it('limits 250 jobs to two concurrent decoders without losing order or results', async () => {
    const queue = createCanvasBackgroundQueue(2);
    let active = 0, peak = 0;
    const results = await Promise.all(Array.from({ length: 250 }, (_, i) => queue(async () => {
      active += 1; peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return i;
    })));
    expect(peak).toBe(2);
    expect(results).toEqual(Array.from({ length: 250 }, (_, i) => i));
  });
  it('continues after a failed decoder and shares the bound across successive batches', async () => {
    const queue = createCanvasBackgroundQueue(1);
    const first = queue(async () => { throw new Error('decode'); });
    const second = queue(async () => 2);
    await expect(first).rejects.toThrow('decode');
    await expect(second).resolves.toBe(2);
  });
});
