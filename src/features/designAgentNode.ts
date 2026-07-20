import type { DesignAgentConfig } from './canvasModel';

export const DESIGN_AGENT_ROLES = [
  'requirement_analyzer',
  'inspiration_analyzer',
  'design_strategist',
  'design_reviewer',
  'presentation_writer',
  'general',
] as const satisfies readonly NonNullable<DesignAgentConfig['agentRole']>[];

export const DESIGN_AGENT_ARTIFACT_TYPES = [
  'DesignBrief',
  'ResearchReport',
  'InspirationAnalysis',
  'DesignStrategy',
  'DesignReview',
  'PromptPackage',
  'Document',
] as const satisfies readonly NonNullable<DesignAgentConfig['outputArtifactType']>[];

export const DESIGN_AGENT_THINKING_MODES = [
  'analysis',
  'generation',
  'review',
] as const satisfies readonly NonNullable<DesignAgentConfig['thinkingMode']>[];

export const DESIGN_AGENT_ROLE_LABELS: Record<NonNullable<DesignAgentConfig['agentRole']>, string> = {
  requirement_analyzer: '需求拆解',
  inspiration_analyzer: '灵感分析',
  design_strategist: '设计策略',
  design_reviewer: '方案评审',
  presentation_writer: '交付整理',
  general: '通用设计 Agent',
};

export const DESIGN_AGENT_ARTIFACT_LABELS: Record<NonNullable<DesignAgentConfig['outputArtifactType']>, string> = {
  DesignBrief: 'Design Brief',
  ResearchReport: '研究报告',
  InspirationAnalysis: '灵感分析',
  DesignStrategy: '设计策略',
  DesignReview: '设计评审',
  PromptPackage: '提示词包',
  Document: '设计文档',
};

export const DESIGN_AGENT_THINKING_MODE_LABELS: Record<NonNullable<DesignAgentConfig['thinkingMode']>, string> = {
  analysis: '分析',
  generation: '生成',
  review: '评审',
};

const DEFAULT_ARTIFACT_BY_ROLE: Record<NonNullable<DesignAgentConfig['agentRole']>, NonNullable<DesignAgentConfig['outputArtifactType']>> = {
  requirement_analyzer: 'DesignBrief',
  inspiration_analyzer: 'InspirationAnalysis',
  design_strategist: 'DesignStrategy',
  design_reviewer: 'DesignReview',
  presentation_writer: 'Document',
  general: 'Document',
};

const DEFAULT_MODE_BY_ROLE: Record<NonNullable<DesignAgentConfig['agentRole']>, NonNullable<DesignAgentConfig['thinkingMode']>> = {
  requirement_analyzer: 'analysis',
  inspiration_analyzer: 'analysis',
  design_strategist: 'analysis',
  design_reviewer: 'review',
  presentation_writer: 'generation',
  general: 'generation',
};

const includes = <T extends string>(values: readonly T[], value: unknown): value is T => (
  typeof value === 'string' && values.includes(value as T)
);

export const normalizeDesignAgentConfig = (value?: unknown): Required<DesignAgentConfig> => {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const agentRole = includes(DESIGN_AGENT_ROLES, record.agentRole)
    ? record.agentRole
    : 'general';
  return {
    agentRole,
    outputArtifactType: includes(DESIGN_AGENT_ARTIFACT_TYPES, record.outputArtifactType)
      ? record.outputArtifactType
      : DEFAULT_ARTIFACT_BY_ROLE[agentRole],
    thinkingMode: includes(DESIGN_AGENT_THINKING_MODES, record.thinkingMode)
      ? record.thinkingMode
      : DEFAULT_MODE_BY_ROLE[agentRole],
  };
};

