import { useCallback, useEffect, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';

import type { BufferItem } from '../../types';
import {
  ASSET_PAGE_SIZE,
  getAssetCount,
  getFolderAssetCounts,
  listAssets,
  MAX_DRAWER_ASSET_CACHE_SIZE,
  type AssetListOptions,
} from '../../services/assetsApi';
import { mergeDrawerAssetPageWindow } from '../../hooks/useDrawerAssetCache';
import { getDrawerItemSearchText } from '../../utils/drawerItemSearch';
import { stripHeavyDataThumbnail } from '../../utils/canvasSerialization';

const DEFAULT_LIBRARY_ID = 'default';

export const assetMatchesDrawerQuery = (item: BufferItem, options: AssetListOptions) => {
  if (options.file_type && item.type !== options.file_type) return false;
  const keyword = options.keyword?.trim().toLocaleLowerCase();
  if (keyword && !getDrawerItemSearchText(item).includes(keyword)) return false;
  if (!keyword && options.folder_ids?.length) {
    return Boolean(item.folderId && options.folder_ids.includes(item.folderId));
  }
  if (!keyword && options.folder_id === 'all') return !item.folderId;
  if (!keyword && options.folder_id) return item.folderId === options.folder_id;
  return true;
};

type UseDrawerAssetQueryOptions = {
  ready: boolean;
  storageMode: 'initializing' | 'sqlite' | 'json';
  isUtilityActive: boolean;
  query: AssetListOptions;
  queryKey: string;
  statsRevision: number;
  items: BufferItem[];
  itemsRef: MutableRefObject<BufferItem[]>;
  replaceAssets: (assets: BufferItem[]) => void;
  appendAssets: (assets: BufferItem[]) => void;
  onFirstPageReady: () => void;
};

export const useDrawerAssetQuery = (options: UseDrawerAssetQueryOptions) => {
  const {
    ready,
    storageMode,
    isUtilityActive,
    query,
    queryKey,
    statsRevision,
    items,
    itemsRef,
    replaceAssets,
    appendAssets,
    onFirstPageReady,
  } = options;
  const [totalAssetCount, setTotalAssetCount] = useState(0);
  const [assetWindowOffset, setAssetWindowOffset] = useState(0);
  const [hasMoreAssets, setHasMoreAssets] = useState(false);
  const [isAssetPageLoading, setIsAssetPageLoading] = useState(false);
  const [folderAssetCountRows, setFolderAssetCountRows] = useState<Array<{
    folderId: string | null;
    count: number;
  }>>([]);
  const [quickAccessItems, setQuickAccessItems] = useState<BufferItem[]>([]);
  const [queryRevision, setQueryRevision] = useState(0);
  const requestIdRef = useRef(0);
  const offsetsInFlightRef = useRef(new Set<number>());
  const queryRef = useRef<AssetListOptions>(query);
  const totalRef = useRef(0);
  const windowOffsetRef = useRef(0);

  const cancel = useCallback(() => {
    requestIdRef.current += 1;
    offsetsInFlightRef.current.clear();
    setIsAssetPageLoading(false);
  }, []);

  const refresh = useCallback(() => {
    setQueryRevision(revision => revision + 1);
  }, []);

  useEffect(() => {
    windowOffsetRef.current = 0;
    setAssetWindowOffset(0);
  }, [queryKey]);

  useEffect(() => {
    if (!ready || storageMode !== 'sqlite' || isUtilityActive) {
      cancel();
      return;
    }
    const requestId = ++requestIdRef.current;
    offsetsInFlightRef.current.clear();
    offsetsInFlightRef.current.add(0);
    queryRef.current = query;
    setIsAssetPageLoading(true);
    void Promise.all([
      getAssetCount(query),
      listAssets({ ...query, offset: 0, limit: ASSET_PAGE_SIZE }),
    ]).then(([count, firstPage]) => {
      if (requestId !== requestIdRef.current) return;
      const compactPage = firstPage.map(stripHeavyDataThumbnail);
      replaceAssets(compactPage);
      windowOffsetRef.current = 0;
      setAssetWindowOffset(0);
      totalRef.current = count;
      setTotalAssetCount(count);
      setHasMoreAssets(compactPage.length < count);
    }).catch(error => {
      if (requestId !== requestIdRef.current) return;
      console.warn('SQLite 素材首屏查询失败:', error);
      replaceAssets([]);
      totalRef.current = 0;
      setTotalAssetCount(0);
      setHasMoreAssets(false);
    }).finally(() => {
      offsetsInFlightRef.current.delete(0);
      if (requestId === requestIdRef.current) {
        setIsAssetPageLoading(false);
        onFirstPageReady();
      }
    });
  }, [
    cancel,
    isUtilityActive,
    onFirstPageReady,
    query,
    queryKey,
    ready,
    replaceAssets,
    storageMode,
    queryRevision,
  ]);

  const loadNextPage = useCallback(() => {
    if (storageMode !== 'sqlite' || isAssetPageLoading || !hasMoreAssets) return;
    const requestId = requestIdRef.current;
    const cachedQueryAssets = itemsRef.current.filter(item => (
      assetMatchesDrawerQuery(item, queryRef.current)
    ));
    const offset = windowOffsetRef.current + cachedQueryAssets.length;
    if (offsetsInFlightRef.current.has(offset)) return;
    offsetsInFlightRef.current.add(offset);
    setIsAssetPageLoading(true);
    void listAssets({ ...queryRef.current, offset, limit: ASSET_PAGE_SIZE })
      .then(page => {
        if (requestId !== requestIdRef.current) return;
        const compactPage = page.map(stripHeavyDataThumbnail);
        const merged = mergeDrawerAssetPageWindow(
          cachedQueryAssets,
          compactPage,
          MAX_DRAWER_ASSET_CACHE_SIZE,
        );
        if (merged.evictedFromStart > 0) {
          const nextWindowOffset = windowOffsetRef.current + merged.evictedFromStart;
          windowOffsetRef.current = nextWindowOffset;
          setAssetWindowOffset(nextWindowOffset);
          replaceAssets(merged.assets);
        } else {
          appendAssets(compactPage);
        }
        setHasMoreAssets(
          compactPage.length > 0 && offset + compactPage.length < totalRef.current,
        );
      })
      .catch(error => console.warn('SQLite 素材分页查询失败:', error))
      .finally(() => {
        offsetsInFlightRef.current.delete(offset);
        if (requestId === requestIdRef.current) setIsAssetPageLoading(false);
      });
  }, [
    appendAssets,
    hasMoreAssets,
    isAssetPageLoading,
    itemsRef,
    replaceAssets,
    storageMode,
  ]);

  const loadPreviousPage = useCallback(() => {
    if (storageMode !== 'sqlite' || isAssetPageLoading || windowOffsetRef.current <= 0) return;
    const requestId = requestIdRef.current;
    const currentWindowOffset = windowOffsetRef.current;
    const limit = Math.min(ASSET_PAGE_SIZE, currentWindowOffset);
    const offset = currentWindowOffset - limit;
    if (offsetsInFlightRef.current.has(offset)) return;
    offsetsInFlightRef.current.add(offset);
    setIsAssetPageLoading(true);
    void listAssets({ ...queryRef.current, offset, limit })
      .then(page => {
        if (requestId !== requestIdRef.current) return;
        const compactPage = page.map(stripHeavyDataThumbnail);
        const cachedQueryAssets = itemsRef.current.filter(item => (
          assetMatchesDrawerQuery(item, queryRef.current)
        ));
        const merged = [...new Map(
          [...compactPage, ...cachedQueryAssets].map(item => [item.id, item]),
        ).values()].slice(0, MAX_DRAWER_ASSET_CACHE_SIZE);
        windowOffsetRef.current = offset;
        setAssetWindowOffset(offset);
        replaceAssets(merged);
        setHasMoreAssets(offset + merged.length < totalRef.current);
      })
      .catch(error => console.warn('SQLite 素材上一页查询失败:', error))
      .finally(() => {
        offsetsInFlightRef.current.delete(offset);
        if (requestId === requestIdRef.current) setIsAssetPageLoading(false);
      });
  }, [isAssetPageLoading, itemsRef, replaceAssets, storageMode]);

  useEffect(() => {
    if (!ready || storageMode !== 'sqlite') return;
    let cancelled = false;
    void Promise.all([
      getFolderAssetCounts(DEFAULT_LIBRARY_ID),
      listAssets({ quick_access: true, sort: 'updated_at_desc', offset: 0, limit: ASSET_PAGE_SIZE }),
      getAssetCount(queryRef.current),
    ]).then(([counts, pinned, currentQueryCount]) => {
      if (cancelled) return;
      setFolderAssetCountRows(counts);
      setQuickAccessItems(pinned.map(stripHeavyDataThumbnail));
      totalRef.current = currentQueryCount;
      setTotalAssetCount(currentQueryCount);
      const loadedQueryCount = itemsRef.current.filter(item => (
        assetMatchesDrawerQuery(item, queryRef.current)
      )).length;
      setHasMoreAssets(windowOffsetRef.current + loadedQueryCount < currentQueryCount);
    }).catch(error => console.warn('SQLite 素材统计查询失败:', error));
    return () => { cancelled = true; };
  }, [itemsRef, queryRevision, ready, statsRevision, storageMode]);

  useEffect(() => {
    if (storageMode !== 'json') return;
    setQuickAccessItems(items.filter(item => item.isQuickAccess));
    setTotalAssetCount(items.length);
    setHasMoreAssets(false);
    const counts = new Map<string | null, number>();
    items.forEach(item => {
      const folderId = item.folderId || null;
      counts.set(folderId, (counts.get(folderId) || 0) + 1);
    });
    setFolderAssetCountRows([...counts].map(([folderId, count]) => ({ folderId, count })));
  }, [items, storageMode]);

  return {
    totalAssetCount,
    assetWindowOffset,
    hasMoreAssets,
    isAssetPageLoading,
    folderAssetCountRows,
    quickAccessItems,
    setQuickAccessItems,
    loadNextDrawerAssetPage: loadNextPage,
    loadPreviousDrawerAssetPage: loadPreviousPage,
    refreshDrawerAssetQuery: refresh,
    cancelDrawerAssetQuery: cancel,
  };
};
