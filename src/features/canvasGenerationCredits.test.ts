import { describe, expect, it } from 'vitest';
import type { CanvasWorkflowTemplate } from './canvasTemplates';
import {
  estimateCanvasImageGenerationCredits,
  estimateCanvasTextAgentCredits,
  estimateCanvasVideoGenerationCredits,
  estimateCanvasWorkflowCredits,
  getCanvasImageUnitCredits,
  getCanvasVideoRequestCredits,
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
    expect(getCanvasImageUnitCredits('Xais img2_1k', '4k')).toBe(18);
    expect(getCanvasImageUnitCredits('gpt-image-2', '2k')).toBe(15);
    expect(getCanvasImageUnitCredits('Xais Img2_4K', '2k')).toBe(15);
    expect(getCanvasImageUnitCredits('Xais Img2_4K(高画质)', '2k')).toBe(15);
    expect(getCanvasImageUnitCredits('legacy-gpt-image-2-high-quality', '4k')).toBe(18);
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

  it('uses independent fast-channel pricing for the same Banana model IDs', () => {
    const pricing = {
      agentRequestCredits: '7',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '500',
      imageModels: [{
        model: 'nano-banana-pro',
        credits2k: '8',
        credits4k: '10',
      }, {
        model: 'nano-banana-pro-fast',
        credits2k: '28',
        credits4k: '30',
      }, {
        model: 'nano-banana-2',
        credits2k: '11',
        credits4k: '13',
      }, {
        model: 'nano-banana-2-fast',
        credits2k: '24',
        credits4k: '27',
      }],
      videoModels: [],
    };

    expect(getCanvasImageUnitCredits(
      'gemini-3-pro-image',
      '2k',
      pricing,
      ['IMAGE_NANO_BANANA_PRO_FAST'],
    )).toBe(28);
    expect(getCanvasImageUnitCredits(
      'gemini-3-pro-image',
      '4k',
      pricing,
      ['IMAGE_NANO_BANANA_PRO_FAST'],
    )).toBe(30);
    expect(getCanvasImageUnitCredits(
      'gemini-3.1-flash-image',
      '2k',
      pricing,
      ['IMAGE_NANO_BANANA_2_FAST'],
    )).toBe(24);
    expect(getCanvasImageUnitCredits('gemini-3-pro-image', '2k', pricing)).toBe(8);
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
      duration: 8,
    }, {
      ...pricing,
      videoDefaultCredits: '320',
      videoModels: [{ model: 'seedance2', credits: '48' }],
    })).toEqual({
      outputCount: 2,
      durationSeconds: 8,
      creditsPerSecond: 48,
      totalCredits: 768,
    });
    expect(estimateCanvasVideoGenerationCredits({
      model: 'SourceMix2.0',
      count: 1,
      duration: 4,
    }, {
      ...pricing,
      videoDefaultCredits: '320',
      videoModels: [{ model: 'seedance2', credits: '48' }],
    }).totalCredits).toBe(192);
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

  it('uses role-specific wallet pricing for standalone text Agent nodes', () => {
    const pricing = {
      agentRequestCredits: '7',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '500',
      imageModels: [],
      videoModels: [],
    };
    expect(estimateCanvasTextAgentCredits(pricing, 'general')).toEqual({ unitCredits: 7, totalCredits: 7 });
    expect(estimateCanvasTextAgentCredits(pricing, 'inspiration_analyzer')).toEqual({ unitCredits: 3, totalCredits: 3 });
  });

  it('uses 2K pricing for the dual Banana Pro and Banana 2 capability', () => {
    const pricing = {
      agentRequestCredits: '7',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '500',
      imageModels: [{
        model: 'gemini-3-pro-image',
        credits1k: '7',
        credits2k: '18',
        credits4k: '20',
      }, {
        model: 'gemini-3.1-flash-image',
        credits1k: '6',
        credits2k: '15',
        credits4k: '18',
      }],
      videoModels: [],
    };
    expect(estimateCanvasImageGenerationCredits({
      model: 'gemini-3-pro-image-preview',
      resolution: '1k',
      count: 2,
      capabilities: ['IMAGE_NANO_BANANA_DUAL_2K'],
    }, pricing)).toEqual({ outputCount: 2, unitCredits: 18, totalCredits: 36 });
    expect(estimateCanvasImageGenerationCredits({
      model: 'gemini-3.1-flash-image-preview',
      resolution: '2k',
      count: 1,
      capabilities: ['IMAGE_NANO_BANANA_DUAL_2K'],
    }, pricing)).toEqual({ outputCount: 1, unitCredits: 15, totalCredits: 15 });
  });

  it('uses dimensional video pricing overrides from the wallet', () => {
    const pricing = {
      agentRequestCredits: '7',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '2',
      imageModels: [],
      videoModels: [{
        model: 'kling-video',
        credits: '2',
        creditsPerSecond: '3',
        creditsPerVideo: '5',
        creditsByDuration: { '10': '40' },
        creditsByResolution: { '1080p': '8' },
        creditsByCount: { '3': '200' },
      }],
    };
    expect(getCanvasVideoRequestCredits('kling-video', 10, 2, '1080p', pricing)).toBe(250);
    expect(getCanvasVideoRequestCredits('kling-video', 10, 3, '720p', pricing)).toBe(200);
    expect(estimateCanvasVideoGenerationCredits({
      model: 'kling-video', count: 2, duration: 10, resolution: '1080p',
    }, pricing).totalCredits).toBe(250);
  });

  it('uses MiniMax H3 native resolution pricing in the client estimate', () => {
    const pricing = {
      agentRequestCredits: '7',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '2',
      imageModels: [],
      videoModels: [{
        model: 'MiniMax-H3',
        credits: '15',
        creditsByResolution: { '2k': '10' },
      }],
    };
    expect(estimateCanvasVideoGenerationCredits({
      model: 'MiniMax-H3',
      duration: 5,
      count: 1,
      resolution: '2K',
    }, pricing).totalCredits).toBe(125);
  });

  it('includes MiniMax H3 reference material pricing in the client estimate', () => {
    const pricing = {
      agentRequestCredits: '7',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '2',
      imageModels: [],
      videoModels: [{
        model: 'MiniMax-H3',
        credits: '15',
        creditsByResolution: { '2k': '10' },
        includedReferenceImages: 5,
        creditsPerExtraReferenceImage: '9',
        creditsPerReferenceVideoSecond: '15',
        referenceVideoCreditsByResolution: { '2k': '10' },
      }],
    };

    expect(getCanvasVideoRequestCredits(
      'MiniMax-H3',
      4,
      1,
      '768P',
      pricing,
      { imageCount: 7, videoCount: 1 },
    )).toBe(138);
    expect(estimateCanvasVideoGenerationCredits({
      model: 'MiniMax-H3',
      duration: 4,
      count: 2,
      resolution: '2K',
    }, pricing, { imageCount: 6, videoCount: 1 }).totalCredits).toBe(418);
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
