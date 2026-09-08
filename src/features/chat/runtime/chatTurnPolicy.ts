import { normalizeVisibleChatText } from './chatVisibleText';

export const MAX_WEB_SEARCH_QUERIES_PER_TURN = 4;
export const MAX_TOOL_ROUNDS = 8;
export const MAX_EMPTY_RESPONSE_RECOVERIES = 1;

export const EMPTY_CHAT_RESULT_ERROR = '模型未返回有效结果，请重试。';

export const EMPTY_RESPONSE_RECOVERY_INSTRUCTION = [
  '上一轮模型没有返回用户可见的最终结果。',
  '请不要继续隐藏推理，也不要重复已经完成的工具调用；请直接返回最终用户可见答复。',
  '如果任务本应产生图片、视频或文件，但尚未产生真实产物，则明确调用对应工具。',
].join('\n');

export type ChatProviderOutcome = 'complete' | 'execute-tools' | 'recover-empty' | 'error-empty';

export const classifyChatProviderOutcome = (input: {
  content: string;
  reasoning?: string;
  toolCallCount: number;
  emptyRecoveryCount: number;
}): ChatProviderOutcome => {
  if (normalizeVisibleChatText(input.content)) return 'complete';
  if (input.toolCallCount > 0) return 'execute-tools';
  return input.emptyRecoveryCount < MAX_EMPTY_RESPONSE_RECOVERIES
    ? 'recover-empty'
    : 'error-empty';
};

export const canRunChatToolRound = (depth: number) => depth < MAX_TOOL_ROUNDS;

export const normalizeWebSearchQuery = (argumentsJson: string): string | null => {
  try {
    const query = String((JSON.parse(argumentsJson || '{}') as Record<string, unknown>).query || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLocaleLowerCase();
    return query || null;
  } catch (_) {
    return null;
  }
};

export const canAcceptWebSearchQuery = (
  acceptedQueries: ReadonlySet<string>,
  argumentsJson: string,
) => {
  const query = normalizeWebSearchQuery(argumentsJson);
  return Boolean(
    query
    && !acceptedQueries.has(query)
    && acceptedQueries.size < MAX_WEB_SEARCH_QUERIES_PER_TURN,
  );
};

export const buildWebSearchTurnInstruction = (
  webSearchCount: number,
  currentDate: string,
) => {
  const normalizedCount = Math.max(0, Math.min(
    MAX_WEB_SEARCH_QUERIES_PER_TURN,
    Math.floor(webSearchCount),
  ));
  const remainingSearches = MAX_WEB_SEARCH_QUERIES_PER_TURN - normalizedCount;
  const searchInstruction = normalizedCount === 0
    ? `本轮最多允许 ${MAX_WEB_SEARCH_QUERIES_PER_TURN} 次不同关键词的联网搜索。先调用一次 web_search；结果足够时直接回答，仅在资料明显缺失、歧义或关键词错误时继续换用不同关键词。`
    : remainingSearches > 0
      ? `本轮已完成 ${normalizedCount} 次不同关键词的联网搜索，最多还可使用 ${remainingSearches} 次。结果足够时直接回答；仅在资料明显不足时换用不同关键词，禁止重复原关键词。`
      : '本轮联网搜索额度已用完，请基于已取得资料直接完成回答，不要声称无法回答。';
  return [
    `当前本地日期是 ${currentDate}。解析“今天、昨天、最近”等相对日期时必须以此为准，并把具体日期写入搜索词。`,
    searchInstruction,
    '回答必须综合搜索结果中的摘要、正文摘录、发布时间，并用 Markdown 链接标注来源。不要只给用户一组链接。',
  ].join('\n');
};
