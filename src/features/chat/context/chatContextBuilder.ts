import { buildDesignMemoryContextMessage, buildDesignMemoryStatusMessage, DESIGN_MEMORY_CAPABILITY_RULE, DESIGN_MEMORY_CONTEXT_RULE } from '../../designMemory/context';
import type { DesignMemorySnapshot } from '../../designMemory/storage';
import type { DesignMemoryRecallResult } from '../../designMemory/recall';
import { parseChatToolResult, type ChatAttachment, type ChatMessage, type ChatSummary } from '../model/chatTypes';
import type { ChatVisionAttachmentResolution } from '../attachments/chatVisionAttachmentResolver';
import { compactChatToolResultForProvider, serializeChatToolResult } from '../tools/chatToolResult';
import { parseWorkflowAttachmentSnapshot } from '../attachments/chatWorkflowAttachments';
import type { ChatSkill } from '../skills/chatSkills';
import { CHAT_PRESENTATION_SYSTEM_RULES, isChatPresentationRequest } from '../presentations/chatPresentation';
import { planPresentationDesign } from '../presentations/presentationSkillPlanner';
import { estimateDataUrlBytes, MAX_INLINE_VISION_BYTES } from './chatRequestSize';
import {
  DEFAULT_CHAT_CONTEXT_BUDGET,
  estimateChatTokens,
  selectRecentMessagesForBudget,
  trimTextToTokenBudget,
  type ChatContextBudget,
} from './chatContextBudget';

