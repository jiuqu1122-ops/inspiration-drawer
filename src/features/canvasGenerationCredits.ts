import type { CanvasImageItem } from './canvasModel';
import type { CanvasWorkflowTemplate } from './canvasTemplates';

export const CANVAS_LLM_NODE_CREDITS = 10;
export const CANVAS_DEFAULT_IMAGE_UNIT_CREDITS = 100;

const imageModelToken = (model?: string | null) => String(model || '')
  .trim()
  .toLowerCase()
  .replace(/preview/g, '')
  .replace(/[^a-z0-9]+/g, '');

type PricedImageResolution = '1k' | '2k' | '4k';

const getPricedImageResolution = (
  model?: string | null,
  resolution?: string | null,
): PricedImageResolution => {
  const token = imageModelToken(model);
  if (token.includes('4k')) return '4k';
  if (token.includes('2k')) return '2k';
  if (token.includes('1k')) return '1k';
  const requested = String(resolution || '').trim().toLowerCase();
  if (requested === '1k' || requested === '4k') return requested;
  return '2k';
};

export const getCanvasImageUnitCredits = (
  model?: string | null,
  resolution?: string | null,
) => {
  const rawModel = String(model || '');
  const token = imageModelToken(rawModel);
  const selectedResolution = getPricedImageResolution(rawModel, resolution);
  const isGptImage2 = token.includes('gptimage2')
    || token.includes('image2')
    || token.includes('img2');
  const isHighQuality = isGptImage2 && (
    rawModel.includes('高画质')
    || token.endsWith('h')
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

  return CANVAS_DEFAULT_IMAGE_UNIT_CREDITS;
};

const getImageOutputCount = (count?: number | null) => {
  const normalized = Math.round(Number(count) || 1);
  return Math.max(1, Math.min(4, normalized));
};

type CanvasImageCreditInput = Pick<
  NonNullable<CanvasImageItem['ai']>,
  'model' | 'resolution' | 'count'
>;

export const estimateCanvasImageGenerationCredits = (ai?: CanvasImageCreditInput | null) => {
  const outputCount = getImageOutputCount(ai?.count);
  const unitCredits = getCanvasImageUnitCredits(ai?.model, ai?.resolution);
  return {
    outputCount,
    unitCredits,
    totalCredits: outputCount * unitCredits,
  };
};

export type CanvasWorkflowCreditEstimate = {
  imageNodeCount: number;
  imageOutputCount: number;
  llmNodeCount: number;
  imageCredits: number;
  llmCredits: number;
  totalCredits: number;
};

type CanvasWorkflowCreditOptions = {
  resolveImageModel?: (node: CanvasWorkflowTemplate['nodes'][number]) => string | undefined;
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
      llmNodeCount: 0,
      imageCredits: 0,
      llmCredits: 0,
      totalCredits: 0,
    };
  }

  const imageNodes = workflow.nodes.filter(node => node.ai?.type === 'image-generator');
  const imageEstimate = imageNodes.reduce((summary, node) => {
    const estimate = estimateCanvasImageGenerationCredits({
      model: node.ai?.model || options.resolveImageModel?.(node),
      resolution: node.ai?.resolution,
      count: node.ai?.count,
    });
    return {
      outputCount: summary.outputCount + estimate.outputCount,
      credits: summary.credits + estimate.totalCredits,
    };
  }, { outputCount: 0, credits: 0 });
  const llmNodeCount = workflow.nodes.filter(isWorkflowLlmNode).length;
  const llmCredits = llmNodeCount * CANVAS_LLM_NODE_CREDITS;

  return {
    imageNodeCount: imageNodes.length,
    imageOutputCount: imageEstimate.outputCount,
    llmNodeCount,
    imageCredits: imageEstimate.credits,
    llmCredits,
    totalCredits: imageEstimate.credits + llmCredits,
  };
};
