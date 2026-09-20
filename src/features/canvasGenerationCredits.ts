import type { CanvasAiCredentialSource, CanvasImageItem } from './canvasModel';
import type { CanvasWorkflowTemplate } from './canvasTemplates';

export const CANVAS_LLM_NODE_CREDITS = 10;
export const CANVAS_DEFAULT_IMAGE_UNIT_CREDITS = 100;
export const CANVAS_DEFAULT_VIDEO_CREDITS_PER_SECOND = 500;

export type CanvasCreditPricingState = 'loading' | 'ready' | 'unavailable';

export type CanvasImageBillingType =
  | 'image_flat'
  | 'image_count'
  | 'image_resolution';

export type CanvasVideoBillingType =
  | 'video_flat'
  | 'video_second'
  | 'video_duration'
  | 'video_resolution_duration';

export type CanvasTextAgentCreditRole =
  | 'requirement_analyzer'
  | 'inspiration_analyzer'
  | 'design_strategist'
  | 'design_reviewer'
  | 'presentation_writer'
  | 'seedance_video_analyzer'
  | 'general'
  | string;

export type CanvasAiCreditPricing = {
  agentRequestCredits: string;
  inspirationAnalysisCredits: string;
  canvasTextAgentCredits?: string;
  imageDefaultCredits: string;
  videoDefaultCredits: string;
  imageModels: Array<{
    model: string;
    billingType?: CanvasImageBillingType;
    creditsPerRequest?: string;
    creditsPerImage?: string;
    creditsByResolution?: Record<string, string>;
    credits1k?: string;
    credits2k?: string;
    credits4k?: string;
  }>;
  videoModels: Array<{
    model: string;
    billingType?: CanvasVideoBillingType;
    credits: string;
    creditsPerSecond?: string;
    creditsPerVideo?: string;
    creditsByDuration?: Record<string, string>;
    creditsByResolution?: Record<string, string>;
    creditsByCount?: Record<string, string>;
    includedReferenceImages?: number;
    creditsPerExtraReferenceImage?: string;
    creditsPerReferenceVideoSecond?: string;
    referenceVideoCreditsByResolution?: Record<string, string>;
  }>;
  updatedAt?: string | null;
};

export const shouldShowCanvasGenerationCredits = (
  credentialSource?: CanvasAiCredentialSource | null,
) => credentialSource === 'wallet';

export const getCanvasTextAgentRequestCredits = (
  pricing?: CanvasAiCreditPricing | null,
  role?: CanvasTextAgentCreditRole | null,
) => {
  const configuredCredits = Number(
    role === 'inspiration_analyzer'
      ? pricing?.inspirationAnalysisCredits
      : pricing?.canvasTextAgentCredits ?? pricing?.agentRequestCredits,
  );
  return Number.isFinite(configuredCredits) && configuredCredits >= 0
    ? configuredCredits
    : CANVAS_LLM_NODE_CREDITS;
};

export const estimateCanvasTextAgentCredits = (
  pricing?: CanvasAiCreditPricing | null,
  role?: CanvasTextAgentCreditRole | null,
  options: { serverDriven?: boolean } = {},
): CanvasTextAgentCreditEstimate => {
  if (options.serverDriven && !pricing) {
    return { available: false, reason: 'pricing_loading', totalCredits: 0 };
  }
  // Older wallet responses do not expose CANVAS_TEXT yet. In that case the
  // server's explicit agent request price remains the compatible price for
  // ordinary workflow text-agent roles; it is not a client-side default.
  const configuredValue = role === 'inspiration_analyzer'
    ? pricing?.inspirationAnalysisCredits
    : pricing?.canvasTextAgentCredits ?? pricing?.agentRequestCredits;
  const configuredCredits = Number(configuredValue);
  if (options.serverDriven && (!Number.isFinite(configuredCredits) || configuredCredits < 0)) {
    return { available: false, reason: 'pricing_unavailable', totalCredits: 0 };
  }
  const unitCredits = getCanvasTextAgentRequestCredits(pricing, role);
  return { available: true, unitCredits, totalCredits: unitCredits };
};

