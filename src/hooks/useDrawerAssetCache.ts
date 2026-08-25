import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';

import {
  ASSET_WRITE_BATCH_SIZE,
  deleteAssetsInBatches,
  MAX_DRAWER_ASSET_CACHE_SIZE,
  updateAssetsBatch,
  upsertAssetsInBatches,
} from '../services/assetsApi';
import type { AssetBatchUpdate } from '../services/assetsApi';
import type { BufferItem } from '../types';

type AssetSnapshot = Map<string, string>;

export type DrawerAssetDiff = {
  added: BufferItem[];
  changed: BufferItem[];
  removedIds: string[];
  snapshot: AssetSnapshot;
};

const snapshotAsset = (asset: BufferItem) => JSON.stringify(asset);

export const capDrawerAssetCache = (
  assets: BufferItem[],
  maximum = MAX_DRAWER_ASSET_CACHE_SIZE,
) => assets.length > maximum ? assets.slice(0, maximum) : assets;

export const mergeDrawerAssetPageWindow = (
  current: BufferItem[],
  page: BufferItem[],
  maximum = MAX_DRAWER_ASSET_CACHE_SIZE,
) => {
  const merged = [...new Map([...current, ...page].map(asset => [asset.id, asset])).values()];
  const evictedFromStart = Math.max(0, merged.length - maximum);
  return {
    assets: evictedFromStart > 0 ? merged.slice(evictedFromStart) : merged,
    evictedFromStart,
  };
};

export const createDrawerAssetSnapshot = (assets: BufferItem[]): AssetSnapshot => (
  new Map(assets.map(asset => [asset.id, snapshotAsset(asset)]))
);

export const diffDrawerAssets = (
  previous: AssetSnapshot,
  assets: BufferItem[],
): DrawerAssetDiff => {
  const snapshot = createDrawerAssetSnapshot(assets);
  const added: BufferItem[] = [];
  const changed: BufferItem[] = [];
  const currentIds = new Set<string>();

  assets.forEach(asset => {
    currentIds.add(asset.id);
    const before = previous.get(asset.id);
    if (before === undefined) {
      added.push(asset);
    } else if (before !== snapshot.get(asset.id)) {
      changed.push(asset);
    }
  });

  return {
    added,
    changed,
    removedIds: [...previous.keys()].filter(id => !currentIds.has(id)),
    snapshot,
  };
};

type UseDrawerAssetCacheOptions = {
  storageMode: 'initializing' | 'sqlite' | 'json';
  onPersisted?: () => void;
  onError?: (error: unknown) => void;
};

export const useDrawerAssetCache = ({
  storageMode,
  onPersisted,
  onError,
}: UseDrawerAssetCacheOptions) => {
  const [assets, setAssetState] = useState<BufferItem[]>([]);
  const [mutationRevision, setMutationRevision] = useState(0);
  const baselineRef = useRef<AssetSnapshot>(new Map());
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const onPersistedRef = useRef(onPersisted);
  const onErrorRef = useRef(onError);

  useEffect(() => { onPersistedRef.current = onPersisted; }, [onPersisted]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const replaceAssetsFromQuery = useCallback((nextAssets: BufferItem[]) => {
    const deduped = [...new Map(nextAssets.map(asset => [asset.id, asset])).values()];
    baselineRef.current = createDrawerAssetSnapshot(deduped);
    setAssetState(deduped);
  }, []);

  const appendAssetsFromQuery = useCallback((nextAssets: BufferItem[]) => {
    if (nextAssets.length === 0) return;
    setAssetState(previous => {
      const merged = new Map(previous.map(asset => [asset.id, asset]));
      nextAssets.forEach(asset => merged.set(asset.id, asset));
      const next = [...merged.values()];
      baselineRef.current = createDrawerAssetSnapshot(next);
      return next;
    });
  }, []);

  const mutateAssets = useCallback<Dispatch<SetStateAction<BufferItem[]>>>((update) => {
    setAssetState(previous => (
      typeof update === 'function'
        ? update(previous)
        : update
    ));
    setMutationRevision(revision => revision + 1);
  }, []);

  useEffect(() => {
    if (mutationRevision === 0) return;
    const diff = diffDrawerAssets(baselineRef.current, assets);
    baselineRef.current = diff.snapshot;
    if (storageMode !== 'sqlite') return;
    if (diff.added.length === 0 && diff.changed.length === 0 && diff.removedIds.length === 0) return;

    const persist = async () => {
      if (diff.added.length > 0) {
        await upsertAssetsInBatches(diff.added);
      }
      for (let offset = 0; offset < diff.changed.length; offset += ASSET_WRITE_BATCH_SIZE) {
        const updates: AssetBatchUpdate[] = diff.changed
          .slice(offset, offset + ASSET_WRITE_BATCH_SIZE)
          .map(asset => ({ ids: [asset.id], patch: { metadata: asset } }));
        await updateAssetsBatch(updates);
      }
      if (diff.removedIds.length > 0) {
        await deleteAssetsInBatches(diff.removedIds);
      }
      setAssetState(current => {
        const capped = capDrawerAssetCache(current);
        if (capped === current) return current;
        baselineRef.current = createDrawerAssetSnapshot(capped);
        return capped;
      });
      onPersistedRef.current?.();
    };

    persistenceQueueRef.current = persistenceQueueRef.current
      .then(persist)
      .catch(error => {
        onErrorRef.current?.(error);
      });
  }, [assets, mutationRevision, storageMode]);

  return {
    assets,
    setAssets: mutateAssets,
    replaceAssetsFromQuery,
    appendAssetsFromQuery,
  };
};
