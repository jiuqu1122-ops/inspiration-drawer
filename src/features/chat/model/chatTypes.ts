export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';
export type ChatMessageStatus = 'streaming' | 'completed' | 'error' | 'cancelled';
export type ChatToolCallStatus = 'pending' | 'awaiting-approval' | 'running' | 'completed' | 'declined' | 'error';
export type ChatReasoningEffort = '' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export type ChatAttachment = {
  id: string;
  messageId: string;
  type: 'image' | 'video' | 'file' | string;
  path: string;
  thumbnailPath?: string | null;
  mimeType?: string | null;
  metadataJson?: string | null;
  createdAt: number;
};

export type ChatToolCall = {
  id: string;
  messageId: string;
  toolName: string;
  argumentsJson: string;
  resultJson?: string | null;
  status: ChatToolCallStatus;
  createdAt: number;
  completedAt?: number | null;
};

export type ChatGeneratedMedia = {
  id: string;
  type: 'image' | 'video';
  path?: string;
  url?: string;
  thumbnail?: string;
  assetId?: string;
  prompt?: string;
  name?: string;
};

export type ChatGeneratedFile = {
  id: string;
  name: string;
  path: string;
  format: string;
  mimeType?: string;
  size?: number;
};

export type ChatImageModelOption = {
  value: string;
  label: string;
  hint?: string;
  meta?: string;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  role: ChatRole;
  content: string;
  status: ChatMessageStatus;
  createdAt: number;
  attachments: ChatAttachment[];
  toolCalls: ChatToolCall[];
};

export type ChatConversation = {
  id: string;
  title: string;
  model: string;
  createdAt: number;
  updatedAt: number;
  archived: boolean;
};

export type ChatSummary = {
  conversationId: string;
  summary: string;
  throughMessageId?: string | null;
  updatedAt: number;
};

export type ChatMessagePage = {
  messages: ChatMessage[];
  hasMore: boolean;
  nextBeforeCreatedAt?: number | null;
};

export type ChatUsage = {
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  raw?: Record<string, unknown>;
};

export type PendingChatAttachment = Omit<ChatAttachment, 'messageId' | 'createdAt'> & {
  messageId?: string;
  createdAt?: number;
};

export type ChatToolExecutionContext = {
  userText: string;
  conversationId: string;
  messageId: string;
  recentMessages: ChatMessage[];
};

export type ChatToolExecutor = (
  name: string,
  args: Record<string, unknown>,
  context: ChatToolExecutionContext,
) => Promise<unknown>;

export const createChatId = (prefix: string) => (
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
);

export const parseChatToolResult = (value?: string | null): unknown => {
  if (!value) return undefined;
  try { return JSON.parse(value); } catch (_) { return value; }
};

export const getGeneratedMediaFromToolCall = (call: ChatToolCall): ChatGeneratedMedia[] => {
  const parsed = parseChatToolResult(call.resultJson);
  if (!parsed || typeof parsed !== 'object') return [];
  const record = parsed as Record<string, unknown>;
  const media = Array.isArray(record.media) ? record.media : Array.isArray(record.outputs) ? record.outputs : [];
  return media.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Record<string, unknown>;
    const type = String(item.type || item.mediaType || 'image') === 'video' ? 'video' : 'image';
    const path = String(item.path || '').trim() || undefined;
    const url = String(item.url || item.sourceUrl || '').trim() || undefined;
    if (!path && !url) return [];
    return [{
      id: String(item.id || createChatId('generated')),
      type,
      path,
      url,
      thumbnail: String(item.thumbnail || '').trim() || undefined,
      assetId: String(item.assetId || item.drawerItemId || '').trim() || undefined,
      prompt: String(item.prompt || record.prompt || '').trim() || undefined,
      name: String(item.name || '').trim() || undefined,
    } satisfies ChatGeneratedMedia];
  });
};

export const getGeneratedFilesFromToolCall = (call: ChatToolCall): ChatGeneratedFile[] => {
  if (call.toolName !== 'create_file' || call.status !== 'completed') return [];
  const parsed = parseChatToolResult(call.resultJson);
  if (!parsed || typeof parsed !== 'object') return [];
  const files = Array.isArray((parsed as Record<string, unknown>).files)
    ? (parsed as Record<string, unknown>).files as unknown[]
    : [];
  return files.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const file = value as Record<string, unknown>;
    const path = String(file.path || '').trim();
    if (!path) return [];
    return [{
      id: String(file.id || createChatId('generated-file')),
      name: String(file.name || 'AI 生成文件'),
      path,
      format: String(file.format || '').trim().toLowerCase(),
      mimeType: String(file.mimeType || '').trim() || undefined,
      size: Number.isFinite(Number(file.size)) ? Number(file.size) : undefined,
    } satisfies ChatGeneratedFile];
  });
};