export type CanvasTextAgentCreditEstimate = {
  available: boolean;
  reason?: 'pricing_loading' | 'pricing_unavailable';
  unitCredits?: number;
  totalCredits: number;
};

const rawImageModelToken = (model?: string | null) => String(model || '')
  .trim()
  .toLowerCase()
  .replace(/preview/g, '')
  .replace(/[^a-z0-9]+/g, '');

const imageModelToken = (model?: string | null) => {
  const token = rawImageModelToken(model);
  if (token.includes('nanobananaprofast')) return 'nanobananaprofast';
  if (token.includes('nanobanana2fast')) return 'nanobanana2fast';
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

const imagePricingToken = (
  model?: string | null,
  capabilities?: readonly string[] | null,
) => {
  const token = imageModelToken(model);
  const normalizedCapabilities = new Set((capabilities || [])
    .map(item => String(item || '').trim().toUpperCase())
    .filter(Boolean));
  if (token === 'nanobananapro'
    && normalizedCapabilities.has('IMAGE_NANO_BANANA_PRO_FAST')) return 'nanobananaprofast';
  if (token === 'nanobanana2'
    && normalizedCapabilities.has('IMAGE_NANO_BANANA_2_FAST')) return 'nanobanana2fast';
  return token;
};

// The wallet catalog uses canonical model ids, while older saved workflows
// may still contain the provider-facing ids below. Keep this mapping explicit
// and finite: it is a compatibility bridge, not a fuzzy/similar-model match.
const CANONICAL_IMAGE_PRICING_MODEL_BY_TOKEN: Record<string, string> = {
  nanobananapro: 'nano-banana-pro',
  nanobananaprofast: 'nano-banana-pro-fast',
  nanobanana2: 'nano-banana-2',
  nanobanana2fast: 'nano-banana-2-fast',
  image2: 'image2',
};

const getKnownCanonicalImagePricingModel = (
  model?: string | null,
  capabilities?: readonly string[] | null,
) => CANONICAL_IMAGE_PRICING_MODEL_BY_TOKEN[imagePricingToken(model, capabilities)];

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
  capabilities?: readonly string[] | null,
) => {
  const rawModel = String(model || '');
  const token = imageModelToken(rawModel);
  const pricingToken = imagePricingToken(rawModel, capabilities);
  const selectedResolution = getPricedImageResolution(rawModel, resolution);
  // Canonical server pricing is authoritative. Token normalization below is
  // retained only for legacy route ids and older pricing responses.
  const configuredModel = pricing?.imageModels.find(item => item.model === rawModel.trim())
    || pricing?.imageModels.find(item => imageModelToken(item.model) === pricingToken)
    || (pricingToken !== token
      ? pricing?.imageModels.find(item => imageModelToken(item.model) === token)
      : undefined);
  if (configuredModel) {
    const configuredCredits = selectedResolution === '1k'
      ? configuredModel.credits1k ?? configuredModel.credits2k
      : selectedResolution === '4k' ? configuredModel.credits4k : configuredModel.credits2k;
    const parsedCredits = Number(configuredCredits);
    if (Number.isFinite(parsedCredits) && parsedCredits >= 0) return parsedCredits;
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

  const isNanoBananaPro = token === 'nanobananapro' || token === 'nanobananaprofast';
  if (isNanoBananaPro) return selectedResolution === '4k' ? 20 : 18;

  const isNanoBanana2 = token === 'nanobanana2' || token === 'nanobanana2fast';
  if (isNanoBanana2) return selectedResolution === '4k' ? 18 : 15;

  const configuredDefault = Number(pricing?.imageDefaultCredits);
  return Number.isFinite(configuredDefault) && configuredDefault >= 0
    ? configuredDefault
    : CANVAS_DEFAULT_IMAGE_UNIT_CREDITS;
};

export const normalizeCreditEstimateOutputCount = (
  count?: number | null,
  maxOutputs = 4,
) => {
  const normalized = Math.round(Number(count) || 1);
  const normalizedMaximum = Math.max(1, Math.floor(Number(maxOutputs) || 4));
  return Math.max(1, Math.min(normalizedMaximum, normalized));
};

const hasConfiguredImageModel = (
  model: string | null | undefined,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const token = imageModelToken(model);
  const exact = String(model || '').trim();
  return Boolean(exact && pricing?.imageModels.some(item => item.model === exact))
    || Boolean(token && pricing?.imageModels.some(item => imageModelToken(item.model) === token));
};

export type CanvasImageCreditInput = Pick<
  NonNullable<CanvasImageItem['ai']>,
  'model' | 'resolution' | 'count'
> & {
  capabilities?: readonly string[] | null;
  supportedResolutions?: readonly string[] | null;
  defaultResolution?: string | null;
  serverDriven?: boolean;
  maxOutputs?: number | null;
};

export type CanvasImageCreditEstimate = {
  available: boolean;
  reason?: 'pricing_loading' | 'pricing_unavailable' | 'resolution_required';
  billingType?: CanvasImageBillingType;
  outputCount: number;
  resolution: string;
  unitCredits?: number;
  creditsPerRequest?: number;
  creditsPerImage?: number;
  totalCredits: number;
};

type CanvasImagePrice = CanvasAiCreditPricing['imageModels'][number];

const resolveImageBillingType = (price?: CanvasImagePrice | null): CanvasImageBillingType => (
  price?.billingType || 'image_resolution'
);

const findCanvasImagePrice = (
  model: string | null | undefined,
  pricing: CanvasAiCreditPricing | null | undefined,
  exactOnly: boolean,
  capabilities?: readonly string[] | null,
) => {
  const exactModel = String(model || '').trim();
  const exact = pricing?.imageModels.find(item => item.model === exactModel);
  if (exact) return exact;
  if (exactOnly) {
    const canonicalModel = getKnownCanonicalImagePricingModel(model, capabilities);
    return canonicalModel
      ? pricing?.imageModels.find(item => item.model === canonicalModel)
      : undefined;
  }
  const token = imageModelToken(model);
  const pricingToken = imagePricingToken(model, capabilities);
  return pricing?.imageModels.find(item => imageModelToken(item.model) === pricingToken)
    || (pricingToken !== token
      ? pricing?.imageModels.find(item => imageModelToken(item.model) === token)
      : undefined);
};

const normalizedResolution = (value?: string | null) => String(value || '').trim().toLowerCase();

const resolveServerImageResolution = (ai?: CanvasImageCreditInput | null) => {
  const requested = normalizedResolution(ai?.resolution);
  if (requested) return requested;
  const supported = Array.from(new Set((ai?.supportedResolutions || [])
    .map(normalizedResolution)
    .filter(Boolean)));
  const preferred = normalizedResolution(ai?.defaultResolution);
  if (preferred && (supported.length === 0 || supported.includes(preferred))) return preferred;
  if (supported.length === 1) return supported[0]!;
  // Older workflow snapshots encode the selected resolution in the provider
  // model id (for example `Xais Nano Pro_2K`) and omit `ai.resolution`.
  // Recover only that explicit suffix; do not invent a default for an
  // otherwise ambiguous canonical model.
  const encodedResolution = rawImageModelToken(ai?.model).match(/(?:1k|2k|4k)/)?.[0];
  return encodedResolution || '';
};

const unavailableImageEstimate = (
  outputCount: number,
  resolution: string,
  reason: NonNullable<CanvasImageCreditEstimate['reason']>,
  billingType?: CanvasImageBillingType,
): CanvasImageCreditEstimate => ({
  available: false,
  reason,
  ...(billingType ? { billingType } : {}),
  outputCount,
  resolution,
  totalCredits: 0,
});

export const estimateCanvasImageGenerationCredits = (
  ai?: CanvasImageCreditInput | null,
  pricing?: CanvasAiCreditPricing | null,
): CanvasImageCreditEstimate => {
  const outputCount = normalizeCreditEstimateOutputCount(ai?.count, ai?.maxOutputs ?? 4);
  const resolution = ai?.serverDriven
    ? resolveServerImageResolution(ai)
    : getPricedImageResolution(ai?.model, ai?.resolution);
  if (ai?.serverDriven && !pricing) {
    return unavailableImageEstimate(outputCount, resolution, 'pricing_loading');
  }
  const configuredModel = findCanvasImagePrice(
    ai?.model,
    pricing,
    Boolean(ai?.serverDriven),
    ai?.capabilities,
  );
  if (ai?.serverDriven && !configuredModel) {
    return unavailableImageEstimate(outputCount, resolution, 'pricing_unavailable');
  }
  if (ai?.serverDriven && !configuredModel?.billingType) {
    return unavailableImageEstimate(outputCount, resolution, 'pricing_unavailable');
  }
  const billingType = resolveImageBillingType(configuredModel);
  if (billingType === 'image_flat') {
    const creditsPerRequest = nonNegativeCredit(configuredModel?.creditsPerRequest);
    if (creditsPerRequest === null) {
      return unavailableImageEstimate(outputCount, resolution, 'pricing_unavailable', billingType);
    }
    return {
      available: true,
      billingType,
      outputCount,
      resolution,
      unitCredits: creditsPerRequest,
      creditsPerRequest,
      totalCredits: creditsPerRequest,
    };
  }
  if (billingType === 'image_count') {
    const creditsPerImage = nonNegativeCredit(configuredModel?.creditsPerImage);
    if (creditsPerImage === null) {
      return unavailableImageEstimate(outputCount, resolution, 'pricing_unavailable', billingType);
    }
    return {
      available: true,
      billingType,
      outputCount,
      resolution,
      unitCredits: creditsPerImage,
      creditsPerImage,
      totalCredits: creditsPerImage * outputCount,
    };
  }
  if (ai?.serverDriven && !resolution) {
    return unavailableImageEstimate(outputCount, resolution, 'resolution_required', billingType);
  }
  if (configuredModel) {
    const configuredCredits = configuredModel.creditsByResolution?.[resolution]
      ?? (!ai?.serverDriven
        ? resolution === '1k'
          ? configuredModel.credits1k
          : resolution === '4k' ? configuredModel.credits4k : resolution === '2k' ? configuredModel.credits2k : undefined
        : undefined);
    const unitCredits = nonNegativeCredit(configuredCredits);
    if (unitCredits !== null) {
      return {
        available: true,
        billingType,
        outputCount,
        resolution,
        unitCredits,
        creditsPerImage: unitCredits,
        totalCredits: unitCredits * outputCount,
      };
    }
    if (ai?.serverDriven) {
      return unavailableImageEstimate(outputCount, resolution, 'pricing_unavailable', billingType);
    }
  }
  const unitCredits = getCanvasImageUnitCredits(ai?.model, resolution, pricing, ai?.capabilities);
  return {
    available: true,
    billingType: 'image_resolution',
    outputCount,
    resolution,
    unitCredits,
    creditsPerImage: unitCredits,
    totalCredits: outputCount * unitCredits,
  };
};

export const getCanvasVideoCreditsPerSecond = (
  model?: string | null,
  pricing?: CanvasAiCreditPricing | null,
) => {
  const token = videoModelToken(model);
  const exactModel = String(model || '').trim();
  const configuredModel = pricing?.videoModels.find(item => item.model === exactModel)
    || pricing?.videoModels.find(item => videoModelToken(item.model) === token);
  const billingType = resolveVideoBillingType(configuredModel);
  const configuredCredits = Number(configuredModel
    ? billingType === 'video_second' || billingType === 'video_duration'
      ? configuredModel.creditsPerSecond ?? configuredModel.credits
      : 0
    : pricing?.videoDefaultCredits);
  return Number.isFinite(configuredCredits) && configuredCredits >= 0
    ? configuredCredits
    : CANVAS_DEFAULT_VIDEO_CREDITS_PER_SECOND;
};

type CanvasVideoPrice = CanvasAiCreditPricing['videoModels'][number];

export const resolveVideoBillingType = (
  price?: CanvasVideoPrice | null,
): CanvasVideoBillingType => {
  if (price?.billingType) return price.billingType;
  if (price?.creditsPerVideo !== undefined) return 'video_flat';
  if (price?.creditsByResolution !== undefined) return 'video_resolution_duration';
  if (price?.creditsByDuration !== undefined) return 'video_duration';
  return 'video_second';
};

const nonNegativeCredit = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const findCanvasVideoPrice = (
  model: string | null | undefined,
  pricing: CanvasAiCreditPricing | null | undefined,
  exactOnly: boolean,
) => {
  const exactModel = String(model || '').trim();
  const exact = pricing?.videoModels.find(item => item.model === exactModel);
  if (exact || exactOnly) return exact;
  const token = videoModelToken(model);
  return pricing?.videoModels.find(item => videoModelToken(item.model) === token);
};

export type CanvasVideoCreditEstimate = {
  available: boolean;
  reason?: 'pricing_loading' | 'pricing_unavailable' | 'resolution_required';
  billingType?: CanvasVideoBillingType;
  outputCount: number;
  durationSeconds: number;
  resolution: string;
  unitCredits?: number;
  creditsPerSecond?: number;
  creditsPerVideo?: number;
  durationTierSeconds?: number;
  baseCredits: number;
  surchargeCredits: number;
  totalCredits: number;
};

export type CanvasVideoCreditInput = {
  model?: string | null;
  count?: number | null;
  duration?: number | null;
  resolution?: string | null;
  /** AI Center catalog models must have an exact canonical pricing projection. */
  serverDriven?: boolean;
  maxOutputs?: number | null;
};

const unavailableVideoEstimate = (
  outputCount: number,
  durationSeconds: number,
  resolution: string,
  billingType?: CanvasVideoBillingType,
  reason: NonNullable<CanvasVideoCreditEstimate['reason']> = 'pricing_unavailable',
): CanvasVideoCreditEstimate => ({
  available: false,
  reason,
  ...(billingType ? { billingType } : {}),
  outputCount,
  durationSeconds,
  resolution,
  baseCredits: 0,
  surchargeCredits: 0,
  totalCredits: 0,
});

const calculateCanvasVideoCreditEstimate = (
  ai: CanvasVideoCreditInput | null | undefined,
  pricing: CanvasAiCreditPricing | null | undefined,
  references: { imageCount?: number | null; videoCount?: number | null },
): CanvasVideoCreditEstimate => {
  const outputCount = normalizeCreditEstimateOutputCount(ai?.count, ai?.maxOutputs ?? 4);
  const durationSeconds = Math.max(1, Math.ceil(Number(ai?.duration) || 15));
  const requestedResolution = String(ai?.resolution || '').trim().toLowerCase();
  const resolution = ai?.serverDriven
    ? requestedResolution
    : requestedResolution || '720p';
  if (ai?.serverDriven && !pricing) {
    return unavailableVideoEstimate(outputCount, durationSeconds, resolution, undefined, 'pricing_loading');
  }
  const configuredModel = findCanvasVideoPrice(ai?.model, pricing, Boolean(ai?.serverDriven));
  if (ai?.serverDriven && !configuredModel) {
    return unavailableVideoEstimate(outputCount, durationSeconds, resolution);
  }
  const billingType = resolveVideoBillingType(configuredModel);
  if (ai?.serverDriven && billingType === 'video_resolution_duration' && !resolution) {
    return unavailableVideoEstimate(
      outputCount,
      durationSeconds,
      resolution,
      billingType,
      'resolution_required',
    );
  }
  let unitCredits: number | null = null;
  let creditsPerSecond: number | undefined;
  let creditsPerVideo: number | undefined;
  let durationTierSeconds: number | undefined;
  let baseCredits = 0;

  if (billingType === 'video_flat') {
    unitCredits = nonNegativeCredit(configuredModel?.creditsPerVideo);
    if (unitCredits !== null) {
      creditsPerVideo = unitCredits;
      baseCredits = unitCredits * outputCount;
    }
  } else if (billingType === 'video_second') {
    unitCredits = nonNegativeCredit(configuredModel?.creditsPerSecond
      ?? configuredModel?.credits
      ?? pricing?.videoDefaultCredits
      ?? CANVAS_DEFAULT_VIDEO_CREDITS_PER_SECOND);
    if (unitCredits !== null) {
      creditsPerSecond = unitCredits;
      baseCredits = unitCredits * durationSeconds * outputCount;
    }
  } else if (billingType === 'video_duration') {
    const durationPrice = nonNegativeCredit(configuredModel?.creditsByDuration?.[String(durationSeconds)]);
    if (durationPrice !== null) {
      unitCredits = durationPrice;
      creditsPerVideo = durationPrice;
      durationTierSeconds = durationSeconds;
      baseCredits = durationPrice * outputCount;
    } else {
      const fallback = nonNegativeCredit(configuredModel?.creditsPerSecond);
      if (fallback !== null) {
        unitCredits = fallback;
        creditsPerSecond = fallback;
        baseCredits = fallback * durationSeconds * outputCount;
      }
    }
  } else {
    unitCredits = nonNegativeCredit(configuredModel?.creditsByResolution?.[resolution]);
    if (unitCredits !== null) {
      creditsPerSecond = unitCredits;
      baseCredits = unitCredits * durationSeconds * outputCount;
    }
  }
  if (unitCredits === null || !Number.isFinite(baseCredits)) {
    return unavailableVideoEstimate(outputCount, durationSeconds, resolution, billingType);
  }

  const imageCount = Math.max(0, Math.floor(Number(references.imageCount) || 0));
  const videoCount = Math.max(0, Math.floor(Number(references.videoCount) || 0));
  const includedReferenceImages = Math.max(0, Math.floor(Number(configuredModel?.includedReferenceImages) || 0));
  const extraReferenceImageCount = Math.max(0, imageCount - includedReferenceImages);
  const extraReferenceImageCredits = nonNegativeCredit(configuredModel?.creditsPerExtraReferenceImage ?? 0);
  const referenceVideoBase = nonNegativeCredit(configuredModel?.creditsPerReferenceVideoSecond ?? 0);
  const referenceVideoResolution = nonNegativeCredit(configuredModel?.referenceVideoCreditsByResolution?.[resolution] ?? 0);
  if (extraReferenceImageCredits === null || referenceVideoBase === null || referenceVideoResolution === null) {
    return unavailableVideoEstimate(outputCount, durationSeconds, resolution, billingType);
  }
  const surchargeCredits = (
    extraReferenceImageCount * extraReferenceImageCredits
    + videoCount * durationSeconds * (referenceVideoBase + referenceVideoResolution)
  ) * outputCount;
  const totalCredits = baseCredits + surchargeCredits;
  if (!Number.isFinite(totalCredits) || totalCredits < 0) {
    return unavailableVideoEstimate(outputCount, durationSeconds, resolution, billingType);
  }
  return {
    available: true,
    billingType,
    outputCount,
    durationSeconds,
    resolution,
    unitCredits,
    ...(creditsPerSecond !== undefined ? { creditsPerSecond } : {}),
    ...(creditsPerVideo !== undefined ? { creditsPerVideo } : {}),
    ...(durationTierSeconds !== undefined ? { durationTierSeconds } : {}),
    baseCredits,
    surchargeCredits,
    totalCredits,
  };
};

export const getCanvasVideoRequestCredits = (
  model?: string | null,
  duration?: number | null,
  count?: number | null,
  resolution?: string | null,
  pricing?: CanvasAiCreditPricing | null,
  references: { imageCount?: number | null; videoCount?: number | null } = {},
) => {
  return calculateCanvasVideoCreditEstimate({ model, duration, count, resolution }, pricing, references).totalCredits;
};

export const estimateCanvasVideoGenerationCredits = (
  ai?: CanvasVideoCreditInput | null,
  pricing?: CanvasAiCreditPricing | null,
  references: { imageCount?: number | null; videoCount?: number | null } = {},
) => {
  return calculateCanvasVideoCreditEstimate(ai, pricing, references);
};

const displayCredits = (value: number) => new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 6,
}).format(value);

