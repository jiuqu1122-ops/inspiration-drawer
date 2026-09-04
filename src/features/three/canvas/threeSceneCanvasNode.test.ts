import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import { createDefaultThreeSceneSpec } from '../model/normalizeThreeSceneSpec';
import { normalizeSceneAnalysis } from '../model/threeSceneAnalysisSchema';
import { sanitizeCanvasPersistedState } from '../../../utils/canvasSerialization';
import {
  createThreeSceneCanvasNode,
  createThreeSceneCaptureCanvasNode,
  createThreeSceneGeneratorCanvasNode,
  findThreeSceneNodePosition,
} from './threeSceneCanvasNode';

const source: CanvasImageItem = {
  id: 'canvas-source',
  item: {
    id: 'source',
    type: 'image',
    content: '产品图',
    name: 'product.png',
    path: 'C:\\assets\\product.png',
    createdAt: 1,
  },
  x: 100,
  y: 120,
  width: 300,
  height: 220,
};

describe('three scene canvas nodes', () => {
  it('creates an idle generator node with ordered multi-view inputs', () => {
    const side = {
      ...source,
      id: 'canvas-side',
      item: { ...source.item, id: 'side', name: 'side.png', path: 'C:\\assets\\side.png' },
    };
    const node = createThreeSceneGeneratorCanvasNode({
      id: 'canvas-three-generator',
      bufferId: 'three-generator',
      sources: [source, side],
      position: { x: 500, y: 120 },
      createdAt: 2,
    });

    expect(node.item.type).toBe('three-scene');
    expect(node.inputs).toEqual(['canvas-source', 'canvas-side']);
    expect(node.threeScene?.status).toBe('idle');
    expect(node.threeScene?.sourceImageIds).toEqual(['canvas-source', 'canvas-side']);
    expect(node.threeScene?.sourceImagePaths).toEqual([
      'C:\\assets\\product.png',
      'C:\\assets\\side.png',
    ]);

    const persisted = sanitizeCanvasPersistedState({
      items: [JSON.parse(JSON.stringify(node))],
      size: { width: 4000, height: 2400 },
      scale: 1,
      scroll: { left: 0, top: 0 },
      updatedAt: 2,
    });
    expect(persisted.items[0].threeScene?.status).toBe('idle');
    expect(persisted.items[0].threeScene?.analysisCamera).toBeUndefined();
  });

  it('creates a serializable 3D node linked to its source image', () => {
    const sceneSpec = createDefaultThreeSceneSpec();
    const node = createThreeSceneCanvasNode({
      id: 'canvas-three',
      bufferId: 'three',
      source,
      sceneSpec,
      position: { x: 464, y: 120 },
      createdAt: 2,
    });
    if (!node.threeScene) throw new Error('Expected 3D scene data');
    node.threeScene.sceneAnalysis = normalizeSceneAnalysis({
      composition: {
        subjectCenter: [0.42, 0.58],
        subjectWidth: 0.61,
        subjectHeight: 0.45,
        subjectOrientation: 'front-right',
      },
      subject: { shapeHint: 'rounded-box', aspect: [1.8, 1, 1.2] },
    });
    node.threeScene.referenceOverlay = { visible: true, opacity: 0.36, guides: true };
    const reloaded = JSON.parse(JSON.stringify(node)) as CanvasImageItem;

    expect(reloaded.item.type).toBe('three-scene');
    expect(reloaded.threeScene?.sourceImageId).toBe(source.id);
    expect(reloaded.threeScene?.sourceImagePath).toBe(source.item.path);
    expect(reloaded.threeScene?.sceneSpec).toEqual(sceneSpec);
    expect(reloaded.threeScene?.analysisCamera).toEqual({
      position: sceneSpec.camera.position,
      target: sceneSpec.camera.target,
      fov: sceneSpec.camera.fov,
    });

    const persisted = sanitizeCanvasPersistedState({
      items: [reloaded],
      size: { width: 4000, height: 2400 },
      scale: 1,
      scroll: { left: 0, top: 0 },
      updatedAt: 2,
    });
    expect(persisted.items[0].threeScene?.sceneSpec).toEqual(sceneSpec);
    expect(persisted.items[0].threeScene?.sceneAnalysis?.composition.subjectCenter).toEqual([0.42, 0.58]);
    expect(persisted.items[0].threeScene?.sceneAnalysis?.subject.shapeHint).toBe('rounded-box');
    expect(persisted.items[0].threeScene?.referenceOverlay).toEqual({
      visible: true,
      opacity: 0.36,
      guides: true,
    });
  });

  it('places a generated scene to the right without covering existing nodes', () => {
    const blocker: CanvasImageItem = {
      ...source,
      id: 'blocker',
      x: source.x + source.width + 64,
      y: source.y,
      width: 460,
      height: 340,
    };
    const position = findThreeSceneNodePosition(source, [source, blocker]);
    expect(position.x).toBe(source.x + source.width + 64);
    expect(position.y).toBeGreaterThan(source.y);
  });

  it('creates captures as ordinary image nodes', () => {
    const node = createThreeSceneCaptureCanvasNode({
      id: 'canvas-capture',
      bufferId: 'capture',
      path: 'C:\\assets\\view.png',
      url: 'asset://view.png',
      fileName: 'view.png',
      position: { x: 800, y: 120 },
      size: { width: 640, height: 420 },
      createdAt: 3,
    });
    expect(node.item.type).toBe('image');
    expect(node.item.path).toBe('C:\\assets\\view.png');
    expect(node.threeScene).toBeUndefined();
  });
});
