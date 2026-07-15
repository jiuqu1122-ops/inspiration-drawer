export const claimCanvasAiRun = (
  activeRuns: Map<string, string>,
  nodeId: string,
  clientRequestId: string,
) => {
  if (activeRuns.has(nodeId)) return false;
  activeRuns.set(nodeId, clientRequestId);
  return true;
};

export const releaseCanvasAiRun = (
  activeRuns: Map<string, string>,
  nodeId: string,
  clientRequestId: string,
) => {
  if (activeRuns.get(nodeId) !== clientRequestId) return false;
  activeRuns.delete(nodeId);
  return true;
};

export const createCanvasAiClientRequestId = (nodeId: string, now = Date.now()) => {
  const randomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  return `${nodeId}-${now.toString(36)}-${randomPart}`;
};
