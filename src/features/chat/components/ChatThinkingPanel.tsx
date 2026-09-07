import { Check, ChevronDown, Circle, LoaderCircle, OctagonX, Square } from 'lucide-react';
import { memo, useEffect, useId, useState } from 'react';
import type { ChatMessage, ChatThinkingStep } from '../model/chatTypes';
import { formatChatDuration } from '../runtime/chatThinkingRuntime';
import { ChatMarkdown } from './ChatMarkdown';

const stepIcon = (step: ChatThinkingStep) => {
  if (step.status === 'completed') return <Check size={10} />;
  if (step.status === 'cancelled') return <Square size={9} />;
  if (step.status === 'error') return <OctagonX size={10} />;
  if (step.status === 'running') return <LoaderCircle size={10} className="chat-spin" />;
  return <Circle size={8} />;
};

const panelLabel = (message: ChatMessage, thinkingDuration: string, totalDuration: string) => {
  if (message.status === 'cancelled') return `已停止 · ${totalDuration}`;
  if (message.status === 'error') return `处理过程中断 · ${totalDuration}`;
  if (message.status === 'streaming') {
    if (message.reasoning?.trim() && message.reasoningCompletedAt) {
      return `思考 ${thinkingDuration} · 正在生成回答`;
    }
    const usesTools = message.thinkingSteps?.some(step => (
      step.type === 'tool' || step.type === 'search'
    ));
    return usesTools && !message.reasoning?.trim()
      ? `正在处理 · ${totalDuration}`
      : `正在思考 · ${thinkingDuration}`;
  }
  return message.reasoning?.trim()
    ? `思考 ${thinkingDuration} · 共 ${totalDuration}`
    : `处理了 ${totalDuration}`;
};

export const ChatThinkingPanel = memo(function ChatThinkingPanel({ message }: { message: ChatMessage }) {
  const [expanded, setExpanded] = useState(message.status === 'streaming');
  const [now, setNow] = useState(Date.now());
  const panelId = useId();
  const steps = message.thinkingSteps || [];
  const visible = message.role === 'assistant' && (
    message.status === 'streaming'
    || Boolean(message.reasoning?.trim())
    || steps.length > 0
  );
  useEffect(() => {
    if (message.status !== 'streaming') {
      setExpanded(false);
      return;
    }
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [message.status]);
  if (!visible) return null;
  const thinkingDuration = formatChatDuration(
    message.reasoningStartedAt || message.generationStartedAt || message.createdAt,
    message.reasoningCompletedAt,
    now,
  );
  const totalDuration = formatChatDuration(
    message.generationStartedAt || message.createdAt,
    message.generationCompletedAt,
    now,
  );
  return (
    <section className={`chat-thinking-panel chat-thinking-panel--${message.status}`}>
      <button
        type="button"
        className="chat-thinking-panel__summary"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={() => setExpanded(value => !value)}
      >
        <span className="chat-thinking-panel__pulse" aria-hidden="true" />
        <span className="chat-thinking-panel__label" aria-live="polite">{panelLabel(message, thinkingDuration, totalDuration)}</span>
        <ChevronDown size={12} className={expanded ? 'is-open' : ''} />
      </button>
      {expanded && (
        <div id={panelId} className="chat-thinking-panel__content">
          {message.reasoning?.trim() && (
            <div className="chat-thinking-panel__reasoning">
              <span>上游公开推理摘要</span>
              <ChatMarkdown content={message.reasoning} />
            </div>
          )}
          {steps.length > 0 && (
            <div className="chat-thinking-panel__steps" aria-live="polite" aria-atomic="false">
              {steps.map(step => (
                <div className={`chat-thinking-step chat-thinking-step--${step.status}`} key={step.id}>
                  <span className="chat-thinking-step__icon" aria-hidden="true">{stepIcon(step)}</span>
                  <span className="chat-thinking-step__copy">
                    <strong>{step.title}</strong>
                    {step.detail && <small>{step.detail}</small>}
                  </span>
                  <time>{formatChatDuration(step.startedAt, step.completedAt, now)}</time>
                </div>
              ))}
            </div>
          )}
          <p className="chat-thinking-panel__notice">仅展示上游公开摘要与真实执行状态，不包含模型私有推理。</p>
        </div>
      )}
    </section>
  );
});
