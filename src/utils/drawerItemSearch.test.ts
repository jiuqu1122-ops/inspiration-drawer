import { describe, expect, it } from 'vitest';
import type { BufferItem } from '../types';
import { getDrawerItemSearchText, replaceFirstItemRemark } from './drawerItemSearch';

const createItem = (patch: Partial<BufferItem> = {}): BufferItem => ({
  id: 'item-1',
  type: 'image',
  content: 'generated image',
  createdAt: 1,
  ...patch,
});

describe('drawer item search', () => {
  it('indexes the AI image profile including CMF colors, materials, finishes, and tags', () => {
    const searchText = getDrawerItemSearchText(createItem({
      inspirationProfile: {
        itemId: 'item-1',
        summary: 'Minimal desk lamp',
        objects: ['lamp'],
        category: 'lighting',
        form: { silhouette: ['arched'], geometry: ['cylinder'], proportion: ['slender'] },
        cmf: { colors: ['warm white'], materials: ['aluminum'], finishes: ['matte'] },
        style: ['minimal'],
        interaction: ['touch control'],
        scene: ['bedside'],
        mood: ['calm'],
        userTags: ['reference'],
        userNotes: ['keep proportions'],
        aiTags: [{ name: 'soft-light', category: '风格', confidence: 0.92 }],
      },
    }));

    expect(searchText).toContain('warm white');
    expect(searchText).toContain('aluminum');
    expect(searchText).toContain('matte');
    expect(searchText).toContain('soft-light');
  });

  it('does not index drawer remarks attached to images', () => {
    const searchText = getDrawerItemSearchText(createItem({
      remark: 'private generation prompt',
      remarks: ['another private note'],
    }));

    expect(searchText).not.toContain('private generation prompt');
    expect(searchText).not.toContain('another private note');
  });

  it('continues to index remarks for non-image items', () => {
    expect(getDrawerItemSearchText(createItem({
      type: 'text',
      remark: 'searchable note',
    }))).toContain('searchable note');
  });

  it('does not copy image data URLs or blob URLs into the search index', () => {
    const searchText = getDrawerItemSearchText(createItem({
      name: 'Product reference',
      path: 'blob:http://localhost/large-preview',
      url: `data:image/png;base64,${'ABCDEF'.repeat(10_000)}`,
    }));

    expect(searchText).toBe('product reference generated image');
    expect(searchText).not.toContain('abcdef');
    expect(searchText.length).toBeLessThan(100);
  });

  it('replaces only the first remark while preserving the remaining entries', () => {
    expect(replaceFirstItemRemark({ remarks: ['old title', 'detail'] }, 'new title')).toEqual({
      remark: 'new title\ndetail',
      remarks: ['new title', 'detail'],
    });
  });
});
