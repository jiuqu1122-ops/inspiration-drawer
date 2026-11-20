import { useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { checkRhinoComponentUpdates, rhinoComponentUpdateMessage, type RhinoComponentStatus, type RhinoComponentUpdateResult } from './rhinoIndependentUpdates';
import { rhinoRuntimeStatus } from './rhinoRuntime';

export function RhinoIndependentUpdateSettings() {
  const [status, setStatus] = useState<RhinoComponentStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const operation = useRef(false);
  useEffect(() => {
    let disposed = false;
    void invoke<RhinoComponentStatus>('rhino_update_status').then(value => { if (!disposed) setStatus(value); })
      .catch(value => { if (!disposed) setError(String(value)); });
    return () => { disposed = true; };
  }, []);
  const update = async (rollback = false) => {
    if (operation.current) return;
    operation.current = true;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = rollback ? await invoke<RhinoComponentUpdateResult>('rollback_rhino_update') : await checkRhinoComponentUpdates();
      setStatus(result.status);
      setMessage((rollback ? '已回退到上次 Rhino 组件版本。' : '') + rhinoComponentUpdateMessage(result));
    } catch (value) { setError(String(value)); }
    finally { operation.current = false; setBusy(false); }
  };
  const runtime = rhinoRuntimeStatus();
  const names: Record<string, string> = { runtime: '建模模块', plugin8: 'Rhino 8 插件', plugin9: 'Rhino 9 插件' };
  return <div className="space-y-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
    <p className="text-xs font-medium">Rhino 独立更新</p>
    <p className="text-[10px] leading-relaxed text-stone-500">插件和建模模块可单独更新，无需下载整套软件。运行中的任务继续使用启动时的版本。</p>
    <p className="text-[10px] text-stone-500">正在使用的建模模块：{runtime.version === 'bundled' ? '桌面内置版本' : runtime.version}</p>
    {status?.components.map(component => <p key={component.id} className="text-[10px] text-stone-500">已准备的{names[component.id] || component.id}：{component.error ? `校验失败，可回退：${component.error}` : component.version}</p>)}
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={busy} onClick={() => void update()} className="rounded-lg border border-stone-200 px-2 py-2 text-xs disabled:opacity-40 dark:border-stone-600">{busy ? '正在处理…' : '检查并更新 Rhino'}</button>
      <button type="button" disabled={busy || !status?.canRollback} onClick={() => void update(true)} className="rounded-lg border border-stone-200 px-2 py-2 text-xs disabled:opacity-40 dark:border-stone-600">回退上次更新</button>
    </div>
    {message && <p role="status" className="text-[11px] leading-relaxed text-emerald-700 dark:text-emerald-400">{message}</p>}
    {(error || runtime.error) && <p role="alert" className="break-words text-[11px] text-red-600 dark:text-red-400">{error || `独立建模模块未能加载，当前使用内置版本：${runtime.error}`}</p>}
  </div>;
}
