import { useCallback, useEffect, useRef, useState } from 'react';
import { connectDesignMemoryEvents, designMemory } from './storage';
import { DEFAULT_DESIGN_MEMORY_SETTINGS, memorySwitch, type DesignMemoryKind, type DesignMemoryRecord } from './types';

const labels: Record<DesignMemoryKind, string> = { 'drawer-image': '抽屉图片记忆', 'chat-design': 'Chat 设计记忆' };

/** Mount inside the existing settings page. It never reads originals or scans chat histories. */
export function DesignMemorySettingsPanel({
  onOpenSource, onIndexExisting,
}: {
  onOpenSource?: (record: DesignMemoryRecord) => void;
  onIndexExisting?: (kind: DesignMemoryKind) => Promise<{ processed: number; written: number }>;
}) {
  const [settings, setSettings] = useState(DEFAULT_DESIGN_MEMORY_SETTINGS);
  const [kind, setKind] = useState<DesignMemoryKind>('drawer-image');
  const [rows, setRows] = useState<DesignMemoryRecord[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [switching, setSwitching] = useState<DesignMemoryKind[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirmation, setConfirmation] = useState<{ type: 'delete'; row: DesignMemoryRecord } | { type: 'clear'; kind: DesignMemoryKind } | null>(null);
  const loadVersion = useRef(0);
  const activeKind = useRef(kind);
  activeKind.current = kind;


  const refresh = useCallback(async () => {
    const version = ++loadVersion.current;
    const [nextSettings, page] = await Promise.all([designMemory.getSettings(), designMemory.list(kind)]);
    if (version !== loadVersion.current || activeKind.current !== kind) return;
    setSettings(nextSettings); setRows(page.records); setHasMore(page.hasMore);
  }, [kind]);
  useEffect(() => {
    let active = true;
    void connectDesignMemoryEvents();
    const load = async () => {
      try {
        await refresh();
        if (active && activeKind.current === kind) setError('');
      } catch (error) { if (active && activeKind.current === kind) setError(String(error)); }
    };
    void load();
    const unsubscribe = designMemory.subscribe(() => { void load(); });
    return () => { active = false; loadVersion.current += 1; unsubscribe(); };
  }, [kind, refresh]);
  const action = async (task: () => Promise<unknown>, reload = true) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await task(); if (reload) await refresh(); }
    catch (error) { setError(String(error)); }
    finally { setBusy(false); }
  };

  const toggleKind = async (value: DesignMemoryKind, enabled: boolean) => {
    if (switching.includes(value)) return;
    setSwitching(previous => [...previous, value]); setError('');
    if (!enabled) setSettings(previous => ({ ...previous, [value === 'drawer-image' ? 'drawerImage' : 'chatDesign']: { ...memorySwitch(previous, value), enabled: false } }));
    try { setSettings(await designMemory.setEnabled(value, enabled)); }
    catch (error) { setError(String(error)); }
    finally { setSwitching(previous => previous.filter(kind => kind !== value)); }
  };

  return (
    <section className="space-y-5 text-sm text-gray-700 dark:text-gray-200" aria-labelledby="design-memory-heading">
      <div>
        <h3 id="design-memory-heading" className="text-base font-semibold text-gray-900 dark:text-gray-100">设计记忆</h3>
        <p className="mt-2 leading-relaxed text-gray-500 dark:text-gray-400">
          默认关闭。仅在本机保存；设计对话只向当前模型发送与任务相关的少量记忆，不上传整个素材库或全部聊天记录，不新增 AI 调用。
        </p>
      </div>
      <div className="divide-y divide-gray-200 rounded-xl border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
        {(['drawer-image', 'chat-design'] as const).map(value => (
          <label key={value} className="flex cursor-pointer items-start gap-4 p-4">
            <span className="flex-1">
              <span className="font-medium">{labels[value]}</span>
              <span className="mt-1 block text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                {value === 'drawer-image'
                  ? '复用已有图片分析记录造型、CMF 和风格。收藏不等于喜欢；关闭不影响原有图片分析。'
                  : '记录开启后明确表达的设计要求，并复用当前对话已有摘要；不自动遍历旧对话，不把助手建议当成已认可事实。'}
              </span>
            </span>
            <input
              type="checkbox" role="switch" className="mt-1 h-4 w-4 accent-blue-600"
              aria-label={labels[value]} checked={memorySwitch(settings, value).enabled} disabled={switching.includes(value)}
              onChange={event => { void toggleKind(value, event.target.checked); }}
            />
          </label>
        ))}
      </div>
      <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
        关闭会立即停止该类记忆的检索和自动写入，并取消正在使用它的 Chat 回复；已有记忆保留，重新开启可继续使用。
        清空只清除记忆，不删除原图片或聊天记录。纠正后的内容不会被自动同步覆盖。
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="design-memory-kind">记忆类型</label>
        <select id="design-memory-kind" className="rounded-lg border border-gray-200 bg-transparent px-3 py-2 dark:border-gray-700" value={kind} disabled={busy} onChange={event => {
          setKind(event.target.value as DesignMemoryKind); setRows([]); setEditingId(null); setConfirmation(null);
        }}>
          <option value="drawer-image">抽屉图片记忆</option><option value="chat-design">Chat 设计记忆</option>
        </select>
        <button type="button" className="rounded-lg px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800" disabled={busy} onClick={() => { void action(refresh, false); }}>刷新</button>
        <button type="button" className="ml-auto rounded-lg px-3 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-gray-800" disabled={busy || !rows.length} onClick={() => setConfirmation({ type: 'clear', kind })}>清空此类记忆</button>
      </div>
      {onIndexExisting && <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
        <p className="text-xs leading-relaxed text-gray-500 dark:text-gray-400">
          整理已有资料只在你点击后进行：图片复用已有分析；Chat 只读取已有明确设计陈述和摘要。
          不补跑 AI 分析、不额外调用模型或计费。未分析的图片跳过。处理中仍可随时关闭开关，旧整理任务不会在重新开启后继续写入。
        </p>
        <button type="button" className="mt-3 rounded-lg border border-gray-200 px-3 py-2 disabled:opacity-50 dark:border-gray-700"
          disabled={busy || switching.includes(kind) || !memorySwitch(settings, kind).enabled}
          onClick={() => { void action(async () => {
            if (!memorySwitch(await designMemory.getSettings(), kind).enabled) throw new Error('请先开启对应记忆');
            setNotice('正在整理已有资料…');
            try {
              const result = await onIndexExisting(kind);
              setNotice(`已检查 ${result.processed} 项，新增或更新 ${result.written} 条记忆。已关闭或已删除的内容不会恢复写入。`);
            } catch (error) { setNotice(''); throw error; }
          }); }}>
          {busy ? '正在处理…' : `整理已有${kind === 'drawer-image' ? '图片资料' : '设计对话'}`}
        </button>
        {!memorySwitch(settings, kind).enabled && <p className="mt-2 text-xs text-gray-500">请先明确开启对应记忆，再整理已有资料。</p>}
      </div>}
      {notice && <p role="status" className="text-xs text-gray-500 dark:text-gray-400">{notice}</p>}
      {error && <p role="alert" className="rounded-lg border border-red-200 p-3 text-xs text-red-600 dark:border-red-900">记忆操作未完成：{error}</p>}
      {confirmation && (
        <div role="alertdialog" aria-label="确认删除记忆" className="rounded-lg border border-gray-200 p-4 dark:border-gray-700">
          <p>{confirmation.type === 'clear' ? `确定清空全部${labels[confirmation.kind]}？` : '确定删除这条记忆？'}原素材和聊天记录不会删除。已删除内容不会因旧任务完成而重新加入。</p>
          <div className="mt-3 flex gap-2">
            <button type="button" className="rounded-lg bg-red-600 px-3 py-2 text-white" disabled={busy} onClick={() => {
              void action(async () => {
                if (confirmation.type === 'clear') await designMemory.clear(confirmation.kind);
                else await designMemory.delete(confirmation.row);
                setConfirmation(null); setEditingId(null);
              });
            }}>确认{confirmation.type === 'clear' ? '清空' : '删除'}</button>
            <button type="button" className="rounded-lg px-3 py-2" disabled={busy} onClick={() => setConfirmation(null)}>取消</button>
          </div>
        </div>
      )}
      {!rows.length && !error && <p className="py-6 text-center text-gray-500 dark:text-gray-400">暂无记忆。开启后从新的设计对话或已有图片分析同步，不自动扫描历史。</p>}
      <ul className="space-y-3" aria-label="已保存的设计记忆">
        {rows.map(row => (
          <li key={row.id} className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="break-words font-medium">{row.title}</h4>
                <p className="mt-1 break-words text-xs text-gray-500 dark:text-gray-400">
                  {row.kind === 'drawer-image' ? '图片特征（非用户偏好）' : row.evidence === 'conversation-summary' ? '对话摘要（非逐项确认事实）' : '用户明确陈述'}
                  {' · '}{row.scope === 'project' ? `项目：${row.projectId}` : row.kind === 'drawer-image' ? '全库参考' : '长期偏好'}
                  {row.userCorrected ? ' · 已手动纠正' : ''}
                </p>
              </div>
            </div>
            {editingId === row.id ? (
              <div className="mt-3">
                <textarea className="min-h-32 w-full resize-y rounded-lg border border-gray-300 bg-transparent p-3 dark:border-gray-600" aria-label="纠正记忆内容" value={draft} maxLength={8000} onChange={event => setDraft(event.target.value)} />
                <div className="mt-2 flex gap-2">
                  <button type="button" className="rounded-lg bg-blue-600 px-3 py-2 text-white" disabled={busy || !draft.trim()} onClick={() => { void action(async () => { await designMemory.correct(row, draft); setEditingId(null); }); }}>保存纠正</button>
                  <button type="button" className="rounded-lg px-3 py-2" disabled={busy} onClick={() => setEditingId(null)}>取消</button>
                </div>
              </div>
            ) : <p className="mt-3 whitespace-pre-wrap break-words leading-relaxed">{row.content}</p>}
            <p className="mt-3 break-words text-xs text-gray-500 dark:text-gray-400">
              来源：{row.attribution.label} · {row.sourceId}
              {row.attribution.messageIds?.length ? ` · 消息 ${row.attribution.messageIds.join('、')}` : ''}
              {row.attribution.throughMessageId ? ` · 摘要截至 ${row.attribution.throughMessageId}` : ''}
              {row.attribution.analyzedAt ? ` · 分析于 ${row.attribution.analyzedAt}` : ''}
            </p>
            <div className="mt-2 flex gap-3 text-xs">
              {onOpenSource && <button type="button" className="py-1 text-blue-600" onClick={() => onOpenSource(row)}>查看来源</button>}
              <button type="button" className="py-1 text-blue-600" disabled={busy} onClick={() => { setEditingId(row.id); setDraft(row.content); }}>纠正</button>
              <button type="button" className="py-1 text-red-600" disabled={busy} onClick={() => setConfirmation({ type: 'delete', row })}>删除</button>
            </div>
          </li>
        ))}
      </ul>
      {hasMore && <button type="button" className="w-full rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700" disabled={busy} onClick={() => {
        void action(async () => {
          const page = await designMemory.list(kind, rows.length);
          setRows(previous => [...previous, ...page.records]); setHasMore(page.hasMore);
        }, false);
      }}>加载更多</button>}
    </section>
  );
}
