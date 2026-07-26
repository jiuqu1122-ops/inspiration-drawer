import type { CanvasWorkflowNodeTemplate, CanvasWorkflowTemplate } from './canvasTemplates';

const DATA_IMAGE_PATTERN = /^data:image\/[a-zA-Z0-9.+-]+;base64,/i;

const isEmbeddedImage = (value?: string | null) => (
  DATA_IMAGE_PATTERN.test(String(value || '').trim())
);

const getFixedImageSources = (node: CanvasWorkflowNodeTemplate) => (
  [node.item.url, node.item.path, node.item.sourceUrl, node.item.originalUrl, node.item.thumbnail]
    .map(value => String(value || '').trim())
    .filter((value, index, values) => value && values.indexOf(value) === index)
);

const isPortableFixedImageNode = (node: CanvasWorkflowNodeTemplate) => (
  node.fixedInput === true
  && node.item.type === 'image'
  && node.acceptsExternalInputs !== true
  && node.bridgeType !== 'reference_image'
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
