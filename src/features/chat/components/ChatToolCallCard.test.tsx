import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatToolCall } from '../model/chatTypes';
import { ChatToolCallCard } from './ChatToolCallCard';

// Match the Node-only component test setup; force just the disclosure state.
const disclosure = vi.hoisted(() => ({ expanded: false }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: () => [disclosure.expanded, (update: (value: boolean) => boolean) => {
    disclosure.expanded = update(disclosure.expanded);
  }],
}));

// Synthetic fixtures, NOT a captured remotePC search payload or a live search.
const mozaResults = [
  { title: 'MOZA Racing 官方网站', url: 'https://mozaracing.com/', content: 'SYNTHETIC_LONG_CONTENT'.repeat(1_000) },
  { title: 'MOZA 官方支持', url: 'https://mozaracing.com/synthetic-support', content: 'SYNTHETIC_SUPPORT_CONTENT' },
];
const searchCall = (result: unknown = { provider: 'SyntheticSearch', results: mozaResults }, patch: Partial<ChatToolCall> = {}): ChatToolCall => ({
  id: 'search-synthetic',
  messageId: 'assistant-synthetic',
  toolName: 'web_search',
  argumentsJson: JSON.stringify({ query: 'MOZA 官方网站', debug: 'SYNTHETIC_RAW_ARGUMENTS' }),
  status: 'completed',
  resultJson: JSON.stringify(result),
  createdAt: 1_000,
  ...patch,
});
const renderCard = (call = searchCall(), expanded = false) => {
  disclosure.expanded = expanded;
  return renderToStaticMarkup(<ChatToolCallCard call={call} onResolve={vi.fn()} />);
};
beforeEach(() => { disclosure.expanded = false; });

