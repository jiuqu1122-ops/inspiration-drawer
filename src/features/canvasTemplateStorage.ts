import type { BufferItem } from '../types';
import { clamp } from './common';
import type { CanvasImageItem } from './canvasModel';
import {
  CANVAS_AI_PROMPT_PRESETS,
  type CanvasAiPromptPreset,
  type CanvasWorkflowNodeTemplate,
  type CanvasWorkflowTemplate,
} from './canvasTemplates';

export const CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY = 'drawer_canvas_ai_custom_prompt_presets';
export const CANVAS_AI_HIDDEN_BUILT_IN_PROMPTS_STORAGE_KEY = 'drawer_canvas_ai_hidden_builtin_prompt_presets';
export const CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY = 'drawer_canvas_custom_workflows';
export const CANVAS_HIDDEN_BUILT_IN_WORKFLOWS_STORAGE_KEY = 'drawer_canvas_hidden_builtin_workflows';
export const PRODUCT_RENDER_PRESET_ID = 'product-render';

const canvasWorkflowNormalizeCache = new WeakMap<object, CanvasWorkflowTemplate | null>();

const isCanvasWorkflowLongDuplicateText = (a?: string, b?: string) => {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  return left.length > 120 && left === right;
};

export const getCanvasAiPresetPrompt = (preset?: CanvasAiPromptPreset) => preset?.prompt || '';

export const isLegacyProductRenderPrompt = (prompt: string) => (
  prompt.includes('简约深色背景') && prompt.includes('暗光环境')
);

export const getBuiltInProductRenderPrompt = () => (
  CANVAS_AI_PROMPT_PRESETS.find(preset => preset.id === PRODUCT_RENDER_PRESET_ID)?.prompt || ''
);

export const readCanvasTemplateHiddenIds = (storageKey: string) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.map(value => String(value || '').trim()).filter(Boolean)))
      : [];
  } catch (_) {
    return [];
  }
};

export const normalizeCanvasAiPromptPreset = (value: unknown): CanvasAiPromptPreset | null => {
  const record = value && typeof value === 'object' ? value as Partial<CanvasAiPromptPreset> : {};
  const label = typeof record.label === 'string' ? record.label.trim().slice(0, 24) : '';
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
  if (!label || !prompt) return null;
  return {
    id: typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `custom-${Math.random().toString(36).substring(2, 9)}`,
    label,
    hint: typeof record.hint === 'string' && record.hint.trim()
      ? record.hint.trim().slice(0, 48)
      : '自定义 Prompt 预设',
    prompt,
    aspectRatio: typeof record.aspectRatio === 'string' ? record.aspectRatio : undefined,
    resolution: typeof record.resolution === 'string' ? record.resolution : undefined,
    outputFormat: typeof record.outputFormat === 'string' ? record.outputFormat : undefined,
    count: typeof record.count === 'number' ? record.count : undefined,
  };
};

export const readCustomCanvasAiPromptPresets = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizeCanvasAiPromptPreset).filter((item): item is CanvasAiPromptPreset => !!item)
      : [];
  } catch (_) {
    return [];
  }
};

