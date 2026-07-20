import { describe, expect, it, vi } from 'vitest';
import type { AgentCanvasVisualReference } from './agentModel';
import { prepareAgentVisualReferences } from './canvasAgentVisualReferences';

const reference = (patch: Partial<AgentCanvasVisualReference> = {}): AgentCanvasVisualReference => ({
  id: 'reference-1',
  nodeId: 'node-1',
  name: 'Reference',
  mediaType: 'image',
  source: 'https://images.example.com/reference.png',
  ...patch,
});

describe('prepareAgentVisualReferences', () => {
  it('keeps ordinary public URLs without downloading them locally', async () => {
    const toModelDataUrl = vi.fn(async () => 'data:image/jpeg;base64,unused');

    const result = await prepareAgentVisualReferences([reference()], {
      provider: 'openai-compatible',
      toModelDataUrl,
    });

    expect(result[0]?.source).toBe('https://images.example.com/reference.png');
    expect(toModelDataUrl).not.toHaveBeenCalled();
  });

  it('inlines generated outputs so the Agent channel does not download a remote URL', async () => {
    const toModelDataUrl = vi.fn(async () => 'data:image/jpeg;base64,compressed');

    const result = await prepareAgentVisualReferences([
      reference({ outputId: 'generated-output-1' }),
    ], {
      provider: 'openai-compatible',
      toModelDataUrl,
    });

    expect(toModelDataUrl).toHaveBeenCalledWith('https://images.example.com/reference.png');
    expect(result[0]?.source).toBe('data:image/jpeg;base64,compressed');
  });

  it('drops an unreadable generated URL instead of sending a broken image attachment', async () => {
    const result = await prepareAgentVisualReferences([
      reference({ outputId: 'generated-output-1' }),
    ], {
      provider: 'openai-compatible',
      toModelDataUrl: async () => { throw new Error('download timed out'); },
    });

    expect(result).toEqual([]);
  });

  it('keeps local paths for Codex references', async () => {
    const localReference = reference({
      source: 'asset://localhost/reference.png',
      path: 'E:\\images\\reference.png',
    });

    const result = await prepareAgentVisualReferences([localReference], {
      provider: 'codex',
      toModelDataUrl: async () => '',
    });

    expect(result).toEqual([localReference]);
  });
});
