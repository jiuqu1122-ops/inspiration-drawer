import type {
  CanvasWorkflowNodeTemplate,
  CanvasWorkflowTemplate,
} from './canvasTemplates';
import type {
  CanvasWorkflowRuntime,
  CanvasWorkflowSlotAsset,
} from './canvasModel';
import {
  isConcreteFixedImageNode,
  isReplaceableInternalImageSlot,
  normalizeCanvasWorkflowRuntime,
  normalizeCanvasWorkflowSlotAsset,
} from './canvasWorkflowInternalSlots';

const DATA_IMAGE_PATTERN = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;

const isEmbeddedImage = (value?: string | null) => (
  DATA_IMAGE_PATTERN.test(String(value || '').trim())
);

const getFixedImageSources = (node: CanvasWorkflowNodeTemplate) => (
  [node.item.url, node.item.path, node.item.sourceUrl, node.item.originalUrl, node.item.thumbnail]
    .map(value => String(value || '').trim())
    .filter((value, index, values) => value && values.indexOf(value) === index)
);

export const isPortableFixedImageNode = (node: CanvasWorkflowNodeTemplate) => (
  isConcreteFixedImageNode(node)
  && node.internalSlot?.mode !== 'replaceable_internal'
);

export const hasCanvasWorkflowConcreteFixedImage = (workflow: CanvasWorkflowTemplate) => (
  workflow.nodes.some(node => (
    isPortableFixedImageNode(node)
    && getFixedImageSources(node).length > 0
  ))
);

const getEmbeddedImageExtension = (dataUrl: string) => {
  const mime = dataUrl.match(/^data:image\/([^;,]+)/i)?.[1]?.toLowerCase() || '';
  if (mime === 'jpeg' || mime === 'jpg') return 'jpg';
  if (mime === 'svg+xml') return 'svg';
  if (mime === 'x-ms-bmp') return 'bmp';
  return mime.replace(/[^a-z0-9]/g, '') || 'png';
};

const getFixedImageFileName = (node: CanvasWorkflowNodeTemplate, index: number, dataUrl: string) => {
  const rawName = String(node.item.name || node.item.content || `workflow-reference-${index + 1}`).trim();
  const stem = rawName.replace(/\.[a-zA-Z0-9]+$/, '') || `workflow-reference-${index + 1}`;
  return `${stem}.${getEmbeddedImageExtension(dataUrl)}`;
};

export const embedCanvasWorkflowFixedImages = async (
  workflows: CanvasWorkflowTemplate[],
  readImageDataUrl: (source: string) => Promise<string>,
) => Promise.all(workflows.map(async workflow => ({
  ...workflow,
  nodes: await Promise.all(workflow.nodes.map(async node => {
    if (isReplaceableInternalImageSlot(node)) {
      const defaultValue = node.internalSlot?.defaultValue;
      const defaultSources = [defaultValue?.url, defaultValue?.path]
        .map(value => String(value || '').trim())
        .filter(Boolean);
      let embeddedDefault = defaultSources.find(isEmbeddedImage) || '';
      for (const source of embeddedDefault ? [] : defaultSources) {
        try {
          const candidate = String(await readImageDataUrl(source) || '').trim();
          if (isEmbeddedImage(candidate)) {
            embeddedDefault = candidate;
            break;
          }
        } catch (_) {
          // A missing optional default must not block exporting the slot schema.
        }
      }
      return {
        ...node,
        fixedInput: true,
        acceptsExternalInputs: false,
        externalInputTypes: undefined,
        bridgeType: undefined,
        internalSlot: {
          ...node.internalSlot!,
          defaultValue: embeddedDefault
            ? { ...defaultValue, url: embeddedDefault, path: undefined }
            : defaultValue
              ? { sourceItemId: defaultValue.sourceItemId }
              : undefined,
        },
        item: {
          ...node.item,
          url: undefined,
          path: undefined,
          thumbnail: undefined,
          sourceUrl: undefined,
          originalUrl: undefined,
        },
      };
    }
    if (!isPortableFixedImageNode(node)) return node;

    const sources = getFixedImageSources(node);
    let dataUrl = sources.find(isEmbeddedImage) || '';
    let lastError: unknown = null;
    if (!dataUrl) {
      for (const source of sources) {
        try {
          const candidate = String(await readImageDataUrl(source) || '').trim();
          if (isEmbeddedImage(candidate)) {
            dataUrl = candidate;
            break;
          }
        } catch (error) {
          lastError = error;
        }
      }
    }

    if (!dataUrl) {
      const label = String(node.item.name || node.item.content || node.id || '固定参考图');
      const detail = lastError instanceof Error && lastError.message ? `：${lastError.message}` : '';
      throw new Error(`固定参考图“${label}”无法读取${detail}`);
    }

    return {
      ...node,
      fixedInput: true,
      acceptsExternalInputs: false,
      externalInputTypes: undefined,
      bridgeType: undefined,
      item: {
        ...node.item,
        url: dataUrl,
        path: undefined,
        thumbnail: undefined,
        sourceUrl: undefined,
        originalUrl: undefined,
      },
    };
  })),
})));

