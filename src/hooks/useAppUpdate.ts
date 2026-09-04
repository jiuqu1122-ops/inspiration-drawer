import { useEffect, useRef, useState } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { relaunch } from '@tauri-apps/plugin-process';

import type { AppUpdateInstallResult, AppUpdateProgress } from '../types/appUpdate';
import { getLocalDateKey } from '../features/calendarModel';
import { loadPlatformCapabilities, unsupportedPlatformMessage } from '../platform/capabilities';

const APP_UPDATE_PROMPT_SHOWN_DATE_STORAGE_KEY = 'drawer_app_update_prompt_shown_date';
const APP_UPDATE_LAST_AUTOMATIC_CHECK_STORAGE_KEY = 'drawer_app_update_last_automatic_check';
const APP_UPDATE_AUTOMATIC_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

type UseAppUpdateOptions = {
  isMainDrawerWindow: boolean;
  showToast: (message: string) => void;
};

export const formatAppUpdateErrorMessage = (err: unknown) => {
  const raw = err instanceof Error ? err.message : String(err || '未知错误');
  const lower = raw.toLowerCase();

  if (raw.includes('manifest 请求失败')) {
    return `检查更新失败：manifest 请求失败。原始错误：${raw}`;
  }

  if (raw.includes('manifest 不是合法 JSON')) {
    return `检查更新失败：manifest 不是合法 JSON。原始错误：${raw}`;
  }

  if (raw.includes('manifest 格式不符合预期') || lower.includes('url field was not set')) {
    return `检查更新失败：manifest 格式不符合预期。原始错误：${raw}`;
  }

  if (raw.includes('版本号比较失败')) {
    return `检查更新失败：版本号比较失败。原始错误：${raw}`;
  }

  if (lower.includes('signature field was not set')) {
    return `检查更新失败：signature 缺失。当前安装阶段仍借用 Tauri updater，signature 必须是 .sig 文件内容。原始错误：${raw}`;
  }

  if (lower.includes('signature')) {
    return `检查更新失败：signature 缺失或不匹配。原始错误：${raw}`;
  }

  if (lower.includes('sha256')) {
    return `检查更新失败：sha256 缺失或不匹配。原始错误：${raw}`;
  }

  if (raw.includes('文件大小不匹配') || lower.includes('size')) {
    return `检查更新失败：安装包大小不匹配。原始错误：${raw}`;
  }

  if (raw.includes('下载更新源') || raw.includes('下载失败') || lower.includes('download')) {
    return `检查更新失败：安装包下载失败。原始错误：${raw}`;
  }

  if (raw.includes('安装包路径不存在') || raw.includes('路径不存在')) {
    return `检查更新失败：安装包路径不存在。原始错误：${raw}`;
  }

  if (raw.includes('安装更新失败')) {
    return `检查更新失败：安装阶段失败。原始错误：${raw}`;
  }

  if (lower.includes('sending request') || lower.includes('timed out') || lower.includes('timeout') || lower.includes('dns') || lower.includes('network') || lower.includes('connection')) {
    return `检查更新失败：请求失败。原始错误：${raw}`;
  }

  return `检查更新失败：${raw}`;
};

