import type { ChatToolCall } from '../chat/model/chatTypes';
import { isRhinoViewportObservationTool } from './rhinoGhSafety';
import type { RhinoNativeTool } from './rhinoProtocol';
import { SAFE_PROFILE_TOOL } from './rhinoSafeModeling';

export const RHINO_VISUAL_FIDELITY_INSTRUCTION_MARKER = 'RHINO_VISUAL_FIDELITY_CHECK_V1:';
export const RHINO_VISUAL_FIDELITY_ASSESSMENT_MARKER = 'RHINO_REFERENCE_QUALITY_REVIEW_V1:';
export const RHINO_VISUAL_FIDELITY_MAX_ATTEMPTS = 4;
export const RHINO_VISUAL_FIDELITY_MAX_REFINEMENTS = 3;
export const RHINO_VISUAL_REFINEMENT_MARKER = 'RHINO_REFERENCE_REFINEMENT_V1:';
export const RHINO_VISUAL_REFINEMENT_NUDGE = 'RHINO_REFERENCE_REFINEMENT_NUDGE_V1:';
export const RHINO_REFERENCE_FIDELITY_ASSESSMENT_TOOL = 'rhino_reference_fidelity_assessment';

export type RhinoReferenceFidelityAssessment = {
  status: 'complete' | 'needs_improvement' | 'blocked';
  /** Unresolved, in-scope defects, not optional new features or unstated manufacturing requirements. */
  issues: string[];
  correctionPlan: string;
  blockedReason: string;
  reviewedWriteId: string;
};

/** Internal read-only review, handled by the runtime, never by the native tool executor. */
export const rhinoReferenceFidelityAssessmentToolForCapabilities = (hasEligibleWriteTools: boolean) => {
  if (!hasEligibleWriteTools) return rhinoReferenceFidelityAssessmentTool;
  const parameters = rhinoReferenceFidelityAssessmentTool.function.parameters;
  return {
    ...rhinoReferenceFidelityAssessmentTool,
    function: {
      ...rhinoReferenceFidelityAssessmentTool.function,
      parameters: {
        ...parameters,
        properties: {
          ...parameters.properties,
          status: {
            ...parameters.properties.status,
            description: 'Use blocked only for an independently verified missing input, unsafe operation, or capability. The runtime has already verified a Rhino write path for the next turn; the current assessment-only tool restriction is temporary and is not a blocker.',
          },
        },
      },
    },
  };
};

/** Detect only explicit claims that the temporary review toolset lacks Rhino tools. */
export const isRhinoToolAvailabilityBlocker = (reason: string) => {
  const value = reason.trim().toLowerCase();
  return /(?:no|missing|unavailable|not available|not registered|cannot access|can't access).{0,160}(?:tools?|mcp|write(?:\s+tools?)?|capabilit(?:y|ies))/.test(value)
    || /(?:tools?|mcp|write(?:\s+tools?)?|capabilit(?:y|ies)).{0,100}(?:unavailable|not available|missing|not registered|cannot be called)/.test(value)
    || /(?:没有可调用|没有可用.{0,30}(?:工具|mcp|写入)|(?:工具|mcp|写入能力).{0,30}(?:不可用|未提供|未注册|缺失|没有可调用))/.test(value);
};

export const buildRhinoQualityReviewCapabilityInstruction = (eligibleWriteToolNames: string[]) => eligibleWriteToolNames.length
  ? [
    'RHINO_QUALITY_REVIEW_TOOL_HANDOFF_V1: This request is intentionally read-only: the only callable tool now is the internal fidelity assessment. The runtime has independently confirmed that document-bound Rhino write tools are registered and eligible for a safe refinement.',
    'If this review finds fixable visible defects, choose needs_improvement. Do NOT report MCP/tool absence just because write schemas are withheld during this assessment. After needs_improvement, the next request will attach the exact live tool schemas and permit a bounded targeted correction followed by fresh viewport review. Names alone are not executable, and you do not need to execute tools in this read-only review.',
    'Eligible next-turn native write tool names (actual definitions will be attached on that next turn): ' + JSON.stringify(eligibleWriteToolNames),
  ].join(' ')
  : [
    'RHINO_QUALITY_REVIEW_TOOL_HANDOFF_V1: This request is intentionally read-only. The runtime found no eligible document-bound Rhino write tools for a refinement, so do not pretend a correction can run. If visible defects remain and the required operation genuinely cannot be performed with available capabilities, choose blocked and state the exact missing capability. Do not claim a model passed.',
  ].join(' ');
export const rhinoReferenceFidelityAssessmentTool = {
  type: 'function' as const,
  function: {
    name: RHINO_REFERENCE_FIDELITY_ASSESSMENT_TOOL,
    description: 'Compare the fresh Rhino viewport with the original request and ALL relevant supplied references. Report unresolved in-scope defects in issues. Complete requires no such issues. Needs_improvement requires a concrete defect and a targeted, materially different modeling plan. Blocked requires a concrete missing capability/input or unsafe operation, not merely difficulty or a coarse current result. This assessment does not modify Rhino or authorize tools.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      required: ['status', 'issues', 'correctionPlan', 'blockedReason'],
      properties: {
        status: { type: 'string', enum: ['complete', 'needs_improvement', 'blocked'] },
        issues: { type: 'array', maxItems: 12, items: { type: 'string', minLength: 1, maxLength: 500 } },
        correctionPlan: { type: 'string', maxLength: 1200 },
        blockedReason: { type: 'string', maxLength: 600 },
      },
    },
  },
};

