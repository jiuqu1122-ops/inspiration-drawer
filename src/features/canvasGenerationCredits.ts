import type { CanvasAiCredentialSource, CanvasImageItem } from './canvasModel';
import type { CanvasWorkflowTemplate } from './canvasTemplates';

export const CANVAS_LLM_NODE_CREDITS = 10;
export const CANVAS_DEFAULT_IMAGE_UNIT_CREDITS = 100;
export const CANVAS_DEFAULT_VIDEO_CREDITS_PER_SECOND = 500;

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
    creditsPerSecond?: string;
    creditsPerVideo?: string;
    creditsByDuration?: Record<string, string>;
    creditsByResolution?: Record<string, string>;
    creditsByCount?: Record<string, string>;
  }>;
  updatedAt?: string | null;
};

export const shouldShowCanvasGenerationCredits = (
  credentialSource?: CanvasAiCredentialSource | null,
) => credentialSource === 'wallet';

const rawImageModelToken = (model?: string | null) => String(model || '')
  .trim()
  .toLowerCase()
  .replace(/preview/g, '')
  .replace(/[^a-z0-9]+/g, '');

const imageModelToken = (model?: string | null) => {
  const token = rawImageModelToken(model);
  if (token.includes('nanobananapro')
    || token.includes('xaisnanopro')
    || token.includes('gemini3proimage')
    || token.includes('gemini31proimage')) return 'nanobananapro';
  if (token.includes('nanobanana2')
    || token.includes('xaisnano2')
    || token.includes('gemini31flashimage')
    || token.includes('gemini3flashimage')) return 'nanobanana2';
  if (token.includes('gptimage2') || token.includes('image2') || token.includes('img2')) return 'image2';
  return token;
};

const videoModelToken = (model?: string | null) => {
  const token = imageModelToken(model);
  if (token === 'sourcemix20' || token === 'seedance20') return 'seedance2';
  if (token === 'sourcemix20fast' || token === 'seedance20fast') return 'seedance2fast';
  return token;
};

const supportsImageOneK = (model?: string | null) => {
  const rawToken = rawImageModelToken(model);
  const token = imageModelToken(model);
  if (rawToken.includes('img2') && rawToken.includes('1k')) return false;
  if (rawToken.startsWith('xais') && rawToken.includes('1k')) return false;
  return token !== 'nanobanana2' && token !== 'nanobananapro';
};

type PricedImageResolution = '1k' | '2k' | '4k';

const getPricedImageResolution = (
  model?: string | null,
  resolution?: string | null,
): PricedImageResolution => {
  const requested = String(resolution || '').trim().toLowerCase();
  const token = rawImageModelToken(model);
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
  _capabilities?: readonly string[] | null,
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
  const isGptImage2 = token === 'image2';
  const isHighQuality = isGptImage2 && (
    /高画质|高品質|high[\s_-]*quality/i.test(rawModel)
    || token.endsWith('h')
    || token.includes('image2h')
    || token.includes('img2h')
    || token.includes('highquality')
  );
  void isHighQuality;

  if (isGptImage2) {
    if (selectedResolution === '1k') return 10;
    return selectedResolution === '4k' ? 18 : 15;
  }

  const isNanoBananaPro = token === 'nanobananapro';
  if (isNanoBananaPro) return selectedResolution === '4k' ? 20 : 18;

  const isNanoBanana2 = token === 'nanobanana2';
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
> & {
  capabilities?: readonly string[] | null;
};

export const estimateCanvasImageGenerationCredits = (
  ai?: CanvasImageCreditInput | null,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const outputCount = getImageOutputCount(ai?.count);
  const unitCredits = getCanvasImageUnitCredits(ai?.model, ai?.resolution, pricing, ai?.capabilities);
  return {
    outputCount,
    unitCredits,
    totalCredits: outputCount * unitCredits,
  };
};

export const getCanvasVideoCreditsPerSecond = (
  model?: string | null,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const token = videoModelToken(model);
  const configuredModel = pricing?.videoModels.find(item => videoModelToken(item.model) === token);
  const configuredCredits = Number(
    configuredModel?.creditsPerSecond
      ?? configuredModel?.credits
      ?? pricing?.videoDefaultCredits,
  );
  return Number.isSafeInteger(configuredCredits) && configuredCredits >= 0
    ? configuredCredits
    : CANVAS_DEFAULT_VIDEO_CREDITS_PER_SECOND;
};

export const getCanvasVideoRequestCredits = (
  model?: string | null,
  duration?: number | null,
  count?: number | null,
  resolution?: string | null,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const token = videoModelToken(model);
  const configuredModel = pricing?.videoModels.find(item => videoModelToken(item.model) === token);
  const safeDuration = Math.max(1, Math.ceil(Number(duration) || 15));
  const safeCount = Math.max(1, Math.ceil(Number(count) || 1));
  const durationKey = String(safeDuration);
  const resolutionKey = String(resolution || '720p').trim().toLowerCase() || '720p';
  const countKey = String(safeCount);
  const countOverride = configuredModel?.creditsByCount?.[countKey];
  if (countOverride !== undefined) {
    const parsed = Number(countOverride);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }

  const perSecond = getCanvasVideoCreditsPerSecond(model, pricing);
  const durationOverride = configuredModel?.creditsByDuration?.[durationKey];
  const durationCredits = durationOverride !== undefined
    ? Number(durationOverride)
    : safeDuration * perSecond;
  const perVideo = Number(configuredModel?.creditsPerVideo ?? 0);
  const resolutionSurchargePerSecond = Number(configuredModel?.creditsByResolution?.[resolutionKey] ?? 0);
  if (![durationCredits, perVideo, resolutionSurchargePerSecond].every(value => Number.isSafeInteger(value) && value >= 0)) {
    return safeCount * safeDuration * perSecond;
  }
  return (durationCredits + perVideo + resolutionSurchargePerSecond * safeDuration) * safeCount;
};

export const estimateCanvasVideoGenerationCredits = (
  ai?: Pick<NonNullable<CanvasImageItem['ai']>, 'model' | 'count' | 'duration' | 'resolution'> | null,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const outputCount = getImageOutputCount(ai?.count);
  const durationSeconds = Math.max(1, Math.ceil(Number(ai?.duration) || 15));
  const creditsPerSecond = getCanvasVideoCreditsPerSecond(ai?.model, pricing);
  return {
    outputCount,
    durationSeconds,
    creditsPerSecond,
    totalCredits: getCanvasVideoRequestCredits(
      ai?.model,
      durationSeconds,
      outputCount,
      ai?.resolution,
      pricing,
    ),
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
      duration: node.ai?.duration,
      resolution: node.ai?.resolution,
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
