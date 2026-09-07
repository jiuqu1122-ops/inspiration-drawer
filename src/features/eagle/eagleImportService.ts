import { convertFileSrc, invoke } from '@tauri-apps/api/core';

import type { BufferItem } from '../../types';
import type { EagleImportMode, EagleItemPayload } from '../../types/eagle';
import {
  findEagleDuplicates,
  finishEagleImport,
  importEagleAssetsBatch,
  startEagleImport,
  type EagleImportBatchResult,
  type EagleImportFailure,
  type EagleSourceIdentity,
} from '../../services/assetsApi';
import { normalizeEaglePage } from './eagleNormalization';

const COPY_CONCURRENCY = 2;

export type EagleImportPage = {
  items: EagleItemPayload[];
  failures?: EagleImportFailure[];
  total?: number;
  processed?: number;
  done: boolean;
};

export type EagleImportProgress = EagleImportBatchResult & {
  total: number;
  cached: number;
};

type EagleDatabase = {
  start: typeof startEagleImport;
  findDuplicates: typeof findEagleDuplicates;
  writeBatch: typeof importEagleAssetsBatch;
  finish: typeof finishEagleImport;
};

export type EagleStreamImportOptions = {
  mode: EagleImportMode;
  storageMode: 'sqlite' | 'json';
  folderIdMap: Map<string, string>;
  libraryPath?: string;
  total?: number;
  startedAt: number;
  nextPage: () => Promise<EagleImportPage>;
  getCacheDir?: () => Promise<string>;
  existingJsonAssets?: BufferItem[];
  onJsonBatch?: (assets: BufferItem[]) => void;
  onProgress?: (progress: EagleImportProgress) => void;
  database?: EagleDatabase;
  copyFile?: (sourcePath: string, cacheDir?: string) => Promise<string>;
};

const defaultDatabase: EagleDatabase = {
  start: startEagleImport,
  findDuplicates: findEagleDuplicates,
  writeBatch: importEagleAssetsBatch,
  finish: finishEagleImport,
};

const defaultCopyFile = (sourcePath: string, cacheDir?: string) => invoke<string>(
  'cache_local_file_to_dir',
  { path: sourcePath, dir: cacheDir || undefined },
);

const localFileUrl = (path: string) => (
  typeof window === 'undefined' ? path : convertFileSrc(path)
);

const identityFor = (asset: BufferItem): EagleSourceIdentity => ({
  externalId: asset.externalId || asset.eagleId || '',
  externalPath: asset.externalPath || asset.eagleSourcePath || asset.path || '',
});

const copyPageAssets = async (options: {
  assets: BufferItem[];
  duplicates: Set<string>;
  cacheDir?: string;
  copyFile: (sourcePath: string, cacheDir?: string) => Promise<string>;
}) => {
  const output = [...options.assets];
  const failures: EagleImportFailure[] = [];
  let copied = 0;
  let cursor = 0;
  const worker = async () => {
    while (cursor < output.length) {
      const index = cursor++;
      const asset = output[index];
      const identity = identityFor(asset);
      const duplicate = (identity.externalId && options.duplicates.has(`id:${identity.externalId}`))
        || (identity.externalPath && options.duplicates.has(`path:${identity.externalPath.toLocaleLowerCase()}`));
      if (duplicate) continue;
      const sourcePath = identity.externalPath;
      try {
        const cachedPath = await options.copyFile(sourcePath, options.cacheDir);
        if (!cachedPath) throw new Error('未返回缓存路径');
        output[index] = {
          ...asset,
          path: cachedPath,
          url: localFileUrl(cachedPath),
          eagleImportMode: 'copy',
          sourceAvailability: 'available',
        };
        copied += 1;
      } catch (error) {
        output[index] = null as unknown as BufferItem;
        failures.push({
          filePath: sourcePath,
          reason: error instanceof Error ? error.message : String(error || '复制失败'),
        });
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(COPY_CONCURRENCY, Math.max(1, output.length)) },
    worker,
  ));
  return { assets: output.filter(Boolean), failures, copied };
};

