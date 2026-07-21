import { describe, expect, it } from 'vitest';
import type { CanvasWorkflowTemplate } from './canvasTemplates';
import {
  estimateCanvasImageGenerationCredits,
  estimateCanvasWorkflowCredits,
  getCanvasImageUnitCredits,
  shouldShowCanvasGenerationCredits,
} from './canvasGenerationCredits';

describe('canvas generation credits', () => {
  it('only displays estimates for wallet credits', () => {
    expect(shouldShowCanvasGenerationCredits('wallet')).toBe(true);
    expect(shouldShowCanvasGenerationCredits('local')).toBe(false);
    expect(shouldShowCanvasGenerationCredits(undefined)).toBe(false);
  });

  it('uses the wallet image pricing table', () => {
    expect(getCanvasImageUnitCredits('Xais img2_1k', '4k')).toBe(10);
    expect(getCanvasImageUnitCredits('gpt-image-2', '2k')).toBe(15);
    expect(getCanvasImageUnitCredits('Xais Img2_4K', '2k')).toBe(18);
    expect(getCanvasImageUnitCredits('Xais Img2_4K(高画质)', '2k')).toBe(35);
    expect(getCanvasImageUnitCredits('Xais Nano Pro_2K', '4k')).toBe(18);
    expect(getCanvasImageUnitCredits('Nano Banana Pro', '4k')).toBe(20);
    expect(getCanvasImageUnitCredits('Nano Banana 2', '2k')).toBe(15);
    expect(getCanvasImageUnitCredits('unknown-model', '2k')).toBe(100);
  });

  it('charges each requested image output', () => {
    expect(estimateCanvasImageGenerationCredits({
      model: 'Nano Banana Pro',
      resolution: '4k',
      count: 3,
    })).toEqual({ outputCount: 3, unitCredits: 20, totalCredits: 60 });
  });

  it('sums image and LLM nodes while ignoring reference and plain-text nodes', () => {
    const workflow = {
      id: 'priced-workflow',
      label: 'Priced workflow',
      hint: '',
      nodes: [
        {
          id: 'reference', x: 0, y: 0, width: 100, height: 100,
          item: { id: 'reference', type: 'image', content: '' },
          bridgeType: 'reference_image',
        },
        {
          id: 'plain', x: 0, y: 0, width: 100, height: 100,
          item: { id: 'plain', type: 'text', content: '' },
          textMode: 'plain',
        },
        {
          id: 'analysis', x: 0, y: 0, width: 100, height: 100,
          item: { id: 'analysis', type: 'text', content: '' },
          textMode: 'agent',
        },
        {
          id: 'render-a', x: 0, y: 0, width: 100, height: 100,
          item: { id: 'render-a', type: 'text', content: '' },
          ai: { type: 'image-generator', model: 'gpt-image-2', resolution: '2k', count: 2 },
        },
        {
          id: 'render-b', x: 0, y: 0, width: 100, height: 100,
          item: { id: 'render-b', type: 'text', content: '' },
          ai: { type: 'image-generator', model: 'Nano Banana 2', resolution: '4k', count: 1 },
        },
      ],
    } as CanvasWorkflowTemplate;

    expect(estimateCanvasWorkflowCredits(workflow)).toEqual({
      imageNodeCount: 2,
      imageOutputCount: 3,
      llmNodeCount: 1,
      imageCredits: 48,
      llmCredits: 10,
      totalCredits: 58,
    });
  });

  it('uses the runtime default model for workflow image nodes without a saved model', () => {
    const workflow = {
      id: 'inherited-model-workflow',
      label: 'Inherited model workflow',
      hint: '',
      nodes: [{
        id: 'render', x: 0, y: 0, width: 100, height: 100,
        item: { id: 'render', type: 'text', content: '' },
        ai: { type: 'image-generator', count: 1 },
      }],
    } as CanvasWorkflowTemplate;

    expect(estimateCanvasWorkflowCredits(workflow, {
      resolveImageModel: () => 'Xais Nano Pro_2K',
    }).totalCredits).toBe(18);
  });
});
