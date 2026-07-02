export type AgentProvider = 'openai-compatible' | 'codex';

export type AgentSettings = {
  provider: AgentProvider;
  apiBaseUrl: string;
  apiModel: string;
  apiHeaders: Record<string, string>;
  hasApiKey: boolean;
  codexExecutable: string;
  codexModel: string;
  codexSandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  codexApprovalPolicy: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  systemPrompt: string;
  approvalMode: 'ask' | 'auto';
  retainHistory: boolean;
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  provider: 'openai-compatible',
  apiBaseUrl: 'https://api.openai.com/v1',
  apiModel: 'gpt-4o-mini',
  apiHeaders: {},
  hasApiKey: false,
  codexExecutable: 'codex',
  codexModel: '',
  codexSandbox: 'read-only',
  codexApprovalPolicy: 'on-request',
  systemPrompt: '你是灵感抽屉的画布 Agent。理解用户目标，优先复用已有预设和工作流；需要修改画布时只输出可验证、最小化的画布操作。',
  approvalMode: 'ask',
  retainHistory: true,
};

export const normalizeCodexModelOverride = (value?: string | null) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase().replace(/\s+/g, '');
  if ([
    'auto',
    'default',
    'recommended',
    'codex',
    '5.5',
    'gpt5.5',
    'gpt-5.5',
  ].includes(normalized)) {
    return '';
  }
  if (normalized === '5.4' || normalized === 'gpt5.4') return 'gpt-5.4';
  if (normalized === '5.4-mini' || normalized === 'gpt5.4-mini') return 'gpt-5.4-mini';
  if (normalized === 'spark' || normalized === 'codex-spark') return 'gpt-5.3-codex-spark';
  return trimmed;
};

export type AgentToolCallStatus =
  | 'pending'
  | 'awaiting-approval'
  | 'running'
  | 'completed'
  | 'declined'
  | 'error';

export type AgentToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  status: AgentToolCallStatus;
  result?: unknown;
  error?: string;
};

export type AgentChatMessage = {
  id: string;
  role: 'user' | 'agent' | 'system';
  content: string;
  timestamp: number;
  status?: 'streaming' | 'completed' | 'error' | 'cancelled';
  error?: string;
  toolCalls?: AgentToolCall[];
};

export type AgentConversation = {
  id: string;
  title: string;
  provider: AgentProvider;
  createdAt: number;
  updatedAt: number;
  messages: AgentChatMessage[];
  codexThreadId?: string;
  codexThreadKey?: string;
};

export type AgentCanvasSelectionItem = {
  id: string;
  name: string;
  type: string;
  thumbnail?: string;
  status?: string;
  prompt?: string;
  referenceCount?: number;
  references?: AgentCanvasVisualReference[];
};

export type AgentCanvasVisualReference = {
  id: string;
  nodeId: string;
  outputId?: string;
  name: string;
  mediaType: 'image' | 'video';
  source?: string;
  path?: string;
  thumbnail?: string;
};

export type AgentCanvasContext = {
  selectedIds: string[];
  selectedItems?: AgentCanvasSelectionItem[];
  visualReferences?: AgentCanvasVisualReference[];
  nodes: Array<{
    id: string;
    type: string;
    name: string;
    prompt?: string;
    inputs: string[];
    status?: string;
  }>;
  presets: Array<{ id: string; label: string; hint: string }>;
  workflows: Array<{ id: string; label: string; hint: string }>;
};

export type AgentCanvasToolExecutor = (
  name: string,
  args: Record<string, unknown>,
) => Promise<unknown>;

export type CodexRuntimeStatus = {
  installed: boolean;
  running: boolean;
  authenticated: boolean;
  managed: boolean;
  installAvailable: boolean;
  managedVersion: string;
  executable: string;
  version: string;
  authDetail: string;
};

export type CodexRateLimitWindow = {
  usedPercent: number;
  windowDurationMins: number | null;
  resetsAt: number | null;
};

export type CodexRateLimits = {
  limitId: string;
  limitName: string;
  planType: string;
  primary: CodexRateLimitWindow | null;
  secondary: CodexRateLimitWindow | null;
  remainingPercent: number | null;
  creditsBalance: string;
  creditsUnlimited: boolean;
  rateLimitReachedType: string;
  updatedAt: number;
};

export type CodexInstallProgress = {
  stage: 'idle' | 'downloading' | 'verifying' | 'extracting' | 'ready' | 'error';
  message: string;
  loaded: number;
  total: number;
  progress: number;
};

export type CodexLoginInfo = {
  type: 'chatgpt' | 'chatgptDeviceCode';
  authUrl?: string;
  verificationUrl?: string;
  userCode?: string;
};

export type AgentCodexApproval = {
  id: string | number;
  method: string;
  title: string;
  detail: string;
  params: Record<string, unknown>;
};

export const createAgentId = (prefix: string) => (
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
);

export const createAgentConversation = (provider: AgentProvider): AgentConversation => {
  const now = Date.now();
  return {
    id: createAgentId('agent-conversation'),
    title: '新对话',
    provider,
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
};
