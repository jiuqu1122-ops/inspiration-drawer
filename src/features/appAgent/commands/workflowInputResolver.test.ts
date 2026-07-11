import { describe, expect, it } from 'vitest';
import {
  getWorkflowImageInputTargetNodeIds,
  isWorkflowNodeImageInput,
} from './workflowInputResolver';
import { normalizeCanvasWorkflowTemplate } from '../../canvasTemplateStorage';

describe('workflow input resolver', () => {
  it('treats legacy acceptsExternalInputs nodes that mention reference images as image input targets', () => {
    const workflow = {
      id: 'legacy-reference-workflow',
      label: 'Legacy reference workflow',
      hint: 'Uses external product images',
      nodes: [
        {
          id: 'product_strategy',
          x: 0,
          y: 0,
          width: 360,
          height: 180,
          item: {
            id: 'product_strategy',
            type: 'text',
            content: 'Analyze the external product image before generation.',
          },
          textMode: 'agent',
          acceptsExternalInputs: true,
          outputType: 'text',
        },
        {
          id: 'hero',
          x: 420,
          y: 0,
          width: 560,
          height: 430,
          item: {
            id: 'hero',
            type: 'text',
            content: '',
          },
          inputs: ['product_strategy'],
          outputType: 'image',
          ai: {
            type: 'image-generator',
            presetPrompt: 'Create a hero image based on connected product image and strategy.',
            aspectRatio: '16:9',
            outputFormat: 'jpg',
            count: 1,
          },
        },
      ],
    };

    const normalized = normalizeCanvasWorkflowTemplate(workflow);

    expect(normalized?.nodes[0]?.externalInputTypes).toContain('image');
    expect(isWorkflowNodeImageInput(normalized?.nodes[0])).toBe(true);
    expect(getWorkflowImageInputTargetNodeIds(normalized)).toContain('product_strategy');
  });

  it('uses acceptsExternalInputs text entries as image targets when downstream generators require reference images', () => {
    const workflow = {
      id: 'legacy-text-typed-reference-workflow',
      label: 'Legacy text typed reference workflow',
      hint: 'Uses selected product references',
      nodes: [
        {
          id: 'external_brief',
          item: {
            id: 'external_brief',
            type: 'text',
            content: 'External input entry',
          },
          acceptsExternalInputs: true,
          externalInputTypes: ['text'],
          outputType: 'text',
        },
        {
          id: 'hero',
          item: {
            id: 'hero',
            type: 'text',
            content: '',
          },
          inputs: ['external_brief'],
          outputType: 'image',
          ai: {
            type: 'image-generator',
            presetPrompt: 'Create the final image using the selected product image as SUBJECT_REF.',
            aspectRatio: '16:9',
            outputFormat: 'jpg',
            count: 1,
          },
        },
      ],
    };

    expect(getWorkflowImageInputTargetNodeIds(workflow)).toContain('external_brief');
  });

  it('infers a root image generator as the external image input target for legacy exports without declarations', () => {
    const workflow = {
      id: 'legacy-root-generator-workflow',
      label: 'Product render workflow',
      hint: 'External product references to render outputs',
      nodes: [
        {
          id: 'render_master',
          item: {
            id: 'render_master',
            type: 'text',
            content: '',
          },
          inputs: [],
          acceptsExternalInputs: false,
          outputType: 'image',
          ai: {
            type: 'image-generator',
            presetPrompt: 'Based on connected product image references, create a product render master.',
            aspectRatio: '16:9',
            outputFormat: 'jpg',
            count: 1,
          },
        },
        {
          id: 'detail',
          item: {
            id: 'detail',
            type: 'text',
            content: '',
          },
          inputs: ['render_master'],
          acceptsExternalInputs: false,
          outputType: 'image',
          ai: {
            type: 'image-generator',
            presetPrompt: 'Create detail renders based on upstream product render.',
            aspectRatio: '16:9',
            outputFormat: 'jpg',
            count: 1,
          },
        },
      ],
    };

    const normalized = normalizeCanvasWorkflowTemplate(workflow);

    expect(normalized?.nodes[0]?.acceptsExternalInputs).toBe(true);
    expect(normalized?.nodes[0]?.externalInputTypes).toContain('image');
    expect(getWorkflowImageInputTargetNodeIds(normalized)).toContain('render_master');
  });

  it('infers a root strategy text-agent as the external image input target for legacy detail workflows', () => {
    const workflow = {
      id: 'legacy-detail-workflow',
      label: 'Detail page workflow',
      hint: 'External product reference images drive all pages',
      nodes: [
        {
          id: 'product_strategy',
          item: {
            id: 'product_strategy',
            type: 'text',
            content: 'Analyze all externally connected product reference images first.',
          },
          inputs: [],
          fixedInput: true,
          acceptsExternalInputs: false,
          outputType: 'text',
        },
        {
          id: 'hero_main',
          item: {
            id: 'hero_main',
            type: 'text',
            content: '',
          },
          inputs: ['product_strategy'],
          acceptsExternalInputs: false,
          outputType: 'image',
          ai: {
            type: 'image-generator',
            presetPrompt: 'Create a hero image based on external product references and product_strategy.',
            aspectRatio: '3:4',
            outputFormat: 'jpg',
            count: 1,
          },
        },
      ],
    };

    const normalized = normalizeCanvasWorkflowTemplate(workflow);
    const strategy = normalized?.nodes.find(node => node.id === 'product_strategy');

    expect(strategy?.acceptsExternalInputs).toBe(true);
    expect(strategy?.externalInputTypes).toContain('image');
    expect(strategy?.fixedInput).toBe(false);
    expect(strategy?.textMode).toBe('agent');
    expect(getWorkflowImageInputTargetNodeIds(normalized)).toContain('product_strategy');
  });
});