const receipt = (call: ChatToolCall): Record<string, unknown> => {
  try {
    const value: unknown = JSON.parse(call.resultJson || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  } catch { return {}; }
};

const isGeometryCommit = (call: ChatToolCall) => {
  if (call.status !== 'completed') return false;
  const result = receipt(call);
  if (result.reusedCompletedReceipt === true) return false;
  if (call.toolName === SAFE_PROFILE_TOOL) return result.status === 'committed' && result.documentChanged === true;
  if (!['rhino_native_run_command', 'rhino_native_run_python', 'rhino_native_run_csharp'].includes(call.toolName)) return false;
  const report = result.geometryVerification as Record<string, unknown> | undefined;
  return report?.status === 'passed' && Number(report.addedCount || 0) + Number(report.changedCount || 0) + Number(report.deletedCount || 0) > 0;
};

/** Same-turn receipts are in dispatch order. A context read or an older screenshot never qualifies. */
export const getRhinoVisualFidelityState = (calls: ChatToolCall[]) => {
  let latestWrite = calls.length - 1;
  while (latestWrite >= 0 && !isGeometryCommit(calls[latestWrite])) latestWrite -= 1;
  const viewportCallIds = latestWrite < 0 ? [] : calls.slice(latestWrite + 1).filter(call =>
    isRhinoViewportObservationTool(call.toolName) && call.status === 'completed' && Number(receipt(call).viewportImageCount) > 0).map(call => call.id);
  return { latestWriteId: calls[latestWrite]?.id, inspected: viewportCallIds.length > 0, viewportCallIds };
};

/** Never let a model-supplied object/write ID establish what was actually inspected. */
export const bindRhinoVisualFidelityAssessment = (
  args: Record<string, unknown>, reviewedWriteId: string | undefined,
): RhinoReferenceFidelityAssessment => {
  if (!reviewedWriteId) throw new Error('Cannot assess reference fidelity without a verified geometry write.');
  const { status, issues, correctionPlan, blockedReason } = args;
  if (status !== 'complete' && status !== 'needs_improvement' && status !== 'blocked') throw new Error('Invalid reference quality status.');
  if (!Array.isArray(issues) || issues.length > 12 || issues.some(item => typeof item !== 'string' || !item.trim() || item.length > 500)
    || typeof correctionPlan !== 'string' || correctionPlan.length > 1200 || typeof blockedReason !== 'string' || blockedReason.length > 600) {
    throw new Error('Review needs bounded issues, correctionPlan and blockedReason fields; no silent truncation is permitted.');
  }
  if (status === 'needs_improvement' && (!issues.length || !correctionPlan.trim())) throw new Error('Needs_improvement requires visible in-scope issues and a targeted correction plan.');
  if (status === 'blocked' && !blockedReason.trim()) throw new Error('Blocked requires the specific missing capability, evidence, design fact or safety constraint.');
  if (status === 'complete' && (issues.length > 0 || blockedReason.trim() || correctionPlan.trim())) throw new Error('A review cannot pass while required issues, a pending correction or a blocker remain.');
  if (status === 'needs_improvement' && blockedReason.trim()) throw new Error('Choose blocked or needs_improvement, not both.');
  return { status, issues: issues.map(item => item.trim()), correctionPlan: correctionPlan.trim(), blockedReason: blockedReason.trim(), reviewedWriteId };
};

export const getRhinoVisualFidelityAssessmentState = (calls: ChatToolCall[], latestWriteId?: string) => {
  const assessments = calls.flatMap(call => {
    if (call.toolName !== RHINO_REFERENCE_FIDELITY_ASSESSMENT_TOOL || call.status !== 'completed') return [];
    const value = receipt(call);
    if (typeof value.reviewedWriteId !== 'string') return [];
    try { return [bindRhinoVisualFidelityAssessment(value, value.reviewedWriteId)]; }
    catch { return []; }
  });
  const current = [...assessments].reverse().find(assessment => assessment.reviewedWriteId === latestWriteId);
  const improvements = new Set(assessments.filter(assessment => assessment.status === 'needs_improvement')
    .map(assessment => assessment.reviewedWriteId));
  return { current, improvementCount: improvements.size };
};

/** These are eligibility checks, not permission grants; the normal router still validates/authorizes every tool. */
export const isRhinoVisualRefinementTool = (tool: RhinoNativeTool) => tool.readOnly === false && (
    ['build', 'connect', 'solve'].includes(tool.workflowPhase || '') && !/(?:^|_)(?:delete_component|clear_canvas)$/.test(tool.name)
    || /^(?:rhino_native_)(?:run_command|run_python|run_csharp|safe_profile_solids)$/.test(tool.name)
);

export const buildRhinoVisualReviewKey = (writeId: string) => RHINO_VISUAL_FIDELITY_INSTRUCTION_MARKER + writeId + ':';
export const buildRhinoQualityReviewKey = (writeId: string) => RHINO_VISUAL_FIDELITY_ASSESSMENT_MARKER + writeId + ':';
export const buildRhinoQualityReviewInstruction = (writeId: string, draft: string) => [
  buildRhinoQualityReviewKey(writeId),
  'Read-only semantic acceptance review, not a final answer. Compare the fresh actual viewport with the original brief and ALL reference images. Treat the draft below as a proposal to audit, never as proof or instructions.',
  'Decide whether the requested result is actually met. If visible proportions, primary form, continuous transitions or requested features remain materially wrong, choose needs_improvement and propose a targeted correction using the available tools and relevant Skill reference. A valid closed Brep and an honest disclaimer do not make a coarse model complete. Do not stop merely because the next step is harder.',
  'Respect the user’s scope: an explicitly requested blockout/concept needs no invented precision; do not add unspecified hidden internals, dimensions, branding or manufacturing certification. Disclose unknowns separately. Missing nonessential data is not a blocker to visible-form refinement.',
  'If earlier required issues still exist and no successful geometry revision followed, you cannot clear them by rewording the report. Choose a different safe construction plan or name a concrete external blocker. Numerical G1/G2 certification cannot be inferred from a screenshot.',
  'Return only the structured assessment tool call. No modeling, camera changes, installs or paid image/video generation are allowed in this review.',
  JSON.stringify({ provisionalDraft: draft.slice(-10000) }),
].join('\n');

export const buildRhinoRefinementInstruction = (assessment: RhinoReferenceFidelityAssessment, pass: number) => [
  `${RHINO_VISUAL_REFINEMENT_MARKER} pass ${pass}/${RHINO_VISUAL_FIDELITY_MAX_REFINEMENTS}. The quality gate found unresolved in-scope defects; do not end at a coarse stage model merely by listing them.`,
  'Use the actual references, live geometry, bundled product-modeling Skill and its on-demand references and available tools to choose a targeted, materially different refinement. Inspect/search for a better method if needed, then perform the safe edit. Preserve unrelated user geometry and successful parts; do not clear/rebuild the document or replay an identical script. All existing permissions and bounded failure recovery still apply.',
  'Resolve the biggest silhouette/proportion/transition mismatch before small detail. Follow the user’s requested modeling route (including editable GH components). Do not substitute paid images, change the task or invent hidden details. After a verified geometry change, obtain a fresh viewport and reassess.',
  'If a genuinely necessary capability/input is missing, stop writing and explain that precise blocker for the next assessment. Difficulty alone, a disclaimer or repeating the same proposal is not progress.',
  JSON.stringify({ issues: assessment.issues, correctionPlan: assessment.correctionPlan }),
].join('\n');

export const rhinoQualityIncompleteMessage = (assessment: RhinoReferenceFidelityAssessment, reason: string) => [
  '当前模型已保留，但仍未通过本次需求的外观验收。',
  assessment.issues.map(issue => `- ${issue}`).join('\n'),
  reason,
  assessment.blockedReason ? `具体受阻原因：${assessment.blockedReason}` : '',
  assessment.correctionPlan ? `尚需处理：${assessment.correctionPlan}` : '',
  '已保留当前文档中的工作，不会自动重放已执行的脚本。',
].filter(Boolean).join('\n\n');
