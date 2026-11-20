import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Download, LoaderCircle, Puzzle, RefreshCw } from 'lucide-react';

export type RhinoInstallStatus = {
  majorVersion: number;
  exePath: string;
  running: boolean;
  runningAsCurrentUser?: boolean | null;
  pluginPath?: string | null;
  loadMode?: number | null;
  loadProtection?: number | null;
  installed: boolean;
  conflictingPackagePaths?: string[];
};
type InstallResult = {
  installed: RhinoInstallStatus[]; restartRequired: boolean; repairedConflicts?: number; conflictBackups?: string[];
  cleanedVersions?: number; cleanupBackups?: string[]; cleanupDeferred?: boolean; cleanupWarnings?: string[];
};

export function RhinoPluginSetup({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const [versions, setVersions] = useState<RhinoInstallStatus[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const operation = useRef(false);
  const refresh = useCallback(async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true);
    try { setVersions(await invoke<RhinoInstallStatus[]>('rhino_plugin_status')); setError(''); }
    catch (value) { setError(String(value)); }
    finally { operation.current = false; setBusy(false); }
  }, []);
  useEffect(() => { if (expanded) void refresh(); }, [expanded, refresh]);
  const install = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = await invoke<InstallResult>('install_rhino_plugin');
      setVersions(result.installed);
      const repairNotice = result.repairedConflicts ? `已修复 ${result.repairedConflicts} 个同 ID 旧包冲突，旧包已备份。${result.conflictBackups?.[0] ? '备份：' + result.conflictBackups[0] + '。' : ''}` : '';
      const cleanupNotice = result.cleanedVersions
        ? `\u5df2\u4ece\u5b89\u88c5\u76ee\u5f55\u6e05\u7406 ${result.cleanedVersions} \u4e2a\u65e7\u7248\u63d2\u4ef6\uff0c\u5df2\u4fdd\u7559\u6062\u590d\u5907\u4efd\u3002${result.cleanupBackups?.[0] ? '\u5907\u4efd\uff1a' + result.cleanupBackups[0] + '\u3002' : ''}`
        : '';
      const deferredNotice = result.cleanupDeferred
        ? '\u90e8\u5206 Rhino \u4ecd\u5728\u8fd0\u884c\uff0c\u65e7\u7248\u6587\u4ef6\u6682\u4e0d\u6e05\u7406\uff1b\u5173\u95ed Rhino \u540e\u518d\u70b9\u4e00\u6b21\u5b89\u88c5 / \u66f4\u65b0\u5373\u53ef\u5b89\u5168\u6e05\u7406\u3002'
        : '';
      if (result.cleanupWarnings?.length) setError('\u65b0\u7248\u5df2\u5b89\u88c5\uff0c\u4ee5\u4e0b\u65e7\u7248\u672a\u6e05\u7406\uff1a' + result.cleanupWarnings.join('\n'));
      setMessage(repairNotice + cleanupNotice + deferredNotice + (result.restartRequired
        ? '安装完成。请保存模型并重启正在运行的 Rhino，然后输入 InspirationDrawer 打开插件。'
        : '安装完成。启动 Rhino，输入 InspirationDrawer 即可打开插件。'));
    } catch (value) { setError(String(value)); }
    finally { operation.current = false; setBusy(false); }
  };
  return (
    <section data-settings-section="true" data-active={expanded ? 'true' : 'false'} className="overflow-hidden rounded-[18px] border border-stone-200/80 bg-white dark:border-stone-700/70 dark:bg-stone-800">
      <button data-settings-section-trigger="true" onClick={onToggle} className="flex w-full items-center justify-between p-3 text-left hover:bg-stone-50 dark:hover:bg-stone-700/50">
        <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Puzzle className="h-4 w-4 text-stone-500" />Rhino 插件</span>
        <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="space-y-3 border-t border-stone-100 p-3 dark:border-stone-700/60">
        <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">{'\u4e00\u952e\u5b89\u88c5 Rhino 8 / 9 \u63d2\u4ef6\uff0c\u4f1a\u5c06\u6587\u4ef6\u548c\u6ce8\u518c\u9879\u5199\u5165\u5f53\u524d Windows \u8d26\u6237\u3002\u8fd9\u91cc\u53ea\u80fd\u786e\u8ba4\u6ce8\u518c\u548c\u6587\u4ef6\u6821\u9a8c\uff0c\u4e0d\u80fd\u8bc1\u660e Rhino \u5df2\u6210\u529f\u52a0\u8f7d\uff1b\u5b89\u88c5\u6216\u66f4\u65b0\u540e\u8bf7\u5b8c\u5168\u9000\u51fa\u5e76\u91cd\u542f Rhino\u3002'}</p>
        {versions?.map(version => {
          const statusLabel = version.conflictingPackagePaths?.length
            ? `\u65e7\u5305 ID \u51b2\u7a81\uff08${version.conflictingPackagePaths.length}\uff09`
            : version.installed && version.loadMode === 0
              ? '\u5df2\u6ce8\u518c\uff08Rhino \u5df2\u7981\u7528\u52a0\u8f7d\uff09'
              : version.installed
                ? '\u5df2\u6ce8\u518c\uff08\u672a\u786e\u8ba4 Rhino \u5df2\u52a0\u8f7d\uff09'
                : version.pluginPath
                  ? '\u6ce8\u518c\u8def\u5f84\u4e0e\u5b89\u88c5\u6587\u4ef6\u4e0d\u5339\u914d'
                  : '\u672a\u5b89\u88c5';
          return <div key={version.majorVersion} className="space-y-1 rounded-lg bg-stone-50 px-3 py-2 text-xs dark:bg-stone-900/50">
            <div className="flex items-center justify-between gap-2">
              <span>Rhino {version.majorVersion}{version.running && <small className="ml-2 text-stone-400">{'\u8fd0\u884c\u4e2d'}</small>}</span>
              <span className="flex items-center gap-1 text-stone-500">{version.installed && <Check size={12} />}{statusLabel}</span>
            </div>
            {version.pluginPath && <details className="text-[10px] text-stone-500">
              <summary className="cursor-pointer">{'\u67e5\u770b\u6ce8\u518c\u6587\u4ef6\u8def\u5f84'}</summary>
              <code className="mt-1 block break-all">{version.pluginPath}</code>
            </details>}
            {version.running && version.runningAsCurrentUser === false && <p role="status" className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">{'\u68c0\u6d4b\u5230 Rhino \u662f\u4ee5\u53e6\u4e00 Windows \u8d26\u6237\u8fd0\u884c\uff1b\u6b64\u63d2\u4ef6\u5b89\u88c5\u5728\u62bd\u5c49\u5f53\u524d\u8d26\u6237\uff0c\u53e6\u4e00\u8d26\u6237\u4e0d\u4f1a\u770b\u5230\u6b64\u6ce8\u518c\u9879\u3002'}</p>}
            {version.installed && version.loadMode === 0 && <p role="status" className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">{'\u8bf7\u5728 Rhino \u7684 PlugInManager \u4e2d\u68c0\u67e5\u5e76\u91cd\u65b0\u542f\u7528\u63d2\u4ef6\u3002'}</p>}
            {version.loadProtection != null && version.loadProtection > 1 && <p role="status" className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">{'Rhino \u5f53\u524d\u8bbe\u7f6e\u4e86\u52a0\u8f7d\u4fdd\u62a4\u786e\u8ba4\uff1b\u5982\u672a\u52a0\u8f7d\uff0c\u8bf7\u5728 Rhino \u7684 PlugInManager \u5141\u8bb8\u52a0\u8f7d\u6b64\u63d2\u4ef6\u3002'}</p>}
          </div>;
        })}
        {versions?.length === 0 && <p className="text-[11px] text-amber-700 dark:text-amber-400">尚未检测到 Rhino 8 或 9，请先安装 Rhino 后刷新。</p>}
        {versions?.some(version => version.conflictingPackagePaths?.length) && <p role="status" className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">发现旧版 YAK 与当前插件重复 ID。请先退出对应 Rhino，再一键更新；旧包将备份并移出扫描目录，不会删除。不要勾选 Rhino 弹窗中的“不再加载此插件”。</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy || !versions?.length} onClick={() => void install()} className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900">
            {busy ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}一键安装 / 更新插件
          </button>
          <button type="button" disabled={busy} onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-2 text-xs text-stone-500 disabled:opacity-40 dark:border-stone-600"><RefreshCw size={12} />刷新检测</button>
        </div>
        {message && <p role="status" className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">{message}</p>}
        {error && <p role="alert" className="break-words text-[11px] text-red-600 dark:text-red-400">{error}</p>}
        <p className="text-[10px] leading-relaxed text-stone-400">适用于 Windows 版 Rhino 8 / 9 的 .NET 模式。Rhino 原生 MCP 建模功能还需要 RhinoAI 插件；安装本面板不会替换已有的 RhinoAI。</p>
      </div>}
    </section>
  );
}