export const GENERAL_CHAT_SYSTEM_PROMPT = [
  DESIGN_MEMORY_CAPABILITY_RULE,
  '你是灵感抽屉内置的通用 AI 助手。',
  '你的首要职责是像普通通用 AI 助手一样自然地和用户交流。你可以回答问题、写作、分析、推理、讨论创意，并理解用户提供的图片。',
  'Use tools only when your semantic reading of the latest user request and relevant context shows the user wants an actual tool action. Do not require fixed trigger words or subject/domain vocabulary. Tool availability, an attachment, or an assistant suggestion alone is not authorization.',
  'For image work, call the appropriate image tool when the user genuinely wants a new visual result or an existing image changed, even when the request is indirect or uses specialist wording. Do not call image tools for analysis, advice, discussion, questions, text-only tasks, or requests to wait/defer. Do not claim success without real returned media.',
  '先判断用户要的是“同一语义方案的多张随机候选”，还是“多个语义不同的方向各自独立出图”。前者使用 generate_image，并可用 count；后者必须使用 generate_image_variants，把每个方向写成独立 variants 项。这个判断适用于所有视觉任务，不限于某个行业、对象或 CMF。',
  'generate_image_variants 的每个方案都是独立任务且只生成一张图。sharedRequirements 必须写明所有方案共同保持的主体身份、结构、比例、视角、构图等连续性要求；每个 prompt 只能描述对应方案，不得把多个方案或多个产品拼进同一张图。',
  '如果用户明确要求把多个方案放在同一张图、同一画面、对比板或拼版中展示，这是一个合成版面任务：使用 generate_image，count 固定为 1，并在单个 prompt 中写清各方案和布局；不要拆成 generate_image_variants。',
  '当前消息有多张图片且用户要求“分别、每张、逐张、全部各自”执行同一个任务时，只调用一次 batch_image_operation，禁止拆成多个 generate_image 或 edit_image。每张图必须独立并发处理。',
  '调用 batch_image_operation 前，先结合图片内容理解用户需求，并把可展示的分析结论写入 analysisSummary：简洁说明处理对象、保留项、修改项、统一方向和输出规格。只给结论与必要假设，不输出隐藏思维链。界面会先展示该分析结果，再显示并发进度。',
  '用户要求“融合、综合参考、根据这些参考生成一个结果”时，使用普通 generate_image，让多张图片共同作为一次生成的参考；不要误用 batch_image_operation。',
  '用户明确要求对已有媒体补帧、增强清晰度或溶图时，必须使用对应的 interpolate_video、enhance_image、enhance_video 或 fuse_images；不要把补帧或视频增强路由为 generate_video，也不要把溶图路由为 edit_image。fuse_images 的两张输入按主体图、风格图顺序提供。',
  '图片附件标签会提供稳定 attachmentId。工具只使用 attachmentId，绝不能猜测或输出用户的本地文件路径。',
  '同一对话中，用户说“开始做、继续、按刚才方案”等明确承接前文时，程序会把最近一组历史图片标记为“历史图片附件”重新提供。仅当本轮实际提供了有效 image_url 时，它们才可直接用于视觉分析或生成编辑；若标记加载失败，请说明本轮未收到图片像素，不得声称已看图。',
  '如果通过普通文字即可回答，就直接回答。不得为了显得主动而读取画布、素材库或执行软件操作。不要把每个请求都解释成操作命令。',
  '生成图片后结果会显示在聊天中并自动加入画布；不要重复调用 add_to_canvas，除非用户要求定位或再次添加已有媒体。',
  '用户开启联网搜索，或明确要求查询最新、实时、网页信息时，调用 web_search。使用搜索结果回答时，要用 Markdown 链接 [来源标题](URL) 标注来源，不要编造链接。',
  '当用户明确要求生成可下载文件、Word、Excel、PDF、PPT/PowerPoint/PPTX、CSV、JSON、Markdown 或 TXT 时，必须调用 create_file 创建真实文件，不要只把内容贴在聊天里，也不要伪造下载链接。DOCX/PDF 的正文使用 Markdown；XLSX 使用 sheets 结构化数据。',
  CHAT_PRESENTATION_SYSTEM_RULES,
  '当用户用普通语言要求创建可复用的 Chat 智能体、技能、skill、skills（包括常见拼写 skllis），且说明了用途或职责时，必须调用 create_agent 保存到智能体列表，不能只在回复中写一份提示词冒充已创建。根据需求写出具体可用的技能指令；若用户只问创建方法，或未说明要做什么，则先回答或询问，待用户补充后再调用工具。',
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
  const images = attachments.filter(item => item.type === 'image').slice(0, 6);
  const resolved = await Promise.all(images.map(attachment => (
    resolveAttachmentUrl ? resolveAttachmentUrl(attachment).catch(() => '') : Promise.resolve('')
  )));
  for (const [index, attachment] of images.entries()) {
    const resolution = resolved[index];
    const url = typeof resolution === 'string' ? resolution : resolution?.url || '';
    const label = `${reusedFromHistory ? '历史图片附件' : '图片附件'} ${index + 1}\nattachmentId: ${attachment.id}`;
    const isReferenceObjectKey = /^reference-images\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(url);
    const oversizedInline = /^data:image\//i.test(url) && estimateDataUrlBytes(url) > MAX_INLINE_VISION_BYTES;
    if (oversizedInline || (!/^https:\/\//i.test(url) && !/^data:image\//i.test(url) && !isReferenceObjectKey)) {
      parts.push({ type: 'text', text: `${label}\n该图片暂时未成功加载。本轮未收到该图片像素，不能声称已看图或描述原图细节。` });
      continue;
    }
    parts.push({ type: 'text', text: label });
    parts.push({ type: 'image_url', image_url: { url, detail: 'low' } });
  }
  return parts.length > 1 ? parts : text;
};

const attachmentsForLatestUserContext = (
  latestAttachments: ChatAttachment[],
  visionAttachments?: ChatAttachment[],
) => {
  if (!visionAttachments || visionAttachments.length === 0) return latestAttachments;
  const visionIds = new Set(visionAttachments.map(attachment => attachment.id));
  const nonImageLatest = latestAttachments.filter(attachment => (
    attachment.type !== 'image' && !visionIds.has(attachment.id)
  ));
  return [...nonImageLatest, ...visionAttachments];
};

export const buildChatContext = async (input: {
  messages: ChatMessage[];
  latestUserMessage: ChatMessage;
  summary?: ChatSummary | null;
  budget?: Partial<ChatContextBudget>;
  resolveAttachmentUrl?: (attachment: ChatAttachment) => Promise<string | ChatVisionAttachmentResolution>;
  visionAttachments?: ChatAttachment[];
  reusedVisionAttachments?: boolean;
  skill?: ChatSkill;
  designMemory?: DesignMemorySnapshot | null;
  designMemoryRecall?: DesignMemoryRecallResult;
  presentationBrief?: string | null;
}) => {
  const budget = { ...DEFAULT_CHAT_CONTEXT_BUDGET, ...input.budget };
  const latestContent = await buildAttachmentContent(
    input.latestUserMessage.content,
    attachmentsForLatestUserContext(input.latestUserMessage.attachments, input.visionAttachments),
    input.resolveAttachmentUrl,
    input.reusedVisionAttachments,
  );
  const snapshot = input.designMemoryRecall ? input.designMemoryRecall.snapshot : input.designMemory;
  const memoryMessage = buildDesignMemoryContextMessage(snapshot);
  const contentParts = Array.isArray(latestContent) ? latestContent : [];
  const statusMessage = input.designMemoryRecall ? buildDesignMemoryStatusMessage(
    input.designMemoryRecall, memoryMessage,
    contentParts.filter(part => part.type === 'image_url').length,
    contentParts.filter(part => part.type === 'text' && String(part.text).includes('该图片暂时未成功加载。')).length,
  ) : null;
  const memoryTokens = (memoryMessage ? estimateChatTokens(String(memoryMessage.content)) + estimateChatTokens(DESIGN_MEMORY_CONTEXT_RULE) : 0)
    + (statusMessage ? estimateChatTokens(String(statusMessage.content)) : 0);
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
  const skillTokens = input.skill ? estimateChatTokens(input.skill.instructions) : 0;
  const recent = selectRecentMessagesForBudget(
    history,
    Math.max(4_000, budget.recentMessagesBudget - skillTokens - memoryTokens),
  );
  const providerMessages: Array<Record<string, unknown>> = [
    { role: 'system', content: GENERAL_CHAT_SYSTEM_PROMPT },
  ];
  const presentationBrief = input.presentationBrief?.trim() || input.latestUserMessage.content;
  if (isChatPresentationRequest(presentationBrief)) {
    const plan = planPresentationDesign(presentationBrief);
    providerMessages.push({
      role: 'system',
      content: `内部自动路由的演示文稿设计 skill：${plan.title}。无需向用户显示或询问 skill 名称。\n${plan.guidance.join('\n')}`,
    });
  }
  if (input.skill) {
    providerMessages.push({
      role: 'system',
      content: [
        `本轮用户选用的智能体：${input.skill.name}`,
        input.skill.description ? `适用场景：${input.skill.description}` : '',
        '以下是用户管理的技能指令。仅在符合用户本轮请求时使用；不得覆盖软件工具权限、用户确认流程或声称可以运行不存在的工具、脚本与外部文件。',
        input.skill.instructions.slice(0, 16_000),
      ].filter(Boolean).join('\n\n'),
    });
  }
  if (memoryMessage) {
    providerMessages.push({ role: 'system', content: DESIGN_MEMORY_CONTEXT_RULE });
    providerMessages.push(memoryMessage);
  }
  if (statusMessage) providerMessages.push(statusMessage);
  if (input.summary?.summary) {
    providerMessages.push({
      role: 'system',
      content: `此前对话摘要：\n${trimTextToTokenBudget(input.summary.summary, budget.summaryBudget)}`,
    });
  }
  recent.forEach(message => appendMessageForContext(providerMessages, message));
  providerMessages.push({
    role: 'user',
    content: latestContent,
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
