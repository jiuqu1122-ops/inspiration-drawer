import { invoke, isTauri } from '@tauri-apps/api/core';
import { formatReferenceUploadError } from '../../referenceUploadError';
import type { LayerCatalog, LayerMode, LayerReceipt, LayerSelection } from './canvasLayerTypes';

export type LayerRequest = { operation: LayerMode; clientRequestId: string; image: string; prompt: string; expectedCredits: string; expectedCreditsPerOutputImage?: string; selection?: LayerSelection };

const cloudDevOrigin = import.meta.env.VITE_CANVAS_LAYER_CLOUD_DEV_ORIGIN;
const usesCloudInDev = cloudDevOrigin && cloudDevOrigin === globalThis.location?.origin;
export const canvasLayerMockUrl = import.meta.env.DEV && import.meta.env.VITE_CANVAS_LAYER_MOCK === '1' && !usesCloudInDev
  ? import.meta.env.VITE_CANVAS_LAYER_MOCK_URL || 'http://127.0.0.1:4137'
  : '';
async function mockRequest<T>(path: string, request?: unknown): Promise<T> {
  const response = await fetch(canvasLayerMockUrl + path, request ? {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
  } : undefined);
  const body = await response.json();
  if (!response.ok) throw new Error(`${body.error}: ${body.message}`);
  return body;
}
export const getLayerCatalog = async (): Promise<LayerCatalog> => {
  const catalog = await (canvasLayerMockUrl
    ? mockRequest<{canvasLayers: LayerCatalog}>('/v1/ai/catalog').then(value => value.canvasLayers)
    : invoke<LayerCatalog | null>('cloud_canvas_layer_catalog'));
  return { split: catalog?.split ?? [], edit: catalog?.edit ?? [], referenceUpload: catalog?.referenceUpload === true };
};

const maximumReferenceBytes = 10 * 1024 * 1024;

export async function prepareLayerRequestImage(image: string, referenceUpload: boolean): Promise<string> {
  if (!referenceUpload || canvasLayerMockUrl || !isTauri()) return image;
  const encodedLength = image.length - image.indexOf(',') - 1;
  const padding = image.endsWith('==') ? 2 : image.endsWith('=') ? 1 : 0;
  if (encodedLength * 3 / 4 - padding > maximumReferenceBytes) return image;

  try {
    const [key] = await invoke<string[]>('upload_wallet_reference_images', { sources: [image], preserveImage: true });
    if (!/^reference-images\/\S+$/.test(key ?? '')) throw new Error('服务器未返回有效的图片引用');
    return key;
  } catch (error) {
    throw new Error(formatReferenceUploadError(error));
  }
}

export const submitLayer = (request: LayerRequest) => canvasLayerMockUrl
  ? mockRequest<LayerReceipt>('/v1/ai/canvas-layers', request)
  : invoke<LayerReceipt>('submit_cloud_canvas_layer', { request });
export const lookupLayer = (requestId: string) => canvasLayerMockUrl
  ? mockRequest<LayerReceipt>('/v1/ai/canvas-layers/by-request/' + encodeURIComponent(requestId))
  : invoke<LayerReceipt>('get_cloud_canvas_layer', { requestId });
