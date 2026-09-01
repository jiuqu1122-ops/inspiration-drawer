import { describe, expect, it, vi } from 'vitest';
import type { CanvasImageItem } from '../../canvasModel';
import { canvasAiGroupedModelChoiceValue } from '../../../utils/canvasAiConfig';
import { runChatMediaGeneration } from './chatGenerationBridge';

const generatorNode = (): CanvasImageItem => ({
  id: 'chat-generator',
  item: {
    id: 'chat-generator-item',
    type: 'text',
    content: '',
    name: 'Chat AI 图片',
    createdAt: 1,
    isQuickAccess: false,
  },
  x: 0,
  y: 0,
  width: 320,
  height: 240,
  inputs: [],
  ai: {
    type: 'image-generator',
    provider: 'new-api',
    model: 'old-model',
    prompt: '',
    aspectRatio: '16:9',
    count: 1,
  },
});

describe('Chat generation bridge', () => {
  it('uses the selected existing image-model route and local reference images', async () => {
    const preferred = {
      source: 'wallet' as const,
      provider: 'xais-chat' as const,
      model: 'Xais Nano Pro_2K',
      providerChannelId: 'fast-channel',
    };
    const fallback = {
      source: 'wallet' as const,
      provider: 'new-api' as const,
      model: 'gemini-3-pro-image-preview',
      providerChannelId: 'fallback-channel',
    };
    const model = canvasAiGroupedModelChoiceValue('wallet', preferred, [preferred, fallback]);
    const runGenerator = vi.fn(async (target: CanvasImageItem, options: { sourceItems: () => CanvasImageItem[] }) => {
      expect(target.ai).toMatchObject({
        provider: 'xais-chat',
        model: 'Xais Nano Pro_2K',
        credentialSource: 'wallet',
        providerChannelId: 'fast-channel',
        providerCandidates: [preferred, fallback],
      });
      expect(options.sourceItems().some(item => item.item.path === 'C:\\images\\reference.png')).toBe(true);
      return [{ id: 'generated-asset', path: 'C:\\images\\generated.png', status: 'success' as const }];
    });

    const result = await runChatMediaGeneration({
      toolName: 'generate_image',
      args: {
        prompt: '生成一张冷色风景照',
        model,
        referenceImages: ['C:\\images\\reference.png'],
      },
      sourceItems: () => [],
      buildGeneratorNode: generatorNode,
      runGenerator,
    });

    expect(result.media).toEqual([expect.objectContaining({
      id: 'generated-asset',
      path: 'C:\\images\\generated.png',
      assetId: 'generated-asset',
    })]);
  });
});
