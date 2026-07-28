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

// Multi-output requests append `:slot:N` before reaching the wallet service,
// so keep a small suffix budget below the server's 128-character limit.
const CANVAS_AI_CLIENT_REQUEST_ID_MAX_LENGTH = 120;

export const createCanvasAiClientRequestId = (nodeId: string, now = Date.now()) => {
  const rawRandomPart = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
  const randomPart = rawRandomPart
    .replace(/[^a-zA-Z0-9._:-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    || Math.random().toString(36).slice(2);
  const timePart = Math.max(0, Math.floor(now)).toString(36);
  const suffix = `${timePart}-${randomPart}`;
  const normalizedNodeId = nodeId
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-._:]+|[-._:]+$/g, '')
    || 'canvas-ai';
  const maxPrefixLength = Math.max(
    1,
    CANVAS_AI_CLIENT_REQUEST_ID_MAX_LENGTH - suffix.length - 1,
  );
  const prefix = normalizedNodeId
    .slice(0, maxPrefixLength)
    .replace(/[-._:]+$/g, '')
    || 'c';
  return `${prefix}-${suffix}`;
};
