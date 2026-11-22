import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import { CanvasLayerNode } from './CanvasLayerNode';

it('shows the settled split price using the original receipt even after the stack changes', () => {
  const base = { path: '/base.png', width: 320, height: 400, alpha: false, transparent: false };
  const item: CanvasImageItem = {
    id: 'result', x: 0, y: 0, width: 320, height: 400,
    item: { id: 'asset', type: 'image', content: '', name: '图层组', createdAt: 1 },
    layerResult: { mode: 'split', status: 'success', requestId: 'split-result', chargedCredits: '18.750000',
      imageBilling: { imageCount: 15, creditsPerOutputImage: '1.250000' }, group: { width: 320, height: 400, base, layers: [] } },
  };
  const html = renderToStaticMarkup(<CanvasLayerNode item={item} scope={{}} />);
  expect(html).toContain('图层组 · 1 层（含底图）');
  expect(html).toContain('15 层 × 1.25 积分');
  expect(html).toContain('实扣 18.75 积分');
});

it('registers the edit result image with the shared canvas source updater', () => {
  const original = 'https://example.test/result.png';
  const item: CanvasImageItem = {
    id: 'result', x: 0, y: 0, width: 900, height: 506,
    item: { id: 'asset', type: 'image', content: '', name: '交互编辑结果', createdAt: 1,
      url: original, thumbnail: 'https://example.test/thumb.png' },
    layerResult: { mode: 'edit', status: 'success', requestId: 'edit-result',
      asset: { path: original, width: 2816, height: 1584, alpha: false, transparent: false } },
  };
  const getStableCanvasImageSource = vi.fn(() => original);
  const html = renderToStaticMarkup(<CanvasLayerNode item={item} scope={{ getStableCanvasImageSource }} />);
  expect(getStableCanvasImageSource).toHaveBeenCalledExactlyOnceWith(item);
  expect(html).toContain('data-canvas-main-media="true"');
  expect(html).toContain(`src="${original}"`);
  expect(html).not.toContain('thumb.png');
});
