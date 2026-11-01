import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { emitTo } from '@tauri-apps/api/event';
import { open,save } from '@tauri-apps/plugin-dialog';
import React from 'react';
import { moveAssetsFromFolders } from '../../../services/assetsApi';
import { DEFAULT_LIBRARY_ID } from '../../../services/canvasApi';
import { moveFolders } from '../../../services/libraryApi';
import { getVideoThumbnail } from '../../../services/mediaThumbnail';
import { BufferItem,Folder } from '../../../types';
import type { DrawerTabType,FolderContextMenuState } from '../../../types/drawer';
import { readImageDisplaySize } from '../../../utils/canvasImageSize';
import { createCanvasAiOutputBufferItem,getCanvasAiSuccessfulOutputs } from '../../../utils/canvasItemSelectors';
import { normalizeLocalDragPath } from '../../../utils/localMediaPaths';
import { getDurableAiMediaSource } from '../../aiImageResultRecovery';
import { isCanvasAiGeneratedType,isCanvasAiGeneratorType } from '../../canvasAiRuntime';
import { type CanvasImageItem } from '../../canvasModel';
import { getNameFromUrl,normalizeDraggedUrl } from '../../dragData';
import { getDrawerExternalDragCacheCandidates,getDrawerExternalDragLocalCandidates } from '../../drawerExternalDrag';
import { getDrawerFolderDeletionPlan,normalizeDrawerFolders } from '../../folderModel';

type drawerAssetsActionContext = { lastDroppedPathsKeyRef: React.RefObject<string>; lastNativeDropAtRef: React.RefObject<number>; createAssetId: () => `${string}-${string}-${string}-${string}-${string}`; activeFolderIdRef: React.RefObject<string>; pushDrawerUndoSnapshot: (label: string, options?: { shareImmutableItems?: boolean; }) => void; invalidateDrawerAssetQueryForImport: () => void; prependAssetsAndPersist: (newAssets: BufferItem[]) => Promise<void>; setActiveTab: React.Dispatch<React.SetStateAction<DrawerTabType>>; setIsOpen: React.Dispatch<React.SetStateAction<boolean>>; getLatestFileCacheDir: () => Promise<string>; setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>; enqueueAutoAiTaggingForItems: (incomingItems: BufferItem[]) => void; claimExternalWebImageDrop: (normalizedUrl: string, itemId: string, location: "drawer" | "canvas") => boolean; getPersistentWebSourceUrl: (value?: string) => string | undefined; sourceUrl: string | undefined; captureSource: "browser-extension" | undefined; pageUrl: string | undefined; getWebCaptureSourceSite: (pageUrl?: string) => string | undefined; pageTitle: string | undefined; imageAlt: string | undefined; width: number | undefined; height: number | undefined; sourceType: string | undefined; folderId: string | undefined; showToast: (message: string) => void; webImageCacheDirRef: React.RefObject<string>; cacheWebImageFromCandidates: (urls: string[], name: string, dir?: string) => Promise<{ cachedPath: string; sourceUrl: string; }>; supersededWebImageItemIdsRef: React.RefObject<Set<string>>; dragId: string; localPath: string | undefined; cachedPath: string; getCanvasDropPosition: (index?: number, client?: { x: number; y: number; }) => { x: number; y: number; }; makeCanvasNodeId: (seed: string, kind?: string) => string; x: number; y: number; appendCanvasItems: (nextItems: CanvasImageItem[], label: string, select?: boolean) => number; newFolderName: string; newFolderParentId: string | null; folders: Folder[]; setFolders: React.Dispatch<React.SetStateAction<Folder[]>>; insertDrawerFolderAtTop: (currentFolders: Folder[], folder: Folder) => Folder[]; persistFoldersSnapshot: (nextFolders: Folder[]) => void; setCollapsedFolderIds: React.Dispatch<React.SetStateAction<string[]>>; closeFolderModal: () => void; assetStorageMode: "initializing" | "sqlite" | "json"; setAssetStatsRevision: React.Dispatch<React.SetStateAction<number>>; activeFolderId: string; setActiveFolderId: React.Dispatch<React.SetStateAction<string>>; lastSelectedFolderIdRef: React.RefObject<string | null>; visibleFolderIds: string[]; setSelectedFolderIds: React.Dispatch<React.SetStateAction<string[]>>; foldersRef: React.RefObject<Folder[]>; setFolderMoveTargetId: React.Dispatch<React.SetStateAction<string | null>>; setShowMoveExistingFolderModal: React.Dispatch<React.SetStateAction<boolean>>; setShowMoveFolderModal: React.Dispatch<React.SetStateAction<boolean>>; setShowFolderModal: React.Dispatch<React.SetStateAction<boolean>>; setFolderContextMenu: React.Dispatch<React.SetStateAction<FolderContextMenuState | null>>; isInvalidFolderMoveTarget: (targetId: string | null, movingIds?: string[]) => boolean; setIsMovingFolders: React.Dispatch<React.SetStateAction<boolean>>; getFolderActionIds: (folderId?: string | null) => string[]; activeFolderIdStateRef: React.RefObject<string>; draggingItemIdRef: React.RefObject<string | null>; draggingFolderIdsRef: React.RefObject<string[]>; FOLDER_DRAG_MIME: "application/x-inspiration-drawer-folder-ids"; setDraggingFolderIds: React.Dispatch<React.SetStateAction<string[]>>; editingFolderId: string | null; clearDrawerFolderDragState: () => void; setDragOverFolderId: React.Dispatch<React.SetStateAction<string | null>>; setFolderMoveDragOverId: React.Dispatch<React.SetStateAction<string | null>>; suppressNextFolderClickRef: React.RefObject<boolean>; moveDrawerFoldersToParent: (folderIds: string[], targetParentId?: string | null) => Promise<void>; sanitizeExportFileName: (name: string, fallback?: string) => string; extensionFromValue: (value?: string | null) => string; items: BufferItem[]; selectedIds: string[]; exportFileNameForItem: (item: BufferItem, index: number, used: Set<string>) => string; setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>; setIsSelectMode: React.Dispatch<React.SetStateAction<boolean>>; canvasItemsRef: React.RefObject<CanvasImageItem[]>; downloadBufferItems: (sourceItems: BufferItem[], options?: { feature?: string; }) => Promise<void>; moveFolderName: string; setMoveFolderName: React.Dispatch<React.SetStateAction<string>>; getDraggedDrawerFolderIds: (dt?: DataTransfer | null) => string[]; getDraggedDrawerItemId: (dt?: DataTransfer | null) => string; moveDrawerItemToFolder: (itemId: string, folderId?: string, folderName?: string) => boolean; clearDrawerItemDragState: () => void; displayItems: BufferItem[]; lastSelectedDrawerItemIdRef: React.RefObject<string | null>; updateCanvasItemsImmediate: (updater: (prev: CanvasImageItem[]) => CanvasImageItem[]) => CanvasImageItem[]; getExternalDragItemsForItem: (itemId: string) => BufferItem[]; resolveExternalDragLocalPath: (item: BufferItem) => Promise<{ path: string; restored: boolean; }>; path: string; restored: boolean; isPointerInsideDrawerRef: React.RefObject<boolean>; clearIdleAutoClose: () => void; scheduleAutoClose: (delay?: number) => void; isResizingCards: boolean; setDraggingItemId: React.Dispatch<React.SetStateAction<string | null>>; isGlobalMouseDown: React.RefObject<boolean>; startNativeDrawerItemDrag: (itemId: string) => Promise<boolean>; canvasSurfaceRef: React.RefObject<HTMLDivElement | null>; isCanvasModeRef: React.RefObject<boolean>; addDrawerMediaItemToCanvas: (itemId: string, client?: { x: number; y: number; }) => Promise<boolean>; renameValue: string; setEditingFolderId: React.Dispatch<React.SetStateAction<string | null>>; };

type WebImageCaptureMetadata = {
    dragId?: string;
    sourceUrl?: string;
    pageUrl?: string;
    pageTitle?: string;
    imageAlt?: string;
    width?: number;
    height?: number;
    sourceType?: string;
    captureSource?: 'browser-extension';
    folderId?: string;
    localPath?: string;
  };

