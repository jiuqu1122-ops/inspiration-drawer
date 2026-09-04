import type { BufferItem } from '../../../types';
import type { CanvasImageItem, CanvasItemBox } from '../../canvasModel';
import type { CanvasThreeSceneData, SceneSpecV1 } from '../model/threeSceneTypes';
import { createDefaultThreeSceneSpec } from '../model/normalizeThreeSceneSpec';
import { createThreeScenePreview } from '../preview/threeScenePreview';

export const THREE_SCENE_NODE_SIZE = { width: 460, height: 340 };

const getSourcePath = (source: CanvasImageItem) => [
  source.item.path,
  source.item.sourceUrl,
  source.item.url,
]
  .map(value => String(value || '').trim())
  .find(value => value && !/^data:/i.test(value));

export const createThreeSceneGeneratorCanvasNode = (input: {
  id: string;
  bufferId: string;
  sources?: CanvasImageItem[];
  position: { x: number; y: number };
  createdAt?: number;
}): CanvasImageItem => {
  const createdAt = input.createdAt || Date.now();
  const sources = (input.sources || []).slice(0, 8);
  const sourceImagePaths = sources.map(getSourcePath).filter((value): value is string => !!value);
  const sceneSpec = createDefaultThreeSceneSpec();
  const preview = createThreeScenePreview(sceneSpec);
  return {
    id: input.id,
    item: {
      id: input.bufferId,
      type: 'three-scene',
      content: '使用一张或多张参考图片生成可编辑的 3D 构图场景',
      name: '3D 场景节点',
      thumbnail: preview,
      createdAt,
      isQuickAccess: false,
    },
    x: input.position.x,
    y: input.position.y,
    width: THREE_SCENE_NODE_SIZE.width,
    height: THREE_SCENE_NODE_SIZE.height,
    inputs: sources.map(source => source.id),
    threeScene: {
      type: 'three-scene',
      sceneSpec,
      sourceImageId: sources[0]?.id || '',
      sourceImageIds: sources.map(source => source.id),
      ...(sourceImagePaths[0] ? { sourceImagePath: sourceImagePaths[0] } : {}),
      ...(sourceImagePaths.length > 0 ? { sourceImagePaths } : {}),
      preview,
      referenceOverlay: { visible: true, opacity: 0.4, guides: false },
      status: 'idle',
      createdAt,
    },
  };
};

const intersects = (a: CanvasItemBox, b: CanvasItemBox) => (
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
);

export const findThreeSceneNodePosition = (
  source: CanvasImageItem,
  items: CanvasImageItem[],
) => {
  const gap = 64;
  const step = 52;
  let x = Math.max(24, source.x + source.width + gap);
  let y = Math.max(24, source.y);
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const box = { x, y, ...THREE_SCENE_NODE_SIZE };
    if (!items.some(item => item.id !== source.id && intersects(box, item))) return { x, y };
    y += step;
    if (attempt === 11) {
      x += THREE_SCENE_NODE_SIZE.width + gap;
      y = Math.max(24, source.y);
    }
  }
  return { x, y };
};

export const createThreeSceneCanvasNode = (input: {
  id: string;
  bufferId: string;
  source: CanvasImageItem;
  sceneSpec: SceneSpecV1;
  position: { x: number; y: number };
  createdAt?: number;
}): CanvasImageItem => {
  const createdAt = input.createdAt || Date.now();
  const preview = createThreeScenePreview(input.sceneSpec);
  const sourceImagePath = getSourcePath(input.source);
  const item: BufferItem = {
    id: input.bufferId,
    type: 'three-scene',
    content: '根据图片生成的可编辑 3D 构图',
    name: `${input.source.item.name || '图片'} · 3D 构图`,
    thumbnail: preview,
    createdAt,
    isQuickAccess: false,
  };
  const threeScene: CanvasThreeSceneData = {
    type: 'three-scene',
    sceneSpec: input.sceneSpec,
    analysisCamera: {
      position: [...input.sceneSpec.camera.position],
      target: [...input.sceneSpec.camera.target],
      fov: input.sceneSpec.camera.fov,
    },
    sourceImageId: input.source.id,
    sourceImageIds: [input.source.id],
    ...(sourceImagePath ? { sourceImagePath } : {}),
    ...(sourceImagePath ? { sourceImagePaths: [sourceImagePath] } : {}),
    preview,
    referenceOverlay: { visible: true, opacity: 0.4, guides: false },
    status: 'success',
    createdAt,
  };
  return {
    id: input.id,
    item,
    x: input.position.x,
    y: input.position.y,
    width: THREE_SCENE_NODE_SIZE.width,
    height: THREE_SCENE_NODE_SIZE.height,
    threeScene,
  };
};

export const createThreeSceneCaptureCanvasNode = (input: {
  id: string;
  bufferId: string;
  path: string;
  url: string;
  fileName: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  createdAt?: number;
}): CanvasImageItem => {
  const createdAt = input.createdAt || Date.now();
  return {
    id: input.id,
    item: {
      id: input.bufferId,
      type: 'image',
      content: '3D 当前视角',
      name: input.fileName,
      path: input.path,
      url: input.url,
      createdAt,
      isQuickAccess: false,
    },
    x: input.position.x,
    y: input.position.y,
    width: input.size.width,
    height: input.size.height,
  };
};