export const materializeCanvasWorkflowFixedImages = async (
  workflows: CanvasWorkflowTemplate[],
  saveImageDataUrl: (fileName: string, dataUrl: string) => Promise<string>,
  getDisplayUrl: (path: string) => string,
) => {
  const materialized: CanvasWorkflowTemplate[] = [];
  // Intentionally restore one image at a time. A workflow can contain multiple
  // multi-megabyte data URLs, and parallel IPC calls briefly duplicate all of
  // them in WebView2 and Rust.
  for (const workflow of workflows) {
    const nodes: CanvasWorkflowNodeTemplate[] = [];
    for (let index = 0; index < workflow.nodes.length; index += 1) {
      const node = workflow.nodes[index];
      if (node && isReplaceableInternalImageSlot(node)) {
        const defaultValue = node.internalSlot?.defaultValue;
        const dataUrl = String(defaultValue?.url || '').trim();
        if (!isEmbeddedImage(dataUrl)) {
          nodes.push({
            ...node,
            item: {
              ...node.item,
              url: defaultValue?.url,
              path: defaultValue?.path,
              sourceItemId: defaultValue?.sourceItemId,
            },
          });
          continue;
        }
        const fileName = getFixedImageFileName(node, index, dataUrl);
        const path = String(await saveImageDataUrl(fileName, dataUrl) || '').trim();
        if (!path) throw new Error(`槽位“${node.internalSlot?.label || node.id}”默认图片缓存失败`);
        const displayUrl = getDisplayUrl(path);
        nodes.push({
          ...node,
          internalSlot: {
            ...node.internalSlot!,
            defaultValue: {
              ...defaultValue,
              url: displayUrl,
              path,
            },
          },
          item: {
            ...node.item,
            url: displayUrl,
            path,
            sourceItemId: defaultValue?.sourceItemId,
          },
        });
        continue;
      }
      if (!node || !isPortableFixedImageNode(node)) {
        if (node) nodes.push(node);
        continue;
      }
      const dataUrl = getFixedImageSources(node).find(isEmbeddedImage) || '';
      const existingPath = String(node.item.path || '').trim();
      if (!dataUrl) {
        nodes.push(existingPath
          ? {
              ...node,
              item: {
                ...node.item,
                url: getDisplayUrl(existingPath),
                path: existingPath,
              },
            }
          : node);
        continue;
      }

      const fileName = getFixedImageFileName(node, index, dataUrl);
      const path = String(await saveImageDataUrl(fileName, dataUrl) || '').trim();
      if (!path) {
        throw new Error(`固定参考图“${node.item.name || node.item.content || node.id}”缓存失败`);
      }
      nodes.push({
        ...node,
        fixedInput: true,
        acceptsExternalInputs: false,
        externalInputTypes: undefined,
        bridgeType: undefined,
        item: {
          ...node.item,
          url: getDisplayUrl(path),
          path,
          thumbnail: undefined,
          sourceUrl: undefined,
          originalUrl: undefined,
        },
      });
    }
    materialized.push({ ...workflow, nodes });
  }
  return materialized;
};

export type CanvasWorkflowInstancePortableExport = {
  type: 'inspiration-drawer-workflow-instance';
  version: 1;
  workflow: CanvasWorkflowTemplate;
  runtime?: CanvasWorkflowRuntime;
};

