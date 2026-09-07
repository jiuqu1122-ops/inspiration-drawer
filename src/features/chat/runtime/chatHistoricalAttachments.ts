import type { ChatAttachment, ChatMessage } from '../model/chatTypes';
import {
  explicitlyResetsVisualContext,
  isShortVisualFollowup,
  isVisualRevisionFollowup,
} from '../context/chatVisualIntent';
import { isBatchPlanConfirmation } from './chatBatchPlanReply';

const HISTORICAL_IMAGE_CONTINUATION = /(?:开始(?:做|执行|生成|制作|处理)?(?:吧|了)?|可以开始|继续(?:(?:做|执行|生成|制作|处理|优化|修改)(?:吧|了)?|吧|了|下去)?|(?:就)?(?:这|那)(?:[一二三四五六七八九十两\d]+|几|些)张(?:图|图片)?(?:吧)?|就按(?:这个|上面|刚才|之前|前面)|按(?:这个|上面|刚才|之前|前面).{0,12}(?:做|执行|生成|制作|处理|来)|照(?:这个|上面|刚才|之前|前面).{0,8}(?:做|来)|刚才(?:那些|这些|上传|说的)|之前(?:那些|这些|上传|说的)|前面(?:那些|这些|上传|说的)|(?:这些|那些|那几张|它们).{0,12}(?:继续|再|都|全部|生成|制作|处理|修改|优化)|就这样(?:做|来)?|没问题.{0,6}(?:开始|做|生成)?)/i;

// Keep the latest visual reference active when the user refers to an earlier
// object, analysis or proposal without repeating an exact "continue" phrase.
// These expressions are intentionally domain-neutral: they cover products,
// illustrations, layouts, characters and any other visual subject.
const HISTORICAL_VISUAL_REFERENCE = /(?:(?:按|照|根据|基于|依照).{0,8}(?:你|你们|助手)?(?:刚才|之前|前面|上面|先前)?(?:的)?(?:想法|建议|分析|判断|方案|方向|思路|结论)|(?:这个|这款|这些|这组|上述|前述|原来(?:的)?|当前(?:的)?|刚才(?:的)?|之前(?:的)?|前面(?:的)?)(?:产品|物体|对象|主体|设计|外观|造型|结构|图片|图像|图|方案|方向|版本|角色|人物|场景|页面|海报|包装|作品)|(?:它|它们|该产品|该设计|该对象|该主体).{0,18}(?:生成|制作|处理|修改|优化|调整|改进|换|改|做|出图|渲染|设计|分析|评价)|(?:保持|保留|沿用|延续|不要改变|别改变).{0,18}(?:原|之前|刚才|产品|对象|主体|造型|结构|比例|视角|构图|风格))/i;

const imageAttachments = (message?: ChatMessage): ChatAttachment[] => (
  message?.attachments
    .filter(attachment => attachment.type === 'image' && attachment.path.trim())
    .slice(0, 9) || []
);

export const isHistoricalImageContinuation = (text: string) => {
  const normalized = text.trim();
  if (explicitlyResetsVisualContext(normalized)) return false;
  return HISTORICAL_IMAGE_CONTINUATION.test(normalized)
    || HISTORICAL_VISUAL_REFERENCE.test(normalized)
    || isShortVisualFollowup(normalized)
    || isVisualRevisionFollowup(normalized)
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
  sourceMessage?: ChatMessage;
  reusedFromHistory: boolean;
  toolIntentText: string;
};

export const selectChatImageAttachments = (
  messages: ChatMessage[],
  currentUserText: string,
): ChatImageAttachmentSelection => {
  const userMessages = messages
    .filter(message => message.role === 'user')
    .sort((left, right) => left.createdAt - right.createdAt);
  const currentUser = userMessages[userMessages.length - 1];
  if (!currentUser) {
    return { attachments: [], reusedFromHistory: false, toolIntentText: currentUserText };
  }
  const currentImages = imageAttachments(currentUser);
  if (currentImages.length > 0) {
    return {
      attachments: currentImages,
      sourceMessage: currentUser,
      reusedFromHistory: false,
      toolIntentText: currentUserText,
    };
  }
  if (!isHistoricalImageContinuation(currentUserText) && !followsBatchPlanRevision(messages, currentUser)) {
    return { attachments: [], reusedFromHistory: false, toolIntentText: currentUserText };
  }
  let sourceIndex = -1;
  for (let index = userMessages.length - 2; index >= 0; index -= 1) {
    if (imageAttachments(userMessages[index]).length > 0) {
      sourceIndex = index;
      break;
    }
  }
  const sourceMessage = sourceIndex >= 0 ? userMessages[sourceIndex] : undefined;
  if (!sourceMessage) {
    return { attachments: [], reusedFromHistory: false, toolIntentText: currentUserText };
  }
  const toolIntentText = userMessages
    .slice(sourceIndex)
    .map(message => message.content.trim())
    .filter(Boolean)
    .join('\n');
  return {
    attachments: imageAttachments(sourceMessage),
    sourceMessage,
    reusedFromHistory: true,
    toolIntentText: toolIntentText || `${sourceMessage.content}\n${currentUserText}`.trim(),
  };
};