export const addDroppedPathsImpl = async (ctx: Pick<drawerAssetsActionContext, 'activeFolderIdRef' | 'createAssetId' | 'enqueueAutoAiTaggingForItems' | 'getLatestFileCacheDir' | 'invalidateDrawerAssetQueryForImport' | 'lastDroppedPathsKeyRef' | 'lastNativeDropAtRef' | 'prependAssetsAndPersist' | 'pushDrawerUndoSnapshot' | 'setActiveTab' | 'setIsOpen' | 'setItems'>, paths: string[]) => {
  const { activeFolderIdRef, createAssetId, enqueueAutoAiTaggingForItems, getLatestFileCacheDir, invalidateDrawerAssetQueryForImport, lastDroppedPathsKeyRef, lastNativeDropAtRef, prependAssetsAndPersist, pushDrawerUndoSnapshot, setActiveTab, setIsOpen, setItems } = ctx;
    const cleanPaths = Array.from(new Set((paths || []).filter(Boolean)));
    if (cleanPaths.length === 0) return;

    const key = cleanPaths.join('\n');
    const now = Date.now();
    if (key === lastDroppedPathsKeyRef.current && now - lastNativeDropAtRef.current < 600) return;
    lastDroppedPathsKeyRef.current = key;
    lastNativeDropAtRef.current = now;

    const stagedItems = await Promise.all(cleanPaths.map(async originalPath => {
      const fileName = originalPath.split(/[\\/]/).pop() || '未知文件';
      const ext = fileName.split('.').pop()?.toLowerCase() || '';
      let kind: 'file' | 'directory' | 'missing' = 'file';
      try {
        kind = await invoke<'file' | 'directory' | 'missing'>('path_kind', { path: originalPath });
      } catch (_) {
        kind = 'file';
      }

      const isDirectory = kind === 'directory';
      let type: 'image' | 'video' | 'file' | 'text' = 'file';
      if (!isDirectory && ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) type = 'image';
      else if (!isDirectory && ['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) type = 'video';
      return {
        id: createAssetId(), type, content: fileName, name: fileName,
        path: originalPath,
        url: isDirectory ? '' : convertFileSrc(originalPath),
        createdAt: Date.now(), isQuickAccess: false,
        folderId: activeFolderIdRef.current !== 'all' ? activeFolderIdRef.current : undefined,
        isDirectory,
      } as BufferItem & { isDirectory?: boolean };
    }));

    pushDrawerUndoSnapshot('拖入素材');
    invalidateDrawerAssetQueryForImport();
    const persistImport = prependAssetsAndPersist(stagedItems);
    void persistImport.then(
      () => setActiveTab('all'),
      () => setActiveTab('all'),
    );
    setIsOpen(true);

    // 卡片先用原始路径即时显示；文件复制和视频缩略图放到后台完成，
    // 避免大文件导入期间抽屉看起来没有响应。
    void (async () => {
      const latestCacheDir = await getLatestFileCacheDir();
      const cachedItems = await Promise.all(stagedItems.map(async stagedItem => {
        if (stagedItem.isDirectory || !stagedItem.path) return stagedItem;
        const originalSourcePath = stagedItem.path;
        let path = originalSourcePath;
        let fileName = stagedItem.name || stagedItem.content || '未知文件';

        // 有些浏览器/Windows OLE 拖网页图片时不会给 URL，只给一个已经落到 App 默认目录的临时文件路径。
        // 这类路径不会经过 addWebImageUrl，所以这里再兜底把 App 默认缓存里的图片迁移到用户设置的缓存目录。
        if (stagedItem.type === 'image' && latestCacheDir) {
          try {
            const relocatedPath = await invoke<string>('relocate_web_cache_file', {
              path,
              dir: latestCacheDir,
            });
            if (relocatedPath) {
              path = relocatedPath;
              fileName = path.split(/[\\/]/).pop() || fileName;
            }
          } catch (err) {
            console.warn('文件缓存路径迁移失败:', err);
          }
        }

        // 本地拖入的文件/图片/视频统一复制一份到缓存目录，卡片后续指向缓存副本。
        // 这样即使原文件被移动，抽屉里的灵感也还能打开、预览和进行 AI 分析。
        try {
          const cachedPath = await invoke<string>('cache_local_file_to_dir', {
            path,
            dir: latestCacheDir || undefined,
          });
          if (cachedPath) {
            path = cachedPath;
            fileName = path.split(/[\\/]/).pop() || fileName;
          }
        } catch (err) {
          console.warn('本地文件缓存失败，保留原路径:', err);
        }

        let thumbnail = stagedItem.thumbnail;
        if (stagedItem.type === 'video') {
          try {
            thumbnail = await getVideoThumbnail(path);
          } catch (err) {
            console.warn('视频缩略图生成失败:', err);
          }
        }

        return {
          ...stagedItem,
          content: fileName,
          name: fileName,
          path,
          url: convertFileSrc(path),
          thumbnail: thumbnail || undefined,
          sourceUrl: originalSourcePath !== path ? originalSourcePath : undefined,
          originalUrl: originalSourcePath !== path ? originalSourcePath : undefined,
        } as BufferItem;
      }));
      const cachedById = new Map(cachedItems.map(item => [item.id, item]));
      const stagedById = new Map(stagedItems.map(item => [item.id, item]));
      invalidateDrawerAssetQueryForImport();
      setItems(previous => previous.map(item => {
        const cached = cachedById.get(item.id);
        const staged = stagedById.get(item.id);
        if (!cached || !staged) return item;
        return {
          ...item,
          content: item.content === staged.content ? cached.content : item.content,
          name: item.name === staged.name ? cached.name : item.name,
          path: cached.path,
          url: cached.url,
          thumbnail: cached.thumbnail,
          sourceUrl: cached.sourceUrl,
          originalUrl: cached.originalUrl,
        };
      }));
      enqueueAutoAiTaggingForItems(cachedItems);
    })().catch(err => console.warn('后台缓存拖入素材失败:', err));

};

export const addWebImageUrlImpl = (ctx: Pick<drawerAssetsActionContext, 'activeFolderIdRef' | 'cacheWebImageFromCandidates' | 'claimExternalWebImageDrop' | 'createAssetId' | 'enqueueAutoAiTaggingForItems' | 'getPersistentWebSourceUrl' | 'getWebCaptureSourceSite' | 'invalidateDrawerAssetQueryForImport' | 'prependAssetsAndPersist' | 'pushDrawerUndoSnapshot' | 'setActiveTab' | 'setIsOpen' | 'setItems' | 'showToast' | 'supersededWebImageItemIdsRef' | 'webImageCacheDirRef'>, url: string, name?: string, fallbackUrls: string[] = [], captureMetadata: WebImageCaptureMetadata = {}) => {
  const { activeFolderIdRef, cacheWebImageFromCandidates, claimExternalWebImageDrop, createAssetId, enqueueAutoAiTaggingForItems, getPersistentWebSourceUrl, getWebCaptureSourceSite, invalidateDrawerAssetQueryForImport, prependAssetsAndPersist, pushDrawerUndoSnapshot, setActiveTab, setIsOpen, setItems, showToast, supersededWebImageItemIdsRef, webImageCacheDirRef } = ctx;
    const normalizedUrl = normalizeDraggedUrl(url);
    if (!normalizedUrl) return;

    const itemId = createAssetId();
    if (!claimExternalWebImageDrop(normalizedUrl, itemId, 'drawer')) return;
    const displayName = name || getNameFromUrl(normalizedUrl);
    const persistentSourceUrl = getPersistentWebSourceUrl(captureMetadata.sourceUrl)
      || (!captureMetadata.captureSource ? getPersistentWebSourceUrl(normalizedUrl) : undefined);
    const newItem: BufferItem = {
      id: itemId,
      type: 'image',
      content: displayName,
      name: displayName,
      url: normalizedUrl,
      path: normalizedUrl,
      sourceUrl: persistentSourceUrl,
      originalUrl: persistentSourceUrl,
      pageUrl: captureMetadata.pageUrl,
      sourceSite: getWebCaptureSourceSite(captureMetadata.pageUrl),
      pageTitle: captureMetadata.pageTitle,
      imageAlt: captureMetadata.imageAlt,
      width: captureMetadata.width,
      height: captureMetadata.height,
      originalWidth: captureMetadata.width,
      originalHeight: captureMetadata.height,
      captureSource: captureMetadata.captureSource,
      captureSourceType: captureMetadata.sourceType,
      createdAt: Date.now(),
      isQuickAccess: false,
      folderId: captureMetadata.folderId
        || (activeFolderIdRef.current !== 'all' ? activeFolderIdRef.current : undefined),
    };
    pushDrawerUndoSnapshot('添加网页图片');
    invalidateDrawerAssetQueryForImport();
    const persistImport = prependAssetsAndPersist([newItem]);
    void persistImport.then(
      () => setActiveTab('image'),
      () => setActiveTab('image'),
    );
    setIsOpen(true);
    showToast('已添加网页图片，正在缓存');

    const latestCacheDir = (
      webImageCacheDirRef.current ||
      localStorage.getItem('drawer_web_image_cache_dir') ||
      ''
    ).trim();

    cacheWebImageFromCandidates(
      [normalizedUrl, ...fallbackUrls],
      displayName,
      latestCacheDir || undefined,
    )
      .then(({ cachedPath, sourceUrl }) => {
        if (supersededWebImageItemIdsRef.current.delete(itemId)) return;
        if (!cachedPath) return;
        const cachedUrl = convertFileSrc(cachedPath);
        const cachedItem = {
          ...newItem,
          url: cachedUrl,
          path: cachedPath,
          sourceUrl: persistentSourceUrl || getPersistentWebSourceUrl(sourceUrl),
          originalUrl: persistentSourceUrl || getPersistentWebSourceUrl(sourceUrl),
        } as BufferItem;
        invalidateDrawerAssetQueryForImport();
        setItems(prev => prev.map(item => item.id === itemId ? cachedItem : item));
        enqueueAutoAiTaggingForItems([cachedItem]);
        if (captureMetadata.dragId) {
          void emitTo('edge', 'browser-extension-image-save-succeeded', { dragId: captureMetadata.dragId });
        }
        showToast('网页图片已缓存');
      })
      .catch((err) => {
        if (supersededWebImageItemIdsRef.current.delete(itemId)) return;
        console.warn('网页图片缓存失败:', err);
        if (captureMetadata.captureSource === 'browser-extension') {
          setItems(prev => prev.filter(item => item.id !== itemId));
          if (captureMetadata.dragId) {
            void emitTo('edge', 'browser-extension-image-save-failed', { dragId: captureMetadata.dragId });
          }
          showToast('网页图片保存失败');
          return;
        }
        showToast('网页图片已添加，缓存失败');
      });

};

export const importBrowserExtensionImageToDrawerImpl = async (ctx: Pick<drawerAssetsActionContext, 'activeFolderIdRef' | 'cacheWebImageFromCandidates' | 'claimExternalWebImageDrop' | 'createAssetId' | 'enqueueAutoAiTaggingForItems' | 'getPersistentWebSourceUrl' | 'getWebCaptureSourceSite' | 'invalidateDrawerAssetQueryForImport' | 'prependAssetsAndPersist' | 'pushDrawerUndoSnapshot' | 'setActiveTab' | 'setIsOpen' | 'setItems' | 'showToast' | 'webImageCacheDirRef'>, source: string, displayName: string, fallbackUrls: string[], captureMetadata: WebImageCaptureMetadata) => {
  const { activeFolderIdRef, cacheWebImageFromCandidates, claimExternalWebImageDrop, createAssetId, enqueueAutoAiTaggingForItems, getPersistentWebSourceUrl, getWebCaptureSourceSite, invalidateDrawerAssetQueryForImport, prependAssetsAndPersist, pushDrawerUndoSnapshot, setActiveTab, setIsOpen, setItems, showToast, webImageCacheDirRef } = ctx;
    const normalizedSource = normalizeDraggedUrl(source);
    if (!normalizedSource) throw new Error('浏览器插件没有返回可用图片');
    const itemId = createAssetId();
    if (!claimExternalWebImageDrop(normalizedSource, itemId, 'drawer')) return;
    const latestCacheDir = (
      webImageCacheDirRef.current
      || localStorage.getItem('drawer_web_image_cache_dir')
      || ''
    ).trim();
    showToast('正在保存网页图片');
    try {
      const preparedLocalPath = captureMetadata.localPath?.trim();
      const cachedPath = preparedLocalPath
        ? latestCacheDir
          ? await invoke<string>('relocate_web_cache_file', { path: preparedLocalPath, dir: latestCacheDir })
          : preparedLocalPath
        : (await cacheWebImageFromCandidates(
            [normalizedSource, ...fallbackUrls],
            displayName,
            latestCacheDir || undefined,
          )).cachedPath;
      const sourceUrl = captureMetadata.sourceUrl || fallbackUrls[0] || '';
      if (!cachedPath) throw new Error('网页图片本地化失败');
      const persistentSourceUrl = getPersistentWebSourceUrl(captureMetadata.sourceUrl)
        || getPersistentWebSourceUrl(sourceUrl);
      const item: BufferItem = {
        id: itemId,
        type: 'image',
        content: displayName,
        name: displayName,
        path: cachedPath,
        url: convertFileSrc(cachedPath),
        sourceUrl: persistentSourceUrl,
        originalUrl: persistentSourceUrl,
        pageUrl: captureMetadata.pageUrl,
        sourceSite: getWebCaptureSourceSite(captureMetadata.pageUrl),
        pageTitle: captureMetadata.pageTitle,
        imageAlt: captureMetadata.imageAlt,
        width: captureMetadata.width,
        height: captureMetadata.height,
        originalWidth: captureMetadata.width,
        originalHeight: captureMetadata.height,
        captureSource: 'browser-extension',
        captureSourceType: captureMetadata.sourceType,
        createdAt: Date.now(),
        isQuickAccess: false,
        folderId: captureMetadata.folderId
          || (activeFolderIdRef.current !== 'all' ? activeFolderIdRef.current : undefined),
      };
      pushDrawerUndoSnapshot('添加网页图片');
      invalidateDrawerAssetQueryForImport();
      await prependAssetsAndPersist([item]);
      setActiveTab('image');
      setIsOpen(true);
      enqueueAutoAiTaggingForItems([item]);
      if (captureMetadata.dragId) {
        void emitTo('edge', 'browser-extension-image-save-succeeded', { dragId: captureMetadata.dragId });
      }
      showToast('网页图片已保存');
    } catch (error) {
      console.warn('browser extension image save failed:', error);
      setItems(items => items.filter(item => item.id !== itemId));
      if (captureMetadata.dragId) {
        void emitTo('edge', 'browser-extension-image-save-failed', { dragId: captureMetadata.dragId });
      }
      showToast('网页图片保存失败');
      throw error;
    }

};

export const importBrowserExtensionImageToCanvasImpl = async (ctx: Pick<drawerAssetsActionContext, 'appendCanvasItems' | 'cacheWebImageFromCandidates' | 'claimExternalWebImageDrop' | 'createAssetId' | 'getCanvasDropPosition' | 'getPersistentWebSourceUrl' | 'getWebCaptureSourceSite' | 'makeCanvasNodeId' | 'showToast' | 'webImageCacheDirRef'>, source: string, displayName: string, fallbackUrls: string[], captureMetadata: WebImageCaptureMetadata, client?: { x: number; y: number }) => {
  const { appendCanvasItems, cacheWebImageFromCandidates, claimExternalWebImageDrop, createAssetId, getCanvasDropPosition, getPersistentWebSourceUrl, getWebCaptureSourceSite, makeCanvasNodeId, showToast, webImageCacheDirRef } = ctx;
    const normalizedSource = normalizeDraggedUrl(source);
    if (!normalizedSource) throw new Error('浏览器插件没有返回可用图片');
    const itemId = createAssetId();
    if (!claimExternalWebImageDrop(normalizedSource, itemId, 'canvas')) return;
    const latestCacheDir = (
      webImageCacheDirRef.current
      || localStorage.getItem('drawer_web_image_cache_dir')
      || ''
    ).trim();
    showToast('正在保存网页图片');
    try {
      const preparedLocalPath = captureMetadata.localPath?.trim();
      const cachedPath = preparedLocalPath
        ? latestCacheDir
          ? await invoke<string>('relocate_web_cache_file', { path: preparedLocalPath, dir: latestCacheDir })
          : preparedLocalPath
        : (await cacheWebImageFromCandidates(
            [normalizedSource, ...fallbackUrls],
            displayName,
            latestCacheDir || undefined,
          )).cachedPath;
      const sourceUrl = captureMetadata.sourceUrl || fallbackUrls[0] || '';
      if (!cachedPath) throw new Error('网页图片本地化失败');
      const persistentSourceUrl = getPersistentWebSourceUrl(captureMetadata.sourceUrl)
        || getPersistentWebSourceUrl(sourceUrl);
      const item: BufferItem = {
        id: itemId,
        type: 'image',
        content: displayName,
        name: displayName,
        path: cachedPath,
        url: convertFileSrc(cachedPath),
        sourceUrl: persistentSourceUrl,
        originalUrl: persistentSourceUrl,
        pageUrl: captureMetadata.pageUrl,
        sourceSite: getWebCaptureSourceSite(captureMetadata.pageUrl),
        pageTitle: captureMetadata.pageTitle,
        imageAlt: captureMetadata.imageAlt,
        originalWidth: captureMetadata.width,
        originalHeight: captureMetadata.height,
        captureSource: 'browser-extension',
        captureSourceType: captureMetadata.sourceType,
        createdAt: Date.now(),
        isQuickAccess: false,
      };
      const position = getCanvasDropPosition(0, client);
      const size = await readImageDisplaySize(item.url || '');
      const canvasItem: CanvasImageItem = {
        id: makeCanvasNodeId(itemId, 'web_image'),
        item,
        x: position.x,
        y: position.y,
        width: size.width,
        height: size.height,
      };
      if (appendCanvasItems([canvasItem], '添加网页图片到画布', false) === 0) {
        throw new Error('画布没有接收网页图片');
      }
      if (captureMetadata.dragId) {
        void emitTo('edge', 'browser-extension-image-save-succeeded', { dragId: captureMetadata.dragId });
      }
      showToast('网页图片已保存到画布');
    } catch (error) {
      console.warn('browser extension canvas image save failed:', error);
      if (captureMetadata.dragId) {
        void emitTo('edge', 'browser-extension-image-save-failed', { dragId: captureMetadata.dragId });
      }
      showToast('网页图片保存失败');
      throw error;
    }

};

export const handleAddFolderImpl = (ctx: Pick<drawerAssetsActionContext, 'closeFolderModal' | 'createAssetId' | 'folders' | 'insertDrawerFolderAtTop' | 'newFolderName' | 'newFolderParentId' | 'persistFoldersSnapshot' | 'pushDrawerUndoSnapshot' | 'setCollapsedFolderIds' | 'setFolders' | 'showToast'>) => {
  const { closeFolderModal, createAssetId, folders, insertDrawerFolderAtTop, newFolderName, newFolderParentId, persistFoldersSnapshot, pushDrawerUndoSnapshot, setCollapsedFolderIds, setFolders, showToast } = ctx;
    const name = newFolderName.trim();
    if (!name) return;
    const parent = newFolderParentId
      ? folders.find(folder => folder.id === newFolderParentId)
      : null;
    const parentId = parent?.id;
    const hasDuplicate = folders.some(folder => (
      (folder.parentId || undefined) === parentId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    ));
    if (hasDuplicate) {
      showToast(parent ? '该项目中已有同名子目录' : '已有同名文件夹');
      return;
    }
    const newFolder: Folder = {
      id: createAssetId(),
      name,
      color: parent?.color || '#10b981',
      parentId,
    };
    pushDrawerUndoSnapshot(parent ? '新建子目录' : '新建文件夹');
    setFolders(prev => {
      const nextFolders = insertDrawerFolderAtTop(prev, newFolder);
      persistFoldersSnapshot(nextFolders);
      return nextFolders;
    });
    if (parentId) setCollapsedFolderIds(prev => prev.filter(id => id !== parentId));
    closeFolderModal();
    showToast(parent ? `已在「${parent.name}」中新建子目录` : '文件夹创建成功');

};

export const handleDeleteFolderImpl = (ctx: Pick<drawerAssetsActionContext, 'activeFolderId' | 'assetStorageMode' | 'folders' | 'persistFoldersSnapshot' | 'pushDrawerUndoSnapshot' | 'setActiveFolderId' | 'setAssetStatsRevision' | 'setCollapsedFolderIds' | 'setFolders' | 'setItems' | 'showToast'>, id: string) => {
  const { activeFolderId, assetStorageMode, folders, persistFoldersSnapshot, pushDrawerUndoSnapshot, setActiveFolderId, setAssetStatsRevision, setCollapsedFolderIds, setFolders, setItems, showToast } = ctx;
    const deletionPlan = getDrawerFolderDeletionPlan(folders, id);
    if (!deletionPlan) return;
    const { target, childIds, removedIds, destinationId } = deletionPlan;
    pushDrawerUndoSnapshot(target.parentId ? '删除子目录' : '删除文件夹');
    setFolders(prev => {
      const nextFolders = prev.filter(folder => !removedIds.has(folder.id));
      persistFoldersSnapshot(nextFolders);
      return nextFolders;
    });
    setItems(prev => prev.map(item => (
      item.folderId && removedIds.has(item.folderId) ? { ...item, folderId: destinationId } : item
    )));
    if (assetStorageMode === 'sqlite') {
      void moveAssetsFromFolders([...removedIds], destinationId)
        .then(() => setAssetStatsRevision(revision => revision + 1))
        .catch(error => console.warn('移动已删除文件夹中的素材失败:', error));
    }
    setCollapsedFolderIds(prev => prev.filter(folderId => !removedIds.has(folderId)));
    if (removedIds.has(activeFolderId)) setActiveFolderId(destinationId || 'all');
    showToast(target.parentId
      ? '子目录已删除，内容已移回项目文件夹'
      : childIds.length > 0
        ? '项目文件夹及子目录已删除，内容已移回主抽屉'
        : '文件夹已删除，内容已移回主抽屉');

};

export const handleDrawerFolderSelectionClickImpl = (ctx: Pick<drawerAssetsActionContext, 'lastSelectedFolderIdRef' | 'setSelectedFolderIds' | 'visibleFolderIds'>, folderId: string, event: React.MouseEvent) => {
  const { lastSelectedFolderIdRef, setSelectedFolderIds, visibleFolderIds } = ctx;
    const isRangeSelect = event.shiftKey;
    const isToggleSelect = event.ctrlKey || event.metaKey;
    if (isRangeSelect) {
      const lastId = lastSelectedFolderIdRef.current;
      if (lastId && visibleFolderIds.includes(lastId) && visibleFolderIds.includes(folderId)) {
        const start = visibleFolderIds.indexOf(lastId);
        const end = visibleFolderIds.indexOf(folderId);
        const rangeIds = visibleFolderIds.slice(Math.min(start, end), Math.max(start, end) + 1);
        setSelectedFolderIds(rangeIds);
      } else {
        setSelectedFolderIds([folderId]);
      }
      lastSelectedFolderIdRef.current = folderId;
      return false;
    }
    if (isToggleSelect) {
      setSelectedFolderIds(prev => (
        prev.includes(folderId) ? prev.filter(id => id !== folderId) : [...prev, folderId]
      ));
      lastSelectedFolderIdRef.current = folderId;
      return false;
    }
    setSelectedFolderIds([folderId]);
    lastSelectedFolderIdRef.current = folderId;
    return true;

};

export const openMoveExistingFolderModalImpl = (ctx: Pick<drawerAssetsActionContext, 'foldersRef' | 'lastSelectedFolderIdRef' | 'setFolderContextMenu' | 'setFolderMoveTargetId' | 'setSelectedFolderIds' | 'setShowFolderModal' | 'setShowMoveExistingFolderModal' | 'setShowMoveFolderModal'>, folderIds: string[]) => {
  const { foldersRef, lastSelectedFolderIdRef, setFolderContextMenu, setFolderMoveTargetId, setSelectedFolderIds, setShowFolderModal, setShowMoveExistingFolderModal, setShowMoveFolderModal } = ctx;
    const cleanIds = Array.from(new Set(folderIds.filter(id => foldersRef.current.some(folder => folder.id === id))));
    if (cleanIds.length === 0) return;
    setSelectedFolderIds(cleanIds);
    lastSelectedFolderIdRef.current = cleanIds[cleanIds.length - 1] || null;
    setFolderMoveTargetId(null);
    setShowMoveExistingFolderModal(true);
    setShowMoveFolderModal(false);
    setShowFolderModal(false);
    setFolderContextMenu(null);

};

export const moveDrawerFoldersToParentImpl = async (ctx: Pick<drawerAssetsActionContext, 'foldersRef' | 'isInvalidFolderMoveTarget' | 'persistFoldersSnapshot' | 'setCollapsedFolderIds' | 'setFolderContextMenu' | 'setFolderMoveTargetId' | 'setFolders' | 'setIsMovingFolders' | 'setSelectedFolderIds' | 'setShowMoveExistingFolderModal' | 'showToast'>, folderIds: string[], targetParentId?: string | null) => {
  const { foldersRef, isInvalidFolderMoveTarget, persistFoldersSnapshot, setCollapsedFolderIds, setFolderContextMenu, setFolderMoveTargetId, setFolders, setIsMovingFolders, setSelectedFolderIds, setShowMoveExistingFolderModal, showToast } = ctx;
    const cleanIds = Array.from(new Set(folderIds.filter(id => foldersRef.current.some(folder => folder.id === id))));
    const normalizedTargetId = targetParentId || null;
    if (cleanIds.length === 0) return;
    if (isInvalidFolderMoveTarget(normalizedTargetId, cleanIds)) {
      showToast('不能移动到自身或子文件夹中');
      return;
    }
    setIsMovingFolders(true);
    try {
      const normalizedFolders = normalizeDrawerFolders(foldersRef.current.map(folder => (
        cleanIds.includes(folder.id)
          ? { ...folder, parentId: normalizedTargetId || undefined }
          : folder
      )));
      const existingIds = new Set(normalizedFolders.map(folder => folder.id));
      setFolders(normalizedFolders);
      persistFoldersSnapshot(normalizedFolders);
      setSelectedFolderIds(cleanIds.filter(id => existingIds.has(id)));
      await moveFolders({
        folderIds: cleanIds,
        newParentId: normalizedTargetId,
        libraryId: DEFAULT_LIBRARY_ID,
      });
      if (normalizedTargetId) {
        setCollapsedFolderIds(prev => prev.filter(id => id !== normalizedTargetId));
      }
      setFolderMoveTargetId(null);
      setShowMoveExistingFolderModal(false);
      setFolderContextMenu(null);
      showToast(normalizedTargetId
        ? `已移动 ${cleanIds.length} 个文件夹`
        : `已移动 ${cleanIds.length} 个文件夹到主抽屉`);
    } catch (err) {
      console.warn('移动文件夹失败:', err);
      showToast(`移动文件夹失败：${String(err || '未知错误')}`);
    } finally {
      setIsMovingFolders(false);
    }

};

export const handleFolderContextMenuImpl = (ctx: Pick<drawerAssetsActionContext, 'getFolderActionIds' | 'lastSelectedFolderIdRef' | 'setFolderContextMenu' | 'setSelectedFolderIds'>, event: React.MouseEvent, folderId: string) => {
  const { getFolderActionIds, lastSelectedFolderIdRef, setFolderContextMenu, setSelectedFolderIds } = ctx;
    event.preventDefault();
    event.stopPropagation();
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-folder-control="true"], input, textarea, select')) {
      return;
    }
    const actionIds = getFolderActionIds(folderId);
    if (!actionIds.includes(folderId) || actionIds.length === 0) {
      setSelectedFolderIds([folderId]);
      lastSelectedFolderIdRef.current = folderId;
    }
    setFolderContextMenu({ x: event.clientX, y: event.clientY, folderId });

};

