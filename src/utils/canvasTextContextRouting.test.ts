import { describe, expect, it } from 'vitest';
import {
  applyCanvasTextContextRouting,
  buildCanvasContextRoutingInstruction,
  formatCanvasTextResultMarkdown,
} from './canvasTextContextRouting';

describe('canvas text context routing', () => {
  it('keeps legacy unbound text unchanged', () => {
    expect(applyCanvasTextContextRouting('完整分析内容')).toBe('完整分析内容');
  });

  it('automatically selects global context and the current stable target ID', () => {
    const output = JSON.stringify({
      global: '统一策略',
      targets: {
        'node-hero': '主图策略',
        'node-detail': '细节策略',
      },
    });
    const selected = applyCanvasTextContextRouting(output, {
      targetKeys: ['runtime-random-id', 'node-detail'],
    });

    expect(selected).toContain('"global": "统一策略"');
    expect(selected).toContain('"target": "细节策略"');
    expect(selected).not.toContain('主图策略');
  });

  it('keeps explicit field bindings as a custom-schema override', () => {
    const output = [
      '```json',
      JSON.stringify({ global: '统一策略', hero: '主图策略', detail: '细节策略' }),
      '```',
    ].join('\n');
    const selected = applyCanvasTextContextRouting(output, { bindings: ['global', 'hero'] });

    expect(selected).toContain('"global": "统一策略"');
    expect(selected).toContain('"hero": "主图策略"');
    expect(selected).not.toContain('细节策略');
  });

  it('falls back to full output when JSON or required routing data is incomplete', () => {
    const prose = '自然语言分析，不是 JSON。';
    expect(applyCanvasTextContextRouting(prose, { targetKeys: ['node'] })).toBe(prose);

    const missingTarget = JSON.stringify({ global: '统一策略', targets: { other: '其他' } });
    expect(applyCanvasTextContextRouting(missingTarget, { targetKeys: ['node'] })).toBe(missingTarget);

    const partialCustom = JSON.stringify({ global: '统一策略' });
    expect(applyCanvasTextContextRouting(partialCustom, { bindings: ['global', 'hero'] })).toBe(partialCustom);
  });

  it('builds a business-agnostic routing contract from downstream node metadata', () => {
    const instruction = buildCanvasContextRoutingInstruction([
      { id: 'node-a', label: '第一张图', task: '生成第一张图。' },
      { id: 'node-b', label: '第二张图', task: '生成第二张图。' },
    ]);

    expect(instruction).toContain('"node-a"');
    expect(instruction).toContain('"node-b"');
    expect(instruction).toContain('生成第二张图');
    expect(instruction).not.toContain('hero');
    expect(instruction).not.toContain('detail');
  });

  it('formats the internal routing envelope as user-facing Markdown', () => {
    const output = JSON.stringify({
      global: '## 产品分析\\n\\n- 保留核心造型',
      targets: {
        'internal-node-a': '### 主图策略\\n\\n使用正面视角。',
        'internal-node-b': '### 细节策略\\n\\n突出材质纹理。',
      },
    });

    const markdown = formatCanvasTextResultMarkdown(output);

    expect(markdown).toContain('## 产品分析\n\n- 保留核心造型');
    expect(markdown).not.toContain('使用正面视角。');
    expect(markdown).not.toContain('突出材质纹理。');
    expect(markdown).not.toContain('"global"');
    expect(markdown).not.toContain('internal-node');
    expect(markdown).not.toContain('\\n');
  });

  it('keeps an ordinary Markdown response unchanged', () => {
    const markdown = '## 设计策略\n\n- 简洁\n- 克制';
    expect(formatCanvasTextResultMarkdown(markdown)).toBe(markdown);
  });
});
