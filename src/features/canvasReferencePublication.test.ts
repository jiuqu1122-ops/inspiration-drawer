import { describe, expect, it, vi } from 'vitest';
import { publishCanvasReferencesInOrder } from './canvasReferencePublication';

describe('canvas reference publication', () => {
  it('publishes large reference sets in small batches without changing their order', async () => {
    const publish = vi.fn(async (sources: string[]) => ({
      urls: sources.map(source => `https://oss.example/${source}`),
      shareIds: [`share-${sources.join('-')}`],
    }));
    const cleanup = vi.fn(async () => undefined);

    const result = await publishCanvasReferencesInOrder(
      ['one', 'two', 'three', 'four'],
      publish,
      cleanup,
    );

    expect(publish.mock.calls.map(([sources]) => sources)).toEqual([
      ['one', 'two'],
      ['three', 'four'],
    ]);
    expect(result.urls).toEqual([
      'https://oss.example/one',
      'https://oss.example/two',
      'https://oss.example/three',
      'https://oss.example/four',
    ]);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('retries a failed multi-image batch one image at a time', async () => {
    const publish = vi.fn(async (sources: string[]) => {
      if (sources.length > 1) throw new Error('request body too large');
      return {
        urls: [`https://oss.example/${sources[0]}`],
        shareIds: [`share-${sources[0]}`],
      };
    });
    const cleanup = vi.fn(async () => undefined);

    const result = await publishCanvasReferencesInOrder(
      ['one', 'two'],
      publish,
      cleanup,
    );

    expect(publish.mock.calls.map(([sources]) => sources)).toEqual([
      ['one', 'two'],
      ['one'],
      ['two'],
    ]);
    expect(result.urls).toEqual([
      'https://oss.example/one',
      'https://oss.example/two',
    ]);
  });

  it('cleans completed shares when a later single-image retry fails', async () => {
    const publish = vi.fn(async (sources: string[]) => {
      if (sources.includes('three')) throw new Error('unreadable image');
      return {
        urls: sources.map(source => `https://oss.example/${source}`),
        shareIds: [`share-${sources.join('-')}`],
      };
    });
    const cleanup = vi.fn(async () => undefined);

    await expect(publishCanvasReferencesInOrder(
      ['one', 'two', 'three', 'four'],
      publish,
      cleanup,
    )).rejects.toThrow('unreadable image');

    expect(cleanup).toHaveBeenCalledWith(['share-one-two']);
  });

  it('rejects incomplete responses and cleans their temporary share', async () => {
    const publish = vi.fn(async (sources: string[]) => ({
      urls: sources[0] === 'two' ? [] : ['https://oss.example/one'],
      shareIds: [sources[0] === 'two' ? 'incomplete-share' : 'first-share'],
    }));
    const cleanup = vi.fn(async () => undefined);

    await expect(publishCanvasReferencesInOrder(
      ['one', 'two'],
      publish,
      cleanup,
      1,
    )).rejects.toThrow('预期 1 张');

    expect(cleanup).toHaveBeenCalledWith(['incomplete-share']);
  });
});