export const deleteDrawerFoldersImpl = (ctx: Pick<drawerAssetsActionContext, 'activeFolderIdStateRef' | 'assetStorageMode' | 'foldersRef' | 'lastSelectedFolderIdRef' | 'persistFoldersSnapshot' | 'pushDrawerUndoSnapshot' | 'setActiveFolderId' | 'setAssetStatsRevision' | 'setCollapsedFolderIds' | 'setFolderContextMenu' | 'setFolders' | 'setItems' | 'setSelectedFolderIds' | 'showToast'>, folderIds: string[]) => {
  const { activeFolderIdStateRef, assetStorageMode, foldersRef, lastSelectedFolderIdRef, persistFoldersSnapshot, pushDrawerUndoSnapshot, setActiveFolderId, setAssetStatsRevision, setCollapsedFolderIds, setFolderContextMenu, setFolders, setItems, setSelectedFolderIds, showToast } = ctx;
    const cleanIds = Array.from(new Set(folderIds.filter(id => foldersRef.current.some(folder => folder.id === id))));
    if (cleanIds.length === 0) return;
    const currentFolders = foldersRef.current;
    const removedIds = new Set<string>();
    cleanIds.forEach(id => {
      if (removedIds.has(id)) return;
      const plan = getDrawerFolderDeletionPlan(currentFolders, id);
      plan?.removedIds.forEach(removedId => removedIds.add(removedId));
    });
    if (removedIds.size === 0) return;
    const getDestinationId = (folderId: string) => {
      let cursor = currentFolders.find(folder => folder.id === folderId);
      const seen = new Set<string>();
      while (cursor?.parentId && !seen.has(cursor.parentId)) {
        seen.add(cursor.parentId);
        if (!removedIds.has(cursor.parentId)) return cursor.parentId;
        cursor = currentFolders.find(folder => folder.id === cursor?.parentId);
      }
      return undefined;
    };
    pushDrawerUndoSnapshot(cleanIds.length > 1 ? '删除多个文件夹' : '删除文件夹');
    setFolders(prev => {
      const nextFolders = prev.filter(folder => !removedIds.has(folder.id));
      persistFoldersSnapshot(nextFolders);
      return nextFolders;
    });
    setItems(prev => prev.map(item => (
      item.folderId && removedIds.has(item.folderId)
        ? { ...item, folderId: getDestinationId(item.folderId) }
        : item
    )));
    if (assetStorageMode === 'sqlite') {
      const sourceIdsByDestination = new Map<string, string[]>();
      removedIds.forEach(sourceId => {
        const destinationId = getDestinationId(sourceId) || '';
        sourceIdsByDestination.set(destinationId, [
          ...(sourceIdsByDestination.get(destinationId) || []),
          sourceId,
        ]);
      });
      void Promise.all([...sourceIdsByDestination].map(([destinationId, sourceIds]) => (
        moveAssetsFromFolders(sourceIds, destinationId || undefined)
      ))).then(() => setAssetStatsRevision(revision => revision + 1))
        .catch(error => console.warn('批量移动已删除文件夹中的素材失败:', error));
    }
    setCollapsedFolderIds(prev => prev.filter(folderId => !removedIds.has(folderId)));
    setSelectedFolderIds([]);
    lastSelectedFolderIdRef.current = null;
    setFolderContextMenu(null);
    if (removedIds.has(activeFolderIdStateRef.current)) {
      setActiveFolderId(getDestinationId(activeFolderIdStateRef.current) || 'all');
    }
    showToast(cleanIds.length > 1 ? `已删除 ${cleanIds.length} 个文件夹` : '文件夹已删除');

};

