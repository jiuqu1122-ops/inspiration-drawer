import type { BufferItem } from '../types';
import type { CanvasAiPromptPreset } from '../types/canvasWorkflow';
import {
  CANVAS_AI_PROMPT_PRESETS,
  doesWorkflowTextRequireImageReference,
} from '../utils/canvasWorkflowDefinitions';
import { clamp } from '../features/common';
import type { CanvasImageItem } from '../features/canvasModel';
import { normalizeDesignAgentConfig } from '../features/designAgentNode';
import type {
  CanvasWorkflowNodeTemplate,
  CanvasWorkflowTemplate,
} from '../features/canvasTemplates';
import { normalizeCanvasWorkflowUserInput } from '../features/canvasWorkflowUserInput';
import { isRetiredCanvasWorkflowId } from '../features/canvasWorkflowRetirement';
import {
  isReplaceableInternalImageSlot,
  normalizeCanvasWorkflowInternalSlot,
} from '../features/canvasWorkflowInternalSlots';

const CANVAS_AI_PROMPT_PRESET_PLACEHOLDER = '__canvas_ai_prompt_preset__';
const CANVAS_AI_PROMPT_PRESET_ADD_VALUE = '__canvas_ai_prompt_preset_add__';
const CANVAS_AI_PROMPT_PRESET_MANAGE_VALUE = '__canvas_ai_prompt_preset_manage__';
const CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY = 'drawer_canvas_ai_custom_prompt_presets';
const CANVAS_AI_HIDDEN_BUILT_IN_PROMPTS_STORAGE_KEY = 'drawer_canvas_ai_hidden_builtin_prompt_presets';
const CANVAS_TEXT_AGENT_SYSTEM_PROMPT_UTF8_BYTE_LIMIT = 24_000;
const CANVAS_TEXT_AGENT_USER_PROMPT_UTF8_BYTE_LIMIT = 24_000;
const CANVAS_WORKFLOW_SELECT_PLACEHOLDER = '__canvas_workflow_select__';
const CANVAS_WORKFLOW_SAVE_SELECTION_VALUE = '__canvas_workflow_save_selection__';
const CANVAS_WORKFLOW_MANAGE_VALUE = '__canvas_workflow_manage__';
const CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY = 'drawer_canvas_custom_workflows';
const CANVAS_HIDDEN_BUILT_IN_WORKFLOWS_STORAGE_KEY = 'drawer_canvas_hidden_builtin_workflows';
const CANVAS_TEMPLATE_EXPORT_TYPE = 'inspiration-drawer-canvas-templates';
const CANVAS_TEMPLATE_EXPORT_VERSION = 1;
const canvasWorkflowNormalizeCache = new WeakMap<object, CanvasWorkflowTemplate | null>();
const getCanvasAiPresetPrompt = (preset?: CanvasAiPromptPreset) => preset?.prompt || '';
const PRODUCT_RENDER_PRESET_ID = 'product-render';
const isLegacyProductRenderPrompt = (prompt: string) =>
  prompt.includes('简约深色背景') && prompt.includes('暗光环境');
const getBuiltInProductRenderPrompt = () =>
  CANVAS_AI_PROMPT_PRESETS.find(preset => preset.id === PRODUCT_RENDER_PRESET_ID)?.prompt || '';
