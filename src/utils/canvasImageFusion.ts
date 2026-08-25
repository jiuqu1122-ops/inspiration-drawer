import type { CanvasAiItemData, CanvasImageFusionConfig } from '../features/canvasModel';
import { clamp } from '../features/common';

export type CanvasImageFusionRole = 'BASE' | 'STYLE_REF';

export const DEFAULT_CANVAS_IMAGE_FUSION_BASE_WEIGHT = 80;
export const DEFAULT_CANVAS_IMAGE_FUSION_STYLE_WEIGHT = 45;

const normalizeNodeId = (value: unknown) => {
  const nodeId = typeof value === 'string' ? value.trim() : '';
  return nodeId || null;
};

export const normalizeCanvasImageFusionWeight = (value: unknown, fallback: number) => (
  Math.round(clamp(Number.isFinite(Number(value)) ? Number(value) : fallback, 0, 100))
);

export const isCanvasImageFusionAi = (ai?: CanvasAiItemData | null) => (
  ai?.type === 'image-generator' && ai.imageFusion?.enabled === true
);

export const normalizeCanvasImageFusionConfig = (
  config?: CanvasImageFusionConfig | null,
  inputIds?: string[],
): CanvasImageFusionConfig => {
  const hasInputContext = Array.isArray(inputIds);
  const uniqueInputIds = Array.from(new Set((inputIds || []).map(normalizeNodeId).filter((id): id is string => !!id)));
  const hasConfiguredBase = !!config && Object.prototype.hasOwnProperty.call(config, 'baseNodeId');
  const hasConfiguredStyle = !!config && Object.prototype.hasOwnProperty.call(config, 'styleNodeId');
  const configuredBaseId = normalizeNodeId(config?.baseNodeId);
  const configuredStyleId = normalizeNodeId(config?.styleNodeId);
  const availableConfiguredBaseId = configuredBaseId && (!hasInputContext || uniqueInputIds.includes(configuredBaseId))
    ? configuredBaseId
    : null;
  const availableConfiguredStyleId = configuredStyleId && (!hasInputContext || uniqueInputIds.includes(configuredStyleId))
    ? configuredStyleId
    : null;
  const baseNodeId = hasConfiguredBase ? availableConfiguredBaseId : uniqueInputIds[0] || null;
  const styleNodeId = hasConfiguredStyle
    ? availableConfiguredStyleId && availableConfiguredStyleId !== baseNodeId ? availableConfiguredStyleId : null
    : uniqueInputIds.find(nodeId => nodeId !== baseNodeId) || null;
  return {
    enabled: true,
    baseNodeId,
    styleNodeId,
    baseWeight: normalizeCanvasImageFusionWeight(
      config?.baseWeight,
      DEFAULT_CANVAS_IMAGE_FUSION_BASE_WEIGHT,
    ),
    styleWeight: normalizeCanvasImageFusionWeight(
      config?.styleWeight,
      DEFAULT_CANVAS_IMAGE_FUSION_STYLE_WEIGHT,
    ),
  };
};

export const getCanvasImageFusionInputIds = (
  config?: CanvasImageFusionConfig | null,
  inputIds?: string[],
) => {
  const normalized = normalizeCanvasImageFusionConfig(config, inputIds);
  return [normalized.baseNodeId, normalized.styleNodeId].filter((id): id is string => !!id);
};

