import { getGeneratedMediaFromToolCall, type ChatAttachment, type ChatMessage, type ChatMessagePage, type ChatVisionAttachment } from '../model/chatTypes';
import { MAX_CHAT_VISION_IMAGES } from '../context/chatRequestSize';
import {
  explicitlyResetsVisualContext,
  isShortVisualFollowup,
  isVisualEditFollowup,
  isVisualCreationIntent,
  isVisualRevisionFollowup,
} from '../context/chatVisualIntent';
import { isBatchPlanConfirmation } from './chatBatchPlanReply';

const HISTORICAL_IMAGE_CONTINUATION = /(?:开始(?:做|执行|生成|制作|处理)?(?:吧|了)?|可以开始|继续(?:(?:做|执行|生成|制作|处理|优化|修改)(?:吧|了)?|吧|了|下去)?|(?:就)?(?:这|那)(?:[一二三四五六七八九十两\d]+|几|些)张(?:图|图片)?(?:吧)?|就按(?:这个|上面|刚才|之前|前面)|按(?:这个|上面|刚才|之前|前面).{0,12}(?:做|执行|生成|制作|处理|来)|照(?:这个|上面|刚才|之前|前面).{0,8}(?:做|来)|刚才(?:那些|这些|上传|说的)|之前(?:那些|这些|上传|说的)|前面(?:那些|这些|上传|说的)|(?:这些|那些|那几张|它们).{0,12}(?:继续|再|都|全部|生成|制作|处理|修改|优化)|就这样(?:做|来)?|没问题.{0,6}(?:开始|做|生成)?)/i;

const HISTORICAL_VARIANT_EXECUTION = /(?:[一二两三四五六七八九十\d]+|这些|上述|前述)?\s*(?:个|种|套|组)?\s*(?:方案|方向|版本).{0,12}(?:都|分别|各自|每个|全部).{0,12}(?:出图|生图|做图|生成|制作|渲染)/i;

// A message that only supplies the references belongs to the preceding visual
// request. Keep this deliberately narrow so a new, self-contained image task
// never inherits an unrelated older instruction.
const CURRENT_IMAGE_REFERENCE_ONLY = /^(?=.{1,100}$)(?:(?:这|这些)是|这里是|给你|补充(?:一下)?|重新上传(?:一下)?|我(?:再)?发(?:一下)?|已上传)?[\s，,:：]*(?:参考图|原图|图片|图|附件)(?:在这里|在这|如下|给你)?[。！!，,\s]*$/i;

// Keep the latest visual reference active when the user refers to an earlier
// object, analysis or proposal without repeating an exact "continue" phrase.
// These expressions are intentionally domain-neutral: they cover products,
// illustrations, layouts, characters and any other visual subject.
const HISTORICAL_VISUAL_REFERENCE = /(?:(?:按|照|根据|基于|依照).{0,8}(?:你|你们|助手)?(?:刚才|之前|前面|上面|先前)?(?:的)?(?:想法|建议|分析|判断|方案|方向|思路|结论)|(?:这个|这款|这些|这组|上述|前述|原来(?:的)?|当前(?:的)?|刚才(?:的)?|之前(?:的)?|前面(?:的)?)(?:产品|物体|对象|主体|设计|外观|造型|结构|图片|图像|图|方案|方向|版本|角色|人物|场景|页面|海报|包装|作品)|(?:它|它们|该产品|该设计|该对象|该主体).{0,18}(?:生成|制作|处理|修改|优化|调整|改进|换|改|做|出图|渲染|设计|分析|评价)|(?:保持|保留|沿用|延续|不要改变|别改变).{0,18}(?:原|之前|刚才|产品|对象|主体|造型|结构|比例|视角|构图|风格))/i;

export function imageAttachments(message: ChatMessage): ChatVisionAttachment[] {
  if (message.role === 'user') return message.attachments.filter(item => item.type === 'image' && item.path.trim());
  if (message.role !== 'assistant') return [];
  return message.toolCalls.filter(call => call.status === 'completed').flatMap(call =>
    getGeneratedMediaFromToolCall(call).filter(media => media.type === 'image').map(media => ({
      id: media.id, messageId: message.id, type: 'image', path: media.path || media.url!,
      thumbnailPath: media.thumbnail, createdAt: message.createdAt, generated: true,
    })));
}

