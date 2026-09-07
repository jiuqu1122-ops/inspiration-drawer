import { useCallback, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';

import type { BufferItem, Folder } from '../../types';
import type {
  EagleImportMode,
  EagleImportStatus,
  EagleOfflineLibraryPage,
  EagleOfflineLibraryStart,
} from '../../types/eagle';
import {
  detectEagleConnection,
  eagleApiGet,
  EAGLE_IMPORT_PAGE_LIMIT,
  getEagleErrorMessage,
  normalizeEagleFoldersPayload,
  normalizeEagleItemsPayload,
} from './eagleApi';
import { runEagleStreamImport, type EagleImportProgress } from './eagleImportService';
import { planEagleFolders } from './eagleNormalization';

const initialStatus: EagleImportStatus = {
  phase: 'idle',
  message: '',
  total: 0,
  processed: 0,
  imported: 0,
  skipped: 0,
  cached: 0,
  failed: 0,
};

const isBusy = (status: EagleImportStatus) => (
  ['checking', 'reading', 'importing', 'caching'].includes(status.phase)
);

type UseEagleImportOptions = {
  storageMode: 'initializing' | 'sqlite' | 'json';
  folders: Folder[];
  getCurrentAssets: () => BufferItem[];
  getCacheDir: () => Promise<string>;
  onFoldersReady: (folders: Folder[]) => void;
  onJsonBatch: (assets: BufferItem[]) => void;
  onComplete: (firstFolderId?: string) => void;
  showToast: (message: string) => void;
};

export const useEagleImport = (options: UseEagleImportOptions) => {
  const [status, setStatus] = useState<EagleImportStatus>(initialStatus);
  const [mode, setMode] = useState<EagleImportMode>('reference');

  const updateStatus = useCallback((patch: Partial<EagleImportStatus>) => {
    setStatus(previous => ({ ...previous, ...patch, updatedAt: Date.now() }));
  }, []);

  const setProgress = useCallback((progress: EagleImportProgress) => {
    updateStatus({
      phase: mode === 'copy' ? 'caching' : 'importing',
      message: mode === 'copy'
        ? `已处理 ${progress.processed}/${progress.total || '?'}，已导入 ${progress.imported}，复制 ${progress.cached}`
        : `已处理 ${progress.processed}/${progress.total || '?'}，已导入 ${progress.imported}`,
      total: progress.total,
      processed: progress.processed,
      imported: progress.imported,
      skipped: progress.skipped,
      cached: progress.cached,
      failed: progress.failed,
    });
  }, [mode, updateStatus]);

  const runImport = useCallback(async (input: {
    folders: unknown;
    library?: { name?: string; path?: string };
    total?: number;
    nextPage: () => Promise<{
      items: Record<string, unknown>[];
      failures?: Array<{ filePath: string; reason: string }>;
      total?: number;
      processed?: number;
      done: boolean;
    }>;
    sourceLabel: string;
  }) => {
    if (options.storageMode === 'initializing') {
      throw new Error('素材数据库仍在初始化');
    }
    const startedAt = Date.now();
    const folderPlan = planEagleFolders(normalizeEagleFoldersPayload(input.folders), options.folders);
    if (folderPlan.newFolders.length > 0) options.onFoldersReady(folderPlan.folders);
    updateStatus({
      phase: 'importing',
      message: `正在从 ${input.sourceLabel} 分页导入...`,
      total: input.total || 0,
      processed: 0,
      imported: 0,
      skipped: 0,
      cached: 0,
      failed: 0,
      startedAt,
    });
    const result = await runEagleStreamImport({
      mode,
      storageMode: options.storageMode,
      folderIdMap: folderPlan.folderIdMap,
      libraryPath: input.library?.path,
      total: input.total,
      startedAt,
      nextPage: input.nextPage,
      getCacheDir: options.getCacheDir,
      existingJsonAssets: options.storageMode === 'json' ? options.getCurrentAssets() : undefined,
      onJsonBatch: options.onJsonBatch,
      onProgress: setProgress,
    });
    const details = [
      `导入 ${result.imported}`,
      result.skipped ? `跳过 ${result.skipped}` : '',
      result.failed ? `失败 ${result.failed}` : '',
      mode === 'copy' ? `复制 ${result.cached}` : '',
    ].filter(Boolean).join('，');
    updateStatus({
      phase: 'done',
      message: `${input.sourceLabel}导入完成：${details}`,
      ...result,
    });
    options.onComplete(folderPlan.newFolders[0]?.id);
    options.showToast(`${input.sourceLabel}导入完成：${details}`);
  }, [mode, options, setProgress, updateStatus]);

  const importFromEagle = useCallback(async () => {
    if (isBusy(status)) return;
    const startedAt = Date.now();
    setStatus({
      ...initialStatus,
      phase: 'checking',
      message: '正在连接 Eagle 本地服务...',
      startedAt,
      updatedAt: startedAt,
    });
    try {
      const detection = await detectEagleConnection();
      if (!detection.apiVersion || !detection.baseUrl) {
        updateStatus({
          phase: 'error',
          message: '未检测到可用的 Eagle 本地 API，可改用 .library 离线导入',
          diagnostics: detection,
        });
        options.showToast('Eagle 连接检测失败，请查看诊断或选择 .library 离线导入');
        return;
      }
      if (!detection.libraryOpen) {
        updateStatus({
          phase: 'error',
          message: 'Eagle 已打开，但当前没有可读取的资料库',
          diagnostics: detection,
        });
        options.showToast('请先在 Eagle 中打开资料库，或选择 .library 离线导入');
        return;
      }
      updateStatus({
        phase: 'reading',
        message: `已连接 Eagle ${detection.apiVersion.toUpperCase()}，正在读取文件夹...`,
        diagnostics: detection,
      });
      const folderPayload = await eagleApiGet<unknown>(
        detection.baseUrl,
        detection.apiVersion === 'v2' ? '/folder/get' : '/folder/list',
      );
      let offset = 0;
      let total = 0;
      await runImport({
        folders: folderPayload,
        library: detection.libraryInfo,
        sourceLabel: detection.libraryInfo?.name
          ? `Eagle「${String(detection.libraryInfo.name)}」`
          : 'Eagle',
        nextPage: async () => {
          const payload = await eagleApiGet<unknown>(
            detection.baseUrl!,
            detection.apiVersion === 'v2' ? '/item/get' : '/item/list',
            { limit: EAGLE_IMPORT_PAGE_LIMIT, offset },
          );
          const normalized = normalizeEagleItemsPayload(payload);
          if (normalized.total > 0) total = normalized.total;
          offset += normalized.items.length;
          return {
            items: normalized.items,
            total,
            processed: offset,
            done: normalized.items.length === 0
              || normalized.items.length < EAGLE_IMPORT_PAGE_LIMIT
              || (total > 0 && offset >= total),
          };
        },
      });
    } catch (error) {
      const message = getEagleErrorMessage(error);
      updateStatus({ phase: 'error', message: `Eagle 导入失败：${message}` });
      options.showToast(`Eagle 导入失败：${message}`);
    }
  }, [options, runImport, status, updateStatus]);

  const importFromEagleLibrary = useCallback(async () => {
    if (isBusy(status)) return;
    let sessionId = '';
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: '选择 Eagle .library 资料库目录',
      });
      if (typeof selected !== 'string' || !selected) return;
      if (!/\.library[\\/]?$/i.test(selected)) {
        options.showToast('请选择以 .library 结尾的 Eagle 资料库目录');
        return;
      }
      const startedAt = Date.now();
      setStatus({
        ...initialStatus,
        phase: 'reading',
        message: '正在建立 Eagle 离线资料库流式读取会话...',
        startedAt,
        updatedAt: startedAt,
      });
      const started = await invoke<EagleOfflineLibraryStart>('eagle_start_offline_library', { path: selected });
      sessionId = started.sessionId;
      await runImport({
        folders: started.folders || [],
        library: started.library,
        total: started.total,
        sourceLabel: started.library?.name ? `Eagle 离线库「${started.library.name}」` : 'Eagle 离线库',
        nextPage: async () => {
          const page = await invoke<EagleOfflineLibraryPage>('eagle_read_offline_page', {
            sessionId,
            session_id: sessionId,
            limit: EAGLE_IMPORT_PAGE_LIMIT,
          });
          return {
            items: page.items,
            failures: page.failures,
            total: page.total,
            processed: page.scanned,
            done: page.done,
          };
        },
      });
    } catch (error) {
      const message = getEagleErrorMessage(error);
      updateStatus({ phase: 'error', message: `Eagle 离线导入失败：${message}` });
      options.showToast(`Eagle 离线导入失败：${message}`);
    } finally {
      if (sessionId) {
        await invoke('eagle_finish_offline_library', {
          sessionId,
          session_id: sessionId,
        }).catch(() => undefined);
      }
    }
  }, [options, runImport, status, updateStatus]);

  return {
    eagleImportStatus: status,
    eagleImportMode: mode,
    setEagleImportMode: setMode,
    importFromEagle,
    importFromEagleLibrary,
  };
};
