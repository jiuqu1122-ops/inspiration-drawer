import type { ChatStreamEvent } from '../runtime/chatStream';
import { MAX_CHAT_HTML_LENGTH } from './chatHtmlArtifacts';

export type HtmlToolDraft = { id: string; name: string; source: string };
export type HtmlToolDraftState = Map<number, { name: string; arguments: string; lastPaint: number }>;

// Parse only top-level JSON string values, including unfinished strings. Never
// eval generated code. JSON.parse handles escapes on a completed string; the
// small scanner also tolerates an unfinished escape at a transport boundary.
export function readPartialJsonStrings(json: string): Record<string, string> {
  const values: Record<string, string> = {};
  let index = 0;
  const readString = () => {
    const start = index++;
    let raw = '"';
    while (index < json.length) {
      const char = json[index++];
      if (char === '"') {
        try { return { value: JSON.parse(raw + '"') as string, complete: true }; } catch { return { value: '', complete: false }; }
      }
      if (char === '\\') {
        if (index >= json.length) break;
        const escape = json[index++];
        if (escape === 'u') {
          if (index + 4 > json.length) break;
          raw += '\\u' + json.slice(index, index + 4); index += 4;
        } else raw += '\\' + escape;
      } else raw += char;
    }
    if (index > start) {
      try { return { value: JSON.parse(raw + '"') as string, complete: false }; } catch { /* malformed input stays non-executable */ }
    }
    return { value: '', complete: false };
  };
  while (index < json.length && /\s/.test(json[index])) index++;
  if (json[index++] !== '{') return values;
  while (index < json.length) {
    while (index < json.length && /[\s,]/.test(json[index])) index++;
    if (json[index] !== '"') break;
    const key = readString();
    if (!key.complete) break;
    while (index < json.length && /\s/.test(json[index])) index++;
    if (json[index++] !== ':') break;
    while (index < json.length && /\s/.test(json[index])) index++;
    if (json[index] !== '"') {
      // Optional nulls/objects may arrive before content; skip their complete
      // JSON value without mistaking nested content keys for top-level HTML.
      let depth = 0;
      while (index < json.length) {
        const char = json[index];
        if (char === '"') { if (!readString().complete) return values; continue; }
        if ((char === ',' || char === '}') && depth === 0) break;
        if (char === '{' || char === '[') depth++;
        if (char === '}' || char === ']') depth--;
        index++;
      }
      if (depth !== 0) return values;
      continue;
    }
    const value = readString();
    values[key.value] = value.value;
    if (!value.complete) break;
  }
  return values;
}

export function mergeHtmlToolDraft(state: HtmlToolDraftState, event: ChatStreamEvent, now = Date.now()): HtmlToolDraft | undefined {
  if (event.kind !== 'tool_call_delta') return;
  const index = Math.max(0, event.toolIndex || 0);
  if (index > 16) return;
  const current = state.get(index) || { name: '', arguments: '', lastPaint: 0 };
  if (event.toolName) current.name = event.toolName;
  if (current.name && current.name !== 'create_file') return;
  if (current.arguments.length + (event.argumentsDelta?.length || 0) > MAX_CHAT_HTML_LENGTH * 4) return;
  current.arguments += event.argumentsDelta || '';
  state.set(index, current);
  if (current.name !== 'create_file' || now - current.lastPaint < 300) return;
  current.lastPaint = now;
  const args = readPartialJsonStrings(current.arguments);
  if (!/^(?:html?|html5)$/i.test(args.format || '') || !args.content?.trim()) return;
  return { id: `${event.requestId}:${index}`, name: args.fileName || 'HTML 原型.html', source: args.content };
}
