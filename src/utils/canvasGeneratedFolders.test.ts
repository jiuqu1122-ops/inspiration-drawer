import { describe, expect, it } from 'vitest';
import type { Folder } from '../types';
import {
  AI_GENERATED_FOLDER_ID,
  ensureCanvasGeneratedImageFolders,
  getAiGeneratedImageFolderIds,
  getCanvasGeneratedImageFolderId,
} from './canvasGeneratedFolders';

describe('canvasGeneratedFolders', () => {
  it('creates one AI image child folder per canvas', () => {
    const first = ensureCanvasGeneratedImageFolders([], 'canvas-a', '产品方向 A');
    const second = ensureCanvasGeneratedImageFolders(first.folders, 'canvas-b', '产品方向 B');

    expect(first.folderId).toBe(getCanvasGeneratedImageFolderId('canvas-a'));
    expect(second.folderId).toBe(getCanvasGeneratedImageFolderId('canvas-b'));
    expect(second.folderId).not.toBe(first.folderId);
    expect(second.folders).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: AI_GENERATED_FOLDER_ID }),
      expect.objectContaining({
        id: first.folderId,
        name: '产品方向 A',
        parentId: AI_GENERATED_FOLDER_ID,
      }),
      expect.objectContaining({
        id: second.folderId,
        name: '产品方向 B',
        parentId: AI_GENERATED_FOLDER_ID,
      }),
    ]));
    expect(second.folders.find(folder => folder.id === AI_GENERATED_FOLDER_ID)?.parentId).toBeUndefined();
  });

  it('reuses a legacy AI image root folder and updates a renamed canvas folder', () => {
    const legacyRoot: Folder = { id: 'legacy-ai-root', name: 'AI生图', color: '#000000' };
    const created = ensureCanvasGeneratedImageFolders([legacyRoot], 'canvas-a', '旧画布名');
    const renamed = ensureCanvasGeneratedImageFolders(created.folders, 'canvas-a', '新画布名');

    expect(created.folders).toHaveLength(2);
    expect(created.folders.find(folder => folder.id === created.folderId)).toMatchObject({
      parentId: legacyRoot.id,
      name: '旧画布名',
    });
    expect(renamed.folderId).toBe(created.folderId);
    expect(renamed.folders.find(folder => folder.id === renamed.folderId)).toMatchObject({
      parentId: legacyRoot.id,
      name: '新画布名',
    });
  });

  it('returns the original array when the folders are already correct', () => {
    const created = ensureCanvasGeneratedImageFolders([], 'canvas-a', '画布 A');
    const repeated = ensureCanvasGeneratedImageFolders(created.folders, 'canvas-a', '画布 A');

    expect(repeated.folders).toBe(created.folders);
  });

  it('recognizes the root and all generated-image descendants', () => {
    const created = ensureCanvasGeneratedImageFolders([], 'canvas-a', '画布 A');
    const nested: Folder = {
      id: 'nested',
      name: '批次',
      color: '#000000',
      parentId: created.folderId,
    };
    const folderIds = getAiGeneratedImageFolderIds([...created.folders, nested]);

    expect(folderIds).toEqual(new Set([
      AI_GENERATED_FOLDER_ID,
      created.folderId,
      nested.id,
    ]));
  });
});
