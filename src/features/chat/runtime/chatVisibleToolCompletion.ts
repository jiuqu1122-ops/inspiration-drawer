import {
  getGeneratedFilesFromToolCall,
  getGeneratedMediaFromToolCall,
  type ChatMessage,
  type ChatToolCall,
} from '../model/chatTypes';
import { finalizeChatMessageState } from './chatThinkingRuntime';
import { presentationInterruptedMessage, shouldContinuePresentationAfterMedia } from '../presentations/presentationTurn';

export type ChatVisibleToolCompletion = {
  content: string;
  mediaCount: number;
  fileCount: number;
};

const MEDIA_RESULT_TOOL_NAMES = new Set([
  'generate_image',
  'generate_image_variants',
  'edit_image',
  'generate_video',
  'batch_image_operation',
]);

export const completedMediaToolIsMissingVisibleResult = (call: ChatToolCall) => (
  call.status === 'completed'
  && MEDIA_RESULT_TOOL_NAMES.has(call.toolName)
  && getGeneratedMediaFromToolCall(call).length === 0
);

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


const RHINO_NATIVE_SUCCESS_PREFIX = 'Rhino MCP \u6267\u884c\u5b8c\u6210\uff1a';

const isTransientRhinoCommandOutput = (line: string) => (
  /^(?:\u6b63\u5728\u5efa\u7acb\u7f51\u683c|creating meshes).*?(?:\u6309\s*Esc\s*\u53d6\u6d88|press\s+Esc.*?cancel|Esc\s+to\s+cancel)[.\s\u3002]*$/i.test(line)
);

const rhinoNativeResultDetail = (call: ChatToolCall) => {
  let detail = call.resultJson || '';
  try {
    const parsed: unknown = JSON.parse(detail);
    if (parsed && typeof parsed === 'object' && 'content' in parsed && typeof parsed.content === 'string') detail = parsed.content;
  } catch { /* Preserve an unstructured tool receipt. */ }
  if (call.toolName !== 'rhino_native_run_command') return detail.trim().slice(0, 12_000);
  return detail.trim().split(/\r?\n/).filter(line => !isTransientRhinoCommandOutput(line.trim())).join('\n').trim().slice(0, 12_000);
};

export const summarizeCompletedRhinoNativeCalls = (calls: ChatToolCall[]) => {
  const completed = calls.filter(call => call.toolName.startsWith('rhino_native_') && call.status === 'completed');
  if (completed.length === 0) return '';
  const lines = completed.map(call => {
    const toolName = call.toolName.slice('rhino_native_'.length);
    const detail = rhinoNativeResultDetail(call);
    return `- ${toolName}\uff1a${detail || '\u5df2\u6267\u884c\u5b8c\u6210\u3002'}`;
  });
  return `${RHINO_NATIVE_SUCCESS_PREFIX}\n${lines.join('\n')}`;
};

/** Normalize only legacy success display text. Keep original receipts and failed turns intact. */
export const normalizeCompletedRhinoNativeMessage = (message: ChatMessage): ChatMessage => {
  if (message.role !== 'assistant' || message.status !== 'completed' || message.toolCalls.length === 0
    || !message.toolCalls.every(call => call.toolName.startsWith('rhino_native_') && call.status === 'completed')) return message;
  const marker = message.content.indexOf(RHINO_NATIVE_SUCCESS_PREFIX);
  if (marker < 0) return message;
  const summary = summarizeCompletedRhinoNativeCalls(message.toolCalls);
  const prefix = message.content.slice(0, marker).trim();
  const content = [prefix, summary].filter(Boolean).join('\n\n');
  return content === message.content ? message : { ...message, content };
};

export const finalizeOrphanedStreamingChatMessage = (
  message: ChatMessage,
  now = Date.now(),
  presentationText: string | null = null,
): ChatMessage => {
  if (message.role !== 'assistant' || message.status !== 'streaming') return message;
  const mappedCalls = message.toolCalls.map(call => {
    if (!['pending', 'running', 'awaiting-approval'].includes(call.status)) return call;
    return {
      ...call,
      status: 'error' as const,
      resultJson: call.resultJson || JSON.stringify({ error: 'The tool call was interrupted before the app restarted.' }),
      completedAt: call.completedAt || now,
    };
  });
  const interruptedCalls = mappedCalls.some((call, index) => call !== message.toolCalls[index])
    ? mappedCalls
    : message.toolCalls;
  const recovered = { ...message, toolCalls: interruptedCalls };
  if (shouldContinuePresentationAfterMedia(presentationText, interruptedCalls)) return finalizeChatMessageState({
    ...recovered, content: [message.content.trim(), presentationInterruptedMessage(interruptedCalls)].filter(Boolean).join('\n\n'),
  }, 'error', now, 'PPT \u751f\u6210\u4e2d\u65ad\uff0c\u5df2\u6709\u914d\u56fe\u5df2\u4fdd\u7559');
  const completion = summarizeCompletedVisibleToolCalls(interruptedCalls);
  if (!completion) {
    return finalizeChatMessageState({
      ...recovered,
      content: message.content.trim() || '\u4e0a\u6b21\u751f\u6210\u610f\u5916\u4e2d\u65ad\uff0c\u8bf7\u5148\u68c0\u67e5\u72b6\u6001\u518d\u91cd\u8bd5\u3002',
    }, 'error', now, '\u5e94\u7528\u5173\u95ed\u6216\u8fde\u63a5\u4e2d\u65ad');
  }
  return finalizeChatMessageState({
    ...recovered,
    content: message.content.includes(completion.content)
      ? message.content
      : [message.content.trim(), completion.content].filter(Boolean).join('\n\n'),
    thinkingSteps: message.thinkingSteps?.filter(step => (
      !step.id.endsWith(':thinking:connection')
      && !step.id.endsWith(':thinking:provider-status')
    )),
  }, 'completed', now);
};