export const getDraggedDrawerItemIdImpl = (ctx: Pick<drawerAssetsActionContext, 'draggingItemIdRef'>, dt?: DataTransfer | null) => {
  const { draggingItemIdRef } = ctx;
    if (!dt) return draggingItemIdRef.current || '';
    return (
      dt.getData('application/drawer-item-id') ||
      dt.getData('application/x-drawer-item-id') ||
      dt.getData('text/plain') ||
      draggingItemIdRef.current ||
      ''
    );

};

export const getDraggedDrawerFolderIdsImpl = (ctx: Pick<drawerAssetsActionContext, 'FOLDER_DRAG_MIME' | 'draggingFolderIdsRef' | 'foldersRef'>, dt?: DataTransfer | null) => {
  const { FOLDER_DRAG_MIME, draggingFolderIdsRef, foldersRef } = ctx;
    const activeIds = draggingFolderIdsRef.current;
    if (activeIds.length > 0) return activeIds;
    if (!dt) return [];
    const types = Array.from(dt.types || []);
    if (!types.includes(FOLDER_DRAG_MIME)) return [];
    try {
      const parsed = JSON.parse(dt.getData(FOLDER_DRAG_MIME) || '[]');
      return Array.isArray(parsed)
        ? parsed.map(String).filter(id => foldersRef.current.some(folder => folder.id === id))
        : [];
    } catch (_) {
      return [];
    }

};

