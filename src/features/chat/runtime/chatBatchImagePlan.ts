import type { ChatProviderResult } from './chatStream';
import { normalizeVisibleChatText } from './chatVisibleText';

export type ChatBatchImagePlan = {
  analysisSummary: string;
  instruction: string;
};

const parseRecord = (value: unknown): Record<string, unknown> => {
  try {
    const parsed = JSON.parse(String(value ?? '{}'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch (_) {
    return {};
  }
};

const normalizePlanText = (value: unknown) => normalizeVisibleChatText(value)
  .replace(/\\r\\n/g, '\n')
  .replace(/\\n/g, '\n')
  .replace(/\\r/g, '\n');

const readVisibleString = (record: Record<string, unknown>, key: string) => (
  normalizePlanText(record[key])
);

const readPerImageInstructions = (structured: Record<string, unknown>) => {
  if (!Array.isArray(structured.perImageInstructions)) return '';
  return structured.perImageInstructions.flatMap(value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
    const record = value as Record<string, unknown>;
    const imageIndex = Math.max(1, Math.round(Number(record.imageIndex) || 0));
    const instruction = normalizePlanText(record.instruction);
    return instruction ? [`- **图片 ${imageIndex}**：${instruction}`] : [];
  }).join('\n');
};

const buildDetailedAnalysisSummary = (structured: Record<string, unknown>) => {
  const sections = [
    ['任务理解', readVisibleString(structured, 'taskUnderstanding')],
    ['源图分析', readVisibleString(structured, 'sourceAssessment')],
    ['执行安排', readVisibleString(structured, 'executionPlan')],
    ['具体改动', readVisibleString(structured, 'specificChanges')],
    ['逐图执行', readPerImageInstructions(structured)],
    ['保留与限制', readVisibleString(structured, 'preservationRules')],
    ['结果组织', readVisibleString(structured, 'deliveryPlan')],
  ].filter((section): section is [string, string] => Boolean(section[1]));
  if (sections.length < 7) return '';
  return sections
    .map(([title, content]) => `### ${title}\n\n${content}`)
    .join('\n\n');
};

const buildDetailedExecutionInstruction = (structured: Record<string, unknown>) => {
  const originalInstruction = readVisibleString(structured, 'instruction');
  const sections = [
    ['任务目标', readVisibleString(structured, 'taskUnderstanding')],
    ['通用执行步骤', readVisibleString(structured, 'executionPlan')],
    ['必须完成的改动', readVisibleString(structured, 'specificChanges')],
    ['必须保留与禁止修改', readVisibleString(structured, 'preservationRules')],
  ].filter((section): section is [string, string] => Boolean(section[1]));
  if (sections.length < 4) return originalInstruction;
  return [
    '对当前输入的这一张图片执行以下方案。当前图片是独立任务，不得与其他图片拼接、融合或串用主体。',
    originalInstruction ? `用户原始要求：${originalInstruction}` : '',
    ...sections.map(([title, content]) => `${title}：\n${content}`),
  ].filter(Boolean).join('\n\n');
};

export const extractChatBatchImagePlan = (
  result: ChatProviderResult,
  fallback: ChatBatchImagePlan,
): ChatBatchImagePlan => {
  const planCall = result.toolCalls.find(call => (
    call.name === 'propose_batch_image_plan' || call.name === 'batch_image_operation'
  ));
  const structured = parseRecord(planCall?.arguments);
  const detailedAnalysisSummary = buildDetailedAnalysisSummary(structured);
  return {
    analysisSummary: detailedAnalysisSummary
      || normalizePlanText(structured.analysisSummary)
      || normalizePlanText(result.content)
      || fallback.analysisSummary,
    instruction: buildDetailedExecutionInstruction(structured)
      || fallback.instruction,
  };
};
