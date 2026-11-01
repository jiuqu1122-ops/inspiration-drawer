import { describe, expect, it } from 'vitest';
import type { CanvasImageItem } from '../canvasModel';
import { buildCanvasAgentSelectedItemsImpl } from './inspirationAgentActions';

describe('buildCanvasAgentSelectedItemsImpl', () => {
  it('uses the workflow label instead of the generic canvas item name', () => {
    const workflowNode: CanvasImageItem = {
      id: 'workflow-node-1',
      item: {
        id: 'item-1',
        type: 'text',
        content: '',
        name: '工作流 旧名称',
        createdAt: 1,
      },
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      ai: {
        type: 'workflow',
        presetLabel: '旧名称',
        workflow: { label: '工业设计效果图工作流（优化版）' },
      },
    };

    const selected = buildCanvasAgentSelectedItemsImpl({
      getCanvasAgentVisualReferences: () => [],
      getCanvasAgentVisualReferencesForNodeInputs: () => [],
    }, [workflowNode], [workflowNode.id]);

    expect(selected).toHaveLength(1);
    expect(selected[0].name).toBe('工业设计效果图工作流（优化版）');
  });
});
