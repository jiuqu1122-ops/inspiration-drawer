import type { CanvasAiCredentialSource, CanvasImageItem } from './canvasModel';
import type { CanvasWorkflowTemplate } from './canvasTemplates';

export const CANVAS_LLM_NODE_CREDITS = 10;
export const CANVAS_DEFAULT_IMAGE_UNIT_CREDITS = 100;
export const CANVAS_DEFAULT_VIDEO_UNIT_CREDITS = 500;

export type CanvasAiCreditPricing = {
  agentRequestCredits: string;
  inspirationAnalysisCredits: string;
  imageDefaultCredits: string;
  videoDefaultCredits: string;
  imageModels: Array<{
    model: string;
    credits1k?: string;
    credits2k: string;
    credits4k: string;
  }>;
  videoModels: Array<{
    model: string;
    credits: string;
  }>;
  updatedAt?: string | null;
};

export const shouldShowCanvasGenerationCredits = (
  credentialSource?: CanvasAiCredentialSource | null,
) => credentialSource === 'wallet';

const imageModelToken = (model?: string | null) => String(model || '')
  .trim()
  .toLowerCase()
  .replace(/preview/g, '')
  .replace(/[^a-z0-9]+/g, '');

const supportsImageOneK = (model?: string | null) => {
  const token = imageModelToken(model);
  return !token.startsWith('xais')
    && !token.includes('nanobananapro')
    && !token.includes('nanobanana2')
    && !token.includes('nanopro')
    && !token.includes('nano2')
    && !token.includes('nanolite')
    && !token.includes('gemini3proimage')
    && !token.includes('gemini31proimage')
    && !token.includes('gemini31flashimage')
    && !token.includes('gemini3flashimage');
};

type PricedImageResolution = '1k' | '2k' | '4k';

const getPricedImageResolution = (
  model?: string | null,
  resolution?: string | null,
): PricedImageResolution => {
  const requested = String(resolution || '').trim().toLowerCase();
  const token = imageModelToken(model);
  if (requested === '1k' || requested === '2k' || requested === '4k') {
    if (requested === '1k' && !supportsImageOneK(model)) return '2k';
    return requested;
  }
  if (token.includes('4k')) return '4k';
  if (token.includes('2k')) return '2k';
  if (token.includes('1k')) return '1k';
  return '2k';
};

export const getCanvasImageUnitCredits = (
  model?: string | null,
  resolution?: string | null,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const rawModel = String(model || '');
  const token = imageModelToken(rawModel);
  const selectedResolution = getPricedImageResolution(rawModel, resolution);
  const configuredModel = pricing?.imageModels.find(item => imageModelToken(item.model) === token);
  if (configuredModel) {
    const configuredCredits = selectedResolution === '1k'
      ? configuredModel.credits1k ?? configuredModel.credits2k
      : selectedResolution === '4k' ? configuredModel.credits4k : configuredModel.credits2k;
    const parsedCredits = Number(configuredCredits);
    if (Number.isSafeInteger(parsedCredits) && parsedCredits >= 0) return parsedCredits;
  }
  const isRetiredXaisImage2OneK = token === 'xaisimg21k' || token === 'xaisimage21k';
  const isGptImage2 = !isRetiredXaisImage2OneK && (
    token.includes('gptimage2')
    || token.includes('image2')
    || token.includes('img2')
  );
  const isHighQuality = isGptImage2 && (
    /高画质|高品質|high[\s_-]*quality/i.test(rawModel)
    || token.endsWith('h')
    || token.includes('image2h')
    || token.includes('img2h')
    || token.includes('highquality')
  );

  if (isHighQuality) return selectedResolution === '4k' ? 35 : 30;
  if (isGptImage2) {
    if (selectedResolution === '1k') return 10;
    return selectedResolution === '4k' ? 18 : 15;
  }

  const isNanoBananaPro = token.includes('nanobananapro')
    || token.includes('xaisnanopro')
    || token.includes('nanopro')
    || token.includes('gemini3proimage')
    || token.includes('gemini31proimage');
  if (isNanoBananaPro) return selectedResolution === '4k' ? 20 : 18;

  const isNanoBanana2 = token.includes('nanobanana2')
    || token.includes('xaisnano2')
    || token.includes('nano2')
    || token.includes('gemini31flashimage')
    || token.includes('gemini3flashimage');
  if (isNanoBanana2) return selectedResolution === '4k' ? 18 : 15;

  const configuredDefault = Number(pricing?.imageDefaultCredits);
  return Number.isSafeInteger(configuredDefault) && configuredDefault >= 0
    ? configuredDefault
    : CANVAS_DEFAULT_IMAGE_UNIT_CREDITS;
};

const getImageOutputCount = (count?: number | null) => {
  const normalized = Math.round(Number(count) || 1);
  return Math.max(1, Math.min(4, normalized));
};

const hasConfiguredImageModel = (
  model: string | null | undefined,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const token = imageModelToken(model);
  return Boolean(token && pricing?.imageModels.some(item => imageModelToken(item.model) === token));
};

type CanvasImageCreditInput = Pick<
  NonNullable<CanvasImageItem['ai']>,
  'model' | 'resolution' | 'count'
