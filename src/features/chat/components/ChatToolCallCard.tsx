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
  declined: '已拒绝',
  error: '失败',
};

export function ChatToolCallCard({ call, onResolve }: {
  call: ChatToolCall;
  onResolve: (id: string, approved: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const active = call.status === 'pending' || call.status === 'running';
  const error = call.status === 'error' || call.status === 'declined';
  return (
    <div className={`chat-tool ${error ? 'chat-tool--error' : ''}`}>
      <button type="button" className="chat-tool__summary" onClick={() => setExpanded(value => !value)}>
        <span className="chat-tool__icon">
          {active ? <LoaderCircle size={13} className="chat-spin" /> : call.status === 'completed' ? <Check size={13} /> : <ShieldAlert size={13} />}
        </span>
        <span className="chat-tool__label">{TOOL_LABELS[call.toolName] || call.toolName}</span>
        <span className="chat-tool__status">{STATUS_LABELS[call.status] || call.status}</span>
        <ChevronDown size={12} className={expanded ? 'chat-tool__chevron is-open' : 'chat-tool__chevron'} />
      </button>
      {call.status === 'awaiting-approval' && (
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
