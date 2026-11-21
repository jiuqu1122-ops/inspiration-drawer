import { invoke, isTauri } from '@tauri-apps/api/core';
import { afterEach, expect, it, vi } from 'vitest';
import { getLayerCatalog, prepareLayerRequestImage, submitLayer } from './canvasLayerApi';
import { normalizeLayerInput } from './canvasLayerAssets';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn(() => true) }));

afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

it('uploads the exact normalized bytes before submitting only the image reference', async () => {
  const native = vi.mocked(invoke);
  const image = 'data:image/png;base64,AAAA';
  const key = 'reference-images/input.png';
  vi.mocked(isTauri).mockReturnValue(true);
  native.mockResolvedValueOnce({ edit: [], referenceUpload: true })
    .mockResolvedValueOnce([key]).mockResolvedValueOnce({ status: 'processing' });

  const catalog = await getLayerCatalog();
  const source = await prepareLayerRequestImage(image, catalog.referenceUpload === true);
  const request = { operation: 'split' as const, clientRequestId: 'canvas-layer-test', image: source, prompt: '', expectedCredits: '35' };
  await submitLayer(request);

  expect(native.mock.calls).toEqual([
    ['cloud_canvas_layer_catalog'],
    ['upload_wallet_reference_images', { sources: [image], preserveImage: true }],
    ['submit_cloud_canvas_layer', { request: { ...request, image: key } }],
  ]);
});

it('keeps the original inline request for older servers and images larger than the signed upload limit', async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockResolvedValueOnce({ split: [], edit: [] });
  const catalog = await getLayerCatalog();
  const smallImage = 'data:image/jpeg;base64,AAAA';
  const largeImage = 'data:image/png;base64,' + 'A'.repeat(4 * Math.ceil((10 * 1024 * 1024 + 1) / 3));
  expect(await prepareLayerRequestImage(smallImage, catalog.referenceUpload === true)).toBe(smallImage);
  expect(await prepareLayerRequestImage(largeImage, true)).toBe(largeImage);
  expect(invoke).toHaveBeenCalledExactlyOnceWith('cloud_canvas_layer_catalog');
});

it('keeps a failed signed upload separate from the layer task submission', async () => {
  vi.mocked(isTauri).mockReturnValue(true);
  vi.mocked(invoke).mockRejectedValueOnce('上传图片文件失败：连接超时');
  await expect(prepareLayerRequestImage('data:image/jpeg;base64,AAAA', true)).rejects.toThrow('上传图片文件失败：连接超时');
  expect(invoke).toHaveBeenCalledTimes(1);
});

it('preserves the visible JPEG dimensions and passes transparent PNG through unchanged', async () => {
  const drawImage = vi.fn();
  const toDataURL = vi.fn(() => 'data:image/jpeg;base64,BAAA');
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), toDataURL };
  vi.stubGlobal('document', { createElement: () => canvas });
  vi.stubGlobal('Image', class MockImage {
    naturalWidth = 2752;
    naturalHeight = 1536;
    onload?: () => void;
    set src(_value: string) { this.onload?.(); }
  });

  const png = 'data:image/png;base64,AAAA';
  expect(await normalizeLayerInput(png)).toBe(png);
  expect(drawImage).not.toHaveBeenCalled();
  expect(await normalizeLayerInput('data:image/jpeg;base64,AAAA')).toBe('data:image/jpeg;base64,BAAA');
  expect([canvas.width, canvas.height]).toEqual([2752, 1536]);
  expect(toDataURL).toHaveBeenCalledExactlyOnceWith('image/jpeg', 0.92);
});
