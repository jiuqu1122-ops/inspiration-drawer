import { parsePrototype, type PrototypeDocument } from '../prototypes/prototypeSchema';
import { renderPrototypeHtml, prototypeFileName } from '../prototypes/prototypeHtml';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { getGeneratedFilesFromToolCall, type ChatGeneratedFile, type ChatMessage } from '../model/chatTypes';

export const MAX_CHAT_HTML_LENGTH = 2_000_000;
export type ChatHtmlArtifact = {
  id: string;
  messageId: string;
  name: string;
  source: string;
  streaming: boolean;
  file?: ChatGeneratedFile;
  prototype?: PrototypeDocument;
};

export const isHtmlLanguage = (language: string) => /^(?:html?|html5)$/i.test(language);
export const htmlCodeArtifactId = (messageId: string, offset: number) => `${messageId}:html:${offset}`;
const parser = unified().use(remarkParse);
const htmlName = (source: string) => {
  const title = source.match(/<title\b[^>]*>([^<]{1,120})<\/title\s*>/i)?.[1]?.trim();
  const name = (title || 'HTML 原型').replace(/[<>:"/\\|?*]/g, '_').split('').filter(char => char.charCodeAt(0) >= 32).join('').slice(0, 100);
  return `${name}.html`;
};

// Use the same Markdown grammar and source offsets as the message renderer. This
// handles nested fences, backticks in JS, and still-open streaming code blocks.
const artifactCache = new WeakMap<ChatMessage, ChatHtmlArtifact[]>();
export function getMessageHtmlArtifacts(message: ChatMessage): ChatHtmlArtifact[] {
  const cached = artifactCache.get(message);
  if (cached) return cached;
  if (message.role !== 'assistant') return [];
  const artifacts: ChatHtmlArtifact[] = [];
  const visit = (node: { type: string; lang?: string | null; value?: string; position?: { start: { offset?: number } }; children?: typeof node[] }) => {
    if (node.type === 'code' && isHtmlLanguage(node.lang || '') && node.value?.trim()) {
      artifacts.push({
        id: htmlCodeArtifactId(message.id, node.position?.start.offset || 0),
        messageId: message.id, name: htmlName(node.value), source: node.value,
        streaming: message.status === 'streaming',
      });
    }
    node.children?.forEach(visit);
  };
  visit(parser.parse(message.content));
  if (!artifacts.length && /^\s*(?:<!doctype\s+html\b|<html\b)/i.test(message.content)) {
    artifacts.push({ id: `${message.id}:html:document`, messageId: message.id,
      name: htmlName(message.content), source: message.content, streaming: message.status === 'streaming' });
  }
  if (message.status === 'streaming') for (const draft of message.htmlDrafts || []) {
    artifacts.push({ id: `${message.id}:draft:${draft.id}`, messageId: message.id, name: draft.name, source: draft.source, streaming: true });
  }
  for (const call of message.toolCalls) {
    if (['create_ui_prototype','animate_ui_prototype'].includes(call.toolName) && call.status === 'completed') {
      const file = getGeneratedFilesFromToolCall(call)[0];
      if (file) try {
        const prototype = parsePrototype(call.toolName === 'animate_ui_prototype' ? JSON.parse(call.resultJson || '{}').prototypeDocument : JSON.parse(call.argumentsJson).prototype);
        artifacts.push({ id: `${message.id}:prototype:${call.id}`, messageId: message.id,
          name: `${prototypeFileName(prototype.name)}.html`, source: renderPrototypeHtml(prototype), prototype, file, streaming: false });
      } catch { /* Invalid data must not become executable artifacts. */ }
      continue;
    }
    if (call.toolName !== 'create_file' || call.status !== 'completed') continue;
    const file = getGeneratedFilesFromToolCall(call).find(value => /^(?:html?|html5)$/i.test(value.format) || /\.html?$/i.test(value.name));
    if (!file) continue;
    try {
      const args = JSON.parse(call.argumentsJson) as Record<string, unknown>;
      if (typeof args.content !== 'string' || !args.content.trim()) continue;
      artifacts.push({ id: `${message.id}:file:${call.id}`, messageId: message.id,
        name: file.name, source: args.content, streaming: false, file });
    } catch { /* Incomplete/invalid tool arguments are not executable artifacts. */ }
  }
  artifactCache.set(message, artifacts);
  return artifacts;
}

export const collectChatHtmlArtifacts = (messages: ChatMessage[], conversationId: string) => messages
  .filter(message => message.conversationId === conversationId)
  .flatMap(getMessageHtmlArtifacts);

// This is capability exposure, NOT a keyword router. The model decides whether
// the user wants a runnable document, code advice, an image, or no tool at all.
export const hasChatHtmlContext = (text: string) => /\bhtml5?\b|\b(?:ui|web\s*(?:app|page|site)|website|prototype|interactive\s+document)\b|网页|网站|前端|交互文档|原型|界面|页面|[\u4e00-\u9fff]{1,8}页(?:[，。！？,.!?\s]|$)/i.test(text);