export const normalizeCanvasWorkflowTemplate = (value: unknown): CanvasWorkflowTemplate | null => {
  if (!value || typeof value !== 'object') return null;
  const cacheKey = value as object;
  if (canvasWorkflowNormalizeCache.has(cacheKey)) {
    return canvasWorkflowNormalizeCache.get(cacheKey) || null;
  }

  const record = value as Partial<CanvasWorkflowTemplate>;
  const label = typeof record.label === 'string' ? record.label.trim().slice(0, 32) : '';
  const rawNodes = Array.isArray(record.nodes) ? record.nodes : [];
  if (!label || rawNodes.length === 0) {
    canvasWorkflowNormalizeCache.set(cacheKey, null);
    return null;
  }

  const nodes = rawNodes.map((nodeValue, index) => {
    const node = nodeValue && typeof nodeValue === 'object'
      ? nodeValue as Partial<CanvasWorkflowNodeTemplate>
      : {};
    const rawItem = node.item && typeof node.item === 'object'
      ? node.item as Partial<BufferItem>
      : {};
    let itemType = rawItem.type === 'text'
      || rawItem.type === 'image'
      || rawItem.type === 'file'
      || rawItem.type === 'video'
      ? rawItem.type
      : 'text';
    const id = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : `node-${index}`;
    let externalInputTypes = Array.isArray(node.externalInputTypes)
      ? node.externalInputTypes
        .map(type => String(type || '').trim())
        .filter((type): type is 'image' | 'text' | 'video' => type === 'image' || type === 'text' || type === 'video')
      : undefined;
    const rawAi = node.ai && typeof node.ai === 'object'
      ? node.ai as Partial<NonNullable<CanvasImageItem['ai']>>
      : undefined;
    const aiPrompt = String(rawAi?.prompt || '').trim();
    const aiPresetPrompt = String(rawAi?.presetPrompt || '').trim();
    const itemContent = String(rawItem.content || '');
    const executablePrompt = rawAi?.type === 'image-generator'
      ? (aiPresetPrompt || aiPrompt || itemContent.trim())
      : '';
    if (node.acceptsExternalInputs === true && (!externalInputTypes || externalInputTypes.length === 0)) {
      externalInputTypes = ['image', 'text'];
    }
    const isReferenceImageBridge = (
      node.bridgeType === 'reference_image'
      || id === 'product_reference_image'
    )
      && node.acceptsExternalInputs === true
      && (
        externalInputTypes?.includes('image')
        || node.outputType === 'image'
        || node.outputType === 'image[]'
      );
    if (isReferenceImageBridge) itemType = 'file';
    const shouldCompactItemContent = rawAi?.type === 'image-generator'
      && isCanvasWorkflowLongDuplicateText(itemContent, executablePrompt);
    const shouldCompactAiPrompt = rawAi?.type === 'image-generator'
      && isCanvasWorkflowLongDuplicateText(aiPrompt, executablePrompt);
    return {
      id,
      x: Number(node.x) || 0,
      y: Number(node.y) || index * 220,
      width: clamp(Number(node.width) || 390, 160, 1200),
      height: clamp(Number(node.height) || 430, 120, 1200),
      item: {
        id,
        type: itemType,
        content: isReferenceImageBridge ? (itemContent || '参考图桥接') : (shouldCompactItemContent ? '' : itemContent),
        name: typeof rawItem.name === 'string' ? rawItem.name.slice(0, 80) : (isReferenceImageBridge ? '参考图桥接' : undefined),
        path: typeof rawItem.path === 'string' ? rawItem.path : undefined,
        url: typeof rawItem.url === 'string' ? rawItem.url : undefined,
        thumbnail: typeof rawItem.thumbnail === 'string' ? rawItem.thumbnail : undefined,
        sourceUrl: typeof rawItem.sourceUrl === 'string' ? rawItem.sourceUrl : undefined,
        originalUrl: typeof rawItem.originalUrl === 'string' ? rawItem.originalUrl : undefined,
        remark: typeof rawItem.remark === 'string' ? rawItem.remark : undefined,
        remarks: Array.isArray(rawItem.remarks)
          ? rawItem.remarks.map(remark => String(remark || '').trim()).filter(Boolean).slice(0, 12)
          : undefined,
        createdAt: 0,
        isQuickAccess: false,
      },
      inputs: Array.isArray(node.inputs)
        ? node.inputs.map(inputId => String(inputId || '').trim()).filter(Boolean)
        : [],
      fixedInput: typeof node.fixedInput === 'boolean'
        ? node.fixedInput
        : (!node.ai && (itemType === 'image' || itemType === 'text')),
      textMode: node.textMode === 'plain' ? 'plain' : node.textMode === 'agent' ? 'agent' : undefined,
      acceptsExternalInputs: node.acceptsExternalInputs === true,
      externalInputTypes,
      outputType: node.outputType === 'image'
        || node.outputType === 'image[]'
        || node.outputType === 'text'
        || node.outputType === 'video'
        || node.outputType === 'video[]'
        ? node.outputType
        : undefined,
      bridgeType: isReferenceImageBridge ? 'reference_image' as const : undefined,
      ai: rawAi
        ? {
          ...rawAi,
          prompt: shouldCompactAiPrompt ? undefined : rawAi.prompt,
          presetPrompt: rawAi.type === 'image-generator' && executablePrompt ? executablePrompt : rawAi.presetPrompt,
          outputs: [],
          status: 'idle' as const,
          error: undefined,
          generatedAt: undefined,
        }
        : undefined,
    } as CanvasWorkflowNodeTemplate;
  }).filter(node => node.ai?.type === 'image-generator' || !!node.item.type);

  if (nodes.length === 0 || !nodes.some(node => node.ai?.type === 'image-generator')) {
    canvasWorkflowNormalizeCache.set(cacheKey, null);
    return null;
  }

  const normalized: CanvasWorkflowTemplate = {
    id: typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `workflow-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    label,
    hint: typeof record.hint === 'string' && record.hint.trim()
      ? record.hint.trim().slice(0, 80)
      : '自定义工作流',
    nodes,
    createdAt: Number(record.createdAt) || Date.now(),
    builtin: !!record.builtin,
  };
  canvasWorkflowNormalizeCache.set(cacheKey, normalized);
  return normalized;
};

export const readCustomCanvasWorkflows = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed
        .map(normalizeCanvasWorkflowTemplate)
        .filter((item): item is CanvasWorkflowTemplate => !!item && !item.builtin)
      : [];
  } catch (_) {
    return [];
  }
};