export const useAppUpdate = ({ isMainDrawerWindow, showToast }: UseAppUpdateOptions) => {
  const shouldShowDailyAppUpdatePrompt = () => {
    if (!isMainDrawerWindow) return false;
    const todayKey = getLocalDateKey(Date.now());
    if (localStorage.getItem(APP_UPDATE_PROMPT_SHOWN_DATE_STORAGE_KEY) === todayKey) return false;
    localStorage.setItem(APP_UPDATE_PROMPT_SHOWN_DATE_STORAGE_KEY, todayKey);
    return true;
  };

  const [appVersion, setAppVersion] = useState('');
  const [autoUpdaterSupported, setAutoUpdaterSupported] = useState(false);
  const [isCheckingAppUpdate, setIsCheckingAppUpdate] = useState(false);
  const isCheckingAppUpdateRef = useRef(false);
  const [showAppUpdatePromptArrow, setShowAppUpdatePromptArrow] = useState(false);

  useEffect(() => {
    let disposed = false;
    void loadPlatformCapabilities().then(capabilities => {
      if (disposed) return;
      setAutoUpdaterSupported(capabilities.autoUpdater);
      if (capabilities.autoUpdater && shouldShowDailyAppUpdatePrompt()) {
        setShowAppUpdatePromptArrow(true);
      }
    });
    return () => {
      disposed = true;
    };
  }, [isMainDrawerWindow]);

  useEffect(() => {
    if (!isMainDrawerWindow) return;
    getVersion()
      .then(setAppVersion)
      .catch(err => {
        console.warn('获取应用版本失败:', err);
        setAppVersion('5.0.15');
      });
  }, []);

  const checkAndInstallAppUpdate = async (options: { silent?: boolean; hidePromptWhenUpToDate?: boolean } = {}) => {
    if (!isMainDrawerWindow) return;
    if (!autoUpdaterSupported) {
      if (!options.silent) showToast(unsupportedPlatformMessage('自动更新'));
      return;
    }
    if (isCheckingAppUpdateRef.current) {
      if (!options.silent) showToast('正在检查更新...');
      return;
    }

    isCheckingAppUpdateRef.current = true;
    setIsCheckingAppUpdate(true);
    const progressId = `app-update-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    let unlistenAppUpdateProgress: (() => void) | undefined;
    try {
      if (!options.silent) showToast('正在检查更新...');
      let lastToastAt = 0;
      let lastDownloadingSource = '';
      unlistenAppUpdateProgress = await listen<AppUpdateProgress>('app-update-progress', (event) => {
        const progress = event.payload;
        if (progress?.progressId !== progressId) return;
        console.info('[app-update]', {
          updaterKind: progress.updaterKind,
          stage: progress.stage,
          message: progress.message,
          manifestEndpoint: progress.manifestEndpoint,
          statusCode: progress.statusCode,
          version: progress.version,
          currentVersion: progress.currentVersion,
          available: progress.available,
          sourceName: progress.sourceName,
          sourceUrl: progress.sourceUrl,
          selectedUrl: progress.selectedUrl,
          errorMessage: progress.errorMessage,
          loaded: progress.loaded,
          total: progress.total,
          progress: progress.progress,
        });
        const sourceName = progress.sourceName || '更新源';
        const version = progress.version || '';

        if (progress.stage === 'found') {
          showToast(version ? `发现新版本 ${version}，准备下载更新` : '发现新版本，准备下载更新');
          return;
        }

        if (progress.stage === 'source-started') {
          lastDownloadingSource = sourceName;
          showToast(`正在尝试 ${sourceName}`);
          return;
        }

        if (progress.stage === 'downloading') {
          const total = Number(progress.total || 0);
          const loaded = Number(progress.loaded || 0);
          const now = Date.now();
          if (sourceName !== lastDownloadingSource || now - lastToastAt > 1200 || (total > 0 && loaded >= total)) {
            lastToastAt = now;
            lastDownloadingSource = sourceName;
            showToast(total > 0
              ? `正在从 ${sourceName} 下载 ${Math.min(99, Math.round((loaded / total) * 100))}%`
              : `正在从 ${sourceName} 下载更新包`);
          }
          return;
        }

        if (progress.stage === 'download-finished') {
          showToast(`${sourceName} 下载完成，正在校验`);
          return;
        }

        if (progress.stage === 'sha256-verified') {
          showToast(`${sourceName} SHA256 校验通过`);
          return;
        }

        if (progress.stage === 'installing') {
          showToast('更新包校验通过，正在安装');
          return;
        }

        if (progress.stage === 'source-failed') {
          console.warn('[app-update] source failed:', {
            sourceName: progress.sourceName,
            sourceUrl: progress.sourceUrl,
            message: progress.message,
            errorMessage: progress.errorMessage,
          });
          if (!options.silent) {
            const detail = `${progress.message || ''}\n${progress.errorMessage || ''}`.toLowerCase();
            const reason = detail.includes('signature')
              ? 'signature 校验/格式失败'
              : detail.includes('sha256')
                ? 'SHA256 校验失败'
                : detail.includes('文件大小') || detail.includes('size')
                  ? '文件大小不匹配'
                  : detail.includes('url field')
                    ? 'manifest 下载 URL 缺失'
                    : detail.includes('download') || detail.includes('下载')
                      ? '下载失败'
                      : '处理失败';
            showToast(`${sourceName} ${reason}，正在切换备用源`);
          }
        }
      });

      const result = await invoke<AppUpdateInstallResult>('check_and_install_app_update_mirrors', {
        progressId,
        checkTimeoutMs: 8000,
        downloadTimeoutMs: 180000,
      });

      if (!result.available) {
        if (options.hidePromptWhenUpToDate) setShowAppUpdatePromptArrow(false);
        if (!options.silent) showToast('当前已是最新版本');
        return;
      }

      if (!result.installed) return;
      setShowAppUpdatePromptArrow(false);
      showToast('更新已安装，准备重启');

      window.setTimeout(() => {
        void relaunch().catch(err => {
          console.warn('relaunch after update failed:', err);
          showToast('更新已安装，请手动重启应用');
        });
      }, 900);
    } catch (err) {
      console.warn('检查更新失败:', err);
      if (!options.silent) showToast(formatAppUpdateErrorMessage(err));
    } finally {
      unlistenAppUpdateProgress?.();
      isCheckingAppUpdateRef.current = false;
      setIsCheckingAppUpdate(false);
    }
  };

  useEffect(() => {
    if (!isMainDrawerWindow || !autoUpdaterSupported) return;
    let disposed = false;
    let timer: number | null = null;

    const scheduleNextAutomaticCheck = () => {
      if (disposed) return;
      const stored = Number(localStorage.getItem(APP_UPDATE_LAST_AUTOMATIC_CHECK_STORAGE_KEY));
      const lastCheckedAt = Number.isFinite(stored) && stored > 0 ? stored : 0;
      const elapsed = lastCheckedAt > 0 ? Math.max(0, Date.now() - lastCheckedAt) : 0;
      const delayMs = lastCheckedAt > 0
        ? Math.max(1000, APP_UPDATE_AUTOMATIC_CHECK_INTERVAL_MS - elapsed)
        : 15_000;

      timer = window.setTimeout(async () => {
        if (disposed) return;
        localStorage.setItem(APP_UPDATE_LAST_AUTOMATIC_CHECK_STORAGE_KEY, String(Date.now()));
        await checkAndInstallAppUpdate({ silent: true, hidePromptWhenUpToDate: true });
        scheduleNextAutomaticCheck();
      }, delayMs);
    };

    scheduleNextAutomaticCheck();
    return () => {
      disposed = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [autoUpdaterSupported, isMainDrawerWindow]);

  const handleAppUpdatePromptClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (isCheckingAppUpdate) {
      showToast('正在检查更新...');
      return;
    }
    void checkAndInstallAppUpdate({ hidePromptWhenUpToDate: true });
  };

  useEffect(() => {
    if (!isMainDrawerWindow) setShowAppUpdatePromptArrow(false);
  }, []);

  return {
    appVersion,
    autoUpdaterSupported,
    checkAndInstallAppUpdate,
    handleAppUpdatePromptClick,
    isCheckingAppUpdate,
    showAppUpdatePromptArrow,
  };
};
