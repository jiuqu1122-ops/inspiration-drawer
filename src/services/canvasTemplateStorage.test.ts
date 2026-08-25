import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_AI_PROMPT_PRESETS } from '../utils/canvasWorkflowDefinitions';
import {
  CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY,
  CANVAS_AI_HIDDEN_BUILT_IN_PROMPTS_STORAGE_KEY,
  CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY,
  getBuiltInProductRenderPrompt,
  isLegacyProductRenderPrompt,
  normalizeCanvasWorkflowTemplate,
  readCanvasTemplateHiddenIds,
  readCustomCanvasAiPromptPresets,
  readCustomCanvasWorkflows,
} from './canvasTemplateStorage';

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, String(value));
  }
}

const makeReferenceWorkflow = (id: string, builtin = false) => ({
  id,
  label: 'Product reference workflow',
  hint: 'Based on connected product reference images',
  builtin,
  nodes: [
    {
      id: 'render',
      x: 10,
      y: 20,
      width: 390,
      height: 430,
      item: {
        id: 'render',
        type: 'text',
        content: 'Generate a product image',
        createdAt: 0,
        isQuickAccess: false,
      },
      inputs: [],
      ai: {
        type: 'image-generator',
        provider: 'custom',
        model: 'test-model',
        prompt: 'Generate a product image',
        strategyBindings: ['global', 'hero'],
        status: 'idle',
        outputs: [],
      },
    },
  ],
});

describe('canvasTemplateStorage', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    vi.stubGlobal('localStorage', storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves prompt storage normalization and hidden-id deduplication', () => {
    storage.setItem(CANVAS_AI_HIDDEN_BUILT_IN_PROMPTS_STORAGE_KEY, JSON.stringify([' alpha ', 'alpha', '', null]));
    storage.setItem(CANVAS_AI_CUSTOM_PROMPTS_STORAGE_KEY, JSON.stringify([
      { id: 'custom-one', label: '  Custom prompt  ', hint: '  Hint  ', prompt: '  Render this product  ' },
      { id: 'invalid', label: '', prompt: '' },
    ]));

    expect(readCanvasTemplateHiddenIds(CANVAS_AI_HIDDEN_BUILT_IN_PROMPTS_STORAGE_KEY)).toEqual(['alpha']);
    expect(readCustomCanvasAiPromptPresets()).toEqual([
      expect.objectContaining({
        id: 'custom-one',
        label: 'Custom prompt',
        hint: 'Hint',
        prompt: 'Render this product',
      }),
    ]);
  });

  it('keeps the current UTF-8 legacy prompt detection', () => {
    expect(isLegacyProductRenderPrompt('简约深色背景，暗光环境')).toBe(true);
    expect(isLegacyProductRenderPrompt('Adaptive product background')).toBe(false);
    expect(getBuiltInProductRenderPrompt()).toBe(
      CANVAS_AI_PROMPT_PRESETS.find(preset => preset.id === 'product-render')?.prompt,
    );
  });

  it('normalizes reference workflows and filters built-in stored workflows', () => {
    const source = makeReferenceWorkflow('custom-reference');
    const normalized = normalizeCanvasWorkflowTemplate(source);

    expect(normalized).not.toBeNull();
    expect(normalizeCanvasWorkflowTemplate(source)).toBe(normalized);
    expect(normalized?.nodes[0]).toMatchObject({
      acceptsExternalInputs: true,
      externalInputTypes: ['image', 'text'],
      fixedInput: false,
      ai: {
        prompt: undefined,
        presetPrompt: 'Generate a product image',
        strategyBindings: ['global', 'hero'],
        outputs: [],
        status: 'idle',
      },
    });

    storage.setItem(CANVAS_CUSTOM_WORKFLOWS_STORAGE_KEY, JSON.stringify([
      source,
      makeReferenceWorkflow('stored-built-in', true),
    ]));
    expect(readCustomCanvasWorkflows().map(workflow => workflow.id)).toEqual(['custom-reference']);
  });

  it('preserves generic automatic context routing on text Agent nodes', () => {
    const normalized = normalizeCanvasWorkflowTemplate({
      id: 'routed-context',
      label: 'Routed context workflow',
      hint: 'Analyze once and route context by downstream node ID',
      nodes: [
        {
          id: 'analysis',
          item: { type: 'text', content: 'Analyze the input.' },
          textMode: 'agent',
          contextRouting: 'auto',
        },
        {
          id: 'render-a',
          item: { type: 'text', content: '' },
          inputs: ['analysis'],
          ai: { type: 'image-generator', presetPrompt: 'Render A.' },
        },
      ],
    });

    expect(normalized?.nodes.find(node => node.id === 'analysis')?.contextRouting).toBe('auto');
  });

  it('preserves image fusion roles and independent weights in workflows', () => {
    const normalized = normalizeCanvasWorkflowTemplate({
      id: 'fusion-workflow',
      label: 'Fusion workflow',
      nodes: [
        { id: 'base', item: { type: 'image', content: '' } },
        { id: 'style', item: { type: 'image', content: '' } },
        {
          id: 'fusion',
          item: { type: 'text', content: '融合为一款产品' },
          inputs: ['base', 'style'],
          ai: {
            type: 'image-generator',
            imageFusion: {
              enabled: true,
              baseNodeId: 'base',
              styleNodeId: 'style',
              baseWeight: 82,
              styleWeight: 47,
            },
            referenceRoles: [
              { nodeId: 'base', role: 'BASE' },
              { nodeId: 'style', role: 'STYLE_REF' },
            ],
          },
        },
      ],
    });

    expect(normalized?.nodes.find(node => node.id === 'fusion')?.ai).toMatchObject({
      imageFusion: {
        enabled: true,
        baseNodeId: 'base',
        styleNodeId: 'style',
        baseWeight: 82,
        styleWeight: 47,
      },
      referenceRoles: [
        { nodeId: 'base', role: 'BASE' },
        { nodeId: 'style', role: 'STYLE_REF' },
      ],
    });
  });
});
