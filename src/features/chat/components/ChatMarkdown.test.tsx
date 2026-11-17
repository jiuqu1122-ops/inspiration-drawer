import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatMarkdown } from './ChatMarkdown';

describe('ChatMarkdown', () => {
  it('renders common GFM content instead of exposing Markdown markers', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown content={'## 标题\n\n1. **AI 应用**\n2. ~~旧内容~~\n\n`inline`\n\n```js\nconst ok = true;\n```'} />,
    );

    expect(html).toContain('<h2>标题</h2>');
    expect(html).toContain('<strong>AI 应用</strong>');
    expect(html).toContain('<del>旧内容</del>');
    expect(html).toContain('<ol>');
    expect(html).toContain('language-js');
    expect(html).not.toContain('**AI 应用**');
  });

  it('does not execute or render raw HTML', () => {
    const html = renderToStaticMarkup(
      <ChatMarkdown content={'安全文本<script>alert(1)</script><iframe src="https://example.com"></iframe>\n\n[危险链接](javascript:alert(1))\n\n[安全链接](https://example.com)'} />,
    );

    expect(html).toContain('安全文本');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<iframe');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="https://example.com"');
  });
});


it('offers interactive preview only on HTML fences and retains safe host rendering', () => {
  const html = renderToStaticMarkup(<ChatMarkdown messageId="m" onPreviewHtml={() => {}} content={'```html\n<button onclick="this.textContent=2">1</button>\n```\n\n```js\nalert(1)\n```'} />);
  expect(html.match(/aria-label="预览 HTML"/g)).toHaveLength(1);
  expect(html).toContain('&lt;button');
  expect(html).not.toContain('<button onclick=');
});
