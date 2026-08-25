import type { RoundedSelectOption } from '../components/RoundedSelect';
import {
  getCanvasAiPublicImageModelName,
  getXaisImage2RatioOptions,
  normalizeCanvasAiImageResolution,
  normalizeXaisImage2Model,
  resolveXaisImage2Ratio,
} from '../features/canvasAiImage';

const CANVAS_AI_ASPECT_RATIOS = ['1:1', '3:4', '4:3', '9:16', '16:9'];
export const CANVAS_AI_DEFAULT_ASPECT_RATIO = '16:9';
const CANVAS_AI_ASPECT_RATIO_OPTIONS: RoundedSelectOption[] = CANVAS_AI_ASPECT_RATIOS.map(ratio => ({
  value: ratio,
  label: ratio,
}));
export const CANVAS_AI_NEW_API_VIDEO_ASPECT_RATIO_OPTIONS: RoundedSelectOption[] = ['16:9', '9:16'].map(ratio => ({
  value: ratio,
  label: ratio,
}));

export const parseCanvasAspectRatioValue = (aspectRatio = CANVAS_AI_DEFAULT_ASPECT_RATIO) => {
  const [rawW, rawH] = String(aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO).split(/[:x×]/i).map(value => Number(value));
  return rawW > 0 && rawH > 0 ? rawW / rawH : 16 / 9;
};
const getClosestCanvasAiStandardAspectRatio = (aspectRatio = CANVAS_AI_DEFAULT_ASPECT_RATIO) => {
  const target = parseCanvasAspectRatioValue(aspectRatio);
  return CANVAS_AI_ASPECT_RATIOS.reduce((best, option) => (
    Math.abs(parseCanvasAspectRatioValue(option) - target) < Math.abs(parseCanvasAspectRatioValue(best) - target)
      ? option
      : best
  ), CANVAS_AI_DEFAULT_ASPECT_RATIO);
};
const getCanvasAspectRatioLabel = (aspectRatio = CANVAS_AI_DEFAULT_ASPECT_RATIO) => {
  const [rawW, rawH] = String(aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO).split(/[:x×]/i).map(value => Math.round(Number(value)));
  if (!Number.isFinite(rawW) || !Number.isFinite(rawH) || rawW <= 0 || rawH <= 0) return CANVAS_AI_DEFAULT_ASPECT_RATIO;
  let width = Math.abs(rawW);
  let height = Math.abs(rawH);
  while (height) {
    const next = width % height;
    width = height;
    height = next;
  }
  const divisor = width || 1;
  return `${Math.round(rawW / divisor)}:${Math.round(rawH / divisor)}`;
};
const formatCanvasAiResolutionOptionLabel = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!/^\d+\s*[x×]\s*\d+$/i.test(trimmed)) return trimmed;
  return `${trimmed.replace(/x/i, '×')} (${getCanvasAspectRatioLabel(trimmed)})`;
};
const getCanvasAiImage2RatioModel = (resolution?: string | null) => (
  normalizeCanvasAiImageResolution(resolution) === '4k' ? 'Xais Img2_4K' : 'Xais Img2_2K'
);
export const usesCanvasAiImage2DimensionOptions = (model?: string | null, resolution?: string | null) => {
  const publicName = getCanvasAiPublicImageModelName('new-api', model)
    || getCanvasAiPublicImageModelName('xais-chat', normalizeXaisImage2Model(model));
  return (publicName === 'GPT Image 2' || publicName === 'GPT Image 2 H')
    && normalizeCanvasAiImageResolution(resolution) !== '1k';
};
export const getCanvasAiAspectRatioOptionsForModel = (
  model?: string | null,
  resolution?: string | null,
): RoundedSelectOption[] => {
  if (usesCanvasAiImage2DimensionOptions(model, resolution)) {
    return getXaisImage2RatioOptions(getCanvasAiImage2RatioModel(resolution)).map(value => ({
      value,
      label: formatCanvasAiResolutionOptionLabel(value),
    }));
  }
  return CANVAS_AI_ASPECT_RATIO_OPTIONS;
};
export const normalizeCanvasAiAspectRatioForModel = (
  model?: string | null,
  aspectRatio?: string | null,
  resolution?: string | null,
) => {
  const value = String(aspectRatio || '').trim();
  if (usesCanvasAiImage2DimensionOptions(model, resolution)) {
    return resolveXaisImage2Ratio(
      getCanvasAiImage2RatioModel(resolution),
      value || CANVAS_AI_DEFAULT_ASPECT_RATIO,
    );
  }
  if (/^\d+\s*[x×]\s*\d+$/i.test(value)) return getClosestCanvasAiStandardAspectRatio(value);
  return CANVAS_AI_ASPECT_RATIOS.includes(value) ? value : CANVAS_AI_DEFAULT_ASPECT_RATIO;
};
