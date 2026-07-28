import type { CanvasAiGeneratedOutput } from './canvasModel';

export const mergeCanvasAiRetryOutputSlot = (
  currentOutputs: CanvasAiGeneratedOutput[],
  outputIndex: number,
  retryOutputs: CanvasAiGeneratedOutput[] | undefined,
  fallback: CanvasAiGeneratedOutput,
  status?: CanvasAiGeneratedOutput['status'],
  error?: string,
) => {
  const nextOutputs = [...currentOutputs];
  const previous = nextOutputs[outputIndex] || fallback;
  const retryOutput = retryOutputs?.[0];
  nextOutputs[outputIndex] = retryOutput
    ? {
      ...previous,
      ...retryOutput,
      id: previous.id || retryOutput.id,
      name: previous.name || retryOutput.name,
      nodeId: previous.nodeId || retryOutput.nodeId,
      nodeLabel: previous.nodeLabel || retryOutput.nodeLabel,
    }
    : {
      ...previous,
      status: status || previous.status,
      error,
    };
  return nextOutputs;
};

export const getCanvasAiRetryNodeStatus = (
  outputs: CanvasAiGeneratedOutput[],
  requestedStatus?: 'idle' | 'working' | 'success' | 'error',
) => {
  if (requestedStatus === 'working') return 'working' as const;
  if (requestedStatus === 'error') return 'error' as const;
  if (requestedStatus === 'success') {
    return outputs.length > 0 && outputs.every(output => output.status === 'success')
      ? 'success' as const
      : 'error' as const;
  }
  return requestedStatus;
};
