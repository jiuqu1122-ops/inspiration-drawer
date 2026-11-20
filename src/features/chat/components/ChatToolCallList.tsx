import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
import type { ChatToolCall } from '../model/chatTypes';
import { ChatToolCallCard } from './ChatToolCallCard';

const COLLAPSE_THRESHOLD = 1;
const hiddenByPresentation = (call: ChatToolCall) => call.toolName === 'batch_image_operation'
  && (call.status === 'awaiting-approval' || call.status === 'declined');

export function ChatToolCallList({ messageId, calls, onResolve }: {
  messageId: string;
  calls: ChatToolCall[];
  onResolve: (id: string, approved: boolean) => void;
}) {
  const visible = calls.filter(call => !hiddenByPresentation(call));
  const hasActive = visible.some(call => call.status === 'pending' || call.status === 'running' || call.status === 'awaiting-approval');
  const failures = visible.filter(call => call.status === 'error' || call.status === 'declined').length;
  const hasGroupedHistory = visible.length >= COLLAPSE_THRESHOLD;
  const [collapsed, setCollapsed] = useState(hasGroupedHistory && !hasActive);
  const userToggled = useRef(false);
  const previousMessageId = useRef(messageId);

  useEffect(() => {
    if (previousMessageId.current !== messageId) {
      previousMessageId.current = messageId;
      userToggled.current = false;
    }
    if (!userToggled.current) setCollapsed(visible.length >= COLLAPSE_THRESHOLD && !hasActive);
  }, [messageId, visible.length, hasActive]);

  if (!visible.length) return null;
  const records = visible.map(call => <ChatToolCallCard key={call.id} call={call} onResolve={onResolve} />);
  if (!hasGroupedHistory) return <div className="chat-tool-call-list">{records}</div>;

  return (
    <section className={`chat-tool-call-group ${collapsed ? 'is-collapsed' : ''}`} aria-label={'\u5de5\u5177\u6267\u884c\u8bb0\u5f55'}>
      <button
        type="button"
        className="chat-tool-call-group__toggle"
        aria-expanded={!collapsed}
        onClick={() => { userToggled.current = true; setCollapsed(value => !value); }}
      >
        <ListChecks size={13} aria-hidden="true" />
        <span>{"\u5de5\u5177\u8bb0\u5f55 \u00b7 "}{visible.length}{" \u6b65"}</span>
        {failures > 0 && <span className="chat-tool-call-group__failures">{failures}{" \u9879\u5931\u8d25"}</span>}
        {hasActive && <span className="chat-tool-call-group__active">{"\u5904\u7406\u4e2d"}</span>}
        <ChevronDown size={13} className={collapsed ? '' : 'is-open'} aria-hidden="true" />
      </button>
      {!collapsed && <div className="chat-tool-call-group__items">{records}</div>}
    </section>
  );
}