export const assignCanvasImageFusionInputs = (
  config: CanvasImageFusionConfig | null | undefined,
  currentInputIds: string[],
  incomingInputIds: string[],
  preferredRole?: CanvasImageFusionRole | null,
) => {
  const normalized = normalizeCanvasImageFusionConfig(config, currentInputIds);
  const incoming = Array.from(new Set(incomingInputIds.map(normalizeNodeId).filter((id): id is string => !!id)));
  let baseNodeId = normalized.baseNodeId || null;
  let styleNodeId = normalized.styleNodeId || null;

  incoming.forEach((nodeId, index) => {
    const role = index === 0 ? preferredRole : null;
    if (role === 'BASE') {
      baseNodeId = nodeId;
      if (styleNodeId === nodeId) styleNodeId = null;
      return;
    }
    if (role === 'STYLE_REF') {
      styleNodeId = nodeId;
      if (baseNodeId === nodeId) baseNodeId = null;
      return;
    }
    if (!baseNodeId) {
      baseNodeId = nodeId;
      if (styleNodeId === nodeId) styleNodeId = null;
    } else if (!styleNodeId && nodeId !== baseNodeId) {
      styleNodeId = nodeId;
    }
  });

  const nextConfig = normalizeCanvasImageFusionConfig({
    ...normalized,
    baseNodeId,
    styleNodeId,
  }, [baseNodeId, styleNodeId].filter((id): id is string => !!id));
  const inputs = getCanvasImageFusionInputIds(nextConfig);
  return {
    config: nextConfig,
    inputs,
    referenceRoles: inputs.map(nodeId => ({
      nodeId,
      role: nodeId === nextConfig.baseNodeId ? 'BASE' : 'STYLE_REF',
    })),
  };
};

export const removeCanvasImageFusionInput = (
  config: CanvasImageFusionConfig | null | undefined,
  currentInputIds: string[],
  inputId: string,
) => {
  const normalized = normalizeCanvasImageFusionConfig(config, currentInputIds);
  return assignCanvasImageFusionInputs({
    ...normalized,
    baseNodeId: normalized.baseNodeId === inputId ? null : normalized.baseNodeId,
    styleNodeId: normalized.styleNodeId === inputId ? null : normalized.styleNodeId,
  }, currentInputIds.filter(nodeId => nodeId !== inputId), []);
};

const getStrengthLabel = (weight: number) => {
  if (weight >= 85) return 'very strong';
  if (weight >= 65) return 'strong';
  if (weight >= 40) return 'moderate';
  if (weight >= 15) return 'light';
  return 'minimal';
};

export const buildCanvasImageFusionPrompt = (options: {
  baseWeight?: number;
  styleWeight?: number;
  originalRequest?: string;
}) => {
  const baseWeight = normalizeCanvasImageFusionWeight(
    options.baseWeight,
    DEFAULT_CANVAS_IMAGE_FUSION_BASE_WEIGHT,
  );
  const styleWeight = normalizeCanvasImageFusionWeight(
    options.styleWeight,
    DEFAULT_CANVAS_IMAGE_FUSION_STYLE_WEIGHT,
  );
  const originalRequest = options.originalRequest?.trim() || '融合基图产品与意向图风格，生成一张完整、可信的产品设计效果图。';
  return [
    '[IMAGE FUSION ROUTING — attachment order is mandatory]',
    'Image 1 = BASE: the core product to preserve and redesign.',
    'Image 2 = STYLE_REF: the visual intention reference; use it only as design-language guidance.',
    `BASE preservation strength: ${baseWeight}/100 (${getStrengthLabel(baseWeight)}). Preserve the BASE product identity, category, camera view, main silhouette, proportions, footprint, functional layout, brand marks, and unspecified areas in proportion to this strength.`,
    `STYLE_REF fusion strength: ${styleWeight}/100 (${getStrengthLabel(styleWeight)}). Transfer only visually supported form language, volume rhythm, surface transitions, CMF/material cues, lighting, color mood, and atmosphere in proportion to this strength.`,
    'The two strengths are independent and do not need to add up to 100.',
    'Produce one coherent, manufacturable product. Do not create a collage, double exposure, split view, or two competing products. Do not directly copy an identifiable reference product.',
    'Do not invent new buttons, screens, ports, lights, logos, or functional parts unless they are clearly supported by the BASE and compatible with the request.',
    `Original request: "${originalRequest.replace(/"/g, '\\"')}"`,
  ].join('\n');
};
