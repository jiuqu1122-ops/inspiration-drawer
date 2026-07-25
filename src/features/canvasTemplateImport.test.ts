import { describe, expect, it } from 'vitest';
import { getCanvasTemplateImportCandidates, parseCanvasTemplateJson } from './canvasTemplateImport';

const preset = { id: 'preset-1', label: '产品渲染', prompt: 'Render the product.' };
const workflow = {
  id: 'workflow-1',
  label: '详情页工作流',
  nodes: [{ id: 'node-1', item: { type: 'text', content: '' }, ai: { type: 'image-generator' } }],
};

describe('canvas template JSON import recognition', () => {
  it('recognizes a single node preset JSON object', () => {
    expect(getCanvasTemplateImportCandidates(preset)).toEqual({ presets: [preset], workflows: [] });
  });

  it('recognizes a single workflow preset JSON object', () => {
    expect(getCanvasTemplateImportCandidates(workflow)).toEqual({ presets: [], workflows: [workflow] });
  });

  it('recognizes exported bundles and raw arrays', () => {
    expect(parseCanvasTemplateJson(JSON.stringify({
      type: 'inspiration-drawer-canvas-templates',
      version: 1,
      presets: [preset],
      workflows: [workflow],
    }))).toEqual({ presets: [preset], workflows: [workflow] });
    expect(getCanvasTemplateImportCandidates([preset, workflow])).toEqual({
      presets: [preset],
      workflows: [workflow],
    });
  });

  it('does not recognize arbitrary JSON as a canvas template', () => {
    expect(getCanvasTemplateImportCandidates({ name: 'ordinary data', items: [] }))
      .toEqual({ presets: [], workflows: [] });
  });
});
