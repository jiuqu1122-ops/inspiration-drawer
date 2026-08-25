import { describe, expect, it } from 'vitest';
import {
  CANVAS_AI_PROMPT_PRESETS,
  CANVAS_BUILT_IN_WORKFLOWS,
  CANVAS_PRODUCT_DETAILS_NODE_IDS,
  buildCanvasProductDetailsWorkflowTemplate,
  canvasAiProviderSupportsNegativePrompt,
  doesWorkflowExplicitlyRequestProductAnalysis,
  doesWorkflowTextRequireImageReference,
  isCanvasProductDetailsWorkflowIntent,
  validateCanvasWorkflowTemplate,
} from './canvasWorkflowDefinitions';

describe('canvasWorkflowDefinitions', () => {
  it('preserves the built-in prompt and workflow catalogs', () => {
    expect(CANVAS_AI_PROMPT_PRESETS.map(preset => preset.id)).toEqual([
      'product-render',
      'cmf-exploration',
      'lifestyle-scene',
      'detail-hero',
    ]);
    expect(CANVAS_BUILT_IN_WORKFLOWS.length).toBeGreaterThan(0);
    expect(new Set(CANVAS_BUILT_IN_WORKFLOWS.map(workflow => workflow.id)).size).toBe(
      CANVAS_BUILT_IN_WORKFLOWS.length,
    );
  });

  it('preserves workflow intent detection', () => {
    expect(doesWorkflowTextRequireImageReference('Based on connected product reference images')).toBe(true);
    expect(doesWorkflowTextRequireImageReference('Generate an abstract color study')).toBe(false);
    expect(isCanvasProductDetailsWorkflowIntent(
      'Product detail page',
      'Keep product consistency with the product reference',
      [],
    )).toBe(true);
    expect(doesWorkflowExplicitlyRequestProductAnalysis('Analyze the product structure first')).toBe(true);
  });

  it('builds a valid product-details workflow with the established output nodes', () => {
    const workflow = buildCanvasProductDetailsWorkflowTemplate({
      label: 'Product detail page',
      hint: 'product_refs -> product_strategy -> five parallel detail-page images',
      provider: 'custom',
      includeStrategy: true,
    });

    expect(CANVAS_PRODUCT_DETAILS_NODE_IDS.every(id => workflow.nodes.some(node => node.id === id))).toBe(true);
    expect(validateCanvasWorkflowTemplate(workflow).errors).toEqual([]);
    expect(canvasAiProviderSupportsNegativePrompt('custom')).toBe(false);
  });
});
