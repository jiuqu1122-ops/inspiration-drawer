import { describe, expect, it } from 'vitest';
import { normalizeCanvasWorkflowTemplate } from './canvasTemplateStorage';
import {
  CANVAS_BUILT_IN_WORKFLOWS,
  PRODUCT_DETAILS_FIVE_IMAGES_BUILT_IN_WORKFLOW,
} from './canvasTemplates';
import { PRODUCT_DETAILS_FIVE_IMAGES_WORKFLOW_ID } from './productDetailsFiveImagesWorkflow';

describe('built-in canvas workflows', () => {
  it('includes the product-consistent five-image detail-page workflow', () => {
    const workflow = PRODUCT_DETAILS_FIVE_IMAGES_BUILT_IN_WORKFLOW;
    const normalized = normalizeCanvasWorkflowTemplate(workflow);

    expect(CANVAS_BUILT_IN_WORKFLOWS.some(item => item.id === PRODUCT_DETAILS_FIVE_IMAGES_WORKFLOW_ID)).toBe(true);
    expect(workflow.builtin).toBe(true);
    expect(normalized).not.toBeNull();

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
});
