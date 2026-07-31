import { describe, expect, it } from 'vitest';
import type { CanvasWorkflowTemplate } from './canvasTemplates';
import {
  estimateCanvasImageGenerationCredits,
  estimateCanvasVideoGenerationCredits,
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
    expect(getCanvasImageUnitCredits('gpt-image-2', '1k')).toBe(10);
    expect(getCanvasImageUnitCredits('Xais img2_1k', '4k')).toBe(100);
    expect(getCanvasImageUnitCredits('gpt-image-2', '2k')).toBe(15);
    expect(getCanvasImageUnitCredits('Xais Img2_4K', '2k')).toBe(15);
    expect(getCanvasImageUnitCredits('Xais Img2_4K(高画质)', '2k')).toBe(30);
    expect(getCanvasImageUnitCredits('legacy-gpt-image-2-high-quality', '4k')).toBe(35);
    expect(getCanvasImageUnitCredits('Xais Nano Pro_2K', '4k')).toBe(20);
    expect(getCanvasImageUnitCredits('Xais Nano Pro_4K', '2k')).toBe(18);
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

  it('uses server pricing for image and workflow LLM estimates', () => {
    const pricing = {
      agentRequestCredits: '7',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '500',
      imageModels: [{
        model: 'gpt-image-2',
        credits1k: '4',
        credits2k: '6',
        credits4k: '9',
      }],
      videoModels: [],
    };
    expect(estimateCanvasImageGenerationCredits({
      model: 'GPT Image 2',
      resolution: '4k',
      count: 2,
    }, pricing)).toEqual({ outputCount: 2, unitCredits: 9, totalCredits: 18 });
    expect(estimateCanvasVideoGenerationCredits({
      model: 'seedance2',
      count: 2,
    }, {
      ...pricing,
      videoDefaultCredits: '320',
      videoModels: [{ model: 'seedance2', credits: '48' }],
    })).toEqual({ outputCount: 2, unitCredits: 48, totalCredits: 96 });
    expect(getCanvasImageUnitCredits('custom-model', '2k', pricing)).toBe(55);

    const workflow = {
      id: 'dynamic-pricing-workflow',
      label: 'Dynamic pricing',
      hint: '',
      nodes: [
        {
          id: 'analysis', x: 0, y: 0, width: 100, height: 100,
          item: { id: 'analysis', type: 'text', content: '' },
          textMode: 'agent',
        },
        {
          id: 'render', x: 0, y: 0, width: 100, height: 100,
          item: { id: 'render', type: 'text', content: '' },
          ai: { type: 'image-generator', model: 'gpt-image-2', resolution: '2k', count: 1 },
        },
      ],
    } as CanvasWorkflowTemplate;
    expect(estimateCanvasWorkflowCredits(workflow, { pricing }).totalCredits).toBe(13);
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
      videoNodeCount: 0,
      videoOutputCount: 0,
      llmNodeCount: 1,
      imageCredits: 48,
      videoCredits: 0,
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

  it('prices retired legacy workflow model labels using the runtime fallback', () => {
    const workflow = {
      id: 'legacy-model-workflow',
      label: 'Legacy workflow',
      hint: '',
      nodes: [{
        id: 'render', x: 0, y: 0, width: 100, height: 100,
        item: { id: 'render', type: 'text', content: '' },
        ai: { type: 'image-generator', model: 'retired-image-model-v1', count: 2 },
      }],
    } as CanvasWorkflowTemplate;

    expect(estimateCanvasWorkflowCredits(workflow, {
      resolveImageModel: () => 'Xais Nano Pro_2K',
    }).totalCredits).toBe(36);
  });
});
