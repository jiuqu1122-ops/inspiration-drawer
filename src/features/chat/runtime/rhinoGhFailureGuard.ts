import type { ChatToolCall } from '../model/chatTypes';

type ToolCall = Pick<ChatToolCall, 'id' | 'toolName' | 'status' | 'resultJson'>;

const INVALID_LOOP = /\binvalid\s+(?:hole\s+)?loop\b|\b(?:hole|outer|inner)?\s*loop\b.{0,60}\b(?:not\s+closed|open|invalid|failed\s+to\s+close)\b|\b(?:not\s+closed|open|invalid|failed\s+to\s+close)\b.{0,60}\b(?:hole|outer|inner)?\s*loop\b|(?:\u5b54|\u8f6e\u5ed3|\u73af).{0,24}(?:\u672a\u95ed\u5408|\u4e0d\u95ed\u5408|\u672a\u5c01\u95ed)|(?:\u672a\u95ed\u5408|\u4e0d\u95ed\u5408|\u672a\u5c01\u95ed).{0,24}(?:\u5b54|\u8f6e\u5ed3|\u73af)/i;
const MAX_INSPECTED_RESULT_CHARS = 64_000;

const extractText = (value: unknown, depth = 0, visited = new Set<object>()): string[] => {
  if (depth > 6 || value == null) return [];
  if (typeof value === 'string') {
    const text = value.slice(0, MAX_INSPECTED_RESULT_CHARS);
    const trimmed = text.trim();
    if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && depth < 6) {
      try { return [text, ...extractText(JSON.parse(trimmed), depth + 1, visited)]; } catch { /* Treat it as ordinary tool text. */ }
    }
    return [text];
  }
  if (typeof value !== 'object' || visited.has(value)) return [];
  visited.add(value);
  if (Array.isArray(value)) return value.slice(0, 256).flatMap(item => extractText(item, depth + 1, visited));
  return Object.entries(value as Record<string, unknown>)
    .slice(0, 256)
    .flatMap(([key, item]) => [key, ...extractText(item, depth + 1, visited)]);
};

const isGhTool = (call: ToolCall) => {
  if (/^rhino_native_g[12]_/.test(call.toolName) || call.toolName === 'rhino_native_verify_gh_geometry') return true;
  if (call.toolName !== 'rhino_native_run_python' && call.toolName !== 'rhino_native_run_csharp') return false;
  try { return Boolean((JSON.parse(call.resultJson || '{}') as Record<string, unknown>).ghVerification); }
  catch { return false; }
};

export const hasInvalidGhLoopFailure = (call: ToolCall) => {
  if (!isGhTool(call) || !call.resultJson || call.status === 'pending' || call.status === 'cancelled') return false;
  try { return extractText(JSON.parse(call.resultJson)).some(text => INVALID_LOOP.test(text)); }
  catch { return INVALID_LOOP.test(call.resultJson); }
};

/** Count failures across model/tool batches, not repeated solve+inspect calls in one batch. */
export const repeatedGhLoopFailureAfterCorrection = (history: ToolCall[], currentBatch: ToolCall[]) => {
  if (!currentBatch.some(hasInvalidGhLoopFailure)) return false;
  const currentIds = new Set(currentBatch.map(call => call.id));
  return history.some(call => !currentIds.has(call.id) && hasInvalidGhLoopFailure(call));
};
