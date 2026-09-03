import type {
  AgentChatMessage,
  WorkflowResultCardData,
  WorkflowResultMedia,
  WorkflowResultReference,
  WorkflowResultStage,
  WorkflowResultStatus,
  WorkflowResultTextAsset,
} from './agentModel';
import type { DesignAgentConfig } from './canvasModel';

const MAX_TEXT_ASSETS = 6;
const MAX_TEXT_CHARS = 6_000;
const MAX_REFERENCES = 8;
const MAX_GENERATION_RESULTS = 12;
const MAX_PERSISTED_DATA_SOURCE_CHARS = 96_000;
const WORKFLOW_STAGE_ORDER: WorkflowResultStage['stage'][] = [
  'requirement',
  'research',
  'concept',
  'refinement',
  'delivery',
];

const WORKFLOW_STAGE_DEFAULT_TITLES: Record<WorkflowResultStage['stage'], string> = {
  requirement: '需求拆解',
  research: '调研洞察',
  concept: '概念生成',
  refinement: '方案深化',
  delivery: '交付整理',
};

export const upsertWorkflowResultMessage = (
  messages: AgentChatMessage[],
  nextMessage: AgentChatMessage,
) => {
  const workflowNodeId = nextMessage.workflowResult?.workflowNodeId;
  if (!workflowNodeId) return [...messages, nextMessage];
  const existingIndex = messages.findIndex(message => (
    message.type === 'workflow_result'
    && message.workflowResult?.workflowNodeId === workflowNodeId
  ));
  if (existingIndex < 0) return [...messages, nextMessage];
  return messages.map((message, index) => index === existingIndex
    ? {
      ...nextMessage,
      id: message.id,
      timestamp: message.timestamp,
    }
    : message);
};

export type WorkflowResultTextNodeInput = {
  nodeId: string;
  title: string;
  content?: string;
  designAgentConfig?: DesignAgentConfig;
};

export type BuildWorkflowResultCardInput = {
  workflowId: string;
  workflowNodeId: string;
  workflowName: string;
  status: WorkflowResultStatus;
  completedAt?: number;
  completedSteps: number;
  totalSteps: number;
  textAssets?: WorkflowResultTextNodeInput[];
  inspirationReferences?: WorkflowResultReference[];
  generationResults?: WorkflowResultMedia[];
  error?: string;
  tasks?: NonNullable<WorkflowResultCardData['tasks']>;
};

const cleanText = (value: unknown, maxChars = MAX_TEXT_CHARS) => (
  typeof value === 'string' ? value.trim().slice(0, maxChars) : ''
);

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const compactMediaSource = (value?: string) => {
  const source = cleanText(value, Math.max(MAX_PERSISTED_DATA_SOURCE_CHARS, value?.length || 0));
  if (!source) return undefined;
  if (source.startsWith('data:') && source.length > MAX_PERSISTED_DATA_SOURCE_CHARS) return undefined;
  return source;
};

