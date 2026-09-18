import { describe, expect, it } from 'vitest';
import { resolvePromptOptimizationRouting } from './internalAgentCapabilityRouting';

describe('prompt optimization routing', () => {
  it.each([
    ['codex', 'unmind-wallet', 'cloud_wallet'],
    ['openai-compatible', 'openai-compatible', 'cloud_wallet'],
    ['codex', 'unmind-wallet', 'user_settings'],
  ] as const)(
    'uses the server binding for %s with wallet markers',
    (provider, apiProvider, apiCredentialSource) => {
      const settings = Object.freeze({
        provider,
        apiProvider,
        apiCredentialSource,
        apiModel: 'stale-local-model',
      });

      expect(resolvePromptOptimizationRouting(settings)).toEqual({
        usesCloudWallet: true,
        allowed: true,
        savedModel: undefined,
        usageContext: 'prompt_optimization',
      });
      expect(settings.provider).toBe(provider);
    },
  );

  it('keeps BYOK on the configured API model', () => {
    expect(resolvePromptOptimizationRouting({
      provider: 'openai-compatible',
      apiProvider: 'openai-compatible',
      apiCredentialSource: 'user_settings',
      apiModel: 'gpt-byok',
    })).toEqual({
      usesCloudWallet: false,
      allowed: true,
      savedModel: 'gpt-byok',
      usageContext: 'prompt_optimization',
    });
  });

  it('continues to reject Codex outside Cloud Wallet', () => {
    expect(resolvePromptOptimizationRouting({
      provider: 'codex',
      apiProvider: 'openai-compatible',
      apiCredentialSource: 'user_settings',
      apiModel: 'gpt-byok',
    })).toMatchObject({
      usesCloudWallet: false,
      allowed: false,
      savedModel: 'gpt-byok',
    });
  });
});