export const handleDrawerFolderDragStartImpl = (ctx: Pick<drawerAssetsActionContext, 'FOLDER_DRAG_MIME' | 'getFolderActionIds' | 'lastSelectedFolderIdRef' | 'setDraggingFolderIds' | 'setSelectedFolderIds'>, event: React.DragEvent, folderId: string) => {
  const { FOLDER_DRAG_MIME, getFolderActionIds, lastSelectedFolderIdRef, setDraggingFolderIds, setSelectedFolderIds } = ctx;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-folder-control="true"], input, textarea, select')) {
      event.preventDefault();
      return;
    }
    const actionIds = getFolderActionIds(folderId);
    const dragIds = actionIds.length > 0 ? actionIds : [folderId];
    setSelectedFolderIds(dragIds);
    lastSelectedFolderIdRef.current = folderId;
    setDraggingFolderIds(dragIds);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(FOLDER_DRAG_MIME, JSON.stringify(dragIds));

};

export const startDrawerFolderPointerDragImpl = (ctx: Pick<drawerAssetsActionContext, 'clearDrawerFolderDragState' | 'editingFolderId' | 'getFolderActionIds' | 'isInvalidFolderMoveTarget' | 'lastSelectedFolderIdRef' | 'moveDrawerFoldersToParent' | 'setDragOverFolderId' | 'setDraggingFolderIds' | 'setFolderMoveDragOverId' | 'setSelectedFolderIds' | 'showToast' | 'suppressNextFolderClickRef'>, event: React.PointerEvent, folderId: string) => {
  const { clearDrawerFolderDragState, editingFolderId, getFolderActionIds, isInvalidFolderMoveTarget, lastSelectedFolderIdRef, moveDrawerFoldersToParent, setDragOverFolderId, setDraggingFolderIds, setFolderMoveDragOverId, setSelectedFolderIds, showToast, suppressNextFolderClickRef } = ctx;
    if (event.button !== 0 || editingFolderId) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-folder-control="true"], input, textarea, select')) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const actionIds = getFolderActionIds(folderId);
    const dragIds = actionIds.length > 0 ? actionIds : [folderId];
    let activated = false;
    let disposed = false;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', cleanup, true);
      document.body.style.cursor = '';
      clearDrawerFolderDragState();
    };

    const updateDropTarget = (clientX: number, clientY: number) => {
      const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const dropEl = el?.closest('[data-folder-drop-id]') as HTMLElement | null;
      const dropId = dropEl?.dataset.folderDropId || '';
      if (!dropId) {
        setDragOverFolderId(null);
        setFolderMoveDragOverId(null);
        return null;
      }
      const targetId = dropId === 'all' ? null : dropId;
      const invalid = isInvalidFolderMoveTarget(targetId, dragIds);
      setDragOverFolderId(dropId);
      setFolderMoveDragOverId(invalid ? dropId : null);
      return { targetId, invalid };
    };

    const onMove = (moveEvent: PointerEvent) => {
      if (disposed) return;
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!activated && distance < 6) return;
      if (!activated) {
        activated = true;
        suppressNextFolderClickRef.current = true;
        setSelectedFolderIds(dragIds);
        lastSelectedFolderIdRef.current = folderId;
        setDraggingFolderIds(dragIds);
        document.body.style.cursor = 'grabbing';
      }
      moveEvent.preventDefault();
      updateDropTarget(moveEvent.clientX, moveEvent.clientY);
    };

    const onUp = (upEvent: PointerEvent) => {
      if (activated) {
        upEvent.preventDefault();
        upEvent.stopPropagation();
        const dropTarget = updateDropTarget(upEvent.clientX, upEvent.clientY);
        if (dropTarget) {
          if (dropTarget.invalid) {
            showToast('不能移动到自身或子文件夹中');
          } else {
            void moveDrawerFoldersToParent(dragIds, dropTarget.targetId);
          }
        }
      }
      cleanup();
      window.setTimeout(() => {
        suppressNextFolderClickRef.current = false;
      }, 250);
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', cleanup, true);

};

