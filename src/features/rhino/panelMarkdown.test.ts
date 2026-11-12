import { describe, expect, it } from 'vitest';
import { parse, render } from './panelMarkdown';
// Minimal DOM verifies semantic construction; real browser smoke covers layout/events.
class NodeFixture {
  children: NodeFixture[] = []; attributes: Record<string, string> = {}; style = {};
  textContent = ''; className = ''; checked = false; disabled = false;
  constructor(public tagName: string) {}
  append(...nodes: NodeFixture[]) { this.children.push(...nodes); }
  setAttribute(name: string, value: string) { this.attributes[name] = value; }
}
function output(markdown: string) {
  const doc = { createElement: (tag: string) => new NodeFixture(tag), createTextNode: (text: string) => { const node = new NodeFixture('#text'); node.textContent = text; return node; }, createDocumentFragment: () => new NodeFixture('#fragment') };
  const tree = render(doc as unknown as Document, markdown) as unknown as NodeFixture;
  const nodes: NodeFixture[] = []; const walk = (node: NodeFixture) => { nodes.push(node); node.children.forEach(walk); }; walk(tree);
  return { nodes, text: nodes.map(node => node.textContent).join(''), tags: nodes.map(node => node.tagName) };
}
describe('Rhino assistant Markdown', () => {
  it('renders headings, nested lists, strong/emphasis, quotes, GFM tasks and tables', () => {
    const value = '# 生成完成\n\n**清晰预览** 与 *说明*\n\n1. 外形\n   - 细节\n\n> 引用\n\n- [x] 已完成\n- [ ] 待检查\n\n| 参数 | 值 |\n| --- | ---: |\n| 尺寸 | 20 |';
    const result = output(value);
    for (const tag of ['h1', 'strong', 'em', 'ol', 'ul', 'blockquote', 'input', 'table', 'th', 'td']) expect(result.tags).toContain(tag);
    expect(result.text).not.toMatch(/\*\*|\[x\]|---:/);
    expect(result.nodes.filter(node => node.tagName === 'input').map(node => [node.checked, node.disabled])).toEqual([[true, true], [false, true]]);
  });
  it('preserves literal code, multiplication and escapes rather than deleting symbols', () => {
    const result = output('大小 2 * 3\n\n' + '\x60\x60\x60python\nprint("**literal**")\n\x60\x60\x60');
    expect(result.text).toContain('2 * 3'); expect(result.text).toContain('**literal**'); expect(result.tags).toContain('pre'); expect(result.tags).toContain('code');
  });
  it('keeps hostile HTML/URLs inert and never fetches Markdown image URLs', () => {
    const result = output('<script>alert(1)</script>\n\n[bad](javascript:alert%281%29) ![参考图](https://tracker.example/pixel) [safe](https://example.com)');
    expect(result.tags).not.toContain('script'); expect(result.tags).not.toContain('img');
    const links = result.nodes.filter(node => node.tagName === 'a'); expect(links).toHaveLength(1);
    expect(links[0].attributes).toMatchObject({ href: 'https://example.com', rel: 'noopener noreferrer' });
    expect(result.text).toContain('参考图');
  });
  it('handles streaming unfinished Markdown without throwing', () => {
    for (const value of ['**正在生成', '| 名称 |', '\x60\x60\x60python\nprint(', '[link](', '* item\n  * child']) expect(() => parse(value)).not.toThrow();
  });
});