export const runEagleStreamImport = async (
  options: EagleStreamImportOptions,
): Promise<EagleImportProgress> => {
  const database = options.database || defaultDatabase;
  const importId = `eagle-import-${options.startedAt}-${globalThis.crypto.randomUUID()}`;
  let total = options.total || 0;
  let processed = 0;
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  let cached = 0;
  let startIndex = 0;
  const jsonIds = new Set(
    (options.existingJsonAssets || []).map(asset => asset.externalId || asset.eagleId).filter(Boolean),
  );
  const jsonPaths = new Set(
    (options.existingJsonAssets || [])
      .map(asset => asset.externalPath || asset.eagleSourcePath || asset.path)
      .filter(Boolean)
      .map(path => String(path).toLocaleLowerCase()),
  );
  const cacheDir = options.mode === 'copy' && options.getCacheDir
    ? await options.getCacheDir()
    : undefined;

  if (options.storageMode === 'sqlite') {
    await database.start(importId, total || undefined);
  }
  try {
    while (true) {
      const page = await options.nextPage();
      if (page.total && page.total > 0) total = page.total;
      const normalized = normalizeEaglePage({
        entries: page.items,
        folderIdMap: options.folderIdMap,
        libraryPath: options.libraryPath,
        startedAt: options.startedAt,
        startIndex,
        mode: options.mode,
      });
      startIndex += page.items.length;
      processed = page.processed ?? (processed + page.items.length + (page.failures?.length || 0));
      let pageAssets = normalized.assets;
      let pageFailures = [...(page.failures || []), ...normalized.failures];

      if (options.storageMode === 'sqlite') {
        const duplicates = new Set<string>();
        if (options.mode === 'copy' && pageAssets.length > 0) {
          const duplicateResult = await database.findDuplicates(pageAssets.map(identityFor));
          duplicateResult.externalIds.forEach(value => duplicates.add(`id:${value}`));
          duplicateResult.externalPaths.forEach(value => duplicates.add(`path:${value.toLocaleLowerCase()}`));
          const copied = await copyPageAssets({
            assets: pageAssets,
            duplicates,
            cacheDir,
            copyFile: options.copyFile || defaultCopyFile,
          });
          pageAssets = copied.assets;
          pageFailures = [...pageFailures, ...copied.failures];
          cached += copied.copied;
        }
        const result = await database.writeBatch({
          importId,
          assets: pageAssets,
          failures: pageFailures,
          totalCount: total || undefined,
          processedCount: processed,
        });
        ({ imported, skipped, failed } = result);
      } else {
        const uniqueAssets: BufferItem[] = [];
        for (const asset of pageAssets) {
          const identity = identityFor(asset);
          const normalizedPath = identity.externalPath.toLocaleLowerCase();
          if ((identity.externalId && jsonIds.has(identity.externalId)) || (normalizedPath && jsonPaths.has(normalizedPath))) {
            skipped += 1;
            continue;
          }
          if (identity.externalId) jsonIds.add(identity.externalId);
          if (normalizedPath) jsonPaths.add(normalizedPath);
          uniqueAssets.push(asset);
        }
        pageAssets = uniqueAssets;
        if (options.mode === 'copy' && pageAssets.length > 0) {
          const copied = await copyPageAssets({
            assets: pageAssets,
            duplicates: new Set(),
            cacheDir,
            copyFile: options.copyFile || defaultCopyFile,
          });
          pageAssets = copied.assets;
          pageFailures = [...pageFailures, ...copied.failures];
          cached += copied.copied;
        }
        options.onJsonBatch?.(pageAssets);
        imported += pageAssets.length;
        failed += pageFailures.length;
      }

      const progress = { total, processed, imported, skipped, failed, cached };
      options.onProgress?.(progress);
      if (page.done) {
        if (options.storageMode === 'sqlite') {
          await database.finish({
            importId,
            status: failed > 0 ? 'partial_failed' : 'success',
            totalCount: total || undefined,
            processedCount: processed,
          });
        }
        return progress;
      }
    }
  } catch (error) {
    if (options.storageMode === 'sqlite') {
      await database.finish({
        importId,
        status: 'failed',
        totalCount: total || undefined,
        processedCount: processed,
      }).catch(() => undefined);
    }
    throw error;
  }
};
