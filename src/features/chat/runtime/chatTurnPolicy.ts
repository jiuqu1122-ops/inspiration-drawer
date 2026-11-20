import { normalizeVisibleChatText } from './chatVisibleText';

export const MAX_WEB_SEARCH_QUERIES_PER_TURN = 4;
export const MAX_TOOL_ROUNDS = 8;
export const MAX_RHINO_TOOL_ROUNDS = 24;
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

export const chatToolRoundLimit = (executionSource: 'desktop' | 'rhino' = 'desktop') => (
  executionSource === 'rhino' ? MAX_RHINO_TOOL_ROUNDS : MAX_TOOL_ROUNDS
);
export const canRunChatToolRound = (depth: number, executionSource: 'desktop' | 'rhino' = 'desktop') => depth < chatToolRoundLimit(executionSource);

export const buildRhinoTurnInstruction = () => [
  'Rhino/Grasshopper is a multi-step tool workflow. A successful native tool call is a completed STEP, not necessarily the completed user task.',
  'g1_start/g2_start only open Grasshopper. Searches and component descriptions are preparation. For a modeling request, continue with the available native tools to build the requested geometry/graph, wire inputs, solve, and verify the actual result before reporting completion.',
  'For an explicit Grasshopper request, create a real Grasshopper graph using the supplied g1_/g2_ schemas. Prefer apply_graph/connect_many to batch known components and wires. Never use run_python to enumerate Grasshopper assemblies with Assembly.GetTypes(); that reflection path can fail on the Rhino host System.Collections.Immutable dependency set. Use g1_/g2_ search, describe, get_canvas_graph and diagnostics instead. For a perforated planar outline, validate every outer/inner curve as individually closed and planar before region/extrusion operations. After a solve reports an invalid/open loop, make at most one targeted correction using the exact component error; do not issue a long series of speculative graph edits. Inspect the solved graph; do not substitute standalone Rhino geometry or stop after startup.',
  'For ordinary Rhino 9 geometry code, prefer the discovered Python tool over C#: its C# script host can fail to load System.Collections.Immutable 9 before execution. If that exact load failure occurs and a read-only snapshot proves no geometry changed, translate the intended operation to Python once; never replay the C# write.',
  'Use only registered tools and real component IDs returned by discovery. Do not invent tools, component names, or output IDs.',
  'Do not clear an existing graph unless the user explicitly requested clearing it. Do not repeat successful writes merely to obtain a closing sentence. Continue from existing tool receipts and use read-only inspection to verify results.',
  'If any required step fails or the result cannot be verified, report what completed and what remains incomplete. Never claim that opening Grasshopper created the requested graph.',
].join('\n');

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
  options: { semanticDecision?: boolean } = {},
) => {
  const normalizedCount = Math.max(0, Math.min(
    MAX_WEB_SEARCH_QUERIES_PER_TURN,
    Math.floor(webSearchCount),
  ));
  const remainingSearches = MAX_WEB_SEARCH_QUERIES_PER_TURN - normalizedCount;
  const searchInstruction = options.semanticDecision
    ? normalizedCount === 0
      ? 'RHINO_WEB_SEARCH_DECISION_V1: Decide from the complete user goal, current references and available Rhino capabilities whether external examples, precedents or reliable information would materially improve the requested result. Use web_search when that judgment says it is useful; do not rely on fixed trigger words. If external research is unnecessary, skip search and continue the Rhino task. Search is a means to the requested result, not the final deliverable.'
      : remainingSearches > 0
        ? `RHINO_WEB_SEARCH_DECISION_V1: ${normalizedCount} distinct web search(es) completed; ${remainingSearches} remain. Judge whether the sources already suffice for the actual Rhino task. If they do, stop searching and continue modeling; if not, issue only a genuinely new query.`
        : 'Search limit reached. Continue the Rhino task using available evidence; state uncertainty instead of inventing external facts.'
    : normalizedCount === 0
      ? `\u672c\u8f6e\u6700\u591a\u5141\u8bb8 ${MAX_WEB_SEARCH_QUERIES_PER_TURN} \u6b21\u4e0d\u540c\u5173\u952e\u8bcd\u7684\u8054\u7f51\u641c\u7d22\u3002\u5148\u8c03\u7528\u4e00\u6b21 web_search\uff1b\u7ed3\u679c\u8db3\u591f\u65f6\u76f4\u63a5\u56de\u7b54\uff0c\u4ec5\u5728\u8d44\u6599\u660e\u663e\u7f3a\u5931\u3001\u6b67\u4e49\u6216\u5173\u952e\u8bcd\u9519\u8bef\u65f6\u7ee7\u7eed\u6362\u7528\u4e0d\u540c\u5173\u952e\u8bcd\u3002`
      : remainingSearches > 0
        ? `\u672c\u8f6e\u5df2\u5b8c\u6210 ${normalizedCount} \u6b21\u4e0d\u540c\u5173\u952e\u8bcd\u7684\u8054\u7f51\u641c\u7d22\uff0c\u6700\u591a\u8fd8\u53ef\u4f7f\u7528 ${remainingSearches} \u6b21\u3002\u7ed3\u679c\u8db3\u591f\u65f6\u76f4\u63a5\u56de\u7b54\uff1b\u4ec5\u5728\u8d44\u6599\u660e\u663e\u4e0d\u8db3\u65f6\u6362\u7528\u4e0d\u540c\u5173\u952e\u8bcd\uff0c\u7981\u6b62\u91cd\u590d\u539f\u5173\u952e\u8bcd\u3002`
        : '\u672c\u8f6e\u8054\u7f51\u641c\u7d22\u989d\u5ea6\u5df2\u7528\u5b8c\uff0c\u8bf7\u57fa\u4e8e\u5df2\u53d6\u5f97\u8d44\u6599\u76f4\u63a5\u5b8c\u6210\u56de\u7b54\uff0c\u4e0d\u8981\u58f0\u79f0\u65e0\u6cd5\u56de\u7b54\u3002';
  return [
    `\u5f53\u524d\u672c\u5730\u65e5\u671f\u662f ${currentDate}\u3002\u89e3\u6790\u201c\u4eca\u5929\u3001\u6628\u5929\u3001\u6700\u8fd1\u201d\u7b49\u76f8\u5bf9\u65e5\u671f\u65f6\u5fc5\u987b\u4ee5\u6b64\u4e3a\u51c6\uff0c\u5e76\u628a\u5177\u4f53\u65e5\u671f\u5199\u5165\u641c\u7d22\u8bcd\u3002`,
    searchInstruction,
    options.semanticDecision
      ? 'If web search was used, synthesize relevant findings into the Rhino task and cite the sources. If not, do not imply that external research was performed.'
      : '\u56de\u7b54\u5fc5\u987b\u7efc\u5408\u641c\u7d22\u7ed3\u679c\u4e2d\u7684\u6458\u8981\u3001\u6b63\u6587\u6458\u5f55\u3001\u53d1\u5e03\u65f6\u95f4\uff0c\u5e76\u7528 Markdown \u94fe\u63a5\u6807\u6ce8\u6765\u6e90\u3002\u4e0d\u8981\u53ea\u7ed9\u7528\u6237\u4e00\u7ec4\u94fe\u63a5\u3002',
  ].join('\n');
};
