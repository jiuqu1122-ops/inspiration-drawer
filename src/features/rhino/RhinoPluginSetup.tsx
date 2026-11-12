import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Download, LoaderCircle, Puzzle, RefreshCw } from 'lucide-react';

export type RhinoInstallStatus = {
  majorVersion: number;
  exePath: string;
  running: boolean;
  pluginPath?: string | null;
  installed: boolean;
  conflictingPackagePaths?: string[];
};
type InstallResult = { installed: RhinoInstallStatus[]; restartRequired: boolean; repairedConflicts?: number; conflictBackups?: string[] };

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
      setMessage(repairNotice + (result.restartRequired
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
        <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">一键安装灵感抽屉插件，自动识别本机 Rhino 8 / 9 并安装对应版本。不需要拖拽文件，也不会修改模型或聊天记录。</p>
        {versions?.map(version => <div key={version.majorVersion} className="flex items-center justify-between gap-2 rounded-lg bg-stone-50 px-3 py-2 text-xs dark:bg-stone-900/50">
          <span>Rhino {version.majorVersion}{version.running && <small className="ml-2 text-stone-400">运行中</small>}</span>
          <span className="flex items-center gap-1 text-stone-500">{version.installed && <Check size={12} />}{version.conflictingPackagePaths?.length ? `旧包 ID 冲突（${version.conflictingPackagePaths.length}）` : version.installed ? '已安装当前版本' : version.pluginPath ? '可更新' : '未安装'}</span>
        </div>)}
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
