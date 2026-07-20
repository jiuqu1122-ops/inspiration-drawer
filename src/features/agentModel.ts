export type AgentProvider = 'openai-compatible' | 'codex';
export type AiGatewayKind = 'new_api' | 'xais' | 'openai_compatible' | 'custom';

export type AgentSendOptions = {
  quickPlanRequested?: boolean;
  forceWorkflowPlanningRoute?: 'remote_ai' | 'local_deterministic';
};

export type CodexReasoningEffort = '' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export type CodexReasoningEffortOption = {
  reasoningEffort: Exclude<CodexReasoningEffort, ''>;
  description: string;
};

export type CodexModelOption = {
  id: string;
  model: string;
  displayName: string;
  description: string;
  hidden: boolean;
  supportedReasoningEfforts: CodexReasoningEffortOption[];
  defaultReasoningEffort: Exclude<CodexReasoningEffort, ''>;
  inputModalities: string[];
  isDefault: boolean;
};

export type AgentSettings = {
  provider: AgentProvider;
  apiGatewayKind: AiGatewayKind;
  apiProvider: string;
  apiBaseUrl: string;
  apiModel: string;
  apiHeaders: Record<string, string>;
  hasApiKey: boolean;
  apiEditable: boolean;
  apiCredentialSource: 'user_settings' | 'license_managed' | 'license_managed_error' | string;
  apiKeyLast4?: string | null;
  apiError?: string | null;
  codexExecutable: string;
  codexModel: string;
  codexReasoningEffort: CodexReasoningEffort;
  codexSandbox: 'read-only' | 'workspace-write' | 'danger-full-access';
  codexApprovalPolicy: 'untrusted' | 'on-failure' | 'on-request' | 'never';
  systemPrompt: string;
  approvalMode: 'ask' | 'auto';
  retainHistory: boolean;
};

export type AgentApiBalanceResult = {
  available: boolean;
  provider: string;
  gatewayKind: AiGatewayKind;
  endpointKind: string;
  totalGranted?: number | null;
  totalUsed?: number | null;
  totalAvailable?: number | null;
  unlimited: boolean;
  currency?: string | null;
  expiresAt?: number | null;
  rawSummary?: string | null;
  unsupportedReason?: string | null;
  display: string;
};

export type AgentApiConnectionResult = {
  ok: boolean;
  gatewayKind: AiGatewayKind;
  provider: string;
  modelCount: number;
  message: string;
  endpointKind: string;
};

const LEGACY_CANVAS_AGENT_SYSTEM_PROMPT = '你是灵感抽屉的画布 Agent。理解用户目标，优先复用已有预设和工作流；需要修改画布时只输出可验证、最小化的画布操作。';

export const DEFAULT_AGENT_SYSTEM_PROMPT = [
  '你是「灵感抽屉」的全局软件 Agent，不是只会画布操作的聊天助手。',
  '你可以跨抽屉素材、文件夹、便签、日历日程、画布节点、生成工作流和设置界面完成任务。',
  '先理解目标并拆成最小可执行步骤；需要信息时读取软件上下文或可见控件；能用工具完成时就直接执行，不要只给操作说明。',
  '执行时优先使用语义工具，必要时导航到对应界面；当前在画布或抽屉都不限制你的行动范围。',
  '高风险操作（删除、清空、运行可能产生费用的生成任务、未知界面复刻操作）要等待确认；完成后简短说明结果和下一步。',
].join('\n');

export const isBuiltInAgentSystemPrompt = (value?: string | null) => {
  const prompt = String(value || '').trim();
  return !prompt
    || prompt === LEGACY_CANVAS_AGENT_SYSTEM_PROMPT
    || prompt === DEFAULT_AGENT_SYSTEM_PROMPT;
};

export const DEFAULT_AGENT_SETTINGS: AgentSettings = {
  provider: 'openai-compatible',
  apiGatewayKind: 'custom',
  apiProvider: 'unmind-wallet',
  apiBaseUrl: 'https://api.unmind.art/v1',
  apiModel: 'unmind-agent',
  apiHeaders: {},
  hasApiKey: false,
  apiEditable: true,
  apiCredentialSource: 'cloud_wallet',
  apiKeyLast4: null,
  apiError: null,
  codexExecutable: 'codex',
  codexModel: '',
  codexReasoningEffort: '',
  codexSandbox: 'read-only',
  codexApprovalPolicy: 'on-request',
  systemPrompt: DEFAULT_AGENT_SYSTEM_PROMPT,
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
  ].includes(normalized)) {
    return '';
  }
  if (normalized === '5.5' || normalized === 'gpt5.5') return 'gpt-5.5';
  if (normalized === '5.4' || normalized === 'gpt5.4') return 'gpt-5.4';
  if (normalized === '5.4-mini' || normalized === 'gpt5.4-mini') return 'gpt-5.4-mini';
  if (normalized === 'spark' || normalized === 'codex-spark') return 'gpt-5.3-codex-spark';
  return trimmed;
};

