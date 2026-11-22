import { readRhinoPluginSyncResult } from './rhinoPluginAutoUpdate';
import { rhinoComponentUpdateMessage, type RhinoComponentStatus, type RhinoComponentUpdateResult } from './rhinoIndependentUpdates';
import { rhinoRuntimeStatus } from './rhinoRuntime';
import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Download, LoaderCircle, Puzzle, RefreshCw } from 'lucide-react';

export type RhinoInstallStatus = {
  majorVersion: number;
  exePath: string;
  running: boolean;
  runningStateUncertain?: boolean;
  runtimeModes?: string[];
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
type SetupStep = 'detect' | 'check' | 'install' | 'rollback';
const componentNames: Record<string, string> = { runtime: '建模模块', plugin8: 'Rhino 8 插件', plugin9: 'Rhino 9 插件' };

export function RhinoPluginSetup({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const [versions, setVersions] = useState<RhinoInstallStatus[] | null>(null);
  const [step, setStep] = useState<SetupStep | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [components, setComponents] = useState<RhinoComponentStatus | null>(null);
  const operation = useRef(false);
  const automaticSync = readRhinoPluginSyncResult();
  const runtime = rhinoRuntimeStatus();
  const busy = step !== null;
  const run = useCallback(async (next: SetupStep, work: () => Promise<void>) => {
    if (operation.current) return;
    operation.current = true;
    setStep(next); setError(''); setMessage('');
    try { await work(); }
    catch (value) { setError(previous => [previous, String(value)].filter(Boolean).join('\n')); }
    finally { operation.current = false; setStep(null); }
  }, []);
  const refresh = useCallback(() => run('detect', async () => {
    const [hosts, updates] = await Promise.allSettled([
      invoke<RhinoInstallStatus[]>('rhino_plugin_status'), invoke<RhinoComponentStatus>('rhino_update_status'),
    ]);
    setVersions(hosts.status === 'fulfilled' ? hosts.value : null);
    setComponents(updates.status === 'fulfilled' ? updates.value : null);
    setError([hosts, updates].flatMap(r => r.status === 'rejected' ? [String(r.reason)] : []).join('\n'));
  }), [run]);
  useEffect(() => { if (expanded) void refresh(); }, [expanded, refresh]);
  const install = () => run('check', async () => {
    let updateNotice = '';
    try {
      const update = await invoke<RhinoComponentUpdateResult>('check_rhino_updates', { prepareOnly: true });
      setComponents(update.status);
      updateNotice = rhinoComponentUpdateMessage(update);
      setMessage(updateNotice);
    } catch (value) {
      setError(`组件更新检查失败。${versions?.length === 0 ? '' : '插件安装将使用本机已有的安装包。'} ${String(value)}`);
    }
    if (versions?.length === 0) return;
    setStep('install');
    const result = await invoke<InstallResult>('install_rhino_plugin');
    setVersions(result.installed);
    const repairNotice = result.repairedConflicts ? `已修复 ${result.repairedConflicts} 个同 ID 旧包冲突，旧包已备份。${result.conflictBackups?.[0] ? '备份：' + result.conflictBackups[0] + '。' : ''}` : '';
    const cleanupNotice = result.cleanedVersions
      ? `\u5df2\u4ece\u5b89\u88c5\u76ee\u5f55\u6e05\u7406 ${result.cleanedVersions} \u4e2a\u65e7\u7248\u63d2\u4ef6\uff0c\u5df2\u4fdd\u7559\u6062\u590d\u5907\u4efd\u3002${result.cleanupBackups?.[0] ? '\u5907\u4efd\uff1a' + result.cleanupBackups[0] + '\u3002' : ''}`
      : '';
    const deferredNotice = result.cleanupDeferred
      ? '\u90e8\u5206 Rhino \u4ecd\u5728\u8fd0\u884c\uff0c\u65e7\u7248\u6587\u4ef6\u6682\u4e0d\u6e05\u7406\uff1b\u5173\u95ed Rhino \u540e\u518d\u70b9\u4e00\u6b21\u5b89\u88c5 / \u66f4\u65b0\u5373\u53ef\u5b89\u5168\u6e05\u7406\u3002'
      : '';
    const cleanupWarnings = result.cleanupWarnings ?? [];
    if (cleanupWarnings.length) setError(previous => [previous, '以下旧版插件未清理', ...cleanupWarnings].filter(Boolean).join('\n'));
    setMessage(updateNotice + repairNotice + cleanupNotice + deferredNotice + (result.restartRequired
      ? '安装完成。请保存模型并重启正在运行的 Rhino，然后输入 InspirationDrawer 打开插件。'
      : '安装完成。启动 Rhino，输入 InspirationDrawer 即可打开插件。'));
  });
  const rollback = () => run('rollback', async () => {
    const result = await invoke<RhinoComponentUpdateResult>('rollback_rhino_update');
    setComponents(result.status);
    setMessage('已回退上次组件更新。' + (result.desktopRestartRequired ? '重启灵感抽屉后启用建模模块。' : '')
      + (result.pluginRestartRequired ? '请保存工程并重启 Rhino。' : ''));
    if (result.installationError) setError('插件注册未完成。' + result.installationError);
    setVersions(await invoke<RhinoInstallStatus[]>('rhino_plugin_status'));
  });
  return (
    <section data-settings-section="true" data-active={expanded ? 'true' : 'false'} className="overflow-hidden rounded-[18px] border border-stone-200/80 bg-white dark:border-stone-700/70 dark:bg-stone-800">
      <button data-settings-section-trigger="true" onClick={onToggle} className="flex w-full items-center justify-between p-3 text-left hover:bg-stone-50 dark:hover:bg-stone-700/50">
        <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200"><Puzzle className="h-4 w-4 text-stone-500" />Rhino 插件</span>
        <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="space-y-3 border-t border-stone-100 p-3 dark:border-stone-700/60">
        <p className="text-[11px] leading-relaxed text-stone-500 dark:text-stone-400">为当前 Windows 账户安装或更新 Rhino 8 / 9 插件，同时检查建模模块更新。</p>
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
            {version.runtimeModes?.some(mode => mode === 'netfx' || mode === 'mixed') && <p role="status" className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">检测到运行中的 Rhino 加载了旧 .NET Framework；本插件需要现代 .NET 模式，重复安装不能修复此模式冲突。请先用 SystemInfo 核实，再通过 SetDotNetRuntime 选择现代 .NET 并重启；同时检查快捷方式是否带 /netfx。切换可能影响依赖旧模式的其他插件。</p>}
            {version.runningStateUncertain && <p role="status" className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">无法读取部分 Rhino 进程信息，已暂缓旧文件清理。请保存工程并退出 Rhino 后重试。</p>}
            {version.pluginPath && <details className="text-[10px] text-stone-500">
              <summary className="cursor-pointer">{'\u67e5\u770b\u6ce8\u518c\u6587\u4ef6\u8def\u5f84'}</summary>
              <code className="mt-1 block break-all">{version.pluginPath}</code>
            </details>}
            {version.running && version.runningAsCurrentUser === false && <p role="status" className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">{'\u68c0\u6d4b\u5230 Rhino \u662f\u4ee5\u53e6\u4e00 Windows \u8d26\u6237\u8fd0\u884c\uff1b\u6b64\u63d2\u4ef6\u5b89\u88c5\u5728\u62bd\u5c49\u5f53\u524d\u8d26\u6237\uff0c\u53e6\u4e00\u8d26\u6237\u4e0d\u4f1a\u770b\u5230\u6b64\u6ce8\u518c\u9879\u3002'}</p>}
            {version.installed && version.loadMode === 0 && <p role="status" className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">{'\u8bf7\u5728 Rhino \u7684 PlugInManager \u4e2d\u68c0\u67e5\u5e76\u91cd\u65b0\u542f\u7528\u63d2\u4ef6\u3002'}</p>}
            {version.loadProtection != null && version.loadProtection > 1 && <p role="status" className="text-[10px] leading-relaxed text-amber-700 dark:text-amber-400">{'Rhino \u5f53\u524d\u8bbe\u7f6e\u4e86\u52a0\u8f7d\u4fdd\u62a4\u786e\u8ba4\uff1b\u5982\u672a\u52a0\u8f7d\uff0c\u8bf7\u5728 Rhino \u7684 PlugInManager \u5141\u8bb8\u52a0\u8f7d\u6b64\u63d2\u4ef6\u3002'}</p>}
          </div>;
        })}
        {versions?.length === 0 && <p className="text-[11px] text-stone-500">尚未检测到 Rhino 8 或 9，仍可检查并准备组件更新。</p>}
        {versions?.some(version => version.conflictingPackagePaths?.length) && <p role="status" className="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400">发现旧版 YAK 与当前插件重复 ID。请先退出对应 Rhino，再一键更新；旧包将备份并移出扫描目录，不会删除。不要勾选 Rhino 弹窗中的“不再加载此插件”。</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={busy} onClick={() => void install()} className="inline-flex items-center gap-2 rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900">
            {step === 'check' || step === 'install' ? <LoaderCircle size={13} className="animate-spin" /> : <Download size={13} />}
            {step === 'check' ? '正在检查组件更新…' : step === 'install' ? '正在安装插件…' : '一键安装 / 更新插件'}
          </button>
          <button type="button" disabled={busy} onClick={() => void refresh()} className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-2 text-xs text-stone-500 disabled:opacity-40 dark:border-stone-600"><RefreshCw size={12} />{step === 'detect' ? '正在检测…' : '刷新检测'}</button>
        </div>
        {message && <p role="status" className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">{message}</p>}
        {(error || runtime.error) && <p role="alert" className="whitespace-pre-line break-words text-[11px] text-red-600 dark:text-red-400">{[error, runtime.error && `当前使用内置建模模块，更新模块加载失败。 ${runtime.error}`].filter(Boolean).join('\n')}</p>}
        <details className="text-[11px] text-stone-500 dark:text-stone-400">
          <summary className="cursor-pointer py-1">版本与回退</summary>
          <div className="mt-1 space-y-1.5 border-l border-stone-200 pl-3 dark:border-stone-700">
            <p>当前建模模块　{runtime.version === 'bundled' ? '桌面内置版本' : runtime.version}</p>
            {components?.components.map(component => <p key={component.id}>
              {componentNames[component.id] || component.id}（已准备）　{component.error ? `校验失败 · ${component.error}` : component.version}
            </p>)}
            <p>插件状态只反映注册和文件校验。软件升级后会自动同步已启用的托管插件。</p>
            {automaticSync && <p className="break-words whitespace-pre-wrap">最近一次自动同步　{automaticSync.message}</p>}
            <button type="button" disabled={busy || !components?.canRollback} onClick={() => void rollback()}
              className="rounded-lg border border-stone-200 px-2 py-1.5 disabled:opacity-40 dark:border-stone-600">
              {step === 'rollback' ? '正在回退…' : '回退上次更新'}
            </button>
          </div>
        </details>
        <p className="text-[10px] leading-relaxed text-stone-400">适用于 Windows 版 Rhino 8 / 9 的 .NET 模式。Rhino 原生 MCP 建模功能还需要 RhinoAI 插件；安装本面板不会替换已有的 RhinoAI。</p>
      </div>}
    </section>
  );
}
