import { describe, expect, it, vi } from 'vitest';
import type { BufferItem } from '../types';
import type {
  CanvasAiGeneratedOutput,
  CanvasImageItem,
} from '../features/canvasModel';
import type {
  CanvasWorkflowNodeTemplate,
  CanvasWorkflowTemplate,
} from '../features/canvasTemplates';
import {
  applyCanvasWorkflowRuntimeSnapshots,
  createCanvasWorkflowModuleOutputsFromExpandedGroup,
  createCanvasWorkflowOutputDrafts,
  createCanvasWorkflowRuntimeSnapshots,
  createCanvasWorkflowRuntimeValue,
  getCanvasAiOutputPreviewSlots,
  getCanvasExpandedWorkflowDownstreamGeneratorIds,
  getCanvasWorkflowAllRuntimeOutputSlots,
  getCanvasWorkflowGeneratorNodes,
  getCanvasWorkflowGroup,
  getCanvasWorkflowOutputLabel,
  getCanvasWorkflowOutputSlotTemplates,
  getCanvasWorkflowTerminalNodeTemplates,
  getComparableCanvasWorkflowTemplate,
  hasCanvasWorkflowTemplateChanged,
  normalizeCanvasWorkflowRuntimeSnapshots,
  sortCanvasWorkflowRuntimeNodeIds,
} from './canvasWorkflowRuntime';

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://converted/${path}`,
  invoke: vi.fn(),
}));

const createCanvasItem = (
  id: string,
  patch: Omit<Partial<CanvasImageItem>, 'id' | 'item'> & { item?: Partial<BufferItem> } = {},
): CanvasImageItem => {
  const { item, ...canvasPatch } = patch;
  return {
    id,
    x: 0,
    y: 0,
    width: 320,
    height: 240,
    ...canvasPatch,
    item: {
      id: `${id}-item`,
      type: 'text',
      content: id,
      createdAt: 1,
      ...item,
    },
  };
};

const createGeneratorNode = (
  id: string,
  patch: Partial<CanvasWorkflowNodeTemplate> = {},
): CanvasWorkflowNodeTemplate => ({
  id,
  x: 0,
  y: 0,
  width: 320,
  height: 240,
  item: {
    type: 'text',
    content: `${id} prompt`,
    name: id.toUpperCase(),
  },
  ai: {
    type: 'image-generator',
    presetLabel: id.toUpperCase(),
    aspectRatio: '16:9',
    count: 1,
  },
  ...patch,
});

const createWorkflow = (): CanvasWorkflowTemplate => ({
  id: 'workflow-1',
  label: 'Workflow 1',
  hint: 'Runtime test workflow',
  nodes: [
    createGeneratorNode('a', { ai: { type: 'image-generator', count: 2, aspectRatio: '1:1' } }),
    createGeneratorNode('b', { inputs: ['a'] }),
  ],
});

