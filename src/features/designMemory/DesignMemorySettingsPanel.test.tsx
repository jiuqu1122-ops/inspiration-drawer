import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DesignMemorySettingsPanel } from './DesignMemorySettingsPanel';

describe('Design Memory settings panel safe initial UI', () => {
  it('renders independent default-off switches and distinct management actions', () => {
    const index = vi.fn();
    const html = renderToStaticMarkup(createElement(DesignMemorySettingsPanel, { onIndexExisting: index }));
    expect(html.match(/role="switch"/g)).toHaveLength(2);
    expect(html).not.toContain('checked=""');
    expect(html).toContain('默认关闭');
    expect(html).toContain('清空此类记忆');
    expect(html).toContain('整理已有图片资料');
    expect(html).toContain('不额外调用模型或计费');
    expect(html).toContain('请先明确开启对应记忆');
    expect(index).not.toHaveBeenCalled();
  });
  it('can mount without a parent importer and does not imply automatic history scanning', () => {
    const html = renderToStaticMarkup(createElement(DesignMemorySettingsPanel));
    expect(html).not.toContain('整理已有图片资料');
    expect(html).toContain('不自动扫描历史');
    expect(html).toContain('收藏不等于喜欢');
  });
});