export const normalizeCodexReasoningEffort = (value?: string | null): CodexReasoningEffort => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['minimal', 'low', 'medium', 'high', 'xhigh'].includes(normalized)
    ? normalized as CodexReasoningEffort
    : '';
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
  stepId?: string;
  createsNode?: boolean;
  outputRef?: string;
  sourceCommandId?: string;
  result?: unknown;
  error?: string;
};

export type AgentThinkingStepStatus =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'cancelled'
  | 'error';

export type AgentThinkingStep = {
  id: string;
  title: string;
  detail?: string;
  status: AgentThinkingStepStatus;
  timestamp: number;
  completedAt?: number;
};

export type AgentMessageType = 'text' | 'tool' | 'workflow_result';

export type WorkflowResultStatus = 'success' | 'partial' | 'error';

export type WorkflowResultTextAsset = {
  nodeId: string;
  title: string;
  content: string;
  agentRole?: string;
  artifactType?: string;
};

export type WorkflowResultReference = {
  id: string;
  nodeId?: string;
  itemId?: string;
  name: string;
  thumbnail?: string;
  role?: string;
  reason?: string;
};

export type WorkflowResultMedia = {
  id: string;
  nodeId?: string;
  name: string;
  mediaType: 'image' | 'video';
  thumbnail?: string;
  url?: string;
  status?: 'success' | 'error';
};

export type WorkflowResultStage = {
  stage: 'requirement' | 'research' | 'concept' | 'refinement' | 'delivery';
  title: string;
  summary: string;
  nodeId?: string;
};

export type AgentWorkflowResult = {
  workflowId: string;
  title?: string;
  stages: WorkflowResultStage[];
  references?: Array<{
    id: string;
    title?: string;
    thumbnail?: string;
    role?: string;
  }>;
  media?: Array<{
    id: string;
    nodeId?: string;
    type: 'image' | 'video';
    url?: string;
    thumbnail?: string;
  }>;
};

export type WorkflowResultCardData = AgentWorkflowResult & {
  workflowNodeId: string;
  workflowName: string;
  status: WorkflowResultStatus;
  summary: string;
  completedAt: number;
  completedSteps: number;
  totalSteps: number;
  designStrategy?: WorkflowResultTextAsset;
  analysisResults: WorkflowResultTextAsset[];
  inspirationReferences: WorkflowResultReference[];
  generationResults: WorkflowResultMedia[];
  nextSteps: string[];
  error?: string;
};

export type AgentChatMessage = {
  id: string;
  role: 'user' | 'agent' | 'system';
  type?: AgentMessageType;
  content: string;
  timestamp: number;
  status?: 'streaming' | 'completed' | 'error' | 'cancelled';
  error?: string;
  selectionSurface?: 'drawer' | 'canvas';
  selectionSnapshot?: AgentCanvasSelectionItem[];
  thinkingSteps?: AgentThinkingStep[];
  toolCalls?: AgentToolCall[];
  workflowPlanningFailure?: {
    userText: string;
  };
  workflowResult?: WorkflowResultCardData;
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
  sourceItemId?: string;
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
  sourceItemId?: string;
  outputId?: string;
  name: string;
  mediaType: 'image' | 'video';
  source?: string;
  path?: string;
  thumbnail?: string;
};

export type AgentCanvasContext = {
  surface?: 'drawer' | 'canvas';
  selectedIds: string[];
  selectedItems?: AgentCanvasSelectionItem[];
  visualReferences?: AgentCanvasVisualReference[];
  calendar?: {
    activeDate?: number;
    activeMonth?: number;
    tagFilter?: string;
    events?: Array<{
      id: string;
      noteLabel: string;
      scheduleId: string;
      title: string;
      done: boolean;
      priority?: string;
      startAt?: number;
      tagIds?: string[];
      sourceTitle?: string;
    }>;
  };
  nodes: Array<{
    id: string;
    sourceItemId?: string;
    type: string;
    name: string;
    prompt?: string;
    inputs: string[];
    status?: string;
  }>;
  presets: Array<{ id: string; label: string; hint: string }>;
  workflows: Array<{
    id: string;
    label: string;
    hint: string;
    userInput?: {
      enabled: boolean;
      type?: 'text';
      label?: string;
      placeholder?: string;
      required?: boolean;
      acceptImages?: boolean;
      acceptFiles?: boolean;
    };
  }>;
  drawer?: {
    activeTab: string;
    activeFolderId: string;
    searchQuery: string;
    pinned: boolean;
    folders: Array<{ id: string; name: string; parentId?: string }>;
    items: Array<{
      id: string;
      type: string;
      name: string;
      content?: string;
      folderId?: string;
      quickAccess?: boolean;
      remarks?: string[];
      inspirationProfile?: import('./appAgent/inspirationMemory/types').InspirationProfile;
    }>;
  };
};

export type AgentToolExecutionContext = {
  snapshot?: AgentCanvasContext;
  userRequest?: string;
};

export type AgentCanvasToolExecutor = (
  name: string,
  args: Record<string, unknown>,
  execution?: AgentToolExecutionContext,
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
  runtimeMode: 'chatgpt' | 'api';
  codexHome: string;
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