describe('canvas workflow runtime', () => {
  it('keeps generator, terminal, label, slot, and draft mappings', () => {
    const workflow = createWorkflow();
    const moduleNode = createCanvasItem('module', {
      ai: { type: 'workflow', workflow },
    });

    expect(getCanvasWorkflowGeneratorNodes(workflow).map(node => node.id)).toEqual(['a', 'b']);
    expect(getCanvasWorkflowTerminalNodeTemplates(workflow).map(node => node.id)).toEqual(['b']);
    expect(getCanvasWorkflowOutputLabel(workflow.nodes[0], 1)).toBe('A #2');
    expect(getCanvasWorkflowOutputSlotTemplates(workflow).map(slot => `${slot.node.id}:${slot.index}`))
      .toEqual(['b:0']);
    expect(getCanvasWorkflowOutputSlotTemplates(workflow, 'all').map(slot => `${slot.node.id}:${slot.index}`))
      .toEqual(['a:0', 'a:1', 'b:0']);

    expect(createCanvasWorkflowOutputDrafts(moduleNode, workflow, 'working', 'all')).toMatchObject([
      { id: 'module_workflow_all_output_a_0', name: 'A', nodeId: 'a', status: 'working', width: 320, height: 320 },
      { id: 'module_workflow_all_output_a_1', name: 'A #2', nodeId: 'a', status: 'working', width: 320, height: 320 },
      { id: 'module_workflow_all_output_b_0', name: 'B', nodeId: 'b', status: 'working', width: 320, height: 180 },
    ]);
  });

  it('merges collapsed and expanded workflow output previews without changing slot ids', () => {
    const workflow = createWorkflow();
    const runtimeOutput: CanvasAiGeneratedOutput = {
      id: 'runtime-output',
      status: 'success',
      url: 'https://example.com/runtime.png',
      name: 'Runtime result',
    };
    const moduleNode = createCanvasItem('module', {
      ai: {
        type: 'workflow',
        workflow,
        workflowOutputMode: 'all',
        workflowRuntime: [{
          templateId: 'a',
          ai: { outputs: [runtimeOutput] },
        }],
      },
    });

    const allSlots = getCanvasWorkflowAllRuntimeOutputSlots(moduleNode, workflow);
    expect(allSlots[0]).toMatchObject({
      id: 'module_workflow_all_output_a_0',
      name: 'Runtime result',
      nodeId: 'a',
      status: 'success',
      url: 'https://example.com/runtime.png',
    });
    expect(getCanvasAiOutputPreviewSlots(moduleNode)).toEqual(allSlots);

    const finalNode = {
      ...moduleNode,
      ai: {
        ...moduleNode.ai!,
        workflowOutputMode: 'final' as const,
        outputs: [{ id: 'saved-output', status: 'success' as const, url: 'https://example.com/final.png' }],
      },
    };
    expect(getCanvasAiOutputPreviewSlots(finalNode)[0]).toMatchObject({
      id: 'saved-output',
      nodeId: 'b',
      url: 'https://example.com/final.png',
    });
  });

  it('creates, normalizes, and applies cloned runtime snapshots', () => {
    const workflow = createWorkflow();
    const idMap = new Map([['a', 'runtime-a'], ['b', 'runtime-b']]);
    const runtimeItems = [
      createCanvasItem('runtime-a', {
        item: { content: 'changed a', name: 'Changed A' },
        ai: {
          type: 'image-generator',
          prompt: 'runtime prompt',
          status: 'success',
          outputs: [{ id: 'output-a', status: 'success', url: 'https://example.com/a.png' }],
        },
      }),
      createCanvasItem('runtime-b', {
        ai: { type: 'image-generator', status: 'idle', outputs: [] },
      }),
    ];

    const snapshots = createCanvasWorkflowRuntimeSnapshots(workflow, runtimeItems, idMap);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toMatchObject({
      templateId: 'a',
      item: { content: 'changed a', name: 'Changed A' },
      ai: { prompt: 'runtime prompt', status: 'success' },
    });
    expect(snapshots[0].ai?.outputs).not.toBe(runtimeItems[0].ai?.outputs);
    expect(normalizeCanvasWorkflowRuntimeSnapshots(snapshots)).toEqual(snapshots);

    const restored = applyCanvasWorkflowRuntimeSnapshots(
      workflow,
      [
        createCanvasItem('runtime-a', { ai: { type: 'image-generator', aspectRatio: '4:3', outputs: [] } }),
        createCanvasItem('runtime-b', { ai: { type: 'image-generator', outputs: [] } }),
      ],
      idMap,
      snapshots,
    );
    expect(restored[0]).toMatchObject({
      item: { content: 'changed a', name: 'Changed A' },
      ai: { prompt: 'runtime prompt', status: 'success', aspectRatio: '1:1', count: 2 },
    });
    expect(restored[0].ai?.outputs).not.toBe(snapshots[0].ai?.outputs);
  });

  it('preserves previous runtime fields while rebuilding snapshots and bindings', () => {
    const workflow = createWorkflow();
    const idMap = new Map([['a', 'runtime-a'], ['b', 'runtime-b']]);
    const runtimeItems = [
      createCanvasItem('runtime-a', { ai: { type: 'image-generator', outputs: [] } }),
      createCanvasItem('runtime-b', { ai: { type: 'image-generator', outputs: [] } }),
    ];

    const runtime = createCanvasWorkflowRuntimeValue(workflow, runtimeItems, idMap, { custom: 'keep' });
    expect(runtime.custom).toBe('keep');
    expect(Object.keys(runtime.nodeSnapshots || {})).toEqual(['a', 'b']);
    expect(runtime.internalSlotBindings).toEqual({});
  });

  it('validates workflow groups and compares normalized templates', () => {
    const workflow = createWorkflow();
    const moduleNode = createCanvasItem('module', { ai: { type: 'workflow', workflow } });
    const grouped = createCanvasItem('runtime-a', {
      workflowGroup: {
        groupId: 'group-1',
        templateId: 'a',
        workflowId: workflow.id,
        workflowLabel: workflow.label,
        workflowHint: workflow.hint,
        module: moduleNode,
        expandedAt: 1,
      },
    });
    expect(getCanvasWorkflowGroup(grouped)?.groupId).toBe('group-1');
    expect(getCanvasWorkflowGroup(createCanvasItem('invalid', { workflowGroup: { groupId: 'group-1' } })))
      .toBeNull();

    const slotNode: CanvasWorkflowNodeTemplate = {
      id: 'slot',
      x: 1.2,
      y: 2.2,
      width: 100.2,
      height: 80.2,
      item: { type: 'image', content: '', url: 'old-url', path: 'old-path' },
      fixedInput: true,
      internalSlot: {
        id: 'reference',
        label: 'Reference',
        mediaType: 'image',
        mode: 'replaceable_internal',
      },
    };
    const first = { ...workflow, nodes: [slotNode, ...workflow.nodes] };
    const second = {
      ...first,
      nodes: [...first.nodes]
        .reverse()
        .map(node => node.id === 'slot'
          ? { ...node, item: { ...node.item, url: 'new-url', path: 'new-path' } }
          : { ...node, inputs: [...(node.inputs || [])].reverse() }),
    };
    expect(getComparableCanvasWorkflowTemplate(second)).toEqual(getComparableCanvasWorkflowTemplate(first));
    expect(hasCanvasWorkflowTemplateChanged(first, second)).toBe(false);
    expect(hasCanvasWorkflowTemplateChanged(first, {
      ...second,
      nodes: second.nodes.map(node => node.id === 'b' ? { ...node, width: node.width + 2 } : node),
    })).toBe(true);
  });

  it('maps expanded group results back to stable collapsed output drafts', () => {
    const workflow = createWorkflow();
    const moduleNode = createCanvasItem('module', { ai: { type: 'workflow', workflow } });
    const idMap = new Map([['a', 'runtime-a'], ['b', 'runtime-b']]);
    const groupItems = [
      createCanvasItem('runtime-a', { ai: { type: 'image-generator', outputs: [] } }),
      createCanvasItem('runtime-b', {
        ai: {
          type: 'image-generator',
          outputs: [{ id: 'runtime-b-output', status: 'success', url: 'https://example.com/b.png' }],
        },
      }),
    ];

    expect(createCanvasWorkflowModuleOutputsFromExpandedGroup(moduleNode, workflow, groupItems, idMap)[0])
      .toMatchObject({
        id: 'module_workflow_final_output_b_0',
        name: 'B',
        status: 'success',
        url: 'https://example.com/b.png',
      });
  });

  it('keeps stable topological and downstream execution order', () => {
    const items = [
      createCanvasItem('a', { x: 100, ai: { type: 'image-generator' } }),
      createCanvasItem('b', { x: 0, ai: { type: 'image-generator' } }),
      createCanvasItem('c', { x: 50, inputs: ['a'], ai: { type: 'image-generator' } }),
      createCanvasItem('plain', { x: -10, item: { type: 'text' } }),
    ];

    expect(sortCanvasWorkflowRuntimeNodeIds(items)).toEqual(['b', 'a', 'c']);
    expect(getCanvasExpandedWorkflowDownstreamGeneratorIds('a', items)).toEqual(['a', 'c']);

    const cycle = [
      createCanvasItem('x', { x: 20, inputs: ['y'], ai: { type: 'image-generator' } }),
      createCanvasItem('y', { x: 10, inputs: ['x'], ai: { type: 'image-generator' } }),
    ];
    expect(sortCanvasWorkflowRuntimeNodeIds(cycle)).toEqual(['y', 'x']);
  });
});