export const exportFileNameForItemImpl = (ctx: Pick<drawerAssetsActionContext, 'extensionFromValue' | 'sanitizeExportFileName'>, item: BufferItem, index: number, used: Set<string>) => {
  const { extensionFromValue, sanitizeExportFileName } = ctx;
    const created = item.createdAt ? new Date(item.createdAt) : new Date();
    const time = Number.isFinite(created.getTime())
      ? `${created.getFullYear()}${String(created.getMonth() + 1).padStart(2, '0')}${String(created.getDate()).padStart(2, '0')}_${String(created.getHours()).padStart(2, '0')}${String(created.getMinutes()).padStart(2, '0')}${String(created.getSeconds()).padStart(2, '0')}`
      : `${Date.now()}`;
    const baseRaw = item.name || item.content || `${item.type || 'item'}_${time}_${index + 1}`;
    let base = sanitizeExportFileName(baseRaw, `灵感卡片_${index + 1}`);
    let ext = extensionFromValue(base);

    if (!ext) {
      if (item.type === 'text') ext = 'txt';
      else if (item.type === 'image') ext = extensionFromValue(item.path || item.url) || 'png';
      else if (item.type === 'video') ext = extensionFromValue(item.path || item.url) || 'mp4';
      else ext = extensionFromValue(item.path || item.url) || 'dat';
      base = `${base}.${ext}`;
    }

    let candidate = base;
    let count = 2;
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const suffix = dot > 0 ? base.slice(dot) : '';
    while (used.has(candidate.toLowerCase())) {
      candidate = `${stem}_${count}${suffix}`;
      count += 1;
    }
    used.add(candidate.toLowerCase());
    return candidate;

};

export const handleExportSelectedItemsImpl = async (ctx: Pick<drawerAssetsActionContext, 'exportFileNameForItem' | 'items' | 'selectedIds' | 'setIsSelectMode' | 'setSelectedIds' | 'showToast'>) => {
  const { exportFileNameForItem, items, selectedIds, setIsSelectMode, setSelectedIds, showToast } = ctx;
    const selectedItems = items.filter(item => selectedIds.includes(item.id));
    if (selectedItems.length === 0) return;

    try {
      const targetDir = await open({
        directory: true,
        multiple: false,
        title: '选择导出文件夹',
      });
      if (typeof targetDir !== 'string' || !targetDir) return;

      const separator = targetDir.includes('\\') ? '\\' : '/';
      const baseDir = targetDir.replace(/[\\/]+$/g, '');
      const used = new Set<string>();
      let exported = 0;
      let skipped = 0;

      for (const [index, item] of selectedItems.entries()) {
        if ((item as any).isDirectory) {
          skipped += 1;
          continue;
        }
        const fileName = exportFileNameForItem(item, index, used);
        const dest = `${baseDir}${separator}${fileName}`;
        const source = item.path || item.url || item.content || '';
        try {
          await invoke('save_item_source_as', {
            source,
            dest,
            content: item.content || '',
            itemType: item.type,
            feature: selectedItems.length > 1 ? 'batch_render' : 'hd_export',
          });
          exported += 1;
        } catch (err) {
          console.warn('导出失败:', item, err);
          skipped += 1;
        }
      }

      showToast(skipped > 0 ? `已导出 ${exported} 个，跳过/失败 ${skipped} 个` : `已导出 ${exported} 个文件`);
      if (exported > 0) {
        setSelectedIds([]);
        setIsSelectMode(false);
      }
    } catch (err) {
      console.error('批量导出失败:', err);
      showToast('导出失败');
    }

};

