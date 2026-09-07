import { useEffect, useMemo, useRef, useState } from 'react';

import type { BufferItem, Folder } from '../../types';
import type { DrawerTabType } from '../../types/drawer';
import { getDrawerItemSearchText } from '../../utils/drawerItemSearch';
import { stripHeavyDataThumbnail } from '../../utils/canvasSerialization';
import { getDrawerFolderScopeIds } from '../folderModel';
import { isCanvasDrawerMediaItem } from '../canvasDrawerMedia';
import {
  getAssetCount,
  listAssets,
  type AssetListOptions,
} from '../../services/assetsApi';

export const CANVAS_SEARCH_CANDIDATE_LIMIT = 36;

type DrawerSearchOptions = {
  activeFolderId: string;
  activeTab: DrawerTabType;
  assetStorageMode: 'initializing' | 'sqlite' | 'json';
  folders: Folder[];
  isCanvasMode: boolean;
  isSearchActive: boolean;
  items: BufferItem[];
};

export function useDrawerSearch(options: DrawerSearchOptions) {
  const {
    activeFolderId,
    activeTab,
    assetStorageMode,
    folders,
    isCanvasMode,
    isSearchActive,
    items,
  } = options;
  const [searchQuery, setSearchQuery] = useState('');
  const [deferredSearchQuery, setDeferredSearchQuery] = useState('');
  const [canvasSearchCandidateLimit, setCanvasSearchCandidateLimit] = useState(
    CANVAS_SEARCH_CANDIDATE_LIMIT,
  );
  const [canvasSearchMediaResults, setCanvasSearchMediaResults] = useState({
    candidates: [] as BufferItem[],
    total: 0,
  });
  const drawerItemSearchTextCacheRef = useRef(new WeakMap<BufferItem, string>());

  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredSearchQuery(searchQuery), 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    setCanvasSearchCandidateLimit(CANVAS_SEARCH_CANDIDATE_LIMIT);
  }, [deferredSearchQuery, isCanvasMode, isSearchActive]);

  const normalizedDeferredSearchQuery = useMemo(
    () => deferredSearchQuery.trim().toLowerCase(),
    [deferredSearchQuery],
  );
  const drawerFolderScopeIds = useMemo(() => (
    activeFolderId === 'all'
      ? []
      : [...getDrawerFolderScopeIds(folders, activeFolderId)].sort()
  ), [activeFolderId, folders]);
  const drawerAssetListOptions = useMemo<AssetListOptions>(() => {
    const keyword = isSearchActive ? deferredSearchQuery.trim() : '';
    return {
      keyword: keyword || undefined,
      folder_id: !keyword && activeFolderId === 'all' ? 'all' : undefined,
      folder_ids: !keyword && activeFolderId !== 'all' ? drawerFolderScopeIds : undefined,
      file_type: activeTab !== 'all' && activeTab !== 'notes' && activeTab !== 'calendar'
        ? activeTab
        : undefined,
      sort: 'created_at_desc',
    };
  }, [activeFolderId, activeTab, deferredSearchQuery, drawerFolderScopeIds, isSearchActive]);
  const drawerAssetQueryKey = useMemo(
    () => JSON.stringify(drawerAssetListOptions),
    [drawerAssetListOptions],
  );
  const drawerSearchIndex = useMemo(() => {
    if (assetStorageMode !== 'json' || !isSearchActive) {
      return [] as Array<{ item: BufferItem; text: string }>;
    }
    const cache = drawerItemSearchTextCacheRef.current;
    return items.map(item => {
      let text = cache.get(item);
      if (text === undefined) {
        text = getDrawerItemSearchText(item);
        cache.set(item, text);
      }
      return { item, text };
    });
  }, [assetStorageMode, isSearchActive, items]);
  const drawerScopedItems = useMemo(() => {
    if (isCanvasMode) return [];
    if (assetStorageMode === 'sqlite') {
      if (activeTab === 'notes' || activeTab === 'calendar') return [];
      let result = items;
      if (normalizedDeferredSearchQuery) {
        result = result.filter(item => (
          getDrawerItemSearchText(item).includes(normalizedDeferredSearchQuery)
        ));
      } else if (activeFolderId === 'all') {
        result = result.filter(item => !item.folderId);
      } else {
        const scopeIds = new Set(drawerFolderScopeIds);
        result = result.filter(item => Boolean(item.folderId && scopeIds.has(item.folderId)));
      }
      return activeTab === 'all' ? result : result.filter(item => item.type === activeTab);
    }

    let result = items;
    const hasSearchQuery = Boolean(normalizedDeferredSearchQuery);
    if (hasSearchQuery) {
      result = drawerSearchIndex
        .filter(entry => entry.text.includes(normalizedDeferredSearchQuery))
        .map(entry => entry.item);
    } else if (activeFolderId === 'all') {
      result = result.filter(item => !item.folderId);
    } else {
      const folderScopeIds = getDrawerFolderScopeIds(folders, activeFolderId);
      result = result.filter(item => Boolean(item.folderId && folderScopeIds.has(item.folderId)));
    }
    if (activeTab === 'notes' || activeTab === 'calendar') return [];
    return result.filter(item => activeTab === 'all' || item.type === activeTab);
  }, [
    activeFolderId,
    activeTab,
    assetStorageMode,
    drawerFolderScopeIds,
    drawerSearchIndex,
    folders,
    isCanvasMode,
    items,
    normalizedDeferredSearchQuery,
  ]);

  useEffect(() => {
    const query = normalizedDeferredSearchQuery;
    if (!isCanvasMode || !isSearchActive || !query || assetStorageMode !== 'sqlite') {
      setCanvasSearchMediaResults({ candidates: [], total: 0 });
      return;
    }
    let cancelled = false;
    const limit = Math.max(1, canvasSearchCandidateLimit);
    void Promise.all([
      listAssets({ keyword: query, file_type: 'image', sort: 'created_at_desc', limit }),
      listAssets({ keyword: query, file_type: 'video', sort: 'created_at_desc', limit }),
      getAssetCount({ keyword: query, file_type: 'image' }),
      getAssetCount({ keyword: query, file_type: 'video' }),
    ]).then(([images, videos, imageCount, videoCount]) => {
      if (cancelled) return;
      const candidates = [...images, ...videos]
        .filter(isCanvasDrawerMediaItem)
        .sort((left, right) => right.createdAt - left.createdAt)
        .slice(0, limit)
        .map(stripHeavyDataThumbnail);
      setCanvasSearchMediaResults({ candidates, total: imageCount + videoCount });
    }).catch(error => console.warn('SQLite 画布素材搜索失败:', error));
    return () => { cancelled = true; };
  }, [
    assetStorageMode,
    canvasSearchCandidateLimit,
    isCanvasMode,
    isSearchActive,
    normalizedDeferredSearchQuery,
  ]);

  return {
    canvasSearchCandidateLimit,
    canvasSearchMediaResults,
    deferredSearchQuery,
    drawerAssetListOptions,
    drawerAssetQueryKey,
    drawerScopedItems,
    normalizedDeferredSearchQuery,
    searchQuery,
    setCanvasSearchCandidateLimit,
    setSearchQuery,
  };
}
