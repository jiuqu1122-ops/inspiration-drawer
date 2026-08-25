import type { AgentCanvasVisualReference } from './agentModel';

type PrepareCanvasAgentVisualReferencesOptions = {
  provider: 'openai-compatible' | 'codex';
  toModelDataUrl: (source: string) => Promise<string>;
  maxReferences?: number;
};

const isPublicHttpSource = (source: string) => (
  /^https?:\/\//i.test(source)
  && !/asset\.localhost|localhost|127\.0\.0\.1/i.test(source)
);

export async function prepareAgentVisualReferences(
  references: AgentCanvasVisualReference[],
  options: PrepareCanvasAgentVisualReferencesOptions,
): Promise<AgentCanvasVisualReference[]> {
  const prepared: AgentCanvasVisualReference[] = [];
  const maxReferences = Math.max(1, Math.min(9, options.maxReferences || 6));

  for (const reference of references.filter(item => item.mediaType === 'image').slice(0, maxReferences)) {
    const source = (reference.source || reference.thumbnail || '').trim();
    if (options.provider === 'codex' && reference.path) {
      prepared.push(reference);
      continue;
    }
    if (!source) continue;

    const canUseDirectly = isPublicHttpSource(source);
    const isGeneratedRemoteOutput = canUseDirectly && !!reference.outputId;
    if (canUseDirectly && !isGeneratedRemoteOutput) {
      prepared.push(reference);
      continue;
    }

    try {
      const dataUrl = await options.toModelDataUrl(source);
      if (dataUrl) prepared.push({ ...reference, source: dataUrl });
    } catch (error) {
      console.warn('Agent visual reference preparation failed:', error);
      if (options.provider === 'codex' && /^data:image\//i.test(source)) {
        prepared.push(reference);
      }
    }
  }

  return prepared;
}
