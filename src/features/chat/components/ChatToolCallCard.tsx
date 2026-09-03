import { Check, ChevronDown, LoaderCircle, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
import type { ChatToolCall } from '../model/chatTypes';

const TOOL_LABELS: Record<string, string> = {
  web_search: '联网搜索',
  create_file: '生成文件',
  get_canvas_selection: '读取画布选中项',
  search_assets: '搜索素材库',
  generate_image: '生成图片',
  edit_image: '编辑图片',
  batch_image_operation: '批量处理图片',
  generate_video: '生成视频',
  add_to_canvas: '发送到画布',
  create_canvas_generator: '创建生成节点',
  list_workflows: '读取工作流',
  run_workflow: '运行工作流',
};

const STATUS_LABELS: Record<string, string> = {
  pending: '准备中',
  'awaiting-approval': '等待确认',
  running: '执行中',
  completed: '已完成',
  cancelled: '已停止',
  declined: '已拒绝',
  error: '失败',
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
  const active = call.status === 'pending' || call.status === 'running';
  const batchProgress = readBatchProgress(call);
  const batchRevisionRequested = batchProgress?.phase === 'revision';
  const error = call.status === 'error' || (call.status === 'declined' && !batchRevisionRequested);
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
      <button type="button" className="chat-tool__summary" onClick={() => setExpanded(value => !value)}>
        <span className="chat-tool__icon">
          {active ? <LoaderCircle size={13} className="chat-spin" /> : call.status === 'completed' || batchProgress?.phase === 'confirming' || batchRevisionRequested ? <Check size={13} /> : <ShieldAlert size={13} />}
        </span>
        <span className="chat-tool__label">{TOOL_LABELS[call.toolName] || call.toolName}</span>
        <span className="chat-tool__status">{batchProgress ? batchStatusLabel(batchProgress) : STATUS_LABELS[call.status] || call.status}</span>
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
          <span>此操作可能产生费用或修改软件内容。</span>
          <div>
            <button type="button" className="chat-button chat-button--primary" onClick={() => onResolve(call.id, true)}>允许</button>
            <button type="button" className="chat-button" onClick={() => onResolve(call.id, false)}><X size={12} />拒绝</button>
          </div>
        </div>
      )}
      {expanded && (
        <div className="chat-tool__details">
          <div><span>工具</span>{call.toolName}</div>
          <div><span>参数</span><pre>{call.argumentsJson}</pre></div>
          {call.resultJson && <div><span>结果</span><pre>{call.resultJson}</pre></div>}
        </div>
      )}
    </div>
  );
}
