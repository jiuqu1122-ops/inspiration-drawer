import type {
  WorkflowResultCardData,
  WorkflowResultMedia,
  WorkflowResultReference,
  WorkflowResultStatus,
  WorkflowResultTextAsset,
} from './agentModel';
import type { DesignAgentConfig } from './canvasModel';

const MAX_TEXT_ASSETS = 6;
const MAX_TEXT_CHARS = 6_000;
const MAX_REFERENCES = 8;
const MAX_GENERATION_RESULTS = 12;
const MAX_PERSISTED_DATA_SOURCE_CHARS = 96_000;

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
};

const cleanText = (value: unknown, maxChars = MAX_TEXT_CHARS) => (
  typeof value === 'string' ? value.trim().slice(0, maxChars) : ''
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
    name: cleanText(reference.name, 160) || '灵感参考',
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
  if (status !== 'success') next.push('检查失败或缺失的节点后重新运行工作流');
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
  const statusLabel = input.status === 'success' ? '已完成' : input.status === 'partial' ? '部分完成' : '执行失败';
  const summaryParts = [
    `${statusLabel} ${completedSteps}/${totalSteps} 个步骤`,
    textAssets.length > 0 ? `${textAssets.length} 份文本成果` : '',
    inspirationReferences.length > 0 ? `${inspirationReferences.length} 个灵感参考` : '',
    generationResults.filter(output => output.status === 'success').length > 0
      ? `${generationResults.filter(output => output.status === 'success').length} 个生成结果`
      : '',
  ].filter(Boolean);

  return {
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
  };
};