const ROLE_INSTRUCTIONS: Record<NonNullable<DesignAgentConfig['agentRole']>, string[]> = {
  requirement_analyzer: [
    '把原始需求整理成可执行的设计简报。',
    '明确产品类型、目标用户、核心场景、需求目标、功能与体验约束、风格/材质/色彩倾向、禁止方向、交付目标和待确认问题。',
    '不要在信息不足时编造尺寸、成本、法规或工程参数；把它们标记为待确认。',
  ],
  inspiration_analyzer: [
    '分析上游灵感和参考图对当前设计任务的可迁移价值。',
    '分别提取造型比例、结构、人机交互、CMF、场景和情绪特征，并说明每项适合影响设计的哪个部分。',
    '只描述可见证据；推断必须明确标注，不要把灵感图误当成必须复制的产品方案。',
  ],
  design_strategist: [
    '把设计简报和灵感依据转译为工业设计策略。',
    '优先处理轮廓、比例、体块组织、功能分区、人机、结构与制造可信度，再定义 CMF 和视觉细节。',
    '早期探索给出 2-4 个真正差异化的概念方向；每个方向都要说明设计原则、风险和下一步验证方法。',
  ],
  design_reviewer: [
    '以工业设计评审视角检查方案，不直接替方案辩护。',
    '检查需求匹配、轮廓与比例、功能布局、人机、结构/制造可信度、CMF、差异化、参考保真和主要风险。',
    '把问题分级，并给出具体、可执行、可验证的修改建议；未知信息不要臆测。',
  ],
  presentation_writer: [
    '把上游设计资产整理成面向评审或交付的清晰文档。',
    '保留关键决策依据、方案亮点、约束、风险和后续行动，不添加上游没有支持的营销结论或工程参数。',
  ],
  general: [
    '根据当前需求和上游内容生成可继续连接到设计流程的文本资产。',
    '涉及产品设计时，优先保证需求、产品逻辑、比例、功能、结构和 CMF 判断可追溯。',
  ],
};

const MODE_INSTRUCTIONS: Record<NonNullable<DesignAgentConfig['thinkingMode']>, string> = {
  analysis: '以证据和约束为主，先拆解再归纳；区分事实、推断和待确认项。',
  generation: '产出可直接进入下一节点的完整设计资产，避免只给泛泛建议。',
  review: '以评审标准逐项核验，先指出问题和风险，再给修改优先级。',
};

const ARTIFACT_INSTRUCTIONS: Record<NonNullable<DesignAgentConfig['outputArtifactType']>, string> = {
  DesignBrief: '输出结构至少包含：项目目标、目标用户与场景、核心需求、设计约束、风格/材质/色彩倾向、禁止方向、交付目标、待确认项。',
  ResearchReport: '输出结构至少包含：研究问题、输入证据、关键发现、机会点、风险与结论。',
  InspirationAnalysis: '输出结构至少包含：参考概览、可见特征、可迁移设计原则、建议参考角色、适用范围与避免复制的部分。',
  DesignStrategy: '输出结构至少包含：设计原则、概念方向、造型与比例、结构/交互、CMF、风险和验证计划。',
  DesignReview: '输出结构至少包含：评审结论、通过项、问题分级、修改建议、待验证项和下一轮标准。',
  PromptPackage: '输出可直接供图片生成节点使用的提示词包，包含 Original request、设计原则、主体/造型/结构/CMF、视角与光线、参考角色和负面约束。',
  Document: '输出标题清楚、层级稳定、可直接复制交付的 Markdown 文档。',
};

export const buildDesignAgentSystemPrompt = (value?: DesignAgentConfig) => {
  const config = normalizeDesignAgentConfig(value);
  return [
    `当前节点角色：${DESIGN_AGENT_ROLE_LABELS[config.agentRole]} (${config.agentRole})。`,
    `目标产物：${DESIGN_AGENT_ARTIFACT_LABELS[config.outputArtifactType]} (${config.outputArtifactType})。`,
    `思考模式：${DESIGN_AGENT_THINKING_MODE_LABELS[config.thinkingMode]} (${config.thinkingMode})。`,
    ...ROLE_INSTRUCTIONS[config.agentRole],
    MODE_INSTRUCTIONS[config.thinkingMode],
    ARTIFACT_INSTRUCTIONS[config.outputArtifactType],
    '使用用户语言输出 Markdown 正文；不要输出 JSON 包装、工具调用或思维过程。',
  ].join('\n');
};