const isCanvasWorkflowLongDuplicateText = (a?: string, b?: string) => {
  const left = String(a || '').trim();
  const right = String(b || '').trim();
  return left.length > 120 && left === right;
};
const readCanvasTemplateHiddenIds = (storageKey: string) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed)
      ? Array.from(new Set(parsed.map(value => String(value || '').trim()).filter(Boolean)))
      : [];
  } catch (_) {
    return [];
  }
};
const normalizeCanvasAiPromptPreset = (value: unknown): CanvasAiPromptPreset | null => {
  const record = value && typeof value === 'object' ? value as Partial<CanvasAiPromptPreset> : {};
  const label = typeof record.label === 'string' ? record.label.trim().slice(0, 24) : '';
  const prompt = typeof record.prompt === 'string' ? record.prompt.trim() : '';
  if (!label || !prompt) return null;
  return {
    id: typeof record.id === 'string' && record.id.trim() ? record.id.trim() : `custom-${Math.random().toString(36).substring(2, 9)}`,
    label,
    hint: typeof record.hint === 'string' && record.hint.trim() ? record.hint.trim().slice(0, 48) : '自定义 Prompt 预设',
    prompt,
    aspectRatio: typeof record.aspectRatio === 'string' ? record.aspectRatio : undefined,
    resolution: typeof record.resolution === 'string' ? record.resolution : undefined,
    outputFormat: typeof record.outputFormat === 'string' ? record.outputFormat : undefined,
    count: typeof record.count === 'number' ? record.count : undefined,
  };
};
const readCustomCanvasAiPromptPresets = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizeCanvasAiPromptPreset).filter((item): item is CanvasAiPromptPreset => !!item)
      : [];
  } catch (_) {
    return [];
  }
};
const normalizeCanvasWorkflowTemplate = (value: unknown): CanvasWorkflowTemplate | null => {
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

  const rawWorkflowText = [
    label,
    record.hint,
    ...rawNodes.flatMap(nodeValue => {
      const node = nodeValue && typeof nodeValue === 'object'
        ? nodeValue as Partial<CanvasWorkflowNodeTemplate>
        : {};
      const rawItem = node.item && typeof node.item === 'object'
        ? node.item as Partial<BufferItem>
        : {};
      const rawAi = node.ai && typeof node.ai === 'object'
        ? node.ai as Partial<NonNullable<CanvasImageItem['ai']>>
        : {};
      return [
        node.id,
        rawItem.name,
        rawItem.content,
        rawItem.remark,
        rawAi.presetId,
        rawAi.presetLabel,
        rawAi.presetPrompt,
        rawAi.prompt,
      ];
    }),
  ].filter(Boolean).join('\n').toLowerCase();
  const shouldInferExternalImageInputs = doesWorkflowTextRequireImageReference(rawWorkflowText)
    && !rawNodes.some(nodeValue => {
      const node = nodeValue && typeof nodeValue === 'object'
        ? nodeValue as Partial<CanvasWorkflowNodeTemplate>
        : {};
      return node.acceptsExternalInputs === true;
    });

  const nodes = rawNodes.map((nodeValue, index) => {
    const node = nodeValue && typeof nodeValue === 'object'
      ? nodeValue as Partial<CanvasWorkflowNodeTemplate>
      : {};
    const rawItem = node.item && typeof node.item === 'object'
      ? node.item as Partial<BufferItem>
      : {};
    let itemType = rawItem.type === 'text' || rawItem.type === 'image' || rawItem.type === 'file' || rawItem.type === 'video'
      ? rawItem.type
      : 'text';
    const id = typeof node.id === 'string' && node.id.trim() ? node.id.trim() : `node-${index}`;
    const internalSlot = normalizeCanvasWorkflowInternalSlot(node.internalSlot, {
      id,
      label: typeof rawItem.name === 'string' ? rawItem.name : id,
      order: index,
    });
    if (internalSlot) itemType = 'image';
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
    const inputIds = Array.isArray(node.inputs)
      ? node.inputs.map(inputId => String(inputId || '').trim()).filter(Boolean)
      : [];
    const hasConcreteImageSource = itemType === 'image'
      && [rawItem.url, rawItem.path, rawItem.thumbnail, rawItem.sourceUrl, rawItem.originalUrl]
        .some(value => typeof value === 'string' && value.trim().length > 0);
    const shouldRestoreConcreteFixedImage = hasConcreteImageSource
      && !rawAi
      && !internalSlot
      && node.bridgeType !== 'reference_image'
      && id !== 'product_reference_image';
    const inferredExternalImageInput = shouldInferExternalImageInputs
      && inputIds.length === 0
      && !internalSlot
      && !(node.fixedInput === true && itemType === 'image')
      && !hasConcreteImageSource
      && (
        rawAi?.type === 'image-generator'
        || itemType === 'text'
        || itemType === 'image'
        || itemType === 'file'
      );
    const acceptsExternalInputs = !internalSlot
      && !shouldRestoreConcreteFixedImage
      && (node.acceptsExternalInputs === true || inferredExternalImageInput);
    if (shouldRestoreConcreteFixedImage) {
      externalInputTypes = undefined;
    } else if (acceptsExternalInputs && (!externalInputTypes || externalInputTypes.length === 0)) {
      externalInputTypes = ['image', 'text'];
    }
    const isReferenceImageBridge = !internalSlot && (
      node.bridgeType === 'reference_image'
      || id === 'product_reference_image'
    )
      && acceptsExternalInputs
      && (
        externalInputTypes?.includes('image')
        || node.outputType === 'image'
        || node.outputType === 'image[]'
      );
    if (isReferenceImageBridge) itemType = 'file';
    const shouldCompactItemContent = rawAi?.type === 'image-generator'
      && isCanvasWorkflowLongDuplicateText(itemContent, executablePrompt);
    const slotDefaultValue = internalSlot?.defaultValue;
    return {
      id,
      x: Number(node.x) || 0,
      y: Number(node.y) || index * 220,
      width: clamp(Number(node.width) || 390, 160, 1200),
      height: clamp(Number(node.height) || 430, 120, 1200),
      item: {
        id,
        type: itemType,
        content: isReferenceImageBridge ? (itemContent || '参考产品图桥接') : (shouldCompactItemContent ? '' : itemContent),
        name: typeof rawItem.name === 'string' ? rawItem.name.slice(0, 80) : (isReferenceImageBridge ? '参考产品图' : undefined),
        path: internalSlot ? slotDefaultValue?.path : (typeof rawItem.path === 'string' ? rawItem.path : undefined),
        url: internalSlot ? slotDefaultValue?.url : (typeof rawItem.url === 'string' ? rawItem.url : undefined),
        thumbnail: internalSlot ? undefined : (typeof rawItem.thumbnail === 'string' ? rawItem.thumbnail : undefined),
        sourceUrl: internalSlot ? undefined : (typeof rawItem.sourceUrl === 'string' ? rawItem.sourceUrl : undefined),
        originalUrl: internalSlot ? undefined : (typeof rawItem.originalUrl === 'string' ? rawItem.originalUrl : undefined),
        sourceItemId: internalSlot ? slotDefaultValue?.sourceItemId : (typeof rawItem.sourceItemId === 'string' ? rawItem.sourceItemId : undefined),
        remark: typeof rawItem.remark === 'string' ? rawItem.remark : undefined,
        remarks: Array.isArray(rawItem.remarks)
          ? rawItem.remarks.map(remark => String(remark || '').trim()).filter(Boolean).slice(0, 12)
          : undefined,
        createdAt: 0,
        isQuickAccess: false,
      },
      inputs: inputIds,
      fixedInput: internalSlot
        ? true
        : shouldRestoreConcreteFixedImage
        ? true
        : typeof node.fixedInput === 'boolean'
        ? (inferredExternalImageInput ? false : node.fixedInput)
        : (!node.ai && (itemType === 'image' || itemType === 'text')),
      textMode: node.textMode === 'plain'
        ? 'plain'
        : node.textMode === 'agent' || (inferredExternalImageInput && itemType === 'text' && !rawAi)
          ? 'agent'
          : undefined,
      designAgentConfig: node.designAgentConfig
        ? normalizeDesignAgentConfig(node.designAgentConfig)
        : undefined,
      acceptsExternalInputs,
      externalInputTypes,
      outputType: internalSlot
        ? (internalSlot.multiple ? 'image[]' : 'image')
        : node.outputType === 'image'
        || node.outputType === 'image[]'
        || node.outputType === 'text'
        || node.outputType === 'video'
        || node.outputType === 'video[]'
        ? node.outputType
        : undefined,
      bridgeType: isReferenceImageBridge ? 'reference_image' as const : undefined,
      internalSlot,
      ai: rawAi
        ? {
          ...rawAi,
          prompt: rawAi.type === 'image-generator' ? undefined : rawAi.prompt,
          presetPrompt: rawAi.type === 'image-generator' && executablePrompt ? executablePrompt : rawAi.presetPrompt,
          outputs: [],
          status: 'idle' as const,
          error: undefined,
          generatedAt: undefined,
        }
        : undefined,
    } as CanvasWorkflowNodeTemplate;
  }).filter(node => node.ai?.type === 'image-generator' || !!node.item.type);

  const internalSlotIds = nodes
    .filter(isReplaceableInternalImageSlot)
    .map(node => node.internalSlot!.id);
  if (
    nodes.length === 0
    || !nodes.some(node => node.ai?.type === 'image-generator')
    || new Set(internalSlotIds).size !== internalSlotIds.length
  ) {
    canvasWorkflowNormalizeCache.set(cacheKey, null);
    return null;
  }
  const normalized = {
    id: typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `workflow-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    label,
    hint: typeof record.hint === 'string' && record.hint.trim()
      ? record.hint.trim().slice(0, 80)
      : '自定义工作流',
    nodes,
    userInput: normalizeCanvasWorkflowUserInput(record.userInput),
    createdAt: Number(record.createdAt) || Date.now(),
    builtin: !!record.builtin,
  };
  canvasWorkflowNormalizeCache.set(cacheKey, normalized);
  return normalized;
};
const readCustomCanvasWorkflows = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeCanvasWorkflowTemplate)
          .filter((item): item is CanvasWorkflowTemplate => !!item && !item.builtin)
          .filter(item => !isRetiredCanvasWorkflowId(item.id))
      : [];
  } catch (_) {
    return [];
  }
};

export {
  CANVAS_AI_PROMPT_PRESET_PLACEHOLDER,
  CANVAS_AI_PROMPT_PRESET_ADD_VALUE,
  CANVAS_AI_PROMPT_PRESET_MANAGE_VALUE,
  CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY,
  CANVAS_AI_HIDDEN_BUILT_IN_PROMPTS_STORAGE_KEY,
  CANVAS_TEXT_AGENT_SYSTEM_PROMPT_UTF8_BYTE_LIMIT,
  CANVAS_TEXT_AGENT_USER_PROMPT_UTF8_BYTE_LIMIT,
  CANVAS_WORKFLOW_SELECT_PLACEHOLDER,
  CANVAS_WORKFLOW_SAVE_SELECTION_VALUE,
  CANVAS_WORKFLOW_MANAGE_VALUE,
  CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY,
  CANVAS_HIDDEN_BUILT_IN_WORKFLOWS_STORAGE_KEY,
  CANVAS_TEMPLATE_EXPORT_TYPE,
  CANVAS_TEMPLATE_EXPORT_VERSION,
  getCanvasAiPresetPrompt,
  PRODUCT_RENDER_PRESET_ID,
  isLegacyProductRenderPrompt,
  getBuiltInProductRenderPrompt,
  readCanvasTemplateHiddenIds,
  normalizeCanvasAiPromptPreset,
  readCustomCanvasAiPromptPresets,
  normalizeCanvasWorkflowTemplate,
  readCustomCanvasWorkflows,
};
