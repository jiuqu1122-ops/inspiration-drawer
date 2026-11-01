import type { AgentProvider } from './agentModel';

type InternalAgentCapabilitySettings = {
  provider: AgentProvider;
  apiProvider: string;
  apiCredentialSource: string;
  apiModel: string;
};

export const usesCloudWalletForInternalAgentCapability = (
  settings: Pick<InternalAgentCapabilitySettings, 'apiProvider' | 'apiCredentialSource'>,
) => (
  settings.apiProvider.trim().toLowerCase() === 'unmind-wallet'
  || settings.apiCredentialSource === 'cloud_wallet'
);

export const resolvePromptOptimizationRouting = (
  settings: InternalAgentCapabilitySettings,
) => {
  const usesCloudWallet = usesCloudWalletForInternalAgentCapability(settings);
  return {
    usesCloudWallet,
    allowed: usesCloudWallet || settings.provider === 'openai-compatible',
    savedModel: usesCloudWallet ? undefined : settings.apiModel,
    usageContext: 'prompt_optimization' as const,
  };
};