// Verify the rendered card, not message/runtime status or real provider behavior.
describe('ChatToolCallCard web search receipts', () => {
  it('reports nonempty MOZA results as search success even beside a later model-stage error', () => {
    const call = searchCall();
    const html = renderToStaticMarkup(<>
      <ChatToolCallCard call={call} onResolve={vi.fn()} />
      <div role="alert">模型续写未返回内容</div>
    </>);
    expect(html).toContain('已找到 2 条结果');
    expect(html).toContain('lucide-check');
    expect(html).toContain('模型续写未返回内容');
    expect(html).not.toContain('搜索出错');
    expect(html).not.toContain('chat-tool--error');
    expect(html).not.toContain('已完成');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain('chat-tool__details');
  });

  it('expands to provider, result/site counts and named links without raw JSON or large content', () => {
    const html = renderCard(searchCall(), true);
    for (const text of ['MOZA 官方网站', 'SyntheticSearch', '2 条结果 · 1 个来源网站',
      'MOZA Racing 官方网站', 'MOZA 官方支持', 'mozaracing.com', '模型回答状态单独显示']) {
      expect(html).toContain(text);
    }
    expect(html).toContain('href="https://mozaracing.com/"');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('aria-expanded="true"');
    for (const text of ['<pre>', 'SYNTHETIC_LONG_CONTENT', 'SYNTHETIC_SUPPORT_CONTENT', 'SYNTHETIC_RAW_ARGUMENTS']) {
      expect(html).not.toContain(text);
    }
    expect(html.length).toBeLessThan(6_000);
  });

  it('renders empty results as no results with a neutral warning instead of blue completion', () => {
    const html = renderCard(searchCall({ results: [] }), true);
    expect(html).toContain('未找到结果');
    expect(html).toContain('0 条结果 · 0 个来源网站');
    expect(html).toContain('搜索服务</span>未提供');
    expect(html).toContain('lucide-shield-alert');
    expect(html).toContain('color:var(--chat-muted);background:var(--chat-soft)');
    expect(html).not.toContain('lucide-check');
    expect(html).not.toContain('已完成');
    expect(html).not.toContain('chat-tool--error');
  });

  it.each([
    [{ error: 'synthetic provider timeout', results: [] }, 'completed', 'synthetic provider timeout'],
    [{ error: { message: 'synthetic provider refused' }, results: mozaResults }, 'completed', 'synthetic provider refused'],
    [{}, 'error', '搜索工具未能完成请求。'],
  ] as const)('shows tool-level errors, including completed envelopes with result.error', (result, status, message) => {
    const html = renderCard(searchCall(result, { status }), true);
    expect(html).toContain('搜索出错');
    expect(html).toContain(message);
    expect(html).toContain('chat-tool--error');
    expect(html).toContain('color:#dc2626;background:var(--chat-soft)');
    expect(html).toContain('lucide-shield-alert');
    expect(html).not.toContain('lucide-check');
    expect(html).not.toContain('已找到');
    expect(html).not.toContain('已完成');
  });

  it.each([undefined, null, '', '{broken', 'null', '[]', '42', '{}', '{"results":{}}']) (
    'does not claim success or no results when the completed receipt is missing or malformed: %s', resultJson => {
      const html = renderCard(searchCall(undefined, { resultJson }), true);
      expect(html).toContain('搜索结果不可用');
      expect(html).toContain('lucide-shield-alert');
      expect(html).not.toContain('lucide-check');
      expect(html).not.toContain('已完成');
      expect(html).not.toContain('未找到结果');
      expect(html).not.toContain('chat-tool--error');
    },
  );

  it('links only absolute HTTP(S) sources, escapes names, and falls back to the hostname', () => {
    const results = [
      { title: '<img src=x onerror=alert(1)>', url: 'https://safe.example/first' },
      { title: '', url: 'http://another.example/second' },
      ...['javascript:alert(1)', 'data:text/html,unsafe', 'file:///private/file', '//relative.example',
        'not a URL', 'https://user:secret@credential.example/'].map(url => ({ title: 'UNSAFE_SOURCE', url })),
      null, { url: 123 },
    ];
    const html = renderCard(searchCall({ results }), true);
    expect(html).toContain('已找到 10 条结果');
    expect(html).toContain('2 个来源网站');
    expect(html.match(/<a /g)).toHaveLength(2);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('href="http://another.example/second"');
    expect(html).toContain('>another.example</a>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('UNSAFE_SOURCE');
    expect(html).not.toContain('secret');
    expect(html).not.toContain('chat-tool--error');
  });

  it('does not relabel nonempty results as search failure when no usable URLs were returned', () => {
    const html = renderCard(searchCall({ results: [{ title: 'MOZA synthetic result', content: 'CONTENT_ONLY' }] }), true);
    expect(html).toContain('已找到 1 条结果');
    expect(html).toContain('1 条结果 · 0 个来源网站');
    expect(html).toContain('未提供有效的 HTTP(S) 来源链接。');
    expect(html).not.toContain('搜索出错');
    expect(html).not.toContain('CONTENT_ONLY');
  });

  it('bounds the expanded source list and text without losing the receipt counts', () => {
    const html = renderCard(searchCall({
      provider: 'P'.repeat(1_000),
      query: 'Q'.repeat(1_000),
      results: Array.from({ length: 10 }, (_, i) => ({ title: 'T'.repeat(1_000), url: `https://source${i}.example/` })),
    }), true);
    expect(html).toContain('已找到 10 条结果');
    expect(html).toContain('10 条结果 · 10 个来源网站');
    expect(html.match(/<a /g)).toHaveLength(8);
    expect(html).toContain('仅展示前 8 条 HTTP(S) 来源链接。');
    expect(html).not.toContain('P'.repeat(81));
    expect(html).not.toContain('Q'.repeat(241));
    expect(html).not.toContain('T'.repeat(161));
  });

  it.each([
    ['pending', '准备中'], ['running', '执行中'], ['awaiting-approval', '等待确认'],
    ['cancelled', '已停止'], ['declined', '已拒绝'],
  ] as const)('preserves the %s lifecycle label rather than treating it as a search receipt', (status, label) => {
    const html = renderCard(searchCall({ results: [], error: 'STALE_ERROR' }, { status }));
    expect(html).toContain(label);
    expect(html).not.toContain('搜索出错');
    expect(html).not.toContain('未找到结果');
    expect(html).not.toContain('已找到');
    if (status === 'running' || status === 'pending') expect(html).toContain('chat-spin');
    if (status === 'awaiting-approval') {
      expect(html).toContain('允许');
      expect(html).toContain('拒绝');
    }
  });
});

describe('ChatToolCallCard other tools remain unchanged', () => {
  it('keeps generic completion and raw details even for a result with search-like fields', () => {
    const html = renderCard(searchCall({ results: [], error: 'synthetic metadata' }, {
      toolName: 'get_canvas_selection', argumentsJson: '{"selected":true}',
    }), true);
    expect(html).toContain('读取画布选中项');
    expect(html).toContain('已完成');
    expect(html).toContain('lucide-check');
    expect(html).toContain('<pre>{&quot;selected&quot;:true}</pre>');
    expect(html).toContain('synthetic metadata');
    expect(html).not.toContain('搜索出错');
    expect(html).not.toContain('chat-tool--error');
  });

  it('keeps generic tool failure, created-agent labels, and batch progress', () => {
    expect(renderCard(searchCall({}, { toolName: 'get_canvas_selection', status: 'error' }))).toContain('chat-tool--error');
    expect(renderCard(searchCall({ name: '测试智能体' }, { toolName: 'create_agent' }))).toContain('智能体：测试智能体');
    const batch = renderCard(searchCall({ phase: 'generating', total: 3, completed: 1, active: 2 }, {
      toolName: 'batch_image_operation', status: 'running',
    }));
    expect(batch).toContain('1/3');
    expect(batch).toContain('chat-tool__batch-progress');
  });
});
