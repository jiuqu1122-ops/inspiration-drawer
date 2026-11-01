import { isShortVisualFollowup, isVisualRevisionFollowup } from '../context/chatVisualIntent';
import { isChatPresentationRequest, isChatPresentationExportRequest, canGenerateChatPresentationImages } from './chatPresentation';
import { getGeneratedFilesFromToolCall, getGeneratedMediaFromToolCall, type ChatMessage, type ChatToolCall } from '../model/chatTypes';

const imageTools = new Set(['generate_image', 'generate_image_variants']);
/** Delivery enforcement is only for an explicit export or a bounded recovery.
 * Initial briefs can still require clarification; never force a domain choice. */
export const resolvePresentationToolChoice = (input: {
  requested: boolean;
  createFileAvailable: boolean;
  explicitExport: boolean;
  fileAttempts: number;
  recoveryCount: number;
}) => input.requested && input.createFileAvailable
  && (input.explicitExport || input.fileAttempts > 0 || input.recoveryCount > 0)
  ? { type: 'function', function: { name: 'create_file' } } : undefined;

export const needsPresentationDeliveryRecovery = (input: {
  requested: boolean;
  createFileAvailable: boolean;
  explicitExport: boolean;
  content: string;
}) => {
  if (!input.requested || !input.createFileAvailable) return false;
  if (input.explicitExport) return true;
  // Missing-capability claims must not be accepted when the tool was supplied.
  if (/(?:没有|未提供|未开放|不具备|缺少|无法使用|不能调用).{0,30}(?:文件创建|创建文件|文件生成|文件导出|导出工具)|(?:no|not available|cannot access).{0,40}(?:file.creation|file.export|create_file)/i.test(input.content)) return true;
  // Ordinary scope/format questions remain a normal conversation, not a forced
  // file operation. There are deliberately no brands or subject categories here.
  return !/(?:[?？]|(?:请|需要|先|能否).{0,12}(?:确认|选择|补充|说明)|(?:确认|明确).{0,12}(?:范围|对象|场景|受众))/i.test(input.content);
};

const CONTINUE_PRESENTATION = /^(?:好的?[，,]?\s*)?(?:可以|继续|开始|开始做吧?|做吧|按这个(?:来|做)|就这样|导出吧?|生成吧?|给我文件|ok(?:ay)?|go ahead|continue)[。.!！\s]*$/i;
const CLARIFICATION_QUESTION = /[?？]|(?:请|需要|先|能否).{0,12}(?:确认|选择|补充|说明)/i;
const NEW_TASK_OR_CANCELLATION = /(?:换个话题|另外|帮我|麻烦|取消|先别|先不|别做|不要做|不用做|写一封|生成一张|做一个|写个|don['’]t|do not|cancel|instead|\b(?:write|generate|create|make)\b)/i;

/** Recognize delivery intent across ordinary Q&A. Only user replies become
 * requirements; a clarification is never a global topic/default trigger. */
export const resolvePresentationTurnText = (text: string, messages: ChatMessage[] = []): string | null => {
  const direct = isChatPresentationRequest(text);
  const exportFollowup = isChatPresentationExportRequest(text);
  const history = messages.filter(message => message.content.trim() !== text.trim()).slice(-24);
  const previousAssistant = [...history].reverse().find(message => message.role === 'assistant' && message.status !== 'streaming');
  const revision = Boolean(previousAssistant && presentationHasFile(previousAssistant.toolCalls || [])
    && (isShortVisualFollowup(text) || isVisualRevisionFollowup(text))
    && !/(?:生成|制作|画|render|generate).{0,16}(?:图片|海报|视频|一张图|image|poster|video)/i.test(text));
  if (direct && !exportFollowup) return text;
  if (!exportFollowup && !revision && !CONTINUE_PRESENTATION.test(text.trim())) return direct ? text : null;
  const replies: string[] = [];
  for (let index = history.length - 1; index >= 0; index--) {
    const message = history[index];
    if (message.role !== 'user') continue;
    if (isChatPresentationRequest(message.content)) return [message.content, ...replies.reverse(), text].join('\n');
    if (CONTINUE_PRESENTATION.test(message.content.trim())) continue;
    const previous = history[index - 1];
    const clarificationReply = previous?.role === 'assistant'
      && CLARIFICATION_QUESTION.test(previous.content)
      && message.content.trim().length <= 400
      && !NEW_TASK_OR_CANCELLATION.test(message.content);
    if (!clarificationReply) break;
    replies.push(message.content);
  }
  return direct ? text : null;
};
export const mergePresentationToolCalls = (previous: ChatToolCall[], current: ChatToolCall[]) => {
  const replacements = new Map(current.map(call => [call.id, call]));
  const known = new Set(previous.map(call => call.id));
  return [...previous.map(call => replacements.get(call.id) || call), ...current.filter(call => !known.has(call.id))];
};
export const validatePresentationImageCall = (text: string | null, name: string, _args: Record<string, unknown>, _previous: ChatToolCall[]) => {
  if (!text || !imageTools.has(name)) return;
  if (!canGenerateChatPresentationImages(text)) throw new Error('用户要求不使用 AI 生图；请使用已有附件或纯文字制作 PPT');
};
export const presentationHasFile = (calls: ChatToolCall[]) => calls.some(call => getGeneratedFilesFromToolCall(call).some(file => file.format === 'pptx'));
export const shouldContinuePresentationAfterMedia = (text: string | null, calls: ChatToolCall[]) => Boolean(text && !presentationHasFile(calls));
export const presentationInterruptedMessage = (calls: ChatToolCall[]) => {
  const images = calls.flatMap(getGeneratedMediaFromToolCall).filter(media => media.type === 'image').length;
  return `PPT 尚未生成可下载文件。${images ? `已生成的 ${images} 张配图已保留，可继续用它们制作 PPT。` : '请根据错误修正后重新生成。'}`;
};
