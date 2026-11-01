// @ts-expect-error The browser tsconfig excludes Node types; this assertion runs only in Vitest.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BufferItemCard from '../BufferItemCard';

describe('dark drawer multi-select overlays', () => {
  it('keeps the selection hit target translucent instead of using a card surface', () => {
    const html = renderToStaticMarkup(<BufferItemCard
      item={{ id: 'test', type: 'image', name: 'synthetic.png', content: '', createdAt: 1, width: 20, height: 20, thumbnail: 'data:image/png;base64,test' }}
      cardWidth={240} mediaHeight={240} isSelectMode isSelected onToggleSelect={() => {}}
    />);
    expect(html).toContain('data-asset-selection-overlay="true"');
    expect(html).toContain('dark:bg-black/20');
    expect(html).not.toContain('data-asset-analysis="true"');
  });
  it('remaps only exact opaque background utility tokens, never alpha or hover variants', () => {
    const css = readFileSync(new URL('../../index.css', import.meta.url), 'utf8');
    for (const color of ['black', 'stone-950', 'stone-900', 'slate-900', 'stone-800']) {
      expect(css).toContain(`[class~="dark:bg-${color}"]`);
      expect(css).not.toContain(`[class*="dark:bg-${color}"]`);
    }
  });
});
