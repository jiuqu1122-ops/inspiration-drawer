import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { createDefaultThreeSceneSpec } from '../model/normalizeThreeSceneSpec';
import { createThreeScenePreview } from '../preview/threeScenePreview';
import { ThreeSceneNode } from './ThreeSceneNode';

const renderNode = (status: 'idle' | 'working' | 'success' | 'error') => {
  const sceneSpec = createDefaultThreeSceneSpec();
  return renderToStaticMarkup(React.createElement(ThreeSceneNode, {
    data: {
      type: 'three-scene',
      sceneSpec,
      sourceImageId: 'front',
      sourceImageIds: ['front', 'side'],
      preview: createThreeScenePreview(sceneSpec),
      status,
      error: status === 'error' ? '模型返回的 3D 场景结构无效' : undefined,
      createdAt: 1,
    },
    references: [
      { id: 'front', name: '正面', source: 'https://example.com/front.jpg' },
      { id: 'side', name: '侧面', source: 'https://example.com/side.jpg' },
    ],
    active: false,
    analyzing: status === 'working',
    onOpenReferences: vi.fn(),
    onRemoveReference: vi.fn(),
    onGenerate: vi.fn(),
    onInteractionStart: vi.fn(),
    onInteractionEnd: vi.fn(),
    onSceneSpecChange: vi.fn(),
    onPreviewChange: vi.fn(),
    onOverlayChange: vi.fn(),
    onCapture: vi.fn(),
    onReanalyze: vi.fn(),
  }));
};

describe('ThreeSceneNode', () => {
  it('renders the idle node as a multi-reference generator', () => {
    const markup = renderNode('idle');
    expect(markup).toContain('3D 场景节点');
    expect(markup).toContain('2/8');
    expect(markup).toContain('已添加 2 个视角');
    expect(markup).toContain('生成场景');
  });

  it('keeps a useful error in the node instead of only showing a toast', () => {
    const markup = renderNode('error');
    expect(markup).toContain('模型返回的 3D 场景结构无效');
    expect(markup).toContain('重新生成');
  });
});