const dedupeBy = <T>(values: T[], getKey: (value: T) => string, limit: number) => {
  const keys = new Set<string>();
  const result: T[] = [];
  for (const value of values) {
    const key = getKey(value);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
};

const toTextAsset = (node: WorkflowResultTextNodeInput): WorkflowResultTextAsset | null => {
  const content = cleanText(node.content);
  if (!content) return null;
  return {
    nodeId: cleanText(node.nodeId, 160),
    title: cleanText(node.title, 120) || '文本成果',
    content,
    agentRole: node.designAgentConfig?.agentRole,
    artifactType: node.designAgentConfig?.outputArtifactType,
  };
};

const normalizeReferences = (references: WorkflowResultReference[]) => dedupeBy(
  references.map((reference, index) => ({
    id: cleanText(reference.id, 180) || `reference-${index}`,
    nodeId: cleanText(reference.nodeId, 180) || undefined,
    itemId: cleanText(reference.itemId, 180) || undefined,
    name: cleanText(reference.name, 160) || '参考资料',
    thumbnail: compactMediaSource(reference.thumbnail),
    role: cleanText(reference.role, 80) || undefined,
    reason: cleanText(reference.reason, 500) || undefined,
  })),
  reference => reference.itemId || reference.id,
  MAX_REFERENCES,
);

const normalizeGenerationResults = (outputs: WorkflowResultMedia[]) => dedupeBy(
  outputs.map((output, index) => ({
    id: cleanText(output.id, 180) || `output-${index}`,
    nodeId: cleanText(output.nodeId, 180) || undefined,
    name: cleanText(output.name, 160) || `生成结果 ${index + 1}`,
    mediaType: output.mediaType === 'video' ? 'video' as const : 'image' as const,
    thumbnail: compactMediaSource(output.thumbnail),
    url: compactMediaSource(output.url),
    status: output.status === 'error' ? 'error' as const : 'success' as const,
  })),
  output => output.id,
  MAX_GENERATION_RESULTS,
);

const inferTextAssetStage = (asset: WorkflowResultTextAsset): WorkflowResultStage['stage'] | null => {
  const role = String(asset.agentRole || '').toLowerCase();
  const artifact = String(asset.artifactType || '').toLowerCase();
  const title = String(asset.title || '').toLowerCase();
  if (role === 'requirement_analyzer' || artifact === 'designbrief' || /需求|brief/.test(title)) return 'requirement';
  if (
    role === 'inspiration_analyzer'
    || artifact === 'researchreport'
    || artifact === 'inspirationanalysis'
    || /调研|研究|灵感|参考|research|inspiration/.test(title)
  ) return 'research';
  if (role === 'design_strategist' || artifact === 'designstrategy' || /概念|策略|concept|strategy/.test(title)) return 'concept';
  if (role === 'design_reviewer' || artifact === 'designreview' || /深化|评审|review|refin/.test(title)) return 'refinement';
  if (role === 'presentation_writer' || artifact === 'document' || /交付|汇总|文档|delivery|presentation/.test(title)) return 'delivery';
  return null;
};

const inferMediaStage = (media: WorkflowResultMedia): WorkflowResultStage['stage'] | null => {
  const text = String(media.name || '').toLowerCase();
  if (/深化|精修|最终|refin|develop|final/.test(text)) return 'refinement';
  if (/概念|方向|concept/.test(text)) return 'concept';
  return null;
};

const normalizeProvidedStages = (stages: WorkflowResultStage[] | undefined) => {
  if (!Array.isArray(stages)) return [];
  const validStages = new Set(WORKFLOW_STAGE_ORDER);
  return dedupeBy(stages.flatMap(stage => {
    if (!stage || !validStages.has(stage.stage)) return [];
    const summary = cleanText(stage.summary);
    if (!summary) return [];
    return [{
      stage: stage.stage,
      title: cleanText(stage.title, 120) || WORKFLOW_STAGE_DEFAULT_TITLES[stage.stage],
      summary,
      nodeId: cleanText(stage.nodeId, 180) || undefined,
    } satisfies WorkflowResultStage];
  }), stage => stage.stage, WORKFLOW_STAGE_ORDER.length)
    .sort((a, b) => WORKFLOW_STAGE_ORDER.indexOf(a.stage) - WORKFLOW_STAGE_ORDER.indexOf(b.stage));
};

export const buildWorkflowResultStages = (
  textAssets: WorkflowResultTextAsset[],
  generationResults: WorkflowResultMedia[] = [],
): WorkflowResultStage[] => {
  const byStage = new Map<WorkflowResultStage['stage'], WorkflowResultStage>();
  textAssets.forEach(asset => {
    const stage = inferTextAssetStage(asset);
    if (!stage) return;
    const existing = byStage.get(stage);
    byStage.set(stage, {
      stage,
      title: cleanText(asset.title, 120) || existing?.title || WORKFLOW_STAGE_DEFAULT_TITLES[stage],
      summary: cleanText(existing
        ? `${existing.summary}\n\n${asset.title}:\n${asset.content}`
        : asset.content),
      nodeId: cleanText(asset.nodeId, 180) || existing?.nodeId,
    });
  });
  generationResults
    .filter(media => media.status !== 'error')
    .forEach(media => {
      const stage = inferMediaStage(media);
      if (!stage) return;
      const existing = byStage.get(stage);
      const mediaSummary = `视觉结果：${cleanText(media.name, 160) || '已生成视觉方案'}`;
      byStage.set(stage, {
        stage,
        title: existing?.title || WORKFLOW_STAGE_DEFAULT_TITLES[stage],
        summary: cleanText(existing ? `${existing.summary}\n\n${mediaSummary}` : mediaSummary),
        nodeId: existing?.nodeId || cleanText(media.nodeId, 180) || undefined,
      });
    });
  return WORKFLOW_STAGE_ORDER.flatMap(stage => {
    const value = byStage.get(stage);
    return value ? [value] : [];
  });
};

export type WorkflowResultCardLegacyData = Omit<
  WorkflowResultCardData,
  'title' | 'stages' | 'references' | 'media'
> & Partial<Pick<WorkflowResultCardData, 'title' | 'stages' | 'references' | 'media'>>;

export const attachWorkflowResultConversationSummary = (
  result: WorkflowResultCardLegacyData,
): WorkflowResultCardData => {
  const textAssets = [
    ...result.analysisResults,
    ...(result.designStrategy ? [result.designStrategy] : []),
  ];
  const providedStages = normalizeProvidedStages(result.stages);
  return {
    ...result,
    title: cleanText(result.title, 160) || result.workflowName,
    stages: providedStages.length > 0
      ? providedStages
      : buildWorkflowResultStages(textAssets, result.generationResults),
    references: result.inspirationReferences.map(reference => ({
      id: reference.id,
      title: reference.name,
      thumbnail: reference.thumbnail,
      role: reference.role,
    })),
    media: result.generationResults
      .filter(output => output.status !== 'error')
      .map(output => ({
        id: output.id,
        nodeId: output.nodeId,
        type: output.mediaType,
        url: output.url,
        thumbnail: output.thumbnail,
      })),
  };
};

const normalizeStoredTextAsset = (value: unknown, index: number): WorkflowResultTextAsset | null => {
  const record = asRecord(value);
  if (!record) return null;
  const content = cleanText(record.content);
  if (!content) return null;
  return {
    nodeId: cleanText(record.nodeId, 180) || `stage-${index}`,
    title: cleanText(record.title, 120) || '文本成果',
    content,
    agentRole: cleanText(record.agentRole, 80) || undefined,
    artifactType: cleanText(record.artifactType, 80) || undefined,
  };
};

const normalizeWorkflowResultTasks = (value: unknown): NonNullable<WorkflowResultCardData['tasks']> => {
  if (!Array.isArray(value)) return [];
  const validStatuses = new Set(['idle', 'waiting', 'ready', 'running', 'success', 'failed', 'skipped']);
  return value.flatMap((candidate, index) => {
    const record = asRecord(candidate);
    if (!record) return [];
    const status = String(record.status || 'waiting');
    return [{
      id: cleanText(record.id, 180) || `workflow-task-${index}`,
      label: cleanText(record.label, 160) || `任务 ${index + 1}`,
      status: (validStatuses.has(status) ? status : 'waiting') as NonNullable<WorkflowResultCardData['tasks']>[number]['status'],
    }];
  }).slice(0, 80);
};

const STAGE_AGENT_META: Record<WorkflowResultStage['stage'], Pick<WorkflowResultTextAsset, 'agentRole' | 'artifactType'>> = {
  requirement: { agentRole: 'requirement_analyzer', artifactType: 'DesignBrief' },
  research: { agentRole: 'inspiration_analyzer', artifactType: 'ResearchReport' },
  concept: { agentRole: 'design_strategist', artifactType: 'DesignStrategy' },
  refinement: { agentRole: 'design_reviewer', artifactType: 'DesignReview' },
  delivery: { agentRole: 'presentation_writer', artifactType: 'Document' },
};

/**
 * Upgrades either the existing rich card payload or the compact AgentChatMessage
 * workflowResult shape into the canonical card data used by both Agent panels.
 */
export const normalizeWorkflowResultCardData = (value: unknown): WorkflowResultCardData | null => {
  const record = asRecord(value);
  if (!record) return null;
  const workflowId = cleanText(record.workflowId, 180);
  if (!workflowId) return null;

  const providedStages = normalizeProvidedStages(
    Array.isArray(record.stages) ? record.stages as WorkflowResultStage[] : undefined,
  );
  const storedAnalysisResults = (Array.isArray(record.analysisResults) ? record.analysisResults : [])
    .map(normalizeStoredTextAsset)
    .filter((asset): asset is WorkflowResultTextAsset => !!asset);
  let designStrategy = normalizeStoredTextAsset(record.designStrategy, storedAnalysisResults.length);
  let analysisResults = storedAnalysisResults;
  if (analysisResults.length === 0 && !designStrategy && providedStages.length > 0) {
    const stageAssets = providedStages.map((stage, index): WorkflowResultTextAsset => ({
      nodeId: stage.nodeId || `stage-${stage.stage}-${index}`,
      title: stage.title,
      content: stage.summary,
      ...STAGE_AGENT_META[stage.stage],
    }));
    designStrategy = stageAssets.find(asset => asset.agentRole === 'design_strategist') || null;
    analysisResults = stageAssets.filter(asset => asset.agentRole !== 'design_strategist');
  }

  const rawLegacyReferences = Array.isArray(record.inspirationReferences)
    ? record.inspirationReferences
    : [];
  const rawCompactReferences = Array.isArray(record.references)
    ? record.references
    : [];
  const inspirationReferences = normalizeReferences((
    rawLegacyReferences.length > 0
      ? rawLegacyReferences
      : rawCompactReferences.flatMap((reference, index) => {
        const item = asRecord(reference);
        if (!item) return [];
        return [{
          id: cleanText(item.id, 180) || `reference-${index}`,
          name: cleanText(item.title, 160) || '参考资料',
          thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : undefined,
          role: cleanText(item.role, 80) || undefined,
        }];
      })
  ).flatMap((reference, index) => {
    const item = asRecord(reference);
    if (!item) return [];
    return [{
      id: cleanText(item.id, 180) || `reference-${index}`,
      nodeId: cleanText(item.nodeId, 180) || undefined,
      itemId: cleanText(item.itemId, 180) || undefined,
      name: cleanText(item.name, 160) || cleanText(item.title, 160) || '参考资料',
      thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : undefined,
      role: cleanText(item.role, 80) || undefined,
      reason: cleanText(item.reason, 500) || undefined,
    }];
  }));

  const rawLegacyMedia = Array.isArray(record.generationResults) ? record.generationResults : [];
  const rawCompactMedia = Array.isArray(record.media) ? record.media : [];
  const generationResults = normalizeGenerationResults((
    rawLegacyMedia.length > 0 ? rawLegacyMedia : rawCompactMedia
  ).flatMap((media, index) => {
    const item = asRecord(media);
    if (!item) return [];
    return [{
      id: cleanText(item.id, 180) || `media-${index}`,
      nodeId: cleanText(item.nodeId, 180) || undefined,
      name: cleanText(item.name, 160) || `生成结果 ${index + 1}`,
      mediaType: String(item.mediaType || item.type) === 'video' ? 'video' as const : 'image' as const,
      url: typeof item.url === 'string' ? item.url : undefined,
      thumbnail: typeof item.thumbnail === 'string' ? item.thumbnail : undefined,
      status: item.status === 'error' ? 'error' as const : 'success' as const,
    }];
  }));

  const hasLegacyPayload = Array.isArray(record.analysisResults)
    || Array.isArray(record.inspirationReferences)
    || Array.isArray(record.generationResults);
  if (!hasLegacyPayload && providedStages.length === 0) return null;
  const status: WorkflowResultStatus = ['running', 'success', 'partial', 'error'].includes(String(record.status || ''))
    ? record.status as WorkflowResultStatus
    : 'success';
  const textAssets = [...analysisResults, ...(designStrategy ? [designStrategy] : [])];
  const nextSteps = Array.isArray(record.nextSteps)
    ? record.nextSteps.map(step => cleanText(step, 180)).filter(Boolean).slice(0, 3)
    : extractNextSteps(textAssets);
  const totalSteps = Math.max(
    providedStages.length,
    Math.max(0, Math.round(Number(record.totalSteps) || 0)),
  );
  const completedSteps = Math.min(
    totalSteps,
    Math.max(0, Math.round(Number(record.completedSteps) || totalSteps)),
  );
  const workflowName = cleanText(record.workflowName, 160)
    || cleanText(record.title, 160)
    || '工作流成果';

  return attachWorkflowResultConversationSummary({
    workflowId,
    workflowNodeId: cleanText(record.workflowNodeId, 180),
    workflowName,
    title: cleanText(record.title, 160) || workflowName,
    status,
    summary: cleanText(record.summary, 500)
      || `${providedStages.length || textAssets.length} 个阶段成果`,
    completedAt: Number(record.completedAt) || Date.now(),
    completedSteps,
    totalSteps,
    designStrategy: designStrategy || undefined,
    analysisResults,
    inspirationReferences,
    generationResults,
    nextSteps: nextSteps.length > 0
      ? nextSteps
      : buildFallbackNextSteps(status, textAssets, generationResults),
    error: cleanText(record.error, 1_000) || undefined,
    stages: providedStages,
    tasks: normalizeWorkflowResultTasks(record.tasks),
  });
};

const extractNextSteps = (assets: WorkflowResultTextAsset[]) => {
  const preferred = assets.filter(asset => (
    asset.agentRole === 'design_reviewer'
    || asset.agentRole === 'presentation_writer'
    || asset.artifactType === 'DesignReview'
  ));
  const candidates = preferred.flatMap(asset => asset.content.split(/\r?\n/))
    .map(line => line
      .replace(/^\s*(?:[-*•]|\d+[.)、]|#+)\s*/, '')
      .replace(/\*\*/g, '')
      .trim())
    .filter(line => (
      line.length >= 6
      && line.length <= 180
      && /下一步|建议|优化|调整|验证|确认|补充|迭代|修改|评审/.test(line)
    ));
  return dedupeBy(candidates, value => value, 3);
};

const buildFallbackNextSteps = (
  status: WorkflowResultStatus,
  assets: WorkflowResultTextAsset[],
  generationResults: WorkflowResultMedia[],
) => {
  const next: string[] = [];
  if (status === 'partial' || status === 'error') next.push('检查失败或缺失的节点后重新运行工作流');
  if (generationResults.some(output => output.status === 'success')) next.push('在画布中比较并筛选生成方案');
  if (assets.some(asset => asset.agentRole === 'design_reviewer' || asset.artifactType === 'DesignReview')) {
    next.push('按方案评审中的优先级继续迭代');
  } else if (status === 'success') {
    next.push('增加方案评审节点，验证需求匹配与设计风险');
  }
  return dedupeBy(next, value => value, 3);
};

export const buildWorkflowResultCardData = (
  input: BuildWorkflowResultCardInput,
): WorkflowResultCardData => {
  const textAssets = dedupeBy(
    (input.textAssets || []).map(toTextAsset).filter((asset): asset is WorkflowResultTextAsset => !!asset),
    asset => `${asset.nodeId}:${asset.artifactType || asset.title}`,
    MAX_TEXT_ASSETS,
  );
  const strategyIndex = textAssets.findIndex(asset => (
    asset.agentRole === 'design_strategist' || asset.artifactType === 'DesignStrategy'
  ));
  const designStrategy = strategyIndex >= 0 ? textAssets[strategyIndex] : undefined;
  const analysisResults = textAssets.filter((_, index) => index !== strategyIndex);
  const inspirationReferences = normalizeReferences(input.inspirationReferences || []);
  const generationResults = normalizeGenerationResults(input.generationResults || []);
  const extractedNextSteps = extractNextSteps(textAssets);
  const nextSteps = extractedNextSteps.length > 0
    ? extractedNextSteps
    : buildFallbackNextSteps(input.status, textAssets, generationResults);
  const totalSteps = Math.max(0, Math.round(Number(input.totalSteps) || 0));
  const completedSteps = Math.min(totalSteps, Math.max(0, Math.round(Number(input.completedSteps) || 0)));
  const statusLabel = input.status === 'running'
    ? '分析中'
    : input.status === 'success'
      ? '已完成'
      : input.status === 'partial'
        ? '部分完成'
        : '执行失败';
  const summaryParts = [
    `${statusLabel} ${completedSteps}/${totalSteps} 个步骤`,
    textAssets.length > 0 ? `${textAssets.length} 份文本成果` : '',
    inspirationReferences.length > 0 ? `${inspirationReferences.length} 个参考资料` : '',
    generationResults.filter(output => output.status === 'success').length > 0
      ? `${generationResults.filter(output => output.status === 'success').length} 个生成结果`
      : '',
  ].filter(Boolean);

  return attachWorkflowResultConversationSummary({
    workflowId: cleanText(input.workflowId, 180),
    workflowNodeId: cleanText(input.workflowNodeId, 180),
    workflowName: cleanText(input.workflowName, 160) || '工作流成果',
    status: input.status,
    summary: summaryParts.join(' · '),
    completedAt: Number(input.completedAt) || Date.now(),
    completedSteps,
    totalSteps,
    designStrategy,
    analysisResults,
    inspirationReferences,
    generationResults,
    nextSteps,
    error: cleanText(input.error, 1_000) || undefined,
    tasks: normalizeWorkflowResultTasks(input.tasks),
  });
};