>;

export const estimateCanvasImageGenerationCredits = (
  ai?: CanvasImageCreditInput | null,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const outputCount = getImageOutputCount(ai?.count);
  const unitCredits = getCanvasImageUnitCredits(ai?.model, ai?.resolution, pricing);
  return {
    outputCount,
    unitCredits,
    totalCredits: outputCount * unitCredits,
  };
};

export const getCanvasVideoUnitCredits = (
  model?: string | null,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const token = imageModelToken(model);
  const configuredModel = pricing?.videoModels.find(item => imageModelToken(item.model) === token);
  const configuredCredits = Number(configuredModel?.credits ?? pricing?.videoDefaultCredits);
  return Number.isSafeInteger(configuredCredits) && configuredCredits >= 0
    ? configuredCredits
    : CANVAS_DEFAULT_VIDEO_UNIT_CREDITS;
};

export const estimateCanvasVideoGenerationCredits = (
  ai?: Pick<NonNullable<CanvasImageItem['ai']>, 'model' | 'count'> | null,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const outputCount = getImageOutputCount(ai?.count);
  const unitCredits = getCanvasVideoUnitCredits(ai?.model, pricing);
  return {
    outputCount,
    unitCredits,
    totalCredits: outputCount * unitCredits,
  };
};

export type CanvasWorkflowCreditEstimate = {
  imageNodeCount: number;
  imageOutputCount: number;
  videoNodeCount: number;
  videoOutputCount: number;
  llmNodeCount: number;
  imageCredits: number;
  videoCredits: number;
  llmCredits: number;
  totalCredits: number;
};

type CanvasWorkflowCreditOptions = {
  resolveImageModel?: (node: CanvasWorkflowTemplate['nodes'][number]) => string | undefined;
  pricing?: CanvasAiCreditPricing | null;
};

const isWorkflowLlmNode = (node: CanvasWorkflowTemplate['nodes'][number]) => (
  node.item.type === 'text'
  && !node.ai
  && node.textMode !== 'plain'
);

export const estimateCanvasWorkflowCredits = (
  workflow?: CanvasWorkflowTemplate | null,
  options: CanvasWorkflowCreditOptions = {},
): CanvasWorkflowCreditEstimate => {
  if (!workflow) {
    return {
      imageNodeCount: 0,
      imageOutputCount: 0,
      videoNodeCount: 0,
      videoOutputCount: 0,
      llmNodeCount: 0,
      imageCredits: 0,
      videoCredits: 0,
      llmCredits: 0,
      totalCredits: 0,
    };
  }

  const imageNodes = workflow.nodes.filter(node => node.ai?.type === 'image-generator');
  const imageEstimate = imageNodes.reduce((summary, node) => {
    const savedModel = node.ai?.model;
    const resolvedModel = options.resolveImageModel?.(node);
    // Historical workflows can contain retired/unrecognised model labels. They
    // are executed with the current provider fallback, so pricing the stale
    // label at the generic 100-credit sentinel overstates the real run.
    const savedModelIsPriced = options.pricing
      ? hasConfiguredImageModel(savedModel, options.pricing)
      : getCanvasImageUnitCredits(savedModel, node.ai?.resolution) !== CANVAS_DEFAULT_IMAGE_UNIT_CREDITS;
    const model = savedModel && savedModelIsPriced
      ? savedModel
      : resolvedModel || savedModel;
    const estimate = estimateCanvasImageGenerationCredits({
      model,
      resolution: node.ai?.resolution,
      count: node.ai?.count,
    }, options.pricing);
    return {
      outputCount: summary.outputCount + estimate.outputCount,
      credits: summary.credits + estimate.totalCredits,
    };
  }, { outputCount: 0, credits: 0 });
  const videoNodes = workflow.nodes.filter(node => node.ai?.type === 'video-generator');
  const videoEstimate = videoNodes.reduce((summary, node) => {
    const estimate = estimateCanvasVideoGenerationCredits({
      model: node.ai?.model,
      count: node.ai?.count,
    }, options.pricing);
    return {
      outputCount: summary.outputCount + estimate.outputCount,
      credits: summary.credits + estimate.totalCredits,
    };
  }, { outputCount: 0, credits: 0 });
  const llmNodeCount = workflow.nodes.filter(isWorkflowLlmNode).length;
  const configuredLlmCredits = Number(options.pricing?.agentRequestCredits);
  const llmUnitCredits = Number.isSafeInteger(configuredLlmCredits) && configuredLlmCredits >= 0
    ? configuredLlmCredits
    : CANVAS_LLM_NODE_CREDITS;
  const llmCredits = llmNodeCount * llmUnitCredits;

  return {
    imageNodeCount: imageNodes.length,
    imageOutputCount: imageEstimate.outputCount,
    videoNodeCount: videoNodes.length,
    videoOutputCount: videoEstimate.outputCount,
    llmNodeCount,
    imageCredits: imageEstimate.credits,
    videoCredits: videoEstimate.credits,
    llmCredits,
    totalCredits: imageEstimate.credits + videoEstimate.credits + llmCredits,
  };
};
