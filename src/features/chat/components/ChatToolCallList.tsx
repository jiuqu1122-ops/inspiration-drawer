import { useState } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
import type { ChatToolCall } from '../model/chatTypes';
import { rhinoStepPreviewCount } from './ChatRhinoStepPreview';
import { ChatToolCallCard } from './ChatToolCallCard';

const hiddenByPresentation = (call: ChatToolCall) => call.toolName === 'batch_image_operation'
  && (call.status === 'awaiting-approval' || call.status === 'declined');
const isActive = (call: ChatToolCall) => ['pending', 'running', 'awaiting-approval'].includes(call.status);

type HistoryProps = { calls: ChatToolCall[]; onResolve: (id: string, approved: boolean) => void };

export function ChatToolCallList({ messageId, ...props }: HistoryProps & { messageId: string }) {
  return <ToolCallHistory key={messageId} {...props} />;
}

function ToolCallHistory({ calls, onResolve }: HistoryProps) {
  const [manualView, setManualView] = useState<'closed' | 'all' | null>(null);
  const visible = calls.filter(call => !hiddenByPresentation(call));
  if (!visible.length) return null;

  const hasActive = visible.some(isActive);
  const failures = visible.filter(call => call.status === 'error' || call.status === 'declined').length;
  const previews = new Set(visible.filter(call => rhinoStepPreviewCount(call) > 0));
  const rows = manualView === 'closed' ? [] : manualView === 'all' ? visible
    : previews.size ? visible.filter(call => previews.has(call) || isActive(call))
      : hasActive ? visible : [];
  const collapsed = rows.length === 0;

  return (
    <section className={`chat-tool-call-group ${collapsed ? 'is-collapsed' : ''}`} aria-label="工具执行记录" data-canvas-edit-control="true">
      <button type="button" className="chat-tool-call-group__toggle" aria-expanded={!collapsed}
        onClick={() => setManualView(collapsed ? 'all' : 'closed')}>
        <ListChecks size={13} aria-hidden="true" />
        <span>工具记录 · {visible.length} 步</span>
        {failures > 0 && <span className="chat-tool-call-group__failures">{failures} 项失败</span>}
        {hasActive && <span className="chat-tool-call-group__active">处理中</span>}
        <ChevronDown size={13} className={collapsed ? '' : 'is-open'} aria-hidden="true" />
      </button>
      {!collapsed && (
        <div className="chat-tool-call-group__items">
          {rows.map(call => <ChatToolCallCard key={call.id} call={call} onResolve={onResolve} />)}
          {rows.length < visible.length && (
            <button type="button" className="chat-tool-call-group__show-all" onClick={() => setManualView('all')}>
              查看全部 {visible.length} 步
            </button>
          )}
        </div>
      )}
    </section>
  );
}
