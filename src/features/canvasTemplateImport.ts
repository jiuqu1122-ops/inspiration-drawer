export type CanvasTemplateImportCandidates = {
  presets: unknown[];
  workflows: unknown[];
};

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const classifyCanvasTemplateCandidate = (
  value: unknown,
  result: CanvasTemplateImportCandidates,
) => {
  if (!isRecord(value)) return;
  if (typeof value.label === 'string' && typeof value.prompt === 'string') {
    result.presets.push(value);
  }
  if (typeof value.label === 'string' && Array.isArray(value.nodes)) {
    result.workflows.push(value);
  }
};

export const getCanvasTemplateImportCandidates = (rawValue: unknown): CanvasTemplateImportCandidates => {
  const result: CanvasTemplateImportCandidates = { presets: [], workflows: [] };
  if (Array.isArray(rawValue)) {
    rawValue.forEach(value => classifyCanvasTemplateCandidate(value, result));
    return result;
  }
  if (!isRecord(rawValue)) return result;

  const hasContainerFields = Array.isArray(rawValue.presets)
    || Array.isArray(rawValue.workflows)
    || isRecord(rawValue.preset)
    || isRecord(rawValue.workflow);
  if (!hasContainerFields) {
    classifyCanvasTemplateCandidate(rawValue, result);
    return result;
  }

  if (Array.isArray(rawValue.presets)) {
    rawValue.presets.forEach(value => classifyCanvasTemplateCandidate(value, result));
  }
  if (Array.isArray(rawValue.workflows)) {
    rawValue.workflows.forEach(value => classifyCanvasTemplateCandidate(value, result));
  }
  if (isRecord(rawValue.preset)) classifyCanvasTemplateCandidate(rawValue.preset, result);
  if (isRecord(rawValue.workflow)) classifyCanvasTemplateCandidate(rawValue.workflow, result);
  return result;
};

export const parseCanvasTemplateJson = (text: string) => (
  getCanvasTemplateImportCandidates(JSON.parse(text) as unknown)
);
