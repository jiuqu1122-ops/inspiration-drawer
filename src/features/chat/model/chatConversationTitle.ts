import type { ChatConversation, ChatMessage } from './chatTypes';

/** Identity stays in conversation.id; automatic labels never contain it. */
export const isAutomaticConversationTitle = (title: string) => /^(?:新对话|图片对话|Rhino\s+(?:对话(?:\s*·.*)?|\d+(?:\s+\?+)?)|Rhino\s+chat)$/i.test(title.trim());

export function firstRequestTitle(text: string): string {
  const request = text.split(/\n\n\[Rhino /)[0].trim();
  const firstLine = request.split(/\r?\n/).map(line => line.trim()).find(Boolean) || '';
  const firstSentence = firstLine.match(/^.*?[\u3002\uff01\uff1f!?]/)?.[0]?.trim() || firstLine;
  const readable = firstSentence.replace(/^#+\s*|^[\s>]+/g, '').replace(/\s+/g, ' ').trim();
  const points = Array.from(readable);
  return points.length > 36 ? points.slice(0, 36).join('') + '…' : readable || '新对话';
}

export function conversationDisplayTitle(conversation?: Pick<ChatConversation, 'title' | 'firstUserMessage'>, messages: ChatMessage[] = []): string {
  if (!conversation) return '新对话';
  if (!isAutomaticConversationTitle(conversation.title)) return conversation.title;
  const first = conversation.firstUserMessage ?? [...messages].filter(message => message.role === 'user').sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))[0]?.content;
  return first ? firstRequestTitle(first) : '新对话';
}
