import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';
import { composeLayerGroup, layerAssetUrl, loadLayerImage, makeLayerCanvas, orderedLayers } from './canvasLayerAssets';
import type { CanvasLayerGroup, LayerAsset } from './canvasLayerTypes';

async function pixels(asset: LayerAsset) {
  const { context } = makeLayerCanvas(asset.width, asset.height);
  context.drawImage(await loadLayerImage(layerAssetUrl(asset.path)), 0, 0);
  return context.getImageData(0, 0, asset.width, asset.height);
}

export async function buildLayerPsd(group: CanvasLayerGroup) {
  const { writePsdUint8Array } = await import('ag-psd');
  const composite = await composeLayerGroup(group);
  const children = [{ name: '底图', left: 0, top: 0, opacity: 1, hidden: false, imageData: await pixels(group.base) }];
  for (const layer of orderedLayers(group)) {
    children.push({ name: layer.name, left: layer.x, top: layer.y, opacity: layer.opacity,
      hidden: !!layer.hidden, imageData: await pixels(layer) });
  }
  return writePsdUint8Array({ width: group.width, height: group.height, children,
    imageData: composite.getContext('2d')!.getImageData(0, 0, group.width, group.height) }, { trimImageData: false });
}

export async function buildLayerPngZip(group: CanvasLayerGroup) {
  const { zipSync, strToU8 } = await import('fflate');
  const files: Record<string, Uint8Array> = {};
  const read = async (asset: LayerAsset) => {
    const image = await loadLayerImage(layerAssetUrl(asset.path));
    const { canvas, context } = makeLayerCanvas(asset.width, asset.height);
    context.drawImage(image, 0, 0);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('无法导出 PNG');
    return new Uint8Array(await blob.arrayBuffer());
  };
  files['base.png'] = await read(group.base);
  const layers = [];
  for (const { path, ...layer } of orderedLayers(group)) {
    const file = `layer-${String(layer.order + 1).padStart(2, '0')}.png`;
    files[file] = await read({ ...layer, path });
    layers.push({ ...layer, file });
  }
  files['layers.json'] = strToU8(JSON.stringify({ version: 1, width: group.width, height: group.height,
    base: { file: 'base.png', x: 0, y: 0, width: group.width, height: group.height }, order: 'bottom-to-top', layers }, null, 2));
  return zipSync(files, { level: 0 });
}

export async function exportLayerGroup(group: CanvasLayerGroup, format: 'psd' | 'zip') {
  const filename = '图层组.' + format;
  const path = isTauri() ? await save({ defaultPath: filename, filters: [{ name: format === 'psd' ? 'Photoshop PSD' : 'PNG 图层组 ZIP', extensions: [format] }] }) : null;
  if (isTauri() && !path) return;
  const bytes = format === 'psd' ? await buildLayerPsd(group) : await buildLayerPngZip(group);
  if (path) { await writeFile(path, bytes); return; }
  const href = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer]));
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}
