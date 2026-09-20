import { describe, expect, it } from 'vitest';
import { PRODUCT_DETAILS_FIVE_IMAGES_BUILT_IN_WORKFLOW } from './canvasTemplates';
import type { CanvasWorkflowTemplate } from './canvasTemplates';
import { findAiCatalogModel } from './aiModelCapabilities';
import {
  describeCanvasImageCreditEstimate,
  describeCanvasVideoCreditEstimate,
  estimateCanvasImageGenerationCredits,
  estimateCanvasTextAgentCredits,
  estimateCanvasVideoGenerationCredits,
  estimateCanvasWorkflowCredits,
  getCanvasImageUnitCredits,
  getCanvasVideoRequestCredits,
  resolveVideoBillingType,
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

  it('prefers exact canonical image pricing before legacy token aliases', () => {
    const pricing = {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', imageDefaultCredits: '55', videoDefaultCredits: '500',
      imageModels: [
        { model: 'canonical-image-x', credits2k: '12', credits4k: '18' },
        { model: 'canonical_image_x', credits2k: '99', credits4k: '99' },
      ],
      videoModels: [],
    };
    expect(getCanvasImageUnitCredits('canonical-image-x', '2K', pricing)).toBe(12);
  });

  it('prefers exact canonical video pricing before legacy token aliases', () => {
    const pricing = {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', imageDefaultCredits: '55', videoDefaultCredits: '500',
      imageModels: [],
      videoModels: [
        { model: 'canonical-video-x', credits: '31' },
        { model: 'canonical_video_x', credits: '88' },
      ],
    };
    expect(getCanvasVideoRequestCredits('canonical-video-x', 5, 1, '720p', pricing)).toBe(155);
  });

  it('charges each requested image output', () => {
    expect(estimateCanvasImageGenerationCredits({
      model: 'Nano Banana Pro',
      resolution: '4k',
      count: 3,
    })).toMatchObject({ available: true, outputCount: 3, unitCredits: 20, totalCredits: 60 });
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
    }, pricing)).toMatchObject({ available: true, outputCount: 2, unitCredits: 9, totalCredits: 18 });
    expect(estimateCanvasVideoGenerationCredits({
      model: 'seedance2',
      count: 2,
      duration: 8,
    }, {
      ...pricing,
      videoDefaultCredits: '320',
      videoModels: [{ model: 'seedance2', credits: '48' }],
    })).toMatchObject({
      available: true,
      billingType: 'video_second',
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
      agentRequestCredits: '10',
      inspirationAnalysisCredits: '3',
      canvasTextAgentCredits: '1.000000',
      imageDefaultCredits: '55',
      videoDefaultCredits: '500',
      imageModels: [],
      videoModels: [],
    };
    for (const role of [
      'requirement_analyzer',
      'design_strategist',
      'design_reviewer',
      'presentation_writer',
      'seedance_video_analyzer',
      'general',
    ]) {
      expect(estimateCanvasTextAgentCredits(pricing, role)).toMatchObject({ available: true, unitCredits: 1, totalCredits: 1 });
    }
    expect(estimateCanvasTextAgentCredits(pricing, 'inspiration_analyzer')).toMatchObject({ available: true, unitCredits: 3, totalCredits: 3 });
  });

  it('falls back to legacy Agent pricing when an old server omits Canvas Text pricing', () => {
    const pricing = {
      agentRequestCredits: '10',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '500',
      imageModels: [],
      videoModels: [],
    };
    expect(estimateCanvasTextAgentCredits(pricing, 'general')).toMatchObject({ available: true, unitCredits: 10, totalCredits: 10 });
    expect(estimateCanvasTextAgentCredits(pricing, 'general', { serverDriven: true }))
      .toMatchObject({ available: true, unitCredits: 10, totalCredits: 10 });
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
    }, pricing)).toMatchObject({ available: true, outputCount: 2, unitCredits: 18, totalCredits: 36 });
    expect(estimateCanvasImageGenerationCredits({
      model: 'gemini-3.1-flash-image-preview',
      resolution: '2k',
      count: 1,
      capabilities: ['IMAGE_NANO_BANANA_DUAL_2K'],
    }, pricing)).toMatchObject({ available: true, outputCount: 1, unitCredits: 15, totalCredits: 15 });
  });

  it('keeps the three image billing strategies mutually exclusive', () => {
    const base = {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', canvasTextAgentCredits: '1',
      imageDefaultCredits: '999999', videoDefaultCredits: '500', videoModels: [],
    };
    const flat = estimateCanvasImageGenerationCredits({
      model: 'flat-image', count: 4, serverDriven: true, maxOutputs: 8,
    }, {
      ...base,
      imageModels: [{ model: 'flat-image', billingType: 'image_flat' as const, creditsPerRequest: '20' }],
    });
    expect(flat).toMatchObject({
      available: true, billingType: 'image_flat', outputCount: 4, creditsPerRequest: 20, totalCredits: 20,
    });
    expect(describeCanvasImageCreditEstimate(flat)).toBe('预计需要 20 积分：20 积分/次');

    const count = estimateCanvasImageGenerationCredits({
      model: 'count-image', count: 4, serverDriven: true, maxOutputs: 8,
    }, {
      ...base,
      imageModels: [{ model: 'count-image', billingType: 'image_count' as const, creditsPerImage: '20' }],
    });
    expect(count).toMatchObject({
      available: true, billingType: 'image_count', outputCount: 4, creditsPerImage: 20, totalCredits: 80,
    });
    expect(describeCanvasImageCreditEstimate(count)).toBe('预计需要 80 积分：20 积分/张 × 4 张');

    const resolution = estimateCanvasImageGenerationCredits({
      model: 'resolution-image', resolution: '4K', count: 3, serverDriven: true, maxOutputs: 8,
      supportedResolutions: ['2k', '4k'],
    }, {
      ...base,
      imageModels: [{
        model: 'resolution-image', billingType: 'image_resolution' as const,
        creditsByResolution: { '2k': '15', '4k': '20' },
      }],
    });
    expect(resolution).toMatchObject({
      available: true, billingType: 'image_resolution', outputCount: 3, unitCredits: 20, totalCredits: 60,
    });
    expect(describeCanvasImageCreditEstimate(resolution)).toBe('预计需要 60 积分：4K · 20 积分/张 × 3 张');
  });

  it('supports decimal image credits and capability-driven output limits', () => {
    const estimate = estimateCanvasImageGenerationCredits({
      model: 'decimal-image', resolution: '2k', count: 2, serverDriven: true,
      supportedResolutions: ['2k'], maxOutputs: 8,
    }, {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', canvasTextAgentCredits: '1',
      imageDefaultCredits: '999999', videoDefaultCredits: '500', videoModels: [],
      imageModels: [{
        model: 'decimal-image', billingType: 'image_resolution', creditsByResolution: { '2k': '7.5' },
      }],
    });
    expect(estimate).toMatchObject({ available: true, outputCount: 2, unitCredits: 7.5, totalCredits: 15 });

    const eightOutputs = estimateCanvasImageGenerationCredits({
      model: 'eight-image', count: 8, serverDriven: true, maxOutputs: 8,
    }, {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', canvasTextAgentCredits: '1',
      imageDefaultCredits: '999999', videoDefaultCredits: '500', videoModels: [],
      imageModels: [{ model: 'eight-image', billingType: 'image_count', creditsPerImage: '10' }],
    });
    expect(eightOutputs).toMatchObject({ available: true, outputCount: 8, totalCredits: 80 });
    expect(estimateCanvasImageGenerationCredits({
      model: 'Nano Banana 2', resolution: '2k', count: 8,
    })).toMatchObject({ available: true, outputCount: 4, totalCredits: 60 });
  });

  it('fails closed for missing canonical image prices and ambiguous resolutions', () => {
    const pricing = {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', canvasTextAgentCredits: '1',
      imageDefaultCredits: '999999', videoDefaultCredits: '500', videoModels: [],
      imageModels: [{
        model: 'canonical-image', billingType: 'image_resolution' as const,
        creditsByResolution: { '2k': '12', '4k': '18' },
      }],
    };
    expect(estimateCanvasImageGenerationCredits({
      model: 'provider/image-alias', resolution: '2k', serverDriven: true,
      supportedResolutions: ['2k', '4k'],
    }, pricing)).toMatchObject({ available: false, reason: 'pricing_unavailable', totalCredits: 0 });
    expect(estimateCanvasImageGenerationCredits({
      model: 'canonical-image', serverDriven: true, supportedResolutions: ['2k', '4k'],
    }, pricing)).toMatchObject({ available: false, reason: 'resolution_required', resolution: '', totalCredits: 0 });
    expect(estimateCanvasImageGenerationCredits({
      model: 'canonical-image', serverDriven: true, supportedResolutions: ['2k', '4k'], defaultResolution: '4K',
    }, pricing)).toMatchObject({ available: true, resolution: '4k', totalCredits: 18 });
    expect(estimateCanvasImageGenerationCredits({
      model: 'canonical-image', serverDriven: true, supportedResolutions: ['2k'],
    }, pricing)).toMatchObject({ available: true, resolution: '2k', totalCredits: 12 });
  });

  it('prices known legacy workflow image ids against canonical wallet pricing', () => {
    const pricing = {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', canvasTextAgentCredits: '1',
      imageDefaultCredits: '999999', videoDefaultCredits: '500', videoModels: [],
      imageModels: [{
        model: 'nano-banana-pro',
        billingType: 'image_resolution' as const,
        creditsByResolution: { '2k': '18', '4k': '20' },
      }],
    };

    expect(estimateCanvasImageGenerationCredits({
      model: 'Xais Nano Pro_2K', count: 1, serverDriven: true,
    }, pricing)).toMatchObject({
      available: true, billingType: 'image_resolution', unitCredits: 18, totalCredits: 18,
    });

    const workflow = {
      id: 'legacy-wallet-pricing-workflow', label: 'Legacy wallet pricing workflow', hint: '',
      nodes: [{
        id: 'render', x: 0, y: 0, width: 100, height: 100,
        item: { id: 'render', type: 'text' as const, content: '' },
        ai: { type: 'image-generator' as const, model: 'Xais Nano Pro_2K', count: 1 },
      }],
    } as CanvasWorkflowTemplate;
    expect(estimateCanvasWorkflowCredits(workflow, {
      pricing,
      resolveImagePricingIdentity: () => ({ model: 'Xais Nano Pro_2K', serverDriven: true }),
    })).toMatchObject({ imageCredits: 18, totalCredits: 18, pricingState: 'ready' });
  });

  it('does not use an unrelated canonical price for an unknown server model', () => {
    const pricing = {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', canvasTextAgentCredits: '1',
      imageDefaultCredits: '999999', videoDefaultCredits: '500', videoModels: [],
      imageModels: [{
        model: 'nano-banana-pro',
        billingType: 'image_resolution' as const,
        creditsByResolution: { '2k': '18' },
      }],
    };

    expect(estimateCanvasImageGenerationCredits({
      model: 'custom-pro-2k', resolution: '2k', count: 1, serverDriven: true,
    }, pricing)).toMatchObject({ available: false, reason: 'pricing_unavailable', totalCredits: 0 });
  });

  it('keeps a legacy workflow priced when the server omits CANVAS_TEXT', () => {
    const pricing = {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3',
      imageDefaultCredits: '999999', videoDefaultCredits: '500', videoModels: [],
      imageModels: [{
        model: 'nano-banana-pro',
        billingType: 'image_resolution' as const,
        creditsByResolution: { '2k': '18' },
      }],
    };
    const workflow = {
      id: 'legacy-server-workflow', label: 'Legacy server workflow', hint: '',
      nodes: [
        {
          id: 'strategy', x: 0, y: 0, width: 100, height: 100,
          item: { id: 'strategy', type: 'text' as const, content: '' },
          textMode: 'agent' as const,
        },
        {
          id: 'render', x: 0, y: 0, width: 100, height: 100,
          item: { id: 'render', type: 'text' as const, content: '' },
          ai: { type: 'image-generator' as const, model: 'Xais Nano Pro_2K', resolution: '2k', count: 1 },
        },
      ],
    } as CanvasWorkflowTemplate;

    expect(estimateCanvasWorkflowCredits(workflow, {
      pricing,
      serverDriven: true,
      resolveImagePricingIdentity: () => ({ model: 'Xais Nano Pro_2K', serverDriven: true }),
    })).toMatchObject({ llmCredits: 7, imageCredits: 18, totalCredits: 25, pricingState: 'ready' });

    expect(estimateCanvasWorkflowCredits(PRODUCT_DETAILS_FIVE_IMAGES_BUILT_IN_WORKFLOW, {
      pricing,
      serverDriven: true,
    })).toMatchObject({
      imageNodeCount: 5,
      imageOutputCount: 5,
      imageCredits: 90,
      llmNodeCount: 1,
      llmCredits: 7,
      totalCredits: 97,
      pricingState: 'ready',
    });
  });

  it('reports loading instead of legacy defaults while wallet pricing is unavailable', () => {
    expect(estimateCanvasImageGenerationCredits({
      model: 'canonical-image', resolution: '2k', serverDriven: true,
    })).toMatchObject({ available: false, reason: 'pricing_loading', totalCredits: 0 });
    expect(estimateCanvasVideoGenerationCredits({
      model: 'canonical-video', duration: 4, serverDriven: true,
    })).toMatchObject({ available: false, reason: 'pricing_loading', totalCredits: 0 });
    expect(estimateCanvasTextAgentCredits(undefined, 'general', { serverDriven: true }))
      .toEqual({ available: false, reason: 'pricing_loading', totalCredits: 0 });
  });

  it('uses mutually exclusive video billing strategies from the wallet', () => {
    const pricing = {
      agentRequestCredits: '7',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '2',
      imageModels: [],
      videoModels: [{
        model: 'kling-video',
        billingType: 'video_flat' as const,
        credits: '0',
        creditsPerSecond: '999',
        creditsPerVideo: '15',
      }],
    };
    expect(getCanvasVideoRequestCredits('kling-video', 4, 1, '1080p', pricing)).toBe(15);
    expect(getCanvasVideoRequestCredits('kling-video', 15, 2, '720p', pricing)).toBe(30);
    expect(estimateCanvasVideoGenerationCredits({
      model: 'kling-video', count: 2, duration: 10, resolution: '1080p', serverDriven: true,
    }, pricing).totalCredits).toBe(30);
  });

  it('prices second, duration-tier, and resolution-duration video models separately', () => {
    const base = {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', imageDefaultCredits: '55', videoDefaultCredits: '999999', imageModels: [],
    };
    expect(estimateCanvasVideoGenerationCredits({
      model: 'second-video', duration: 4, count: 1, serverDriven: true,
    }, {
      ...base,
      videoModels: [{ model: 'second-video', billingType: 'video_second', credits: '15', creditsPerSecond: '15' }],
    }).totalCredits).toBe(60);
    expect(estimateCanvasVideoGenerationCredits({
      model: 'duration-video', duration: 10, count: 1, serverDriven: true,
    }, {
      ...base,
      videoModels: [{ model: 'duration-video', billingType: 'video_duration', credits: '0', creditsByDuration: { '10': '80', '15': '110' } }],
    }).totalCredits).toBe(80);
    expect(estimateCanvasVideoGenerationCredits({
      model: 'resolution-video', duration: 10, count: 1, resolution: '768P', serverDriven: true,
    }, {
      ...base,
      videoModels: [{ model: 'resolution-video', billingType: 'video_resolution_duration', credits: '0', creditsByResolution: { '768p': '5' } }],
    }).totalCredits).toBe(50);
  });

  it('uses the effective server resolution and distinguishes a missing selection', () => {
    const pricing = {
      agentRequestCredits: '7',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '999999',
      imageModels: [],
      videoModels: [{
        model: 'minimax-h3',
        billingType: 'video_resolution_duration' as const,
        credits: '0',
        creditsByResolution: { '768p': '15', '2k': '20' },
      }],
    };
    const defaultResolution = '768p';
    expect(estimateCanvasVideoGenerationCredits({
      model: 'minimax-h3',
      duration: 5,
      count: 1,
      resolution: defaultResolution,
      serverDriven: true,
    }, pricing)).toMatchObject({
      available: true,
      resolution: '768p',
      totalCredits: 75,
    });
    expect(estimateCanvasVideoGenerationCredits({
      model: 'minimax-h3',
      duration: 5,
      count: 1,
      resolution: '2K',
      serverDriven: true,
    }, pricing)).toMatchObject({
      available: true,
      resolution: '2k',
      totalCredits: 100,
    });

    const missing = estimateCanvasVideoGenerationCredits({
      model: 'minimax-h3',
      duration: 5,
      count: 1,
      serverDriven: true,
    }, pricing);
    expect(missing).toMatchObject({
      available: false,
      reason: 'resolution_required',
      resolution: '',
      totalCredits: 0,
    });
    expect(describeCanvasVideoCreditEstimate(missing)).toBe('请选择清晰度');

    expect(estimateCanvasVideoGenerationCredits({
      model: 'legacy-video', duration: 5, count: 1,
    }, {
      ...pricing,
      videoModels: [],
      videoDefaultCredits: '2',
    })).toMatchObject({ available: true, resolution: '720p', totalCredits: 10 });
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
    }, pricing).totalCredits).toBe(50);
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
        creditsByResolution: { '768p': '15', '2k': '10' },
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
    }, pricing, { imageCount: 6, videoCount: 1 }).totalCredits).toBe(298);
  });

  it('fails closed in the UI estimate when canonical pricing is missing', () => {
    const pricing = {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', imageDefaultCredits: '55', videoDefaultCredits: '999999',
      imageModels: [], videoModels: [],
    };
    const canonical = estimateCanvasVideoGenerationCredits({
      model: 'canonical-video', duration: 4, count: 1, serverDriven: true,
    }, pricing);
    expect(canonical).toMatchObject({
      available: false,
      reason: 'pricing_unavailable',
      totalCredits: 0,
    });
    expect(describeCanvasVideoCreditEstimate(canonical)).toBe('价格未配置');
    expect(JSON.stringify(canonical)).not.toContain('999999');

    const legacy = estimateCanvasVideoGenerationCredits({
      model: 'legacy-video', duration: 4, count: 1,
    }, pricing);
    expect(legacy).toMatchObject({ available: true, totalCredits: 3_999_996 });
  });

  it('uses canonical pricing after an upstream alias is resolved through the catalog', () => {
    const catalog = [{
      id: 'canonical-video',
      displayName: 'Canonical Video',
      modality: 'video' as const,
      aliases: ['provider/video-v1'],
    }];
    const canonicalModel = findAiCatalogModel(catalog, 'provider/video-v1');
    const estimate = estimateCanvasVideoGenerationCredits({
      model: canonicalModel?.id,
      duration: 4,
      count: 1,
      serverDriven: true,
    }, {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', imageDefaultCredits: '55', videoDefaultCredits: '999999', imageModels: [],
      videoModels: [{ model: 'canonical-video', billingType: 'video_second', credits: '15', creditsPerSecond: '15' }],
    });
    expect(estimate).toMatchObject({ available: true, totalCredits: 60 });
  });

  it('describes flat and second prices with the correct units', () => {
    const flat = estimateCanvasVideoGenerationCredits({
      model: 'flat-video', duration: 4, count: 1, serverDriven: true,
    }, {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', imageDefaultCredits: '55', videoDefaultCredits: '999999', imageModels: [],
      videoModels: [{ model: 'flat-video', billingType: 'video_flat', credits: '0', creditsPerVideo: '15' }],
    });
    expect(describeCanvasVideoCreditEstimate(flat)).toBe('预计需要 15 积分：15 积分/条 × 1 条');
    expect(describeCanvasVideoCreditEstimate(flat)).not.toContain('积分/秒');

    const second = estimateCanvasVideoGenerationCredits({
      model: 'second-video', duration: 4, count: 1, serverDriven: true,
    }, {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', imageDefaultCredits: '55', videoDefaultCredits: '999999', imageModels: [],
      videoModels: [{ model: 'second-video', billingType: 'video_second', credits: '15', creditsPerSecond: '15' }],
    });
    expect(describeCanvasVideoCreditEstimate(second)).toBe('预计需要 60 积分：15 积分/秒 × 4 秒 × 1 条');
    expect(resolveVideoBillingType({ model: 'old-flat', credits: '15', creditsPerVideo: '15' })).toBe('video_flat');
  });

  it('uses the server video maxOutputs instead of the legacy limit of four', () => {
    const estimate = estimateCanvasVideoGenerationCredits({
      model: 'eight-video', duration: 4, count: 8, serverDriven: true, maxOutputs: 8,
    }, {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3', canvasTextAgentCredits: '1',
      imageDefaultCredits: '55', videoDefaultCredits: '999999', imageModels: [],
      videoModels: [{
        model: 'eight-video', billingType: 'video_flat', credits: '0', creditsPerVideo: '20',
      }],
    });
    expect(estimate).toMatchObject({ available: true, outputCount: 8, totalCredits: 160 });
    expect(estimateCanvasVideoGenerationCredits({
      model: 'legacy-video', duration: 1, count: 8,
    }, {
      agentRequestCredits: '7', inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55', videoDefaultCredits: '20', imageModels: [], videoModels: [],
    })).toMatchObject({ available: true, outputCount: 4, totalCredits: 80 });
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
      pricingState: 'ready',
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

  it('prices a folded workflow from its current public model identity', () => {
    const pricing = {
      agentRequestCredits: '7',
      inspirationAnalysisCredits: '3',
      imageDefaultCredits: '55',
      videoDefaultCredits: '500',
      imageModels: [
        { model: 'nano-banana-pro', credits2k: '8', credits4k: '10' },
        { model: 'nano-banana-pro-fast', credits2k: '28', credits4k: '30' },
      ],
      videoModels: [],
    };
    const workflow = {
      id: 'folded-current-model-workflow',
      label: 'Folded current model workflow',
      hint: '',
      nodes: [{
        id: 'render', x: 0, y: 0, width: 100, height: 100,
        item: { id: 'render', type: 'text', content: '' },
        ai: {
          type: 'image-generator',
          model: 'gemini-3-pro-image',
          resolution: '4k',
          count: 1,
        },
      }],
    } as CanvasWorkflowTemplate;

    expect(estimateCanvasWorkflowCredits(workflow, {
      pricing,
      resolveImagePricingIdentity: () => ({ model: 'nano-banana-pro-fast' }),
    }).totalCredits).toBe(30);
  });

  it('prices workflow LLM requests from CANVAS_TEXT and exposes loading state', () => {
    const workflow = {
      id: 'two-llm-workflow', label: 'Two LLM calls', hint: '',
      nodes: ['a', 'b'].map(id => ({
        id, x: 0, y: 0, width: 100, height: 100,
        item: { id, type: 'text' as const, content: '' },
        textMode: 'agent' as const,
      })),
    } as CanvasWorkflowTemplate;
    const pricing = {
      agentRequestCredits: '10', inspirationAnalysisCredits: '3', canvasTextAgentCredits: '1',
      imageDefaultCredits: '55', videoDefaultCredits: '500', imageModels: [], videoModels: [],
    };
    expect(estimateCanvasWorkflowCredits(workflow, { pricing, serverDriven: true })).toMatchObject({
      llmNodeCount: 2, llmCredits: 2, totalCredits: 2, pricingState: 'ready',
    });
    expect(estimateCanvasWorkflowCredits(workflow, { serverDriven: true })).toMatchObject({
      llmNodeCount: 2, llmCredits: 0, totalCredits: 0,
      pricingState: 'loading', pricingAvailable: false,
    });
  });

  it('uses canonical workflow image identity and its maxOutputs capability', () => {
    const workflow = {
      id: 'eight-image-workflow', label: 'Eight images', hint: '',
      nodes: [{
        id: 'render', x: 0, y: 0, width: 100, height: 100,
        item: { id: 'render', type: 'text', content: '' },
        ai: { type: 'image-generator', model: 'provider/image-alias', count: 8 },
      }],
    } as CanvasWorkflowTemplate;
    const pricing = {
      agentRequestCredits: '10', inspirationAnalysisCredits: '3', canvasTextAgentCredits: '1',
      imageDefaultCredits: '999999', videoDefaultCredits: '500', videoModels: [],
      imageModels: [{
        model: 'canonical-image', billingType: 'image_count' as const, creditsPerImage: '10',
      }],
    };
    expect(estimateCanvasWorkflowCredits(workflow, {
      pricing,
      serverDriven: true,
      resolveImagePricingIdentity: () => ({
        model: 'canonical-image', serverDriven: true, maxOutputs: 8,
      }),
    })).toMatchObject({
      imageOutputCount: 8, imageCredits: 80, totalCredits: 80, pricingState: 'ready',
    });
  });
});