export const downloadBufferItemsImpl = async (ctx: Pick<drawerAssetsActionContext, 'exportFileNameForItem' | 'showToast' | 'webImageCacheDirRef'>, sourceItems: BufferItem[], options?: { feature?: string }) => {
  const { exportFileNameForItem, showToast, webImageCacheDirRef } = ctx;
    const cleanItems = sourceItems.filter(item => item && !(item as any).isDirectory);
    if (cleanItems.length === 0) {
      showToast('没有可下载的内容');
      return;
    }

    const resolveDurableDownloadSource = async (item: BufferItem) => {
      const localPath = String(item.path || '').trim();
      if (localPath) return localPath;
      const source = getDurableAiMediaSource(item);
      if (!item.type || item.type === 'text' || !/^(?:https?:|data:(?:image|video)\/)/i.test(source)) {
        return source;
      }
      const latestCacheDir = (
        webImageCacheDirRef.current
        || localStorage.getItem('drawer_web_image_cache_dir')
        || ''
      ).trim();
      try {
        const cachedPath = await invoke<string>('cache_web_image', {
          url: source,
          name: item.name || item.id || 'generated-output',
          dir: latestCacheDir || undefined,
        });
        return String(cachedPath || source).trim();
      } catch (error) {
        console.warn('下载前缓存生成结果失败，改用稳定结果地址直接下载:', error);
        return source;
      }
    };

    try {
      if (cleanItems.length === 1) {
        const item = cleanItems[0];
        const fileName = exportFileNameForItem(item, 0, new Set());
        const savePath = await save({
          defaultPath: fileName,
          filters: item.type === 'image'
            ? [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'] }]
            : item.type === 'text'
              ? [{ name: 'Text', extensions: ['txt'] }]
              : item.type === 'video'
                ? [{ name: 'Video', extensions: ['mp4', 'mov', 'avi', 'mkv', 'webm'] }]
                : [{ name: 'All Files', extensions: ['*'] }],
        });
        if (!savePath) return;

        await invoke('save_item_source_as', {
          source: await resolveDurableDownloadSource(item),
          dest: savePath,
          content: item.content || '',
          itemType: item.type,
          feature: options?.feature || 'hd_export',
        });
        showToast('已下载');
        return;
      }

      const targetDir = await open({
        directory: true,
        multiple: false,
        title: '选择下载文件夹',
      });
      if (typeof targetDir !== 'string' || !targetDir) return;

      const separator = targetDir.includes('\\') ? '\\' : '/';
      const baseDir = targetDir.replace(/[\\/]+$/g, '');
      const used = new Set<string>();
      let downloaded = 0;
      let skipped = 0;
      for (const [index, item] of cleanItems.entries()) {
        const fileName = exportFileNameForItem(item, index, used);
        const dest = `${baseDir}${separator}${fileName}`;
        try {
          await invoke('save_item_source_as', {
            source: await resolveDurableDownloadSource(item),
            dest,
            content: item.content || '',
            itemType: item.type,
            feature: options?.feature || 'batch_render',
          });
          downloaded += 1;
        } catch (err) {
          console.warn('下载失败:', item, err);
          skipped += 1;
        }
      }
      showToast(skipped > 0 ? `已下载 ${downloaded} 个，失败 ${skipped} 个` : `已下载 ${downloaded} 个文件`);
    } catch (err) {
      console.error('下载失败:', err);
      showToast('下载失败');
    }

};

export const downloadCanvasItemsByIdsImpl = async (ctx: Pick<drawerAssetsActionContext, 'canvasItemsRef' | 'downloadBufferItems'>, ids: string[]) => {
  const { canvasItemsRef, downloadBufferItems } = ctx;
    const idSet = new Set(ids.filter(Boolean));
    const selectedCanvasItems = canvasItemsRef.current.filter(canvasItem => idSet.has(canvasItem.id));
    const needsCommercialExport = selectedCanvasItems.some(canvasItem => (
      isCanvasAiGeneratorType(canvasItem.ai?.type)
      || canvasItem.ai?.type === 'workflow'
      || isCanvasAiGeneratedType(canvasItem.ai?.type)
    ));
    const sourceItems = selectedCanvasItems
      .flatMap(canvasItem => {
        if (!isCanvasAiGeneratorType(canvasItem.ai?.type) && canvasItem.ai?.type !== 'workflow') return [canvasItem.item];
        const outputItems = getCanvasAiSuccessfulOutputs(canvasItem)
          .map((output, index) => createCanvasAiOutputBufferItem(canvasItem, output, index))
          .filter((item): item is BufferItem => !!item);
        return outputItems.length > 0 ? outputItems : [canvasItem.item];
      });
    await downloadBufferItems(sourceItems, {
      feature: needsCommercialExport && sourceItems.length === 1 ? 'commercial_export' : undefined,
    });

};

export const moveSelectedItemsToFolderImpl = (ctx: Pick<drawerAssetsActionContext, 'pushDrawerUndoSnapshot' | 'selectedIds' | 'setIsSelectMode' | 'setItems' | 'setSelectedIds' | 'setShowMoveFolderModal' | 'showToast'>, folderId?: string, folderName?: string) => {
  const { pushDrawerUndoSnapshot, selectedIds, setIsSelectMode, setItems, setSelectedIds, setShowMoveFolderModal, showToast } = ctx;
    if (selectedIds.length === 0) return;
    const idSet = new Set(selectedIds);
    const count = selectedIds.length;
    pushDrawerUndoSnapshot(folderId ? '批量移动到文件夹' : '批量移出文件夹');
    setItems(prev => prev.map(item => idSet.has(item.id) ? { ...item, folderId } : item));
    setSelectedIds([]);
    setIsSelectMode(false);
    setShowMoveFolderModal(false);
    showToast(folderId ? `已移动 ${count} 个到 ${folderName || '文件夹'}` : `已移动 ${count} 个到主抽屉`);

};

export const createFolderAndMoveSelectedImpl = (ctx: Pick<drawerAssetsActionContext, 'activeFolderId' | 'createAssetId' | 'folders' | 'insertDrawerFolderAtTop' | 'moveFolderName' | 'persistFoldersSnapshot' | 'pushDrawerUndoSnapshot' | 'selectedIds' | 'setCollapsedFolderIds' | 'setFolders' | 'setIsSelectMode' | 'setItems' | 'setMoveFolderName' | 'setSelectedIds' | 'setShowMoveFolderModal' | 'showToast'>) => {
  const { activeFolderId, createAssetId, folders, insertDrawerFolderAtTop, moveFolderName, persistFoldersSnapshot, pushDrawerUndoSnapshot, selectedIds, setCollapsedFolderIds, setFolders, setIsSelectMode, setItems, setMoveFolderName, setSelectedIds, setShowMoveFolderModal, showToast } = ctx;
    const name = moveFolderName.trim();
    if (!name || selectedIds.length === 0) return;
    const activeFolder = folders.find(folder => folder.id === activeFolderId);
    const parentFolder = activeFolder || null;
    const parentId = parentFolder?.id;
    const hasDuplicate = folders.some(folder => (
      (folder.parentId || undefined) === parentId && folder.name.toLocaleLowerCase() === name.toLocaleLowerCase()
    ));
    if (hasDuplicate) {
      showToast(parentFolder ? '该项目中已有同名子目录' : '已有同名文件夹');
      return;
    }
    const newFolder: Folder = {
      id: createAssetId(),
      name,
      color: parentFolder?.color || '#10b981',
      parentId,
    };
    const idSet = new Set(selectedIds);
    const count = selectedIds.length;
    pushDrawerUndoSnapshot(parentFolder ? '新建子目录并移动' : '新建文件夹并移动');
    setFolders(prev => {
      const nextFolders = insertDrawerFolderAtTop(prev, newFolder);
      persistFoldersSnapshot(nextFolders);
      return nextFolders;
    });
    if (parentId) setCollapsedFolderIds(prev => prev.filter(id => id !== parentId));
    setItems(prev => prev.map(item => idSet.has(item.id) ? { ...item, folderId: newFolder.id } : item));
    setMoveFolderName('');
    setSelectedIds([]);
    setIsSelectMode(false);
    setShowMoveFolderModal(false);
    showToast(parentFolder
      ? `已在「${parentFolder.name}」中新建子目录并移动 ${count} 个`
      : `已新建并移动 ${count} 个到 ${name}`);

};

export const handleDrawerItemDropToFolderImpl = (ctx: Pick<drawerAssetsActionContext, 'clearDrawerFolderDragState' | 'clearDrawerItemDragState' | 'getDraggedDrawerFolderIds' | 'getDraggedDrawerItemId' | 'isInvalidFolderMoveTarget' | 'moveDrawerFoldersToParent' | 'moveDrawerItemToFolder' | 'showToast'>, e: React.DragEvent, folderId?: string, folderName?: string) => {
  const { clearDrawerFolderDragState, clearDrawerItemDragState, getDraggedDrawerFolderIds, getDraggedDrawerItemId, isInvalidFolderMoveTarget, moveDrawerFoldersToParent, moveDrawerItemToFolder, showToast } = ctx;
    e.preventDefault();
    e.stopPropagation();

    const folderIds = getDraggedDrawerFolderIds(e.dataTransfer);
    if (folderIds.length > 0) {
      const targetId = folderId === 'all' ? null : folderId || null;
      if (isInvalidFolderMoveTarget(targetId, folderIds)) {
        showToast('不能移动到自身或子文件夹中');
      } else {
        void moveDrawerFoldersToParent(folderIds, targetId);
      }
      clearDrawerFolderDragState();
      return;
    }

    const itemId = getDraggedDrawerItemId(e.dataTransfer);
    moveDrawerItemToFolder(itemId, folderId, folderName);
    clearDrawerItemDragState();

};

export const handleDrawerItemDragOverFolderImpl = (ctx: Pick<drawerAssetsActionContext, 'getDraggedDrawerFolderIds' | 'getDraggedDrawerItemId' | 'isInvalidFolderMoveTarget' | 'items' | 'setDragOverFolderId' | 'setFolderMoveDragOverId'>, e: React.DragEvent, folderId: string) => {
  const { getDraggedDrawerFolderIds, getDraggedDrawerItemId, isInvalidFolderMoveTarget, items, setDragOverFolderId, setFolderMoveDragOverId } = ctx;
    const folderIds = getDraggedDrawerFolderIds(e.dataTransfer);
    if (folderIds.length > 0) {
      const targetId = folderId === 'all' ? null : folderId;
      const invalid = isInvalidFolderMoveTarget(targetId, folderIds);
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = invalid ? 'none' : 'move';
      setDragOverFolderId(folderId);
      setFolderMoveDragOverId(invalid ? folderId : null);
      return;
    }
    const itemId = getDraggedDrawerItemId(e.dataTransfer);
    if (!itemId || !items.some(i => i.id === itemId)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);

};

export const handleDrawerItemSelectImpl = (ctx: Pick<drawerAssetsActionContext, 'displayItems' | 'lastSelectedDrawerItemIdRef' | 'setSelectedIds'>, itemId: string, event?: React.MouseEvent) => {
  const { displayItems, lastSelectedDrawerItemIdRef, setSelectedIds } = ctx;
    const visibleIds = displayItems.map(item => item.id);
    const lastId = lastSelectedDrawerItemIdRef.current;
    if (event?.shiftKey && lastId && visibleIds.includes(lastId) && visibleIds.includes(itemId)) {
      const start = visibleIds.indexOf(lastId);
      const end = visibleIds.indexOf(itemId);
      const rangeIds = visibleIds.slice(Math.min(start, end), Math.max(start, end) + 1);
      setSelectedIds(prev => Array.from(new Set([...prev, ...rangeIds])));
    } else {
      setSelectedIds(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
    }
    lastSelectedDrawerItemIdRef.current = itemId;

};

export const resolveExternalDragLocalPathImpl = async (ctx: Pick<drawerAssetsActionContext, 'cacheWebImageFromCandidates' | 'setItems' | 'updateCanvasItemsImmediate' | 'webImageCacheDirRef'>, item: BufferItem) => {
  const { cacheWebImageFromCandidates, setItems, updateCanvasItemsImmediate, webImageCacheDirRef } = ctx;
    for (const candidate of getDrawerExternalDragLocalCandidates(item)) {
      try {
        const kind = await invoke<'file' | 'directory' | 'missing'>('path_kind', { path: candidate });
        if (kind === 'file') return { path: normalizeLocalDragPath(candidate), restored: false };
      } catch (_) {}
    }

    const cacheCandidates = getDrawerExternalDragCacheCandidates(item);
    if (cacheCandidates.length === 0) return { path: '', restored: false };

    const latestCacheDir = (
      webImageCacheDirRef.current
      || localStorage.getItem('drawer_web_image_cache_dir')
      || ''
    ).trim();
    try {
      const { cachedPath, sourceUrl } = await cacheWebImageFromCandidates(
        cacheCandidates,
        item.name || item.content || '拖出图片',
        latestCacheDir || undefined,
      );
      if (!cachedPath) return { path: '', restored: false };
      const cachedUrl = convertFileSrc(cachedPath);
      const sourceIsData = /^data:image\//i.test(sourceUrl);
      const patchItem = (current: BufferItem): BufferItem => ({
        ...current,
        path: cachedPath,
        url: cachedUrl,
        sourceUrl: current.sourceUrl || (sourceIsData ? undefined : sourceUrl),
        originalUrl: current.originalUrl || (sourceIsData ? undefined : sourceUrl),
      });
      setItems(prev => prev.map(current => current.id === item.id ? patchItem(current) : current));
      updateCanvasItemsImmediate(prev => prev.map(canvasItem => (
        canvasItem.item.id === item.id
          ? { ...canvasItem, item: patchItem(canvasItem.item) }
          : canvasItem
      )));
      return { path: cachedPath, restored: true };
    } catch (err) {
      console.warn('拖出图片本地缓存恢复失败:', err);
      return { path: '', restored: false };
    }

};

export const startNativeDrawerItemDragImpl = async (ctx: Pick<drawerAssetsActionContext, 'clearIdleAutoClose' | 'getExternalDragItemsForItem' | 'isPointerInsideDrawerRef' | 'resolveExternalDragLocalPath' | 'scheduleAutoClose' | 'showToast'>, itemId: string) => {
  const { clearIdleAutoClose, getExternalDragItemsForItem, isPointerInsideDrawerRef, resolveExternalDragLocalPath, scheduleAutoClose, showToast } = ctx;
    const resolved = await Promise.all(getExternalDragItemsForItem(itemId).map(resolveExternalDragLocalPath));
    const paths = Array.from(new Set(resolved.map(result => result.path).filter(Boolean)));
    if (paths.length === 0) {
      showToast('拖出失败：没有可读取的本地文件或图片缓存');
      return false;
    }
    if (resolved.some(result => result.restored)) {
      showToast(paths.length > 1 ? '已恢复缺失的本地缓存，正在拖出文件' : '已恢复本地缓存，正在拖出图片');
    }
    try {
      await invoke('start_file_drag', { paths });
    } catch (err) {
      console.warn('系统文件拖拽失败:', err);
      try {
        await invoke('copy_files_to_clipboard', { paths });
        showToast(paths.length > 1 ? '已复制这些文件，可直接粘贴到目标程序' : '已复制文件，可直接粘贴到目标程序');
      } catch (clipboardErr) {
        console.warn('复制文件兜底失败:', clipboardErr);
        showToast('拖出失败：找不到可拖拽的本地文件');
      }
    } finally {
      isPointerInsideDrawerRef.current = false;
      clearIdleAutoClose();
      window.setTimeout(() => scheduleAutoClose(120), 0);
    }
    return true;

};

export const startDrawerItemPointerDragImpl = (ctx: Pick<drawerAssetsActionContext, 'addDrawerMediaItemToCanvas' | 'canvasSurfaceRef' | 'clearDrawerItemDragState' | 'draggingItemIdRef' | 'isCanvasModeRef' | 'isGlobalMouseDown' | 'isResizingCards' | 'moveDrawerItemToFolder' | 'setDraggingItemId' | 'startNativeDrawerItemDrag'>, e: React.PointerEvent, itemId: string) => {
  const { addDrawerMediaItemToCanvas, canvasSurfaceRef, clearDrawerItemDragState, draggingItemIdRef, isCanvasModeRef, isGlobalMouseDown, isResizingCards, moveDrawerItemToFolder, setDraggingItemId, startNativeDrawerItemDrag } = ctx;
    if (e.button !== 0 || isResizingCards) return;

    const target = e.target as HTMLElement | null;
    if (target?.closest('button,input,textarea,select,a,[role="button"],[contenteditable="true"],[data-no-drag="true"],[title*="复制"],[title*="文件夹"],[title*="显示"],[aria-label]')) return;

    const startX = e.clientX;
    const startY = e.clientY;
    let activated = false;
    let disposed = false;
    let nativeDragStarted = false;

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      document.removeEventListener('pointermove', onMove, true);
      document.removeEventListener('pointerup', onUp, true);
      document.removeEventListener('pointercancel', cleanup, true);
      clearDrawerItemDragState();
    };

    const onMove = (me: PointerEvent) => {
      if (disposed) return;
      const distance = Math.hypot(me.clientX - startX, me.clientY - startY);
      if (!activated && distance < 6) return;

      if (!activated) {
        activated = true;
        draggingItemIdRef.current = itemId;
        setDraggingItemId(itemId);
        isGlobalMouseDown.current = true;
        document.body.style.cursor = 'grabbing';
      }

      const isAtWindowEdge =
        me.clientX <= 12 ||
        me.clientY <= 12 ||
        me.clientX >= window.innerWidth - 12 ||
        me.clientY >= window.innerHeight - 12;
      if (isAtWindowEdge && !nativeDragStarted) {
        nativeDragStarted = true;
        cleanup();
        void startNativeDrawerItemDrag(itemId);
        return;
      }

      me.preventDefault();
    };

    const onUp = (me: PointerEvent) => {
      if (activated) {
        const canvasEl = canvasSurfaceRef.current;
        if (isCanvasModeRef.current && canvasEl) {
          const rect = canvasEl.getBoundingClientRect();
          const isInsideCanvas = me.clientX >= rect.left && me.clientX <= rect.right && me.clientY >= rect.top && me.clientY <= rect.bottom;
          if (isInsideCanvas) {
            void addDrawerMediaItemToCanvas(itemId, { x: me.clientX, y: me.clientY });
            cleanup();
            return;
          }
        }

        const el = document.elementFromPoint(me.clientX, me.clientY) as HTMLElement | null;
        const dropEl = el?.closest('[data-folder-drop-id]') as HTMLElement | null;
        if (dropEl) {
          const id = dropEl.dataset.folderDropId || 'all';
          const folderName = dropEl.dataset.folderDropName;
          moveDrawerItemToFolder(itemId, id === 'all' ? undefined : id, folderName);
        }
      }
      cleanup();
    };

    document.addEventListener('pointermove', onMove, true);
    document.addEventListener('pointerup', onUp, true);
    document.addEventListener('pointercancel', cleanup, true);

};

export const handleRenameFolderImpl = (ctx: Pick<drawerAssetsActionContext, 'folders' | 'persistFoldersSnapshot' | 'pushDrawerUndoSnapshot' | 'renameValue' | 'setEditingFolderId' | 'setFolders' | 'showToast'>, id: string) => {
  const { folders, persistFoldersSnapshot, pushDrawerUndoSnapshot, renameValue, setEditingFolderId, setFolders, showToast } = ctx;
    const nextName = renameValue.trim();
    const current = folders.find(f => f.id === id);
    if (nextName && current && current.name !== nextName) {
      const hasDuplicate = folders.some(folder => (
        folder.id !== id &&
        (folder.parentId || undefined) === (current.parentId || undefined) &&
        folder.name.toLocaleLowerCase() === nextName.toLocaleLowerCase()
      ));
      if (hasDuplicate) {
        showToast(current.parentId ? '该项目中已有同名子目录' : '已有同名文件夹');
        setEditingFolderId(null);
        return;
      }
      pushDrawerUndoSnapshot('重命名文件夹');
      const nextFolders = folders.map(f => f.id === id ? { ...f, name: nextName } : f);
      setFolders(nextFolders);
      persistFoldersSnapshot(nextFolders);
      showToast(current.parentId ? '子目录已重命名' : '文件夹已重命名');
    }
    setEditingFolderId(null);

};
