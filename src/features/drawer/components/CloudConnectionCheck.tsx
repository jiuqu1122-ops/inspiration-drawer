import { invoke } from '@tauri-apps/api/core';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { useState } from 'react';

type ConnectionProbe = {
  route: string;
  elapsedMs: number;
  httpStatus: number | null;
  error: string | null;
};

const probeSummary = (probe: ConnectionProbe) =>
  [probe.route, probe.error ?? '云端可达', probe.httpStatus ? `HTTP ${probe.httpStatus}` : '', `${probe.elapsedMs} ms`]
    .filter(Boolean).join(' · ');

export function CloudConnectionCheck() {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ConnectionProbe[]>([]);
  const [message, setMessage] = useState('');
  const check = async () => {
    setChecking(true);
    setResult([]);
    setMessage('');
    try { setResult(await invoke<ConnectionProbe[]>('check_cloud_connection')); }
    catch { setMessage('无法运行云端连接检测，请重试。'); }
    finally { setChecking(false); }
  };
  const copy = async () => {
    try {
      await writeText(['灵感抽屉云端连接检测', ...result.map(probeSummary)].join('\n'));
      setMessage('已复制检测结果');
    } catch { setMessage('复制失败，可截图发给支持人员。'); }
  };
  return <div className="mt-3 text-[11px] leading-5 text-stone-500 dark:text-stone-400">
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={checking} onClick={() => void check()}
        className="rounded-lg border border-stone-200 px-2.5 py-1 hover:bg-stone-50 disabled:opacity-45 dark:border-stone-600 dark:hover:bg-stone-700">
        {checking ? '正在检测…' : '检测云端连接'}
      </button>
      {result.length > 0 && <button type="button" onClick={() => void copy()}
        className="rounded-lg px-2 py-1 hover:bg-stone-50 dark:hover:bg-stone-700">复制结果</button>}
    </div>
    <div role="status">
      {result.map(probe => <p key={probe.route} className="mt-1 tabular-nums">{probeSummary(probe)}</p>)}
      {result.some(probe => !probe.error) && <p>检测的是云端入口。生成任务仍可能在上传或等待结果时超时。</p>}
      {message && <p>{message}</p>}
    </div>
  </div>;
}
