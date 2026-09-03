import type { CanvasImageItem, CanvasWorkflowRuntime } from './canvasModel';
import { isCanvasAiGeneratorType } from './canvasAiRuntime';
import { cloneDrawerValue } from '../utils/canvasSerialization';

type CanvasAiItemData = NonNullable<CanvasImageItem['ai']>;

export const cloneCanvasAiForPaste = (source: CanvasAiItemData): CanvasAiItemData => {
  const cloned = cloneDrawerValue(source);
  if (cloned.type !== 'workflow') {
    return {
      ...cloned,
      status: isCanvasAiGeneratorType(cloned.type) ? 'idle' : cloned.status,
      error: undefined,
    };
  }

  const runtime = !Array.isArray(cloned.workflowRuntime)
    ? cloned.workflowRuntime
    : undefined;
  const retainedRuntime: CanvasWorkflowRuntime | undefined = runtime?.internalSlotBindings
    ? { internalSlotBindings: cloneDrawerValue(runtime.internalSlotBindings) }
    : undefined;

  return {
    ...cloned,
    status: 'idle',
    error: undefined,
    generatedAt: undefined,
    outputs: [],
    workflowRuntime: retainedRuntime,
  };
};
