import { describe, expect, it } from 'vitest';

import type { BufferItem, Folder } from '../types';
import {
  buildCanvasFolderMediaQuery,
  CANVAS_FOLDER_MEDIA_PAGE_SIZE,
  mergeCanvasFolderMediaItems,
} from './canvasFolderMedia';

const folders: Folder[] = [
  { id: 'root', name: 'root', color: '#000' },
  { id: 'child', name: 'child', color: '#000', parentId: 'root' },
  { id: 'other', name: 'other', color: '#000' },
];

const media = (overrides: Partial<BufferItem>): BufferItem => ({
  id: 'asset',
  type: 'image',
  content: '',
  path: 'C:\\media\\asset.png',
  createdAt: 1,
  ...overrides,
});

describe('canvas folder media pagination', () => {
  it('queries a folder and all descendants without relying on the drawer cache', () => {
    expect(buildCanvasFolderMediaQuery(folders, 'root', 'image', 24)).toEqual({
      folder_ids: ['child', 'root'],
      file_type: 'image',
      sort: 'created_at_desc',
      offset: 24,
      limit: CANVAS_FOLDER_MEDIA_PAGE_SIZE,
    });
  });

  it('queries only unfiled assets for the main drawer', () => {
    expect(buildCanvasFolderMediaQuery(folders, undefined, 'video', 0)).toEqual({
      folder_id: 'all',
      file_type: 'video',
      sort: 'created_at_desc',
      offset: 0,
      limit: CANVAS_FOLDER_MEDIA_PAGE_SIZE,
    });
  });

  it('merges image and video pages, removes duplicates, and keeps newest first', () => {
    const merged = mergeCanvasFolderMediaItems(
      [media({ id: 'older-image', createdAt: 10 })],
      [
        media({ id: 'new-video', type: 'video', path: 'C:\\media\\clip.mp4', createdAt: 30 }),
        media({ id: 'older-image', createdAt: 10 }),
        media({ id: 'text', type: 'text', path: undefined, createdAt: 40 }),
      ],
    );

    expect(merged.map(item => item.id)).toEqual(['new-video', 'older-image']);
  });
});
