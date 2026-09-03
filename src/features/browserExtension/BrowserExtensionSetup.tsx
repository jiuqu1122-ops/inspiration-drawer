import { listen } from '@tauri-apps/api/event';
import {
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  FolderOpen,
  LoaderCircle,
  Puzzle,
  RefreshCw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  beginBrowserExtensionInstall,
  getBrowserExtensionStatus,
  openBrowserExtensionPage,
  openPreparedBrowserExtensionFolder,
  retryBrowserExtensionPairing,
} from './browserExtensionApi';
import {
  browserExtensionPrimaryAction,
  browserExtensionStatusLabel,
  browserExtensionStatusTone,
} from './browserExtensionState';
import type {
  BrowserExtensionInstallResult,
  BrowserExtensionStatusSnapshot,
  BrowserKind,
} from './types';

const BROWSERS: Array<{ browser: BrowserKind; label: string }> = [
  { browser: 'chrome', label: 'Chrome' },
  { browser: 'edge', label: 'Edge' },
];

export function BrowserExtensionSetup({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const [snapshot, setSnapshot] = useState<BrowserExtensionStatusSnapshot | null>(null);
  const [installResult, setInstallResult] = useState<BrowserExtensionInstallResult | null>(null);
  const [busyBrowser, setBusyBrowser] = useState<BrowserKind | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await getBrowserExtensionStatus());
      setError('');
    } catch (value) {
      setError(String(value));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15_000);
    const unlisten = listen('browser-extension-status-changed', () => void refresh());
    return () => {
      window.clearInterval(timer);
      void unlisten.then(dispose => dispose());
    };
  }, [refresh]);

  const connectionByBrowser = useMemo(
    () => new Map((snapshot?.extensions || []).map(item => [item.browser, item])),
    [snapshot?.extensions],
  );
  const detectionByBrowser = useMemo(
    () => new Map((snapshot?.browsers || []).map(item => [item.browser, item])),
    [snapshot?.browsers],
  );

  const runAction = async (browser: BrowserKind, action: 'install' | 'reconnect' | 'open') => {
    setBusyBrowser(browser);
    setError('');
    try {
      if (action === 'install') {
        setInstallResult(await beginBrowserExtensionInstall(browser));
      } else if (action === 'reconnect') {
        await retryBrowserExtensionPairing(browser);
      } else {
        await openBrowserExtensionPage(browser);
      }
      await refresh();
    } catch (value) {
      setError(String(value));
    } finally {
      setBusyBrowser(null);
    }
  };

  return (
    <section
      data-settings-section="true"
      data-active={expanded ? 'true' : 'false'}
      className="overflow-hidden rounded-[8px] border border-stone-200/80 bg-white/80 shadow-[0_5px_18px_rgba(28,25,23,0.04)] dark:border-stone-700/70 dark:bg-stone-800/80"
    >
      <button
        type="button"
        data-settings-section-trigger="true"
        onPointerDown={event => event.stopPropagation()}
        onClick={event => {
          event.stopPropagation();
          onToggle();
        }}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-stone-50 dark:hover:bg-stone-700/50"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200">
          <Puzzle className="h-4 w-4 text-cyan-600 dark:text-cyan-300" /> 网页采集插件
        </span>
        <span className="flex items-center gap-2">
          {snapshot?.extensions.some(item => item.status === 'connected') && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-300">
              <Check className="h-3 w-3" /> 已连接
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {expanded && (
        <div data-settings-section-content="true" className="border-t border-stone-100 px-3 pb-3 pt-2 dark:border-stone-700/60">
          <div className="divide-y divide-stone-100 dark:divide-stone-700/60">
            {BROWSERS.map(({ browser, label }) => {
              const detection = detectionByBrowser.get(browser);
              const connection = connectionByBrowser.get(browser);
              const status = connection?.status || (detection?.installed ? 'extension_not_installed' : 'browser_not_installed');
              const tone = browserExtensionStatusTone(status);
              const action = browserExtensionPrimaryAction(status);
              const busy = busyBrowser === browser;
              return (
                <div key={browser} className="flex min-h-[48px] items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <strong className="text-[11px] font-semibold text-stone-700 dark:text-stone-200">{label}</strong>
                      <span className={`flex items-center gap-1 text-[10px] font-medium ${
                        tone === 'connected'
                          ? 'text-emerald-600 dark:text-emerald-300'
                          : tone === 'warning'
                            ? 'text-amber-600 dark:text-amber-300'
                            : tone === 'pending'
                              ? 'text-cyan-600 dark:text-cyan-300'
                              : 'text-stone-400 dark:text-stone-500'
                      }`}>
                        <span className={`h-1.5 w-1.5 rounded-full ${
                          tone === 'connected' ? 'bg-emerald-500' : tone === 'warning' ? 'bg-amber-500' : tone === 'pending' ? 'bg-cyan-500' : 'bg-stone-300 dark:bg-stone-600'
                        }`} />
                        {browserExtensionStatusLabel(status)}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[9px] text-stone-400 dark:text-stone-500">
                      {connection?.extensionVersion
                        ? `扩展 ${connection.extensionVersion}${detection?.version ? ` · 浏览器 ${detection.version}` : ''}`
                        : detection?.version ? `浏览器 ${detection.version}` : connection?.message || '安装后自动配对，无需填写端口或 Token'}
                    </div>
                  </div>
                  {action !== 'none' && (
                    <button
                      type="button"
                      disabled={busy}
                      onPointerDown={event => event.stopPropagation()}
                      onClick={event => {
                        event.stopPropagation();
                        void runAction(browser, action);
                      }}
                      className="flex h-7 shrink-0 items-center gap-1 rounded-[5px] border border-stone-200 bg-white px-2 text-[10px] font-semibold text-stone-600 transition-colors hover:border-stone-300 hover:bg-stone-50 disabled:opacity-50 dark:border-stone-600 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600"
                    >
                      {busy ? <LoaderCircle className="h-3 w-3 animate-spin" /> : action === 'open' ? <ExternalLink className="h-3 w-3" /> : action === 'reconnect' ? <RefreshCw className="h-3 w-3" /> : <Puzzle className="h-3 w-3" />}
                      {action === 'open' ? '扩展页面' : action === 'reconnect' ? '重新连接' : status === 'outdated' ? '更新' : '安装'}
                    </button>
                  )}
                  {action === 'none' && status !== 'browser_not_installed' && (
                    <LoaderCircle className="h-3.5 w-3.5 shrink-0 animate-spin text-cyan-500" />
                  )}
                </div>
              );
            })}
          </div>

          {installResult && (
            <div className="mt-2 flex items-start gap-2 rounded-[6px] bg-stone-50 px-2.5 py-2 text-[10px] leading-4 text-stone-600 dark:bg-stone-900/45 dark:text-stone-300">
              <CircleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-300" />
              <div className="min-w-0 flex-1">
                <p>{installResult.instruction}</p>
                {installResult.mode === 'development' && (
                  <button
                    type="button"
                    onClick={event => {
                      event.stopPropagation();
                      void openPreparedBrowserExtensionFolder();
                    }}
                    className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-cyan-700 hover:text-cyan-800 dark:text-cyan-300"
                  >
                    <FolderOpen className="h-3 w-3" /> 定位 manifest.json
                  </button>
                )}
              </div>
            </div>
          )}

          {error && (
            <div className="mt-2 rounded-[6px] bg-red-50 px-2.5 py-2 text-[10px] text-red-600 dark:bg-red-400/10 dark:text-red-200">
              {error}
            </div>
          )}

          <div className="mt-2 flex items-center justify-between text-[9px] text-stone-400 dark:text-stone-500">
            <span>仅监听本机回环地址 · 协议 v{snapshot?.protocolVersion || 1}</span>
            <button type="button" onClick={event => { event.stopPropagation(); void refresh(); }} className="flex items-center gap-1 hover:text-stone-600 dark:hover:text-stone-300">
              <RefreshCw className="h-3 w-3" /> 刷新
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
