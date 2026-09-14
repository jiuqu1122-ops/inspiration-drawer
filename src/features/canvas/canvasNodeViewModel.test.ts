import { describe, expect, it } from 'vitest';
import { canvasAiPersistedRouteHintsForNode } from './canvasNodeViewModel';

describe('canvas node persisted route hints', () => {
  it('does not rehydrate legacy media channels or candidates for text nodes', () => {
    const hints = canvasAiPersistedRouteHintsForNode(true, {
      type: 'image-generator',
      provider: 'new-api',
      providerChannelId: 'stale-image-channel',
      providerCandidates: [{
        source: 'wallet',
        provider: 'new-api',
        providerChannelId: 'stale-image-channel',
        model: 'gpt-image-2',
      }],
    });

    expect(hints).toEqual({ providerCandidates: [], providerChannelId: undefined });
  });
});
