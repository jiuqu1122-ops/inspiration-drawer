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
});
