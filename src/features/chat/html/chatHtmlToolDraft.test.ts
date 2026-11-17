import { describe, expect, it } from 'vitest';
import { mergeHtmlToolDraft, readPartialJsonStrings, type HtmlToolDraftState } from './chatHtmlToolDraft';
import { normalizeChatStreamEvent } from '../runtime/chatStream';

describe('streamed HTML tools', () => {
  it('keeps the existing native arguments delta field through normalization', () => {
    expect(normalizeChatStreamEvent({ requestId: 'r', kind: 'tool_call_delta', toolCall: { index: 0, name: 'create_file', argumentsDelta: '{"format":"html"' } })?.argumentsDelta).toBe('{"format":"html"');
  });
  it('handles arbitrary boundaries including escapes, Chinese, unicode and unfinished strings', () => {
    const content = '<html><h1>中文</h1><script>let n="\\\\";\nconst x="hi";</script></html>';
    const json = JSON.stringify({ fileName: '原型.html', format: 'html', content });
    for (let index = json.indexOf('content') + 11; index < json.length; index++) {
      const draft = readPartialJsonStrings(json.slice(0, index));
      expect(content.startsWith(draft.content || '')).toBe(true);
    }
    expect(readPartialJsonStrings(json)).toEqual({ fileName: '原型.html', format: 'html', content });
    expect(readPartialJsonStrings('{"format":"html","content":"a\\u4e')).toEqual({ format: 'html', content: 'a' });
    expect(readPartialJsonStrings('{"format":"html","content":"a\\u4e2d')).toEqual({ format: 'html', content: 'a中' });
  });
  it('isolates concurrent tool indexes and throttles parsing without dropping argument chunks', () => {
    const state: HtmlToolDraftState = new Map();
    const event = { requestId: 'r', kind: 'tool_call_delta' as const, toolIndex: 0, toolName: 'create_file', argumentsDelta: '{"fileName":"a.html","format":"html","content":"<h1>A' };
    expect(mergeHtmlToolDraft(state, event, 1000)).toMatchObject({ source: '<h1>A', id: 'r:0' });
    expect(mergeHtmlToolDraft(state, { ...event, toolName: undefined, argumentsDelta: 'B' }, 1100)).toBeUndefined();
    expect(mergeHtmlToolDraft(state, { ...event, toolName: undefined, argumentsDelta: '</h1>"}' }, 1400)).toMatchObject({ source: '<h1>AB</h1>' });
    expect(mergeHtmlToolDraft(state, { ...event, toolIndex: 1, toolName: 'generate_image' }, 2000)).toBeUndefined();
  });
  it('never treats malformed JSON or another file format as HTML', () => {
    const state: HtmlToolDraftState = new Map();
    expect(mergeHtmlToolDraft(state, { requestId: 'r', kind: 'tool_call_delta', toolName: 'create_file', argumentsDelta: '{"format":"txt","content":"<script>alert(1)</script>"}' })).toBeUndefined();
    expect(readPartialJsonStrings('not json')).toEqual({});
    expect(readPartialJsonStrings('{"format":"html","sheets":null,"presentation":{"content":"not HTML"},"content":"<h1>ok')).toEqual({ format: 'html', content: '<h1>ok' });
  });
});