const getSlotAssetSources = (asset: CanvasWorkflowSlotAsset) => (
  [asset.url, asset.path, asset.originalUrl, asset.thumbnail]
    .map(value => String(value || '').trim())
    .filter((value, index, values) => value && values.indexOf(value) === index)
);

const embedSlotAsset = async (
  asset: CanvasWorkflowSlotAsset,
  readImageDataUrl: (source: string) => Promise<string>,
) => {
  let embedded = getSlotAssetSources(asset).find(isEmbeddedImage) || '';
  for (const source of embedded ? [] : getSlotAssetSources(asset)) {
    try {
      const candidate = String(await readImageDataUrl(source) || '').trim();
      if (isEmbeddedImage(candidate)) {
        embedded = candidate;
        break;
      }
    } catch (_) {
      // Keep trying the other local/remote representations.
    }
  }
  if (!embedded) return null;
  return {
    ...asset,
    url: embedded,
    path: undefined,
    thumbnail: undefined,
    originalUrl: undefined,
  };
};

export const exportCanvasWorkflowInstance = async (input: {
  workflow: CanvasWorkflowTemplate;
  runtime?: unknown;
  includeInternalSlotAssets?: boolean;
  readImageDataUrl: (source: string) => Promise<string>;
}): Promise<CanvasWorkflowInstancePortableExport> => {
  const [workflow] = await embedCanvasWorkflowFixedImages(
    [input.workflow],
    input.readImageDataUrl,
  );
  if (!input.includeInternalSlotAssets) {
    return {
      type: 'inspiration-drawer-workflow-instance',
      version: 1,
      workflow,
    };
  }
  const runtime = normalizeCanvasWorkflowRuntime(input.runtime);
  const internalSlotBindings: CanvasWorkflowRuntime['internalSlotBindings'] = {};
  for (const [slotId, binding] of Object.entries(runtime.internalSlotBindings || {})) {
    const assets: CanvasWorkflowSlotAsset[] = [];
    for (const asset of binding.assets) {
      const embedded = await embedSlotAsset(asset, input.readImageDataUrl);
      if (!embedded) {
        throw new Error(`槽位“${slotId}”中的图片无法读取，实例导出已停止`);
      }
      assets.push(embedded);
    }
    internalSlotBindings[slotId] = { slotId, assets };
  }
  return {
    type: 'inspiration-drawer-workflow-instance',
    version: 1,
    workflow,
    runtime: {
      ...runtime,
      internalSlotBindings,
    },
  };
};

export const materializeCanvasWorkflowInstance = async (input: {
  portable: CanvasWorkflowInstancePortableExport;
  saveImageDataUrl: (fileName: string, dataUrl: string) => Promise<string>;
  getDisplayUrl: (path: string) => string;
}) => {
  const [workflow] = await materializeCanvasWorkflowFixedImages(
    [input.portable.workflow],
    input.saveImageDataUrl,
    input.getDisplayUrl,
  );
  const runtime = normalizeCanvasWorkflowRuntime(input.portable.runtime);
  const internalSlotBindings: CanvasWorkflowRuntime['internalSlotBindings'] = {};
  for (const [slotId, binding] of Object.entries(runtime.internalSlotBindings || {})) {
    const assets: CanvasWorkflowSlotAsset[] = [];
    for (let index = 0; index < binding.assets.length; index += 1) {
      const asset = binding.assets[index];
      const dataUrl = getSlotAssetSources(asset).find(isEmbeddedImage) || '';
      if (!dataUrl) {
        const normalized = normalizeCanvasWorkflowSlotAsset(asset);
        if (normalized) assets.push(normalized);
        continue;
      }
      const extension = getEmbeddedImageExtension(dataUrl);
      const safeSlotId = slotId.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80) || 'slot';
      const path = await input.saveImageDataUrl(
        `${safeSlotId}-${index + 1}.${extension}`,
        dataUrl,
      );
      const normalized = normalizeCanvasWorkflowSlotAsset({
        ...asset,
        url: input.getDisplayUrl(path),
        path,
        thumbnail: undefined,
        originalUrl: undefined,
      });
      if (normalized) assets.push(normalized);
    }
    internalSlotBindings[slotId] = { slotId, assets };
  }
  return {
    workflow,
    runtime: {
      ...runtime,
      internalSlotBindings,
    } as CanvasWorkflowRuntime,
  };
};
