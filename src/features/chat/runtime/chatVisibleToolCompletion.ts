import {
  getGeneratedFilesFromToolCall,
  getGeneratedMediaFromToolCall,
  type ChatMessage,
  type ChatToolCall,
} from '../model/chatTypes';
import { finalizeChatMessageState } from './chatThinkingRuntime';

export type ChatVisibleToolCompletion = {
  content: string;
  mediaCount: number;
  fileCount: number;
};

const uniqueByIdentity = <T extends { id?: string }>(
  values: T[],
  fallbackIdentity: (value: T) => string,
) => {
  const seen = new Set<string>();
  return values.filter(value => {
    const identity = fallbackIdentity(value) || value.id;
    if (!identity || seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
};

/**
 * A generated image/video/file is already a complete, user-visible answer.
 * Do not make that successful result depend on an extra provider round trip
 * whose only purpose is to write a closing sentence.
 */
export const summarizeCompletedVisibleToolCalls = (
  calls: ChatToolCall[],
): ChatVisibleToolCompletion | null => {
  const completedCalls = calls.filter(call => call.status === 'completed');
  const media = uniqueByIdentity(
    completedCalls.flatMap(getGeneratedMediaFromToolCall),
    value => value.path || value.url || '',
  );
  const files = uniqueByIdentity(
    completedCalls.flatMap(getGeneratedFilesFromToolCall),
    value => value.path || value.name || '',
  );
  if (media.length === 0 && files.length === 0) return null;

  const imageCount = media.filter(value => value.type === 'image').length;
  const videoCount = media.filter(value => value.type === 'video').length;
  const parts = [
    imageCount > 0 ? `${imageCount} 张图片` : '',
    videoCount > 0 ? `${videoCount} 个视频` : '',
    files.length > 0 ? `${files.length} 个文件` : '',
  ].filter(Boolean);
  return {
    content: `**生成完成**\n\n${parts.join('、')}已生成，结果已保留。`,
    mediaCount: media.length,
    fileCount: files.length,
  };
};

export const finalizeOrphanedStreamingChatMessage = (
  message: ChatMessage,
  now = Date.now(),
): ChatMessage => {
  if (message.role !== 'assistant' || message.status !== 'streaming') return message;
  const completion = summarizeCompletedVisibleToolCalls(message.toolCalls);
  if (!completion) {
    return finalizeChatMessageState({
      ...message,
      content: message.content.trim() || '上次生成意外中断，可重新生成。',
    }, 'error', now, '应用关闭或连接中断');
  }
  return finalizeChatMessageState({
    ...message,
    content: message.content.includes(completion.content)
      ? message.content
      : [message.content.trim(), completion.content].filter(Boolean).join('\n\n'),
    thinkingSteps: message.thinkingSteps?.filter(step => (
      !step.id.endsWith(':thinking:connection')
      && !step.id.endsWith(':thinking:provider-status')
    )),
  }, 'completed', now);
};
