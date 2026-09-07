import React from 'react';
import type { LicenseStatus } from '../../../types/license';
import type { AgentApiBalanceResult,AgentApiConnectionResult,AgentCanvasToolExecutor,AgentCodexApproval,AgentConversation,AgentSendOptions,AgentSettings,CodexInstallProgress,CodexLoginInfo,CodexModelOption,CodexRateLimits,CodexRuntimeStatus,WorkflowResultCardData } from '../../agentModel';

type chatCanvasEffectContext = { isByokUnlocked: boolean; canvasAgent: { settings: AgentSettings; settingsLoading: boolean; saveSettings: (input: AgentSettings & { apiKey?: string; clearApiKey?: boolean; }) => Promise<AgentSettings>; refreshSettings: () => Promise<AgentSettings>; listOpenAiModels: () => Promise<string[]>; testAgentApiConnection: () => Promise<AgentApiConnectionResult>; queryAgentApiBalance: () => Promise<AgentApiBalanceResult>; codexStatus: CodexRuntimeStatus | null; codexRateLimits: CodexRateLimits | null; codexRateLimitsLoading: boolean; codexRateLimitsError: string; codexModels: CodexModelOption[]; codexModelsLoading: boolean; codexModelsError: string; codexInstallProgress: CodexInstallProgress | null; codexLoginInfo: CodexLoginInfo | null; installCodex: () => Promise<CodexRuntimeStatus>; refreshCodexStatus: () => Promise<CodexRuntimeStatus>; refreshCodexRateLimits: () => Promise<CodexRateLimits>; refreshCodexModels: () => Promise<CodexModelOption[]>; startCodexLogin: (mode: "chatgpt" | "chatgptDeviceCode") => Promise<CodexLoginInfo>; openCodexLoginUrl: (url: string) => Promise<void>; logoutCodex: () => Promise<void>; codexApprovals: AgentCodexApproval[]; resolveCodexApproval: (approval: AgentCodexApproval, approved: boolean) => Promise<void>; conversations: AgentConversation[]; activeConversation: AgentConversation; activeConversationId: string; busy: boolean; sendMessage: (content: string, sendOptions?: AgentSendOptions) => Promise<boolean>; optimizePrompt: (content: string, mediaType: "image" | "video") => Promise<string>; cancelCurrent: () => Promise<void>; retryLast: () => Promise<void>; resolveToolCall: (toolCallId: string, approved: boolean) => Promise<void>; executeExternalTool: AgentCanvasToolExecutor; appendWorkflowResult: (result: WorkflowResultCardData) => void; newConversation: () => string; selectConversation: (id: string) => void; deleteConversation: (id: string) => void; clearConversation: () => void; clearAllHistory: () => void; getToolLabel: (name: string) => string; }; setAgentCustomProvider: React.Dispatch<React.SetStateAction<string>>; setAgentCustomBaseUrl: React.Dispatch<React.SetStateAction<string>>; licenseStatus: LicenseStatus | null; };

export const runChatCanvasEffect01 = (ctx: Pick<chatCanvasEffectContext, 'canvasAgent' | 'isByokUnlocked' | 'setAgentCustomBaseUrl' | 'setAgentCustomProvider'>) => {
  const { canvasAgent, isByokUnlocked, setAgentCustomBaseUrl, setAgentCustomProvider } = ctx;
    if (!isByokUnlocked) return;
    const currentProvider = canvasAgent.settings.apiProvider.trim();
    const currentBaseUrl = canvasAgent.settings.apiBaseUrl.trim();
    if (currentProvider && currentProvider.toLowerCase() !== 'unmind-wallet') {
      setAgentCustomProvider(currentProvider);
    }
    if (currentBaseUrl && !currentBaseUrl.toLowerCase().includes('api.unmind.art')) {
      setAgentCustomBaseUrl(currentBaseUrl);
    }

};

export const runChatCanvasEffect02 = (ctx: Pick<chatCanvasEffectContext, 'canvasAgent' | 'licenseStatus'>) => {
  const { canvasAgent, licenseStatus } = ctx;
    if (!licenseStatus) return;
    void canvasAgent.refreshSettings().catch(error => {
      console.warn('刷新授权后的 Agent 设置失败:', error);
    });

};
