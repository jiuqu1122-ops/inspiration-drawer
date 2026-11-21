import { convertFileSrc, invoke, isTauri } from '@tauri-apps/api/core';
import type { CanvasLayerGroup, LayerAsset, LayerOutput } from './canvasLayerTypes';
import { canvasLayerMockUrl } from './canvasLayerApi';

export const layerAssetUrl = (path: string) => /^https?:\/\//.test(path) ? path : convertFileSrc(path);
export const orderedLayers = (group: CanvasLayerGroup) => [...group.layers].sort((a, b) => a.order - b.order);
export function loadLayerImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    if (/^(https?:\/\/|asset:)/i.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('无法读取图层素材'));
    image.src = src;
  });
}
export const makeLayerCanvas = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('无法创建图层画布');
  return { canvas, context };
};
export async function composeLayerGroup(group: CanvasLayerGroup, maxEdge = Infinity) {
  const scale = Math.min(1, maxEdge / Math.max(group.width, group.height));
  const { canvas, context } = makeLayerCanvas(Math.max(1, Math.round(group.width * scale)), Math.max(1, Math.round(group.height * scale)));
  context.scale(canvas.width / group.width, canvas.height / group.height);
  context.drawImage(await loadLayerImage(layerAssetUrl(group.base.path)), 0, 0);
  for (const layer of orderedLayers(group)) {
    if (layer.hidden) continue;
    context.globalAlpha = layer.opacity;
    context.drawImage(await loadLayerImage(layerAssetUrl(layer.path)), layer.x, layer.y);
  }
  return canvas;
}
export async function saveLayerPng(dataUrl: string, name: string) {
  if (canvasLayerMockUrl && !isTauri()) {
    const response = await fetch(canvasLayerMockUrl + '/fixture/cache', { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ image: dataUrl }) });
    if (!response.ok) throw new Error('无法保存本地图层缓存');
    return (await response.json() as { url: string }).url;
  }
  return invoke<string>('save_dropped_file', { fileName: name + '.png', dataUrl });
}
export async function cacheLayerComposite(group: CanvasLayerGroup, name: string) {
  const full = await composeLayerGroup(group);
  const scale = Math.min(1, 640 / Math.max(group.width, group.height));
  const thumb = makeLayerCanvas(Math.max(1, Math.round(group.width * scale)), Math.max(1, Math.round(group.height * scale)));
  thumb.context.drawImage(full, 0, 0, thumb.canvas.width, thumb.canvas.height);
  const [path, thumbnail] = await Promise.all([
    saveLayerPng(full.toDataURL('image/png'), name),
    saveLayerPng(thumb.canvas.toDataURL('image/png'), name + '-preview'),
  ]);
  return { path, url: layerAssetUrl(path), thumbnail: layerAssetUrl(thumbnail) };
}
export async function cacheLayerResult(output: LayerOutput, name: string, readImage: (source: string, optimize?: boolean) => Promise<string>) {
  const paths: string[] = [];
  for (const [index, asset] of output.assets.entries()) {
    if (!/^https?:\/\//.test(asset)) throw new Error('图层素材链接无效');
    // Desktop cache is independent of server cache retention.
    paths.push(isTauri() ? await saveLayerPng(await readImage(asset, false), name + '-' + index) : asset);
  }
  const resolve = <T extends Omit<LayerAsset, 'path'> & { asset: number }>(input: T) => {
    const { asset, ...metadata } = input;
    const path = paths[asset];
    if (!path) throw new Error('图层素材不完整');
    return { ...metadata, path };
  };
  return output.operation === 'split'
    ? { group: { width: output.width, height: output.height, base: resolve(output.base), layers: output.layers.map(resolve) } }
    : { asset: resolve(output.image) };
}
export async function normalizeLayerInput(dataUrl: string) {
  if (dataUrl.startsWith('data:image/png;base64,')) return dataUrl;
  // Decode to the same visible orientation as the selection preview, including EXIF-rotated photos.
  const source = await loadLayerImage(dataUrl);
  const { canvas, context } = makeLayerCanvas(source.naturalWidth, source.naturalHeight);
  context.drawImage(source, 0, 0);
  if (/^data:image\/jpe?g;base64,/i.test(dataUrl)) return canvas.toDataURL('image/jpeg', 0.92);
  return canvas.toDataURL('image/png');
}
