import { describe, expect, it, vi } from 'vitest';
import { executeCanvasWorkflowTool } from './canvasWorkflowToolActions';

const steps = [{ id: 'hero', type: 'image-generator', label: '主视觉', prompt: '绘制蓝色圆球' }];

const createContext = () => {
  const resolveAgentWorkflowInputIds = vi.fn(async (_workflow: unknown, _inputIds: string[], options?: { allowMissingRequired?: boolean }) => {
    if (!options?.allowMissingRequired) throw new Error('需要参考图');
    return {
      inputIds: [],
      createdNodeIds: [],
      resolution: { autoConnections: [], workflowInputResolution: {} },
    };
  });
  const appendCanvasItems = vi.fn(() => 1);
  return {
    context: {
      canvasAiProvider: 'new-api',
      canvasItemsRef: { current: [] },
      getCanvasDropPosition: () => ({ x: 40, y: 40 }),
      resolveAgentWorkflowInputIds,
      isCanvasModeRef: { current: true },
      buildCanvasWorkflowModuleNode: () => ({ id: 'module-1' }),
      appendCanvasItems,
      setCustomCanvasWorkflows: vi.fn(),
      updateCanvasSelection: vi.fn(),
      showToast: vi.fn(),
      generateCanvasWorkflowModuleNode: vi.fn(),
    } as unknown as Parameters<typeof executeCanvasWorkflowTool>[0],
    resolveAgentWorkflowInputIds,
    appendCanvasItems,
  };
};

describe('Agent workflow creation', () => {
  it('creates a reusable workflow without a reference image when it is not run yet', async () => {
    const { context, resolveAgentWorkflowInputIds, appendCanvasItems } = createContext();
    const result = await executeCanvasWorkflowTool(context, 'canvas_create_workflow', {
      label: '示例流程', steps, autoRun: false,
    }, undefined) as { workflowId: string; nodeId: string };

    expect(resolveAgentWorkflowInputIds).toHaveBeenCalledWith(expect.any(Object), [], {
      allowMissingRequired: true,
    });
    expect(appendCanvasItems).toHaveBeenCalledOnce();
    expect(result.workflowId).toBeTruthy();
    expect(result.nodeId).toBe('module-1');
  });

  it('still requires missing inputs before automatically running the workflow', async () => {
    const { context, appendCanvasItems } = createContext();
    await expect(executeCanvasWorkflowTool(context, 'canvas_create_workflow', {
      label: '示例流程', steps, autoRun: true,
    }, undefined)).rejects.toThrow('需要参考图');
    expect(appendCanvasItems).not.toHaveBeenCalled();
  });
});
