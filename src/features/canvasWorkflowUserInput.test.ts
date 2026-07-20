import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from './canvasModel';
import {
  DEFAULT_CANVAS_WORKFLOW_USER_INPUT,
  buildCanvasWorkflowUserInputContext,
  injectCanvasWorkflowUserInputContext,
  normalizeCanvasWorkflowUserInput,
  selectCanvasWorkflowUserInputTargetIds,
} from './canvasWorkflowUserInput';

const makeRuntimeItem = (id: string, inputs: string[] = []): CanvasImageItem => ({
  id,
  item: {
    id: `${id}-item`,
    type: 'text',
    content: '',
    name: id,
    createdAt: 1,
    isQuickAccess: false,
  },
  x: 0,
  y: 0,
  width: 320,
  height: 180,
  inputs,
});

describe('canvas workflow user input', () => {
  it('normalizes defaults and sanitizes imported configuration', () => {
    expect(normalizeCanvasWorkflowUserInput(undefined)).toEqual(DEFAULT_CANVAS_WORKFLOW_USER_INPUT);

    const normalized = normalizeCanvasWorkflowUserInput({
      enabled: false,
      type: 'file',
      label: `  ${'L'.repeat(90)}  `,
      placeholder: `  ${'P'.repeat(260)}  `,
      required: true,
      acceptImages: false,
      acceptFiles: true,
    });

    expect(normalized).toEqual({
      enabled: false,
      type: 'text',
      label: 'L'.repeat(80),
      placeholder: 'P'.repeat(240),
      required: true,
      acceptImages: false,
      acceptFiles: true,
    });
  });

  it('builds a labelled context and injects it only into target nodes', () => {
    const contextId = 'workflow-1:workflow-user-input';
    const runtimeItems = [
      makeRuntimeItem('requirement-node', ['existing-input', contextId]),
      makeRuntimeItem('unrelated-node', ['existing-input']),
    ];

    const context = buildCanvasWorkflowUserInputContext('  设计一款轻量桌面投影仪  ', {
      enabled: true,
      label: '设计需求',
    });
    const injected = injectCanvasWorkflowUserInputContext(runtimeItems, {
      workflowNodeId: 'workflow-1',
      request: '  设计一款轻量桌面投影仪  ',
      config: {
        enabled: true,
        label: '设计需求',
      },
      targetNodeIds: ['requirement-node'],
    });

    expect(context).toBe('设计需求：\n设计一款轻量桌面投影仪');
    expect(injected).not.toBe(runtimeItems);
    expect(runtimeItems[0]?.inputs).toEqual(['existing-input', contextId]);
    expect(injected.find(item => item.id === 'requirement-node')?.inputs).toEqual([
      'existing-input',
      contextId,
    ]);
    expect(injected.find(item => item.id === 'unrelated-node')?.inputs).toEqual(['existing-input']);
    expect(injected.filter(item => item.id === contextId)).toHaveLength(1);
    expect(injected.find(item => item.id === contextId)).toMatchObject({
      textMode: 'plain',
      x: -10_000,
      y: -10_000,
      width: 1,
      height: 1,
      item: {
        id: contextId,
        type: 'text',
        name: '设计需求',
        content: context,
        isQuickAccess: false,
      },
    });
  });

  it('does not build or inject context when disabled or empty', () => {
    const runtimeItems = [makeRuntimeItem('requirement-node')];

    expect(buildCanvasWorkflowUserInputContext('项目需求', { enabled: false })).toBe('');
    expect(buildCanvasWorkflowUserInputContext('   ', { enabled: true })).toBe('');
    expect(injectCanvasWorkflowUserInputContext(runtimeItems, {
      workflowNodeId: 'workflow-1',
      request: '项目需求',
      config: { enabled: false },
      targetNodeIds: ['requirement-node'],
    })).toBe(runtimeItems);
    expect(injectCanvasWorkflowUserInputContext(runtimeItems, {
      workflowNodeId: 'workflow-1',
      request: '   ',
      config: { enabled: true },
      targetNodeIds: ['requirement-node'],
    })).toBe(runtimeItems);
  });

  it('prefers explicit input ports and otherwise targets only runnable roots', () => {
    const rootAgent = {
      ...makeRuntimeItem('root-agent'),
      textMode: 'agent' as const,
    };
    const downstreamGenerator = {
      ...makeRuntimeItem('downstream-generator', ['root-agent']),
      ai: { type: 'image-generator' as const },
    };
    const explicitPort = {
      ...makeRuntimeItem('explicit-port'),
      textMode: 'plain' as const,
    };
    const runtimeItems = [rootAgent, downstreamGenerator, explicitPort];

    expect(selectCanvasWorkflowUserInputTargetIds(runtimeItems, ['missing', 'explicit-port', 'explicit-port']))
      .toEqual(['explicit-port']);
    expect(selectCanvasWorkflowUserInputTargetIds(runtimeItems)).toEqual(['root-agent']);
  });
});
