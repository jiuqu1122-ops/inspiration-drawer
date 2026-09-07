import { describe, expect, it } from 'vitest';

import type { BufferItem } from '../../types';
import type {
  EagleDuplicateLookupResult,
  EagleImportBatchResult,
} from '../../services/assetsApi';
import { normalizeEaglePage, planEagleFolders } from './eagleNormalization';
import { runEagleStreamImport } from './eagleImportService';

const emptyDuplicates: EagleDuplicateLookupResult = { externalIds: [], externalPaths: [] };

describe('Eagle streaming import', () => {
  it('normalizes reference assets while preserving source identity and folder mapping', () => {
    const folderPlan = planEagleFolders(
      [{ id: 'eagle-folder', name: 'Products' }],
      [{ id: 'existing', name: 'Existing', color: '#fff' }],
    );
    const result = normalizeEaglePage({
      entries: [{
        id: 'eagle-1',
        name: 'Chair',
        ext: 'png',
        filePath: 'D:/Design.library/images/eagle-1.info/Chair.png',
        thumbnailPath: 'D:/Design.library/images/eagle-1.info/Chair_thumbnail.png',
        folders: ['eagle-folder'],
        tags: ['工业设计'],
        annotation: '人体工学',
        url: 'https://example.com/chair',
      }],
      folderIdMap: folderPlan.folderIdMap,
      startedAt: 10,
      startIndex: 0,
      mode: 'reference',
    });

    expect(result.failures).toEqual([]);
    expect(result.assets).toHaveLength(1);
    expect(result.assets[0]).toMatchObject({
      path: 'D:/Design.library/images/eagle-1.info/Chair.png',
      externalProvider: 'eagle',
      externalId: 'eagle-1',
      externalPath: 'D:/Design.library/images/eagle-1.info/Chair.png',
      eagleId: 'eagle-1',
      eagleSourcePath: 'D:/Design.library/images/eagle-1.info/Chair.png',
      eagleImportMode: 'reference',
      sourceAvailability: 'available',
      folderId: folderPlan.newFolders[0].id,
    });
  });

  it('processes 100,000 records page-by-page without creating a full import array', async () => {
    const pageSize = 200;
    const total = 100_000;
    let produced = 0;
    let maxBatch = 0;
    let persisted = 0;
    let pageCalls = 0;
    const result = await runEagleStreamImport({
      mode: 'reference',
      storageMode: 'sqlite',
      folderIdMap: new Map(),
      startedAt: 100,
      total,
      nextPage: async () => {
        const count = Math.min(pageSize, total - produced);
        const start = produced;
        produced += count;
        pageCalls += 1;
        return {
          items: Array.from({ length: count }, (_, index) => ({
            id: `eagle-${start + index}`,
            name: `Asset ${start + index}`,
            ext: 'jpg',
            filePath: `D:/Eagle/${start + index}.jpg`,
          })),
          total,
          processed: produced,
          done: produced >= total,
        };
      },
      database: {
        start: async () => undefined,
        findDuplicates: async identities => {
          maxBatch = Math.max(maxBatch, identities.length);
          return emptyDuplicates;
        },
        writeBatch: async request => {
          maxBatch = Math.max(maxBatch, request.assets.length);
          persisted += request.assets.length;
          return {
            processed: request.processedCount,
            imported: persisted,
            skipped: 0,
            failed: 0,
          };
        },
        finish: async () => undefined,
      },
    });

    expect(result).toMatchObject({ processed: total, imported: total, skipped: 0, failed: 0 });
    expect(pageCalls).toBe(500);
    expect(maxBatch).toBe(pageSize);
  }, 20_000);

  it('copy mode skips known duplicates, limits copy concurrency and records failures', async () => {
    let activeCopies = 0;
    let maxActiveCopies = 0;
    let writtenAssets: BufferItem[] = [];
    let writtenFailures = 0;
    const result = await runEagleStreamImport({
      mode: 'copy',
      storageMode: 'sqlite',
      folderIdMap: new Map(),
      startedAt: 200,
      total: 4,
      nextPage: async () => ({
        items: [0, 1, 2, 3].map(index => ({
          id: `eagle-${index}`,
          name: `Asset ${index}`,
          ext: 'jpg',
          filePath: `D:/Eagle/${index}.jpg`,
        })),
        total: 4,
        processed: 4,
        done: true,
      }),
      getCacheDir: async () => 'C:/Drawer/cache',
      copyFile: async sourcePath => {
        activeCopies += 1;
        maxActiveCopies = Math.max(maxActiveCopies, activeCopies);
        await Promise.resolve();
        activeCopies -= 1;
        if (sourcePath.endsWith('/3.jpg')) throw new Error('missing source');
        return `C:/Drawer/cache/${sourcePath.split('/').pop()}`;
      },
      database: {
        start: async () => undefined,
        findDuplicates: async () => ({ externalIds: ['eagle-0'], externalPaths: [] }),
        writeBatch: async request => {
          writtenAssets = request.assets;
          writtenFailures = request.failures.length;
          const duplicateCount = request.assets.filter(asset => asset.externalId === 'eagle-0').length;
          const imported = request.assets.length - duplicateCount;
          return {
            processed: request.processedCount,
            imported,
            skipped: duplicateCount,
            failed: request.failures.length,
          } as EagleImportBatchResult;
        },
        finish: async () => undefined,
      },
    });

    expect(maxActiveCopies).toBeLessThanOrEqual(2);
    expect(result).toMatchObject({ imported: 2, skipped: 1, failed: 1, cached: 2 });
    expect(writtenFailures).toBe(1);
    expect(writtenAssets.find(asset => asset.externalId === 'eagle-0')?.path).toBe('D:/Eagle/0.jpg');
    expect(writtenAssets.filter(asset => asset.eagleImportMode === 'copy')).toHaveLength(3);
    expect(writtenAssets.every(asset => asset.eagleSourcePath?.startsWith('D:/Eagle/'))).toBe(true);
  });
});
