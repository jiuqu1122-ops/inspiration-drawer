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

type AssetSnapshotEntry = {
  asset: BufferItem;
  serialized?: string;
};

type AssetSnapshot = Map<string, AssetSnapshotEntry>;

export type DrawerAssetDiff = {
  added: BufferItem[];
  changed: BufferItem[];
  removedIds: string[];
  snapshot: AssetSnapshot;
};

const snapshotAsset = (asset: BufferItem): AssetSnapshotEntry => ({
  asset,
});

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

export const mergeDrawerQueryAssetsWithPending = (
  queriedAssets: BufferItem[],
  pendingAssets: Iterable<BufferItem>,
) => {
  const merged = new Map<string, BufferItem>();
  for (const asset of pendingAssets) merged.set(asset.id, asset);
  queriedAssets.forEach(asset => {
    if (!merged.has(asset.id)) merged.set(asset.id, asset);
  });
  return [...merged.values()];
};

export const createDrawerAssetSnapshot = (assets: BufferItem[]): AssetSnapshot => (
  new Map(assets.map(asset => [asset.id, snapshotAsset(asset)]))
);

export const diffDrawerAssets = (
  previous: AssetSnapshot,
  assets: BufferItem[],
): DrawerAssetDiff => {
  const snapshot: AssetSnapshot = new Map();
  const added: BufferItem[] = [];
  const changed: BufferItem[] = [];
  const currentIds = new Set<string>();

  assets.forEach(asset => {
    currentIds.add(asset.id);
    const before = previous.get(asset.id);
    // Almost every drawer edit preserves object identity for unchanged rows.
    // Reuse their snapshots so changing one card does not JSON.stringify the
    // entire 2,000-item cache on the WebView's UI thread.
    if (before?.asset === asset) {
      snapshot.set(asset.id, before);
      return;
    }
    const nextSerialized = JSON.stringify(asset);
    const next: AssetSnapshotEntry = { asset, serialized: nextSerialized };
    snapshot.set(asset.id, next);
    if (before === undefined) {
      added.push(asset);
    } else if ((before.serialized ?? JSON.stringify(before.asset)) !== nextSerialized) {
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
  const pendingAddedAssetsRef = useRef(new Map<string, BufferItem>());
  const persistenceQueueRef = useRef<Promise<void>>(Promise.resolve());
  const onPersistedRef = useRef(onPersisted);
  const onErrorRef = useRef(onError);

  useEffect(() => { onPersistedRef.current = onPersisted; }, [onPersisted]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  const replaceAssetsFromQuery = useCallback((nextAssets: BufferItem[]) => {
    const deduped = mergeDrawerQueryAssetsWithPending(
      nextAssets,
      pendingAddedAssetsRef.current.values(),
    );
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

  const updateAssetsFromQuery = useCallback((updatedAssets: BufferItem[]) => {
    if (updatedAssets.length === 0) return;
    const updatedById = new Map(updatedAssets.map(asset => [asset.id, asset]));
    setAssetState(previous => {
      let changed = false;
      const next = previous.map(asset => {
        const updated = updatedById.get(asset.id);
        if (!updated || updated === asset) return asset;
        changed = true;
        return updated;
      });
      if (!changed) return previous;
      const baseline = new Map(baselineRef.current);
      updatedAssets.forEach(asset => {
        if (baseline.has(asset.id)) baseline.set(asset.id, snapshotAsset(asset));
      });
      baselineRef.current = baseline;
      return next;
    });
  }, []);

  const mutateAssets = useCallback<Dispatch<SetStateAction<BufferItem[]>>>((update) => {
    setAssetState(previous => {
      const next = typeof update === 'function'
        ? update(previous)
        : update;
      if (pendingAddedAssetsRef.current.size > 0) {
        next.forEach(asset => {
          if (pendingAddedAssetsRef.current.has(asset.id)) {
            pendingAddedAssetsRef.current.set(asset.id, asset);
          }
        });
      }
      return next;
    });
    setMutationRevision(revision => revision + 1);
  }, []);

  const prependAssetsAndPersist = useCallback((newAssets: BufferItem[]) => {
    const uniqueAssets = [...new Map(newAssets.map(asset => [asset.id, asset])).values()];
    if (uniqueAssets.length === 0) return Promise.resolve();

    if (storageMode !== 'sqlite') {
      mutateAssets(previous => mergeDrawerQueryAssetsWithPending(previous, uniqueAssets));
      return Promise.resolve();
    }

    uniqueAssets.forEach(asset => pendingAddedAssetsRef.current.set(asset.id, asset));
    setAssetState(previous => {
      const next = mergeDrawerQueryAssetsWithPending(previous, uniqueAssets);
      const baseline = new Map(baselineRef.current);
      uniqueAssets.forEach(asset => baseline.set(asset.id, snapshotAsset(asset)));
      baselineRef.current = baseline;
      return next;
    });

    const persist = persistenceQueueRef.current.then(async () => {
      await upsertAssetsInBatches(uniqueAssets);
      uniqueAssets.forEach(asset => pendingAddedAssetsRef.current.delete(asset.id));
      onPersistedRef.current?.();
    });
    persistenceQueueRef.current = persist.catch(error => {
      uniqueAssets.forEach(asset => pendingAddedAssetsRef.current.delete(asset.id));
      onErrorRef.current?.(error);
    });
    return persist;
  }, [mutateAssets, storageMode]);

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
    updateAssetsFromQuery,
    prependAssetsAndPersist,
  };
};