export const describeCanvasImageCreditEstimate = (estimate: CanvasImageCreditEstimate) => {
  if (estimate.reason === 'pricing_loading') return '价格加载中…';
  if (estimate.reason === 'resolution_required') return '请选择清晰度';
  if (!estimate.available || !estimate.billingType) return '价格未配置';
  const total = displayCredits(estimate.totalCredits);
  let calculation: string;
  if (estimate.billingType === 'image_flat') {
    calculation = `${displayCredits(estimate.creditsPerRequest ?? estimate.unitCredits ?? 0)} 积分/次`;
  } else if (estimate.billingType === 'image_count') {
    calculation = `${displayCredits(estimate.creditsPerImage ?? estimate.unitCredits ?? 0)} 积分/张 × ${estimate.outputCount} 张`;
  } else {
    calculation = `${estimate.resolution.toUpperCase()} · ${displayCredits(estimate.creditsPerImage ?? estimate.unitCredits ?? 0)} 积分/张 × ${estimate.outputCount} 张`;
  }
  return `预计需要 ${total} 积分：${calculation}`;
};

export const describeCanvasVideoCreditEstimate = (estimate: CanvasVideoCreditEstimate) => {
  if (estimate.reason === 'pricing_loading') return '价格加载中…';
  if (estimate.reason === 'resolution_required') return '请选择清晰度';
  if (!estimate.available || !estimate.billingType) return '价格未配置';
  const total = displayCredits(estimate.totalCredits);
  const count = estimate.outputCount;
  let calculation: string;
  if (estimate.billingType === 'video_flat') {
    calculation = `${displayCredits(estimate.creditsPerVideo ?? estimate.unitCredits ?? 0)} 积分/条 × ${count} 条`;
  } else if (estimate.billingType === 'video_second') {
    calculation = `${displayCredits(estimate.creditsPerSecond ?? estimate.unitCredits ?? 0)} 积分/秒 × ${estimate.durationSeconds} 秒 × ${count} 条`;
  } else if (estimate.billingType === 'video_duration' && estimate.durationTierSeconds !== undefined) {
    calculation = `${estimate.durationTierSeconds} 秒档 · ${displayCredits(estimate.creditsPerVideo ?? estimate.unitCredits ?? 0)} 积分/条 × ${count} 条`;
  } else if (estimate.billingType === 'video_duration') {
    calculation = `${displayCredits(estimate.creditsPerSecond ?? estimate.unitCredits ?? 0)} 积分/秒 × ${estimate.durationSeconds} 秒 × ${count} 条（备用每秒价）`;
  } else {
    calculation = `${estimate.resolution.toUpperCase()} · ${displayCredits(estimate.creditsPerSecond ?? estimate.unitCredits ?? 0)} 积分/秒 × ${estimate.durationSeconds} 秒 × ${count} 条`;
  }
  const surcharge = estimate.surchargeCredits > 0
    ? `；参考素材附加 ${displayCredits(estimate.surchargeCredits)} 积分`
    : '';
  return `预计需要 ${total} 积分：${calculation}${surcharge}`;
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
  pricingState: CanvasCreditPricingState;
  pricingAvailable?: false;
};

