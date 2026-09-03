import type { ChatAttachment, ChatMessage } from '../model/chatTypes';
import { isBatchPlanConfirmation } from './chatBatchPlanReply';

const HISTORICAL_IMAGE_CONTINUATION = /(?:开始(?:做|执行|生成|制作|处理)?(?:吧|了)?|可以开始|继续(?:(?:做|执行|生成|制作|处理|优化|修改)(?:吧|了)?|吧|了|下去)?|(?:就)?(?:这|那)(?:[一二三四五六七八九十两\d]+|几|些)张(?:图|图片)?(?:吧)?|就按(?:这个|上面|刚才|之前|前面)|按(?:这个|上面|刚才|之前|前面).{0,12}(?:做|执行|生成|制作|处理|来)|照(?:这个|上面|刚才|之前|前面).{0,8}(?:做|来)|刚才(?:那些|这些|上传|说的)|之前(?:那些|这些|上传|说的)|前面(?:那些|这些|上传|说的)|(?:这些|那些|那几张|它们).{0,12}(?:继续|再|都|全部|生成|制作|处理|修改|优化)|就这样(?:做|来)?|没问题.{0,6}(?:开始|做|生成)?)/i;

const imageAttachments = (message?: ChatMessage): ChatAttachment[] => (
  message?.attachments
    .filter(attachment => attachment.type === 'image' && attachment.path.trim())
    .slice(0, 9) || []
);

export const isHistoricalImageContinuation = (text: string) => (
  HISTORICAL_IMAGE_CONTINUATION.test(text.trim()) || isBatchPlanConfirmation(text)
);

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
