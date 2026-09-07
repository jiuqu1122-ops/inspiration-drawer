import { ChevronRight, FolderOpen, RefreshCw, Upload } from 'lucide-react';

import type { EagleImportMode, EagleImportStatus } from '../../types/eagle';

type EagleImportSettingsProps = {
  mode: EagleImportMode;
  status: EagleImportStatus;
  onModeChange: (mode: EagleImportMode) => void;
  onOnlineImport: () => void;
  onOfflineImport: () => void;
};

const BUSY_PHASES: EagleImportStatus['phase'][] = [
  'checking',
  'reading',
  'importing',
  'caching',
];

export function EagleImportSettings({
  mode,
  status,
  onModeChange,
  onOnlineImport,
  onOfflineImport,
}: EagleImportSettingsProps) {
  const busy = BUSY_PHASES.includes(status.phase);

  return (
    <>
      <div className="mx-2 grid grid-cols-2 gap-1 rounded-[14px] border border-stone-200/80 bg-stone-50/70 p-1 text-[10px] dark:border-stone-600/70 dark:bg-stone-800/60">
        <button
          type="button"
          disabled={busy}
          onClick={() => onModeChange('reference')}
          className={'rounded-[10px] px-2 py-1.5 font-bold transition-colors ' + (
            mode === 'reference'
              ? 'bg-white text-orange-600 shadow-sm dark:bg-stone-700 dark:text-orange-300'
              : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          )}
          title="直接引用 Eagle 原始文件，仅保留缩略图缓存"
        >
          引用原文件（推荐）
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onModeChange('copy')}
          className={'rounded-[10px] px-2 py-1.5 font-bold transition-colors ' + (
            mode === 'copy'
              ? 'bg-white text-orange-600 shadow-sm dark:bg-stone-700 dark:text-orange-300'
              : 'text-stone-500 hover:text-stone-800 dark:text-stone-400 dark:hover:text-stone-200'
          )}
          title="按页、限并发复制原始素材到灵感抽屉缓存"
        >
          复制到灵感抽屉
        </button>
      </div>
      <button
        type="button"
        onClick={onOnlineImport}
        disabled={busy}
        className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] disabled:cursor-wait disabled:opacity-70 dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
        title="依次检测 127.0.0.1:41595 的 Eagle V2 / V1 本地 API"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
          <FolderOpen className="w-3.5 h-3.5 shrink-0 text-orange-500" />
          <span className="truncate">从 Eagle 导入</span>
        </span>
        <span className={'flex max-w-[150px] items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold transition-colors ' + (
          status.phase === 'error'
            ? 'border-red-200 bg-red-50 text-red-600 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-200'
            : status.phase === 'done'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-600 dark:border-emerald-800/50 dark:bg-emerald-900/30 dark:text-emerald-300'
              : busy
                ? 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-800/50 dark:bg-orange-900/30 dark:text-orange-300'
                : 'border-stone-200 bg-white/75 text-stone-500 dark:border-stone-600 dark:bg-stone-700/70 dark:text-stone-300'
        )}>
          {busy && <RefreshCw className="h-3 w-3 shrink-0 animate-spin" />}
          <span className="truncate">
            {status.phase === 'idle'
              ? '开始导入'
              : status.phase === 'done'
                ? `已导入 ${status.imported}`
                : status.phase === 'error'
                  ? '失败'
                  : status.processed > 0
                    ? `${status.processed}/${status.total || '?'}`
                    : '处理中'}
          </span>
          <ChevronRight className="w-3 h-3 shrink-0 opacity-45 transition-transform group-hover:translate-x-0.5" />
        </span>
      </button>
      <button
        type="button"
        onClick={onOfflineImport}
        disabled={busy}
        className="group flex min-h-[42px] w-full items-center justify-between gap-3 rounded-[16px] border border-transparent px-2.5 py-2 text-left transition-all hover:border-stone-200/80 hover:bg-stone-50/85 active:scale-[0.995] disabled:cursor-wait disabled:opacity-70 dark:hover:border-stone-600/70 dark:hover:bg-stone-700/50"
        title="选择本机 .library 目录进行只读离线导入"
      >
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-stone-300">
          <Upload className="w-3.5 h-3.5 shrink-0 text-amber-500" />
          <span className="truncate">选择 .library 离线导入</span>
        </span>
        <ChevronRight className="w-3.5 h-3.5 text-stone-400 transition-transform group-hover:translate-x-0.5" />
      </button>
      {status.phase !== 'idle' && (
        <div className={'mx-2 rounded-[14px] border px-2.5 py-2 text-[10px] leading-4 ' + (
          status.phase === 'error'
            ? 'border-red-200/80 bg-red-50/70 text-red-600 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200'
            : 'border-orange-100 bg-orange-50/55 text-orange-700 dark:border-orange-800/35 dark:bg-orange-900/18 dark:text-orange-200'
        )}>
          <div className="font-bold">{status.message || '准备导入 Eagle 素材'}</div>
          {status.phase === 'error' && status.diagnostics && (
            <div className="mt-2 grid gap-1 rounded-[10px] border border-red-100 bg-white/60 px-2 py-1.5 text-stone-600 dark:border-red-400/15 dark:bg-stone-900/35 dark:text-stone-300">
              <div>Eagle 是否打开：<b>{status.diagnostics.eagleOpen ? '是' : '未检测到'}</b></div>
              <div>41595 端口是否可访问：<b>{status.diagnostics.portAccessible ? '是' : '否'}</b></div>
              <div>当前是否打开资料库：<b>{status.diagnostics.libraryOpen === true ? '是' : status.diagnostics.libraryOpen === false ? '否' : '无法确认'}</b></div>
              {status.diagnostics.apiVersion && (
                <div>已识别接口：<b>{status.diagnostics.apiVersion.toUpperCase()}</b></div>
              )}
              <button
                type="button"
                onClick={onOfflineImport}
                className="mt-1 flex items-center justify-center gap-1 rounded-[9px] bg-amber-100 px-2 py-1 font-bold text-amber-700 hover:bg-amber-200 dark:bg-amber-400/15 dark:text-amber-200"
              >
                <Upload className="h-3 w-3" /> 选择 .library 离线导入
              </button>
            </div>
          )}
          {(status.phase === 'caching' || status.cached > 0 || status.skipped > 0 || status.failed > 0) && (
            <div className="mt-1 text-stone-500 dark:text-stone-400">
              {mode === 'copy' ? `已复制：${status.cached}` : '引用模式：未复制原始文件'}
              {status.skipped ? ` / 跳过 ${status.skipped}` : ''}
              {status.failed ? ` / 失败 ${status.failed}` : ''}
            </div>
          )}
        </div>
      )}
    </>
  );
}