// Retain the newest groups within the vision budget, in the order the user saw them.
// The model can refer to any of these IDs; a tool's default inputs remain a single group.
function collectTurnImages(messages: ChatMessage[]) {
  const images: ChatVisionAttachment[] = [];
  const seen = new Set<string>();
  let newest: ChatMessage | undefined;
  for (let index = messages.length - 1; index >= 0 && images.length < MAX_CHAT_VISION_IMAGES; index--) {
    const message = messages[index];
    const group = imageAttachments(message).filter(item => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    if (group.length) {
      newest ??= message;
      images.unshift(...group.slice(0, MAX_CHAT_VISION_IMAGES - images.length));
    }
    if (message.role === 'user' && explicitlyResetsVisualContext(message.content)) return { images, newest, complete: true };
  }
  return { images, newest, complete: images.length >= MAX_CHAT_VISION_IMAGES };
}

// Reopening a conversation loads only its newest page in the UI. Read back
// to the visual boundary without adding older pages to the visible chat.
export async function readEarlierImageMessages(
  recent: ChatMessage[],
  cursor: { beforeCreatedAt: number; beforeId?: string },
  readPage: (cursor: { beforeCreatedAt: number; beforeId?: string }) => Promise<ChatMessagePage>,
) {
  const known = new Set(recent.map(message => message.id));
  let older: ChatMessage[] = [];
  let window = collectTurnImages(recent);
  while (!window.complete) {
    const page = await readPage(cursor);
    const candidates = page.messages.filter(message => !known.has(message.id) && (
      (message.role === 'user' && explicitlyResetsVisualContext(message.content)) || imageAttachments(message).length > 0
    ));
    older = [...candidates, ...older];
    window = collectTurnImages([...older, ...recent]);
    if (!page.hasMore || page.nextBeforeCreatedAt == null) break;
    if (cursor.beforeCreatedAt === page.nextBeforeCreatedAt && cursor.beforeId === page.nextBeforeId) break;
    cursor = { beforeCreatedAt: page.nextBeforeCreatedAt, beforeId: page.nextBeforeId ?? undefined };
  }
  const sourceIds = new Set(window.images.map(image => image.messageId));
  return older.filter(message => sourceIds.has(message.id));
}

export const isHistoricalImageContinuation = (text: string) => {
  const normalized = text.trim();
  if (explicitlyResetsVisualContext(normalized)) return false;
  return HISTORICAL_IMAGE_CONTINUATION.test(normalized)
    || HISTORICAL_VARIANT_EXECUTION.test(normalized)
    || HISTORICAL_VISUAL_REFERENCE.test(normalized)
    || isShortVisualFollowup(normalized)
    || isVisualRevisionFollowup(normalized)
    || isVisualEditFollowup(normalized)
    || isVisualCreationIntent(normalized)
    || isBatchPlanConfirmation(normalized);
};

const followsBatchPlanRevision = (messages: ChatMessage[], currentUser: ChatMessage) => {
  const previousAssistant = messages
    .filter(message => message.role === 'assistant' && message.createdAt < currentUser.createdAt)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  return Boolean(previousAssistant?.toolCalls.some(call => {
    if (call.toolName !== 'batch_image_operation' || call.status !== 'declined') return false;
    try {
      const result = JSON.parse(call.resultJson || '{}') as Record<string, unknown>;
      return result.revisionRequested === true;
    } catch (_) {
      return false;
    }
  }));
};

export type ChatImageAttachmentSelection = {
  attachments: ChatAttachment[];
  visionAttachments: ChatVisionAttachment[];
  sourceMessage?: ChatMessage;
  reusedFromHistory: boolean;
  toolIntentText: string;
};

export const selectChatImageAttachments = (
  messages: ChatMessage[],
  currentUserText: string,
): ChatImageAttachmentSelection => {
  const chronological = [...messages].sort((left, right) => left.createdAt - right.createdAt);
  const currentUser = [...chronological].reverse().find(message => message.role === 'user');
  if (!currentUser) {
    return { attachments: [], visionAttachments: [], reusedFromHistory: false, toolIntentText: currentUserText };
  }
  const turn = chronological.slice(0, chronological.indexOf(currentUser) + 1)
    .filter(message => message.conversationId === currentUser.conversationId);
  const userMessages = turn.filter(message => message.role === 'user');
  const { images: visionAttachments, newest: sourceMessage } = collectTurnImages(turn);
  const currentImages = visionAttachments.filter(image => image.messageId === currentUser.id);
  if (currentImages.length > 0) {
    const recentUserContext = CURRENT_IMAGE_REFERENCE_ONLY.test(currentUserText.trim())
      ? userMessages
          .slice(0, -1)
          .slice(-3)
          .map(message => message.content.trim())
          .filter(Boolean)
      : [];
    return {
      attachments: currentImages,
      visionAttachments,
      sourceMessage: currentUser,
      reusedFromHistory: false,
      toolIntentText: [...recentUserContext, currentUserText.trim()].filter(Boolean).join('\n'),
    };
  }
  if (!sourceMessage || (!isHistoricalImageContinuation(currentUserText) && !followsBatchPlanRevision(turn, currentUser))) {
    return { attachments: [], visionAttachments, reusedFromHistory: visionAttachments.length > 0, toolIntentText: currentUserText };
  }
  const toolIntentText = userMessages.filter(message => message.createdAt >= sourceMessage.createdAt)
    .map(message => message.content.trim())
    .filter(Boolean)
    .join('\n');
  return {
    attachments: visionAttachments.filter(image => image.messageId === sourceMessage.id),
    visionAttachments,
    sourceMessage,
    reusedFromHistory: true,
    toolIntentText: toolIntentText || `${sourceMessage.content}\n${currentUserText}`.trim(),
  };
};
