import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

type MarkdownNode = {
  type: string; value?: string; children?: MarkdownNode[]; depth?: number;
  ordered?: boolean; start?: number; checked?: boolean | null; url?: string;
  alt?: string; lang?: string; align?: Array<string | null>;
};
const parser = unified().use(remarkParse).use(remarkGfm).use(remarkBreaks);
export function parse(markdown: string): MarkdownNode {
  return parser.runSync(parser.parse(String(markdown || ''))) as unknown as MarkdownNode;
}
/** Never insert model-provided HTML or fetch model-provided image URLs. */
export function render(document: Document, markdown: string): DocumentFragment {
  function visit(node: MarkdownNode): Node {
    const children = () => (node.children || []).map(visit);
    const element = (tag: string) => { const el = document.createElement(tag); el.append(...children()); return el; };
    switch (node.type) {
      case 'root': { const fragment = document.createDocumentFragment(); fragment.append(...children()); return fragment; }
      case 'text': return document.createTextNode(node.value || '');
      case 'paragraph': return element('p');
      case 'strong': return element('strong');
      case 'emphasis': return element('em');
      case 'delete': return element('del');
      case 'heading': return element('h' + Math.min(6, Math.max(1, node.depth || 1)));
      case 'blockquote': return element('blockquote');
      case 'break': return document.createElement('br');
      case 'thematicBreak': return document.createElement('hr');
      case 'inlineCode': { const code = document.createElement('code'); code.textContent = node.value || ''; return code; }
      case 'code': {
        const block = document.createElement('div'); block.className = 'message-code-block';
        if (node.lang) { const label = document.createElement('div'); label.className = 'message-code-language'; label.textContent = node.lang; block.append(label); }
        const pre = document.createElement('pre'); const code = document.createElement('code');
        code.textContent = node.value || ''; pre.append(code); block.append(pre); return block;
      }
      case 'list': { const list = element(node.ordered ? 'ol' : 'ul'); if (node.ordered && node.start != null) list.setAttribute('start', String(node.start)); return list; }
      case 'listItem': {
        const item = document.createElement('li');
        if (typeof node.checked === 'boolean') {
          item.className = 'task-list-item';
          const check = document.createElement('input'); check.type = 'checkbox'; check.checked = node.checked; check.disabled = true; check.setAttribute('aria-label', node.checked ? '已完成' : '未完成'); item.append(check);
        }
        item.append(...children()); return item;
      }
      case 'link': {
        // Schemes are explicit; javascript:, file:, asset: and protocol-relative URLs are inert.
        if (!/^https?:\/\//i.test(node.url || '')) return element('span');
        const link = element('a'); link.className = 'message-link'; link.setAttribute('href', node.url!); link.setAttribute('target', '_blank'); link.setAttribute('rel', 'noopener noreferrer'); return link;
      }
      case 'image': return document.createTextNode(node.alt || '[图片]');
      case 'table': {
        const wrapper = document.createElement('div'); wrapper.className = 'message-table-scroll';
        const table = document.createElement('table'); const head = document.createElement('thead'); const body = document.createElement('tbody');
        (node.children || []).forEach((row, index) => {
          const tr = document.createElement('tr');
          (row.children || []).forEach((cell, column) => {
            const td = document.createElement(index === 0 ? 'th' : 'td');
            if (index === 0) td.setAttribute('scope', 'col');
            const align = node.align?.[column]; if (align === 'left' || align === 'right' || align === 'center') td.style.textAlign = align;
            td.append(...(cell.children || []).map(visit)); tr.append(td);
          }); (index === 0 ? head : body).append(tr);
        }); table.append(head, body); wrapper.append(table); return wrapper;
      }
      // Raw HTML is intentionally not interpreted. Plain text preserves legitimate examples.
      case 'html': return document.createTextNode(node.value || '');
      default: { const fragment = document.createDocumentFragment(); fragment.append(...children()); return fragment; }
    }
  }
  return visit(parse(markdown)) as DocumentFragment;
}
