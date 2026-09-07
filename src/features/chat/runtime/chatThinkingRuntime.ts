import type {
  ChatMessage,
  ChatMessageStatus,
  ChatThinkingStepStatus,
  ChatThinkingStepType,
} from '../model/chatTypes';

const STEP_LIMIT = 24;
const TERMINAL_STEP_STATUSES = new Set<ChatThinkingStepStatus>([
  'completed',
  'cancelled',
  'error',
]);

export type ChatThinkingStepPatch = {
  type: ChatThinkingStepType;
  title: string;
  detail?: string;
  status?: ChatThinkingStepStatus;
  startedAt?: number;
  completedAt?: number;
};

export const createChatThinkingStepId = (messageId: string, key: string) => (
  `${messageId}:thinking:${key}`
);

export const upsertChatThinkingStep = (
  message: ChatMessage,
  key: string,
  patch: ChatThinkingStepPatch,
  now = Date.now(),
): ChatMessage => {
  const id = createChatThinkingStepId(message.id, key);
  const steps = [...(message.thinkingSteps || [])];
  const index = steps.findIndex(step => step.id === id);
  if (index < 0) {
    const status = patch.status || 'running';
    steps.push({
      id,
      type: patch.type,
      title: patch.title,
      detail: patch.detail,
      status,
      startedAt: patch.startedAt ?? now,
      completedAt: patch.completedAt
        ?? (TERMINAL_STEP_STATUSES.has(status) ? now : undefined),
    });
  } else {
    const current = steps[index];
    const status = patch.status || current.status;
    steps[index] = {
      ...current,
      type: patch.type,
      title: patch.title,
      detail: patch.detail ?? current.detail,
      status,
      startedAt: patch.startedAt ?? current.startedAt ?? now,
      completedAt: patch.completedAt
        ?? (TERMINAL_STEP_STATUSES.has(status) ? current.completedAt || now : current.completedAt),
    };
  }
  return { ...message, thinkingSteps: steps.slice(-STEP_LIMIT) };
};

export const finishChatThinkingSteps = (
  message: ChatMessage,
  status: Extract<ChatThinkingStepStatus, 'completed' | 'cancelled' | 'error'>,
  now = Date.now(),
  detail?: string,
): ChatMessage => ({
  ...message,
  thinkingSteps: message.thinkingSteps?.map(step => (
    TERMINAL_STEP_STATUSES.has(step.status)
      ? step
      : {
        ...step,
        status,
        detail: detail ?? step.detail,
        completedAt: step.completedAt || now,
      }
  )),
});

export const createStreamingAssistantState = (
  message: ChatMessage,
  now = Date.now(),
): ChatMessage => {
  let next: ChatMessage = {
    ...message,
    reasoning: '',
    reasoningStatus: 'idle',
    generationStartedAt: now,
    generationCompletedAt: undefined,
    reasoningStartedAt: now,
    reasoningCompletedAt: undefined,
    thinkingSteps: [],
  };
  next = upsertChatThinkingStep(next, 'request', {
    type: 'queued',
    title: '请求已发送',
    status: 'completed',
    startedAt: now,
    completedAt: now,
  }, now);
  return upsertChatThinkingStep(next, 'analysis', {
    type: 'reasoning',
    title: '正在分析问题',
    status: 'running',
  }, now);
};

export type ChatStreamBuffers = { content?: string; reasoning?: string };

export const appendChatStreamBuffers = (
  message: ChatMessage,
  buffers: ChatStreamBuffers,
  now = Date.now(),
): ChatMessage => {
  const content = buffers.content || '';
  const reasoning = buffers.reasoning || '';
  if (!content && !reasoning) return message;
  let next: ChatMessage = {
    ...message,
    content: `${message.content}${content}`,
    reasoning: `${message.reasoning || ''}${reasoning}`,
    status: 'streaming',
  };
  next = upsertChatThinkingStep(next, 'analysis', {
    type: 'reasoning',
    title: '分析问题',
    status: 'completed',
  }, now);
  if (reasoning) {
    next = {
      ...next,
      reasoningStatus: 'streaming',
      reasoningStartedAt: message.reasoningStartedAt || now,
    };
    next = upsertChatThinkingStep(next, 'reasoning', {
      type: 'reasoning',
      title: '正在接收公开推理摘要',
      detail: '内容由上游模型明确返回',
      status: 'running',
    }, now);
  }
  if (content) {
    if (next.reasoningStatus === 'streaming') {
      next = {
        ...next,
        reasoningStatus: 'completed',
        reasoningCompletedAt: next.reasoningCompletedAt || now,
      };
      next = upsertChatThinkingStep(next, 'reasoning', {
        type: 'reasoning',
        title: '公开推理摘要已接收',
        detail: '内容由上游模型明确返回',
        status: 'completed',
      }, now);
    }
    next = upsertChatThinkingStep(next, 'answer', {
      type: 'finalizing',
      title: '正在生成回答',
      status: 'running',
    }, now);
  }
  return next;
};

export const finalizeChatMessageState = (
  message: ChatMessage,
  status: ChatMessageStatus,
  now = Date.now(),
  detail?: string,
): ChatMessage => {
  const stepStatus = status === 'completed'
    ? 'completed'
    : status === 'cancelled'
      ? 'cancelled'
      : 'error';
  const reasoningStatus = message.reasoning?.trim()
    ? 'completed'
    : 'unavailable';
  return finishChatThinkingSteps({
    ...message,
    status,
    reasoningStatus,
    generationCompletedAt: message.generationCompletedAt || now,
    reasoningCompletedAt: message.reasoningCompletedAt || now,
  }, stepStatus, now, detail);
};

export const formatChatDuration = (startedAt?: number, completedAt?: number, now = Date.now()) => {
  if (!startedAt) return '0 秒';
  const elapsed = Math.max(0, (completedAt || now) - startedAt);
  if (elapsed < 1_000) return '<1 秒';
  return `${Math.max(1, Math.round(elapsed / 1_000))} 秒`;
};
