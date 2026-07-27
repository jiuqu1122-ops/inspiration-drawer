import { describe, expect, it } from 'vitest';
import {
  isRetiredCanvasWorkflowId,
  removeRetiredCanvasWorkflows,
} from './canvasWorkflowRetirement';

describe('retired canvas workflows', () => {
  it('removes the two retired built-in workflow ids', () => {
    expect(removeRetiredCanvasWorkflows([
      { id: 'industrial-design-full-process' },
      { id: 'industrial-design-basic' },
      { id: 'current-workflow' },
    ])).toEqual([
      { id: 'current-workflow' },
    ]);
  });

  it('preserves a user workflow with the same label but a different id', () => {
    const workflow = {
      id: 'user-industrial-design',
      label: '基础工业设计',
    };

    expect(removeRetiredCanvasWorkflows([workflow])).toEqual([workflow]);
    expect(isRetiredCanvasWorkflowId(workflow.id)).toBe(false);
  });
});
