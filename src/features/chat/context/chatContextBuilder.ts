import type { ChatAttachment, ChatMessage, ChatSummary } from '../model/chatTypes';
import {
  DEFAULT_CHAT_CONTEXT_BUDGET,
  selectRecentMessagesForBudget,
  trimTextToTokenBudget,
  type ChatContextBudget,
} from './chatContextBudget';

export const GENERAL_CHAT_SYSTEM_PROMPT = [
  '你是灵感抽屉内置的通用 AI 助手。',
  '你的首要职责是像普通通用 AI 助手一样自然地和用户交流。你可以回答问题、写作、分析、推理、讨论创意，并理解用户提供的图片。',
  '你还可以使用灵感抽屉提供的软件工具。只有当用户明确要求操作素材库、画布、生成图片或视频、运行 Workflow，或者请求确实无法仅靠文字完成时，才调用工具。',
  '当用户明确要求生成图片、照片、海报、插画、封面或壁纸时，必须调用 generate_image；不要只返回提示词，也不要声称当前没有图片生成工具。',
  '如果通过普通文字即可回答，就直接回答。不得为了显得主动而读取画布、素材库或执行软件操作。不要把每个请求都解释成操作命令。',
  '生成图片后结果会显示在聊天中并自动加入画布；不要重复调用 add_to_canvas，除非用户要求定位或再次添加已有媒体。',
  '用户开启联网搜索，或明确要求查询最新、实时、网页信息时，调用 web_search。使用搜索结果回答时，要用 Markdown 链接 [来源标题](URL) 标注来源，不要编造链接。',
  '当用户明确要求生成可下载文件、Word、Excel、PDF、CSV、JSON、Markdown 或 TXT 时，必须调用 create_file 创建真实文件，不要只把内容贴在聊天里，也不要伪造下载链接。DOCX/PDF 的正文使用 Markdown；XLSX 使用 sheets 结构化数据。',
  '工具结果属于当前本地对话上下文。不要向用户展示内部参数、计划 JSON 或追踪信息。',
].join('\n');

const appendMessageForContext = (
  providerMessages: Array<Record<string, unknown>>,
  message: ChatMessage,
) => {
  const completedCalls = message.role === 'assistant'
    ? message.toolCalls
      .filter(call => ['completed', 'declined', 'error'].includes(call.status) && call.resultJson)
      .slice(-4)
    : [];
  if (completedCalls.length === 0) {
    providerMessages.push({ role: message.role, content: message.content });
    return;
  }
  providerMessages.push({
    role: 'assistant',
    content: null,
    tool_calls: completedCalls.map(call => ({
      id: call.id,
      type: 'function',
      function: { name: call.toolName, arguments: call.argumentsJson || '{}' },
    })),
  });
  completedCalls.forEach(call => providerMessages.push({
    role: 'tool',
    tool_call_id: call.id,
    content: trimTextToTokenBudget(call.resultJson || '', 1_200),
  }));
  if (message.content.trim()) {
    providerMessages.push({ role: 'assistant', content: message.content });
  }
};

const buildAttachmentContent = async (
  text: string,
  attachments: ChatAttachment[],
  resolveAttachmentUrl?: (attachment: ChatAttachment) => Promise<string>,
) => {
  if (!resolveAttachmentUrl || attachments.length === 0) return text;
  const parts: Array<Record<string, unknown>> = [{ type: 'text', text }];
  for (const [index, attachment] of attachments.filter(item => item.type === 'image').slice(0, 6).entries()) {
    const url = await resolveAttachmentUrl(attachment).catch(() => '');
    if (!url) continue;
    parts.push({ type: 'text', text: `图片附件 ${index + 1}` });
    parts.push({ type: 'image_url', image_url: { url, detail: 'low' } });
  }
  return parts.length > 1 ? parts : text;
};

export const buildChatContext = async (input: {
  messages: ChatMessage[];
  latestUserMessage: ChatMessage;
  summary?: ChatSummary | null;
  budget?: Partial<ChatContextBudget>;
  resolveAttachmentUrl?: (attachment: ChatAttachment) => Promise<string>;
}) => {
  const budget = { ...DEFAULT_CHAT_CONTEXT_BUDGET, ...input.budget };
  const summaryBoundary = input.summary?.throughMessageId
    ? input.messages.findIndex(message => message.id === input.summary?.throughMessageId)
    : -1;
  const historySource = summaryBoundary >= 0
    ? input.messages.slice(summaryBoundary + 1)
    : input.messages;
  const history = historySource.filter(message => (
    message.id !== input.latestUserMessage.id
    && (message.role === 'user' || message.role === 'assistant')
    && message.status !== 'error'
  ));
  const recent = selectRecentMessagesForBudget(history, budget.recentMessagesBudget);
  const providerMessages: Array<Record<string, unknown>> = [
    { role: 'system', content: GENERAL_CHAT_SYSTEM_PROMPT },
  ];
  if (input.summary?.summary) {
    providerMessages.push({
      role: 'system',
      content: `此前对话摘要：\n${trimTextToTokenBudget(input.summary.summary, budget.summaryBudget)}`,
    });
  }
  recent.forEach(message => appendMessageForContext(providerMessages, message));
  providerMessages.push({
    role: 'user',
    content: await buildAttachmentContent(
      input.latestUserMessage.content,
      input.latestUserMessage.attachments,
      input.resolveAttachmentUrl,
    ),
  });
  return providerMessages;
};

export const buildSummaryRequestMessages = (
  existingSummary: ChatSummary | null,
  messages: ChatMessage[],
) => [
  {
    role: 'system',
    content: '请把对话压缩为可靠的延续摘要。保留用户偏好、已确认事实、未完成事项、生成媒体及其本地引用关系。不要添加新事实。只返回摘要正文。',
  },
  {
    role: 'user',
    content: [
      existingSummary?.summary ? `已有摘要：\n${existingSummary.summary}` : '',
      ...messages.map(message => `${message.role}: ${message.content}`),
    ].filter(Boolean).join('\n\n'),
  },
];
