import { parseChatToolResult, type ChatAttachment, type ChatMessage, type ChatSummary } from '../model/chatTypes';
import type { ChatVisionAttachmentResolution } from '../attachments/chatVisionAttachmentResolver';
import { compactChatToolResultForProvider, serializeChatToolResult } from '../tools/chatToolResult';
import { parseWorkflowAttachmentSnapshot } from '../attachments/chatWorkflowAttachments';
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
  '当用户明确要求生成图片、照片、海报、插画、封面或壁纸时，必须调用图片生成工具；不要只返回提示词，也不要声称当前没有图片生成工具。',
  '先判断用户要的是“同一语义方案的多张随机候选”，还是“多个语义不同的方向各自独立出图”。前者使用 generate_image，并可用 count；后者必须使用 generate_image_variants，把每个方向写成独立 variants 项。这个判断适用于所有视觉任务，不限于某个行业、对象或 CMF。',
  'generate_image_variants 的每个方案都是独立任务且只生成一张图。sharedRequirements 必须写明所有方案共同保持的主体身份、结构、比例、视角、构图等连续性要求；每个 prompt 只能描述对应方案，不得把多个方案或多个产品拼进同一张图。',
  '如果用户明确要求把多个方案放在同一张图、同一画面、对比板或拼版中展示，这是一个合成版面任务：使用 generate_image，count 固定为 1，并在单个 prompt 中写清各方案和布局；不要拆成 generate_image_variants。',
  '当前消息有多张图片且用户要求“分别、每张、逐张、全部各自”执行同一个任务时，只调用一次 batch_image_operation，禁止拆成多个 generate_image 或 edit_image。每张图必须独立并发处理。',
  '调用 batch_image_operation 前，先结合图片内容理解用户需求，并把可展示的分析结论写入 analysisSummary：简洁说明处理对象、保留项、修改项、统一方向和输出规格。只给结论与必要假设，不输出隐藏思维链。界面会先展示该分析结果，再显示并发进度。',
  '用户要求“融合、综合参考、根据这些参考生成一个结果”时，使用普通 generate_image，让多张图片共同作为一次生成的参考；不要误用 batch_image_operation。',
  '用户明确要求对已有媒体补帧、增强清晰度或溶图时，必须使用对应的 interpolate_video、enhance_image、enhance_video 或 fuse_images；不要把补帧或视频增强路由为 generate_video，也不要把溶图路由为 edit_image。fuse_images 的两张输入按主体图、风格图顺序提供。',
  '图片附件标签会提供稳定 attachmentId。工具只使用 attachmentId，绝不能猜测或输出用户的本地文件路径。',
  '同一对话中，用户说“开始做、继续、按刚才方案”等明确承接前文时，程序会把最近一组历史图片标记为“历史图片附件”重新提供。它们可以直接用于生成或编辑，不要要求用户再次上传。',
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
      .filter(call => ['completed', 'error'].includes(call.status) && call.resultJson)
      .slice(-4)
    : [];
  if (completedCalls.length === 0) {
    providerMessages.push({ role: message.role, content: message.content });
    return;
  }
  const argumentsForProvider = (call: ChatMessage['toolCalls'][number]) => {
    try {
      const parsed = JSON.parse(call.argumentsJson || '{}') as Record<string, unknown>;
      if (['generate_image', 'generate_image_variants', 'edit_image', 'generate_video'].includes(call.toolName)
        && Array.isArray(parsed.referenceImages)) {
        const safeReferences = parsed.referenceImages
          .map(String)
          .filter(value => /^https:\/\//i.test(value));
        if (safeReferences.length > 0) parsed.referenceImages = safeReferences;
        else delete parsed.referenceImages;
      }
      return JSON.stringify(parsed);
    } catch (_) {
      return '{}';
    }
  };
  providerMessages.push({
    role: 'assistant',
    content: null,
    tool_calls: completedCalls.map(call => ({
      id: call.id,
      type: 'function',
      function: { name: call.toolName, arguments: argumentsForProvider(call) },
    })),
  });
  completedCalls.forEach(call => providerMessages.push({
    role: 'tool',
    tool_call_id: call.id,
    content: trimTextToTokenBudget(serializeChatToolResult(
      compactChatToolResultForProvider(call.toolName, parseChatToolResult(call.resultJson)),
    ), 1_200),
  }));
  if (message.content.trim()) {
    providerMessages.push({ role: 'assistant', content: message.content });
  }
};

const buildAttachmentContent = async (
  text: string,
  attachments: ChatAttachment[],
  resolveAttachmentUrl?: (attachment: ChatAttachment) => Promise<string | ChatVisionAttachmentResolution>,
  reusedFromHistory = false,
) => {
  if (attachments.length === 0) return text;
  const parts: Array<Record<string, unknown>> = [{ type: 'text', text }];
  const workflowAttachments = attachments
    .map(attachment => ({ attachment, snapshot: parseWorkflowAttachmentSnapshot(attachment) }))
    .filter((item): item is { attachment: ChatAttachment; snapshot: NonNullable<ReturnType<typeof parseWorkflowAttachmentSnapshot>> } => Boolean(item.snapshot));
  for (const { attachment, snapshot } of workflowAttachments) {
    parts.push({
      type: 'text',
      text: `工作流附件 ${attachment.id}\n结构快照（仅供分析；未经用户确认不得应用或运行）：\n${JSON.stringify(snapshot)}`,
    });
  }
  if (!resolveAttachmentUrl) return parts.length > 1 ? parts : text;
  const images = attachments.filter(item => item.type === 'image').slice(0, 6);
  const resolved = await Promise.all(images.map(attachment => (
    resolveAttachmentUrl(attachment).catch(() => '')
  )));
  for (const [index, attachment] of images.entries()) {
    const resolution = resolved[index];
    const url = typeof resolution === 'string' ? resolution : resolution?.url || '';
    const label = `${reusedFromHistory ? '历史图片附件' : '图片附件'} ${index + 1}\nattachmentId: ${attachment.id}`;
    const isReferenceObjectKey = /^reference-images\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(url);
    if (!/^https:\/\//i.test(url) && !/^data:image\//i.test(url) && !isReferenceObjectKey) {
      parts.push({ type: 'text', text: `${label}\n该图片暂时未成功加载。` });
      continue;
    }
    parts.push({ type: 'text', text: label });
    parts.push({ type: 'image_url', image_url: { url, detail: 'low' } });
  }
  return parts.length > 1 ? parts : text;
};

export const buildChatContext = async (input: {
  messages: ChatMessage[];
  latestUserMessage: ChatMessage;
  summary?: ChatSummary | null;
  budget?: Partial<ChatContextBudget>;
  resolveAttachmentUrl?: (attachment: ChatAttachment) => Promise<string | ChatVisionAttachmentResolution>;
  visionAttachments?: ChatAttachment[];
  reusedVisionAttachments?: boolean;
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
      input.visionAttachments || input.latestUserMessage.attachments,
      input.resolveAttachmentUrl,
      input.reusedVisionAttachments,
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