type CanvasWorkflowCreditOptions = {
  resolveImageModel?: (node: CanvasWorkflowTemplate['nodes'][number]) => string | undefined;
  resolveImagePricingIdentity?: (node: CanvasWorkflowTemplate['nodes'][number]) => {
    model?: string;
    capabilities?: readonly string[];
    supportedResolutions?: readonly string[];
    defaultResolution?: string;
    serverDriven?: boolean;
    maxOutputs?: number;
  } | undefined;
  resolveVideoPricingIdentity?: (node: CanvasWorkflowTemplate['nodes'][number]) => {
    model?: string;
    serverDriven?: boolean;
    maxOutputs?: number;
  } | undefined;
  serverDriven?: boolean;
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
      pricingState: 'ready',
    };
  }

  const imageNodes = workflow.nodes.filter(node => node.ai?.type === 'image-generator');
  const imageEstimate = imageNodes.reduce((summary, node) => {
    const savedModel = node.ai?.model;
    const pricingIdentity = options.resolveImagePricingIdentity?.(node);
    const resolvedModel = options.resolveImageModel?.(node);
    const serverDriven = pricingIdentity?.serverDriven ?? options.serverDriven ?? false;
    // Historical workflows can contain retired/unrecognised model labels. They
    // are executed with the current provider fallback, so pricing the stale
    // label at the generic 100-credit sentinel overstates the real run.
    const savedModelIsPriced = !serverDriven && options.pricing
      ? hasConfiguredImageModel(savedModel, options.pricing)
      : !serverDriven
        && getCanvasImageUnitCredits(savedModel, node.ai?.resolution) !== CANVAS_DEFAULT_IMAGE_UNIT_CREDITS;
    const model = pricingIdentity?.model
      || (savedModel && savedModelIsPriced ? savedModel : resolvedModel || savedModel);
    const estimate = estimateCanvasImageGenerationCredits({
      model,
      resolution: node.ai?.resolution,
      count: node.ai?.count,
      capabilities: pricingIdentity?.capabilities,
      supportedResolutions: pricingIdentity?.supportedResolutions,
      defaultResolution: pricingIdentity?.defaultResolution,
      serverDriven,
      maxOutputs: pricingIdentity?.maxOutputs,
    }, options.pricing);
    return {
      outputCount: summary.outputCount + estimate.outputCount,
      credits: summary.credits + estimate.totalCredits,
      estimates: [...summary.estimates, estimate],
    };
  }, { outputCount: 0, credits: 0, estimates: [] as CanvasImageCreditEstimate[] });
  const videoNodes = workflow.nodes.filter(node => node.ai?.type === 'video-generator');
  const videoEstimate = videoNodes.reduce((summary, node) => {
    const pricingIdentity = options.resolveVideoPricingIdentity?.(node);
    const estimate = estimateCanvasVideoGenerationCredits({
      model: pricingIdentity?.model || node.ai?.model,
      count: node.ai?.count,
      duration: node.ai?.duration,
      resolution: node.ai?.resolution,
      serverDriven: pricingIdentity?.serverDriven ?? options.serverDriven,
      maxOutputs: pricingIdentity?.maxOutputs,
    }, options.pricing);
    return {
      outputCount: summary.outputCount + estimate.outputCount,
      credits: summary.credits + estimate.totalCredits,
      estimates: [...summary.estimates, estimate],
    };
  }, { outputCount: 0, credits: 0, estimates: [] as CanvasVideoCreditEstimate[] });
  const llmNodeCount = workflow.nodes.filter(isWorkflowLlmNode).length;
  const llmEstimate = llmNodeCount > 0
    ? estimateCanvasTextAgentCredits(options.pricing, undefined, { serverDriven: options.serverDriven })
    : null;
  const llmCredits = llmNodeCount * (llmEstimate?.unitCredits ?? 0);
  const unavailableReasons = [
    ...imageEstimate.estimates.map(estimate => estimate.reason),
    ...videoEstimate.estimates.map(estimate => estimate.reason),
    llmEstimate?.reason,
  ].filter(Boolean);
  const pricingState: CanvasCreditPricingState = unavailableReasons.includes('pricing_loading')
    ? 'loading'
    : unavailableReasons.length > 0 ? 'unavailable' : 'ready';

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
    pricingState,
    ...(pricingState !== 'ready' ? { pricingAvailable: false as const } : {}),
  };
};
