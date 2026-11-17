import { describe, expect, it } from 'vitest';
import { finalizeChatMessageState } from '../runtime/chatThinkingRuntime';
import type { ChatMessage, ChatToolCall } from '../model/chatTypes';
import { collectChatHtmlArtifacts, getMessageHtmlArtifacts, htmlCodeArtifactId } from './chatHtmlArtifacts';
import { buildChatHtmlPreviewDocument, CHAT_HTML_PREVIEW_CSP, CHAT_HTML_PREVIEW_SANDBOX } from './chatHtmlPreviewDocument';
const message = (content: string, overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm', conversationId: 'c', role: 'assistant', content, status: 'completed', createdAt: 0, attachments: [], toolCalls: [], ...overrides,
});
describe('HTML artifacts', () => {
  it('drops streamed tool drafts on completion/cancel/failure without persisting a fake file', () => {
    const original = message('', { status: 'streaming', htmlDrafts: [{ id: 'r:0', name: '原型.html', source: '<html>draft</html>' }] });
    expect(getMessageHtmlArtifacts(original)[0]).toMatchObject({ streaming: true, name: '原型.html' });
    for (const status of ['completed', 'error', 'cancelled'] as const) {
      const finished = finalizeChatMessageState(original, status, 10);
      expect(finished.htmlDrafts).toBeUndefined();
      expect(getMessageHtmlArtifacts(finished)).toEqual([]);
    }
  });
  it('uses stable Markdown source offsets including nested and unclosed streaming fences', () => {
    const content = '页面如下：\n\n```html\n<title>交互文档</title><button>一</button>';
    const [first] = getMessageHtmlArtifacts(message(content, { status: 'streaming' }));
    expect(first).toMatchObject({ id: htmlCodeArtifactId('m', content.indexOf('```')), name: '交互文档.html', streaming: true });
    expect(getMessageHtmlArtifacts(message(content + '更多内容\n```'))[0].id).toBe(first.id);
    const nested = getMessageHtmlArtifacts(message('> ```HTML\n> <p>嵌套</p>\n> ```'));
    expect(nested[0].source).toBe('<p>嵌套</p>');
  });
  it('keeps multiple blocks distinct and ignores other languages and user-supplied instructions', () => {
    const content = '```html\n<div>A</div>\n```\n```js\nalert(1)\n```\n~~~htm\n<div>B</div>\n~~~';
    expect(getMessageHtmlArtifacts(message(content))).toHaveLength(2);
    expect(getMessageHtmlArtifacts(message(content, { role: 'user' }))).toEqual([]);
  });
  it('supports raw complete documents without rendering them in the host', () => {
    expect(getMessageHtmlArtifacts(message('<!DOCTYPE html><html><title>页面</title></html>'))[0]).toMatchObject({ id: 'm:html:document', name: '页面.html' });
    expect(getMessageHtmlArtifacts(message('讨论 <div> 不是一个完整文档'))).toEqual([]);
  });
  it('recovers the exact generated file source from persisted tool arguments, not a fabricated path', () => {
    const source = '<html><script>let n=1;</script><h1>中文</h1></html>';
    const call: ChatToolCall = { id: 'call', messageId: 'm', toolName: 'create_file', createdAt: 0, status: 'completed', argumentsJson: JSON.stringify({ fileName: '示例.html', format: 'html', content: source }), resultJson: JSON.stringify({ files: [{ id: 'f', name: '示例.html', format: 'html', path: 'C:/generated/sample.html' }] }) };
    expect(getMessageHtmlArtifacts(message('', { toolCalls: [call] }))[0]).toMatchObject({ id: 'm:file:call', source, file: { id: 'f' } });
    expect(getMessageHtmlArtifacts(message('', { toolCalls: [{ ...call, status: 'error' }] }))).toEqual([]);
    expect(getMessageHtmlArtifacts(message('', { toolCalls: [{ ...call, argumentsJson: '{broken' }] }))).toEqual([]);
  });
  it('never leaks another document/conversation or a user HTML attachment into the preview', () => {
    const source = '```html\n<p>one</p>\n```';
    expect(collectChatHtmlArtifacts([message(source), message(source, { id: 'other', conversationId: 'other' })], 'c').map(artifact => artifact.messageId)).toEqual(['m']);
  });
});
describe('isolated interactive HTML document', () => {
  it('puts restrictive policy before any model content and keeps scripts isolated', () => {
    const source = '<meta http-equiv="Content-Security-Policy" content="default-src *"><script>parent.document.body.textContent="bad"</script>';
    const doc = buildChatHtmlPreviewDocument(source);
    expect(doc.indexOf(CHAT_HTML_PREVIEW_CSP)).toBeLessThan(doc.indexOf(source));
    expect(doc).toContain(source); // not incorrectly HTML-escaped, interaction is intentional
    expect(CHAT_HTML_PREVIEW_SANDBOX).toBe('allow-scripts');
    for (const value of ["connect-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'", "worker-src 'none'"]) expect(CHAT_HTML_PREVIEW_CSP).toContain(value);
    expect(CHAT_HTML_PREVIEW_CSP).not.toContain('https:');
    expect(CHAT_HTML_PREVIEW_CSP).not.toContain('asset:');
  });
  it('rejects oversized preview sources', () => {
    expect(() => buildChatHtmlPreviewDocument('x'.repeat(2_000_001))).toThrow('2 MB');
  });
});
