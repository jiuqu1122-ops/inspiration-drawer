import { Check, ChevronDown, LoaderCircle, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import type { ChatToolCall } from '../model/chatTypes';
import { getChatToolLabel } from '../tools/chatToolLabels';

const STATUS_LABELS: Record<string, string> = {
  pending: '准备中',
  'awaiting-approval': '等待确认',
  running: '执行中',
  completed: '已完成',
  cancelled: '已停止',
  declined: '已拒绝',
  error: '失败',
};

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const readJsonRecord = (json?: string | null) => {
  try { return asRecord(JSON.parse(json || '')); } catch { return {}; }
};

const receiptText = (value: unknown, limit: number) => (
  typeof value === 'string' ? value.trim().slice(0, limit) : ''
);

const readWebSearchReceipt = (call: ChatToolCall) => {
  if (call.toolName !== 'web_search') return null;
  const result = readJsonRecord(call.resultJson);
  const results = Array.isArray(result.results) ? result.results : null;
  const outcome = call.status === 'error' || (call.status === 'completed' && Boolean(result.error))
    ? 'error'
    : call.status !== 'completed'
      ? null
      : !results ? 'unavailable' : results.length > 0 ? 'success' : 'empty';
  const sources = (results || []).flatMap((value: unknown) => {
    const item = asRecord(value);
    if (typeof item.url !== 'string') return [];
    try {
      const url = new URL(item.url);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return [];
      return [{ url: url.href, host: url.hostname, title: receiptText(item.title, 160) || url.hostname }];
    } catch { return []; }
  });
  return {
    outcome,
    label: outcome === 'success' ? `已找到 ${results!.length} 条结果`
      : outcome === 'error' ? '搜索出错'
        : outcome === 'empty' ? '未找到结果'
          : outcome === 'unavailable' ? '搜索结果不可用' : STATUS_LABELS[call.status],
    count: results?.length,
    provider: receiptText(result.provider, 80) || '未提供',
    query: receiptText(result.query, 240) || receiptText(readJsonRecord(call.argumentsJson).query, 240),
    error: receiptText(result.error, 240) || receiptText(asRecord(result.error).message, 240),
    sources,
    sourceCount: new Set(sources.map(source => source.host)).size,
  };
};

type BatchStage = 'analyzing' | 'confirming' | 'revision' | 'preparing' | 'generating' | 'completed' | 'cancelled' | 'error';

const readBatchProgress = (call: ChatToolCall) => {
  if (call.toolName !== 'batch_image_operation') return null;
  if (!call.resultJson) {
    return {
      phase: call.status === 'pending'
        ? 'analyzing'
        : call.status === 'awaiting-approval'
          ? 'confirming'
          : 'preparing' as BatchStage,
      total: 0,
      started: 0,
      active: 0,
      completed: 0,
      succeeded: 0,
      failed: 0,
    };
  }
  try {
    const value = JSON.parse(call.resultJson) as Record<string, unknown>;
    const total = Math.max(0, Number(value.total) || 0);
    const completed = Math.min(total, Math.max(0, Number(value.completed) || 0));
    const rawPhase = String(value.phase || '');
    const phase: BatchStage = value.revisionRequested === true
      ? 'revision'
      : call.status === 'cancelled' || value.cancelled === true
      ? 'cancelled'
      : call.status === 'error' || call.status === 'declined'
        ? 'error'
        : rawPhase === 'preparing' || rawPhase === 'generating' || rawPhase === 'completed'
          ? rawPhase
          : call.status === 'pending'
            ? 'analyzing'
            : call.status === 'completed'
              ? 'completed'
              : 'preparing';
    return {
      phase,
      total,
      started: Math.min(total, Math.max(0, Number(value.started) || 0)),
      active: Math.max(0, Number(value.active) || 0),
      completed,
      succeeded: Math.max(0, Number(value.succeeded) || 0),
      failed: Math.max(0, Number(value.failed) || 0),
    };
  } catch (_) {
    return null;
  }
};

const batchStageIndex = (phase: BatchStage) => ({
  analyzing: 0,
  confirming: 1,
  revision: 1,
  preparing: 2,
  generating: 3,
  completed: 4,
  cancelled: 3,
  error: 3,
}[phase]);

const batchStatusLabel = (progress: NonNullable<ReturnType<typeof readBatchProgress>>) => {
  if (progress.phase === 'analyzing') return '分析中';
  if (progress.phase === 'confirming') return '等待确认';
  if (progress.phase === 'revision') return '等待修改';
  if (progress.phase === 'preparing') return '准备中';
  if (progress.phase === 'generating') return `${progress.completed}/${progress.total}`;
  if (progress.phase === 'cancelled') return '已停止';
  if (progress.phase === 'error') return '失败';
  return '已完成';
};

export function ChatToolCallCard({ call, onResolve }: {
  call: ChatToolCall;
  onResolve: (id: string, approved: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const createdAgentName = (() => {
    if (call.toolName !== 'create_agent' || call.status !== 'completed' || !call.resultJson) return '';
    try {
      const result = JSON.parse(call.resultJson) as Record<string, unknown>;
      return typeof result.name === 'string' ? result.name : '';
    } catch { return ''; }
  })();
  const active = call.status === 'pending' || call.status === 'running';
  const searchReceipt = readWebSearchReceipt(call);
  const searchWarning = searchReceipt?.outcome != null && searchReceipt.outcome !== 'success';
  const batchProgress = readBatchProgress(call);
  const batchRevisionRequested = batchProgress?.phase === 'revision';
  const error = call.status === 'error' || (call.status === 'declined' && !batchRevisionRequested) || searchReceipt?.outcome === 'error';
  const currentBatchStage = batchProgress ? batchStageIndex(batchProgress.phase) : -1;
  const batchStages = batchProgress ? [
    { label: '分析需求' },
    { label: batchRevisionRequested ? '修改方案后重新发送' : '确认执行方案' },
    { label: batchProgress.total > 0 ? `准备 ${batchProgress.total} 个独立任务` : '准备独立任务' },
    {
      label: batchProgress.phase === 'generating'
        ? `正在并行处理，${batchProgress.active} 个进行中`
        : '并行处理图片',
    },
    { label: '整理并输出结果' },
  ] : [];
  return (
    <div className={`chat-tool ${error ? 'chat-tool--error' : ''}`}>
      <button type="button" className="chat-tool__summary" aria-expanded={searchReceipt ? expanded : undefined} onClick={() => setExpanded(value => !value)}>
        <span className="chat-tool__icon" style={searchWarning ? {
          color: searchReceipt?.outcome === 'error' ? '#dc2626' : 'var(--chat-muted)',
          background: 'var(--chat-soft)',
        } : undefined}>
          {active ? <LoaderCircle size={13} className="chat-spin" /> : (call.status === 'completed' && !searchWarning) || batchProgress?.phase === 'confirming' || batchRevisionRequested ? <Check size={13} /> : <ShieldAlert size={13} />}
        </span>
        <span className="chat-tool__label">{createdAgentName ? `智能体：${createdAgentName}` : getChatToolLabel(call.toolName)}</span>
        <span className="chat-tool__status">{searchReceipt ? searchReceipt.label : batchProgress ? batchStatusLabel(batchProgress) : STATUS_LABELS[call.status] || call.status}</span>
        <ChevronDown size={12} className={expanded ? 'chat-tool__chevron is-open' : 'chat-tool__chevron'} />
      </button>
      {batchProgress && (
        <div className="chat-tool__batch-progress" aria-live="polite">
          <div className="chat-tool__batch-steps">
            {batchStages.map((stage, stageIndex) => {
              const done = batchProgress.phase === 'completed' || stageIndex < currentBatchStage;
              const current = stageIndex === currentBatchStage && batchProgress.phase !== 'completed';
              const stageError = current && (batchProgress.phase === 'error' || batchProgress.phase === 'cancelled');
              const waitingForUser = current && (batchProgress.phase === 'confirming' || batchProgress.phase === 'revision');
              return (
                <div
                  key={stage.label}
                  className={`chat-tool__batch-step ${done ? 'is-done' : ''} ${current ? 'is-current' : ''} ${stageError ? 'is-error' : ''}`}
                >
                  <span className="chat-tool__batch-step-icon">
                    {done ? <Check size={9} /> : current && !stageError && !waitingForUser ? <LoaderCircle size={9} className="chat-spin" /> : stageError ? <X size={9} /> : null}
                  </span>
                  <span>{stage.label}</span>
                </div>
              );
            })}
          </div>
          {batchProgress.total > 0 && (
            <div className="chat-tool__batch-summary">
              <span>{batchProgress.completed} / {batchProgress.total} 完成</span>
              {batchProgress.active > 0 && <span>{batchProgress.active} 张生成中</span>}
              {batchProgress.failed > 0 && <span>{batchProgress.failed} 张失败</span>}
            </div>
          )}
          {batchProgress.total > 0 && (
            <div className="chat-tool__batch-track" aria-hidden="true">
              <i style={{ width: `${Math.round(batchProgress.completed / batchProgress.total * 100)}%` }} />
            </div>
          )}
        </div>
      )}
      {call.toolName !== 'batch_image_operation' && call.status === 'awaiting-approval' && (
        <div className="chat-tool__approval">
          {call.toolName.startsWith('rhino_native_') ? (
            <>
              <span>将通过 RhinoAI 原生 MCP 操作当前绑定文档。请核对工具名称和参数后确认：</span>
              <pre className="chat-tool__native-approval-args">{JSON.stringify(readJsonRecord(call.argumentsJson), null, 2).slice(0, 6000)}</pre>
            </>
          ) : <span>此操作可能产生费用或修改软件内容。</span>}
          <div>
            <button type="button" className="chat-button chat-button--primary" onClick={() => onResolve(call.id, true)}>允许</button>
            <button type="button" className="chat-button" onClick={() => onResolve(call.id, false)}><X size={12} />拒绝</button>
          </div>
        </div>
      )}
      {expanded && (
        <div className="chat-tool__details">
          {searchReceipt ? (
            <>
              {searchReceipt.query && <div><span>搜索词</span>{searchReceipt.query}</div>}
              <div><span>搜索服务</span>{searchReceipt.provider}</div>
              <div><span>搜索结果</span>{searchReceipt.count == null ? searchReceipt.label
                : `${searchReceipt.count} 条结果 · ${searchReceipt.sourceCount} 个来源网站`}</div>
              {searchReceipt.outcome === 'error' && <div><span>搜索错误</span>{searchReceipt.error || '搜索工具未能完成请求。'}</div>}
              {searchReceipt.outcome === 'success' && <div>以上为搜索工具结果，模型回答状态单独显示。</div>}
              {searchReceipt.sources.slice(0, 8).map((source, index) => (
                <div key={`${source.url}-${index}`}>
                  <a href={source.url} target="_blank" rel="noopener noreferrer">{source.title}</a>
                  <span>{source.host}</span>
                </div>
              ))}
              {searchReceipt.sources.length > 8 && <div>仅展示前 8 条 HTTP(S) 来源链接。</div>}
              {searchReceipt.count != null && searchReceipt.count > 0 && searchReceipt.sources.length === 0 && (
                <div>未提供有效的 HTTP(S) 来源链接。</div>
              )}
            </>
          ) : (
            <>
              <div><span>工具</span>{call.toolName}</div>
              <div><span>参数</span><pre>{call.argumentsJson}</pre></div>
              {call.resultJson && <div><span>结果</span><pre>{call.resultJson}</pre></div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
