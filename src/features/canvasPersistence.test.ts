import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from './canvasModel';
import { sanitizeCanvasPersistedState } from './canvasPersistence';

const createWorkingNode = (): CanvasImageItem => ({
  id: 'node-1',
  x: 0,
  y: 0,
  width: 320,
  height: 320,
  item: {
    id: 'item-1',
    type: 'image',
    content: 'working image',
    createdAt: 1,
  },
  ai: {
    type: 'image-generator',
    status: 'working',
    generatedAt: 1,
    outputs: [{
      id: 'output-1',
      mediaType: 'image',
      status: 'working',
      generatedAt: 1,
    }],
  },
} as CanvasImageItem);

describe('canvas persistence task recovery', () => {
  it('marks an orphaned working node as interrupted after a real restart', () => {
    const restored = sanitizeCanvasPersistedState({ items: [createWorkingNode()] });

    expect(restored.items[0]?.ai?.status).toBe('error');
    expect(restored.items[0]?.ai?.error).toContain('上次生成已中断');
  });

  it('keeps a registered background task working while switching canvases', () => {
    const restored = sanitizeCanvasPersistedState(
      { items: [createWorkingNode()] },
      { activeRunNodeIds: new Set(['node-1']) },
    );

    expect(restored.items[0]?.ai?.status).toBe('working');
    expect(restored.items[0]?.ai?.outputs?.[0]?.status).toBe('working');
  });
});
