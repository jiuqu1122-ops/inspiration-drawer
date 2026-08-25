import { describe, expect, it } from 'vitest';

import type { BufferItem } from '../types';
import {
  capDrawerAssetCache,
  createDrawerAssetSnapshot,
  diffDrawerAssets,
  mergeDrawerAssetPageWindow,
} from './useDrawerAssetCache';

const asset = (id: string, name = id): BufferItem => ({
  id,
  name,
  content: name,
  type: 'image',
  createdAt: 1,
});

describe('drawer asset cache diff', () => {
  it('separates row inserts, updates and deletes', () => {
    const before = createDrawerAssetSnapshot([asset('a'), asset('b'), asset('c')]);
    const result = diffDrawerAssets(before, [asset('a'), asset('b', 'renamed'), asset('d')]);

    expect(result.added.map(item => item.id)).toEqual(['d']);
    expect(result.changed.map(item => item.id)).toEqual(['b']);
    expect(result.removedIds).toEqual(['c']);
  });

  it('reuses snapshots for unchanged object references', () => {
    let serializedReads = 0;
    const unchanged = asset('a');
    Object.defineProperty(unchanged, 'remark', {
      configurable: true,
      enumerable: true,
      get: () => {
        serializedReads += 1;
        return 'unchanged';
      },
    });
    const before = createDrawerAssetSnapshot([unchanged]);
    expect(serializedReads).toBe(0);

    const result = diffDrawerAssets(before, [unchanged]);

    expect(serializedReads).toBe(0);
    expect(result.changed).toEqual([]);
  });

  it('keeps a bounded current-window cache', () => {
    const assets = Array.from({ length: 6 }, (_, index) => asset(String(index)));

    expect(capDrawerAssetCache(assets, 3).map(item => item.id)).toEqual(['0', '1', '2']);
    expect(capDrawerAssetCache(assets, 10)).toBe(assets);
  });

  it('deduplicates pages and slides the bounded window forward', () => {
    const current = ['0', '1', '2'].map(id => asset(id));
    const page = [asset('2', 'newer'), asset('3'), asset('4')];

    const result = mergeDrawerAssetPageWindow(current, page, 4);

    expect(result.evictedFromStart).toBe(1);
    expect(result.assets.map(item => item.id)).toEqual(['1', '2', '3', '4']);
    expect(result.assets.find(item => item.id === '2')?.name).toBe('newer');
  });
});
