import { describe, expect, it } from 'vitest';
import { normalizeCanvasWorkflowTemplate } from './canvasTemplateStorage';
import {
  CANVAS_BUILT_IN_WORKFLOWS,
  PRODUCT_DETAILS_FIVE_IMAGES_BUILT_IN_WORKFLOW,
} from './canvasTemplates';
import { PRODUCT_DETAILS_FIVE_IMAGES_WORKFLOW_ID } from './productDetailsFiveImagesWorkflow';
import {
  INDUSTRIAL_DESIGN_FULL_PROCESS_BUILT_IN_WORKFLOW,
  INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS,
  INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID,
} from './workflows/industrialDesignFullProcessWorkflow';

describe('built-in canvas workflows', () => {
  it('gives every legacy and current workflow the shared user-input contract', () => {
    CANVAS_BUILT_IN_WORKFLOWS.forEach(workflow => {
      expect(normalizeCanvasWorkflowTemplate(workflow)?.userInput).toMatchObject({
        enabled: true,
        type: 'text',
      });
    });
  });

  it('includes the product-consistent five-image detail-page workflow', () => {
    const workflow = PRODUCT_DETAILS_FIVE_IMAGES_BUILT_IN_WORKFLOW;
    const normalized = normalizeCanvasWorkflowTemplate(workflow);

    expect(CANVAS_BUILT_IN_WORKFLOWS.some(item => item.id === PRODUCT_DETAILS_FIVE_IMAGES_WORKFLOW_ID)).toBe(true);
    expect(workflow.builtin).toBe(true);
    expect(normalized).not.toBeNull();
    expect(normalized?.userInput).toMatchObject({
      enabled: true,
      type: 'text',
      required: false,
      acceptImages: true,
      acceptFiles: false,
    });

    const referenceNode = workflow.nodes.find(node => node.id === 'product_refs');
    const strategyNode = workflow.nodes.find(node => node.id === 'product_strategy');
    const generators = workflow.nodes.filter(node => node.ai?.type === 'image-generator');

    expect(referenceNode?.acceptsExternalInputs).toBe(true);
    expect(referenceNode?.externalInputTypes).toEqual(['image']);
    expect(strategyNode?.textMode).toBe('agent');
    expect(strategyNode?.inputs).toEqual(['product_refs']);
    expect(generators.map(node => node.id)).toEqual([
      'hero_main',
      'lifestyle_scene',
      'detail_macro',
      'exploded_view',
      'usage_instruction',
    ]);

    generators.forEach(node => {
      expect(node.inputs).toEqual(['product_refs', 'product_strategy']);
      expect(node.ai?.aspectRatio).toBe('3:4');
      expect(node.ai?.skillMeta?.qualityProfileId).toBe('ecommerce_detail_page');
      expect(node.ai?.presetPrompt).toMatch(/产品|PRODUCT_REF/);
    });
  });

  it('includes the local-first industrial design full-process workflow', () => {
    const workflow = INDUSTRIAL_DESIGN_FULL_PROCESS_BUILT_IN_WORKFLOW;
    const normalized = normalizeCanvasWorkflowTemplate(workflow);

    expect(CANVAS_BUILT_IN_WORKFLOWS.some(item => item.id === INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID)).toBe(true);
    expect(workflow.builtin).toBe(true);
    expect(normalized).not.toBeNull();
    expect(workflow.userInput).toEqual({
      enabled: true,
      type: 'text',
      label: '设计需求',
      placeholder: '例如：为年轻租房用户设计一款轻量、温暖、便携的桌面投影仪…',
      required: true,
      acceptImages: true,
      acceptFiles: false,
    });
    expect(normalized?.userInput).toEqual(workflow.userInput);

    const contextNode = workflow.nodes.find(node => node.id === INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.references);
    const agentNodes = workflow.nodes.filter(node => node.textMode === 'agent');
    const generators = workflow.nodes.filter(node => node.ai?.type === 'image-generator');

    expect(contextNode?.textMode).toBe('plain');
    expect(contextNode?.acceptsExternalInputs).toBe(true);
    expect(contextNode?.externalInputTypes).toEqual(['text', 'image']);
    expect(agentNodes.map(node => node.designAgentConfig?.agentRole)).toEqual([
      'requirement_analyzer',
      'inspiration_analyzer',
      'design_strategist',
      'design_reviewer',
      'presentation_writer',
    ]);
    expect(generators.map(node => node.id)).toEqual([
      INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.concepts,
      INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.development,
    ]);
    generators.forEach(node => {
      expect(node.ai?.provider).toBeUndefined();
      expect(node.ai?.model).toBeUndefined();
      expect(node.ai?.aspectRatio).toBe('16:9');
      expect(node.ai?.skillMeta?.localOnly).toBe(true);
      expect(node.ai?.skillMeta?.allowExternalSearch).toBe(false);
      expect(node.ai?.presetPrompt).toMatch(/不调用外部搜索|不打开网页采集器/);
    });
    expect(workflow.nodes.find(node => node.id === INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.development)?.inputs)
      .not.toContain(INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.concepts);
  });
});
