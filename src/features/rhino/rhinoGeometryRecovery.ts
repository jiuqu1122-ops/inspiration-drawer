import type { ChatToolCall } from '../chat/model/chatTypes';
import { GEOMETRY_PREFLIGHT_REJECTION, RhinoGeometryPreflightError, SAFE_PROFILE_TOOL } from './rhinoSafeModeling';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue => value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
export const MAX_GEOMETRY_PREFLIGHT_CORRECTIONS = 2;

const INPUT_FIELDS: Record<string, string[]> = {
  hole_outside_or_crossing: ['outer', 'holes'], wall_too_thin: ['outer', 'holes'],
  holes_overlap_or_nested: ['holes'], hole_web_too_thin: ['holes'], invalid_hole: ['holes'],
  invalid_part: ['outer', 'holes', 'thickness', 'xAxis', 'yAxis'],
  planar_region_count: ['outer', 'holes'], solid_invalid: ['outer', 'holes', 'thickness'],
  solid_transform_failed: ['origin', 'xAxis', 'yAxis'], invalid_plan: ['parts', 'units'],
};

/** Structured, input-specific evidence; no fixture coordinates or automatic geometry edits. */
export function geometryFailureReceipt(receipt: RecordValue, args: RecordValue): RecordValue {
  const parts = Array.isArray(args.parts) ? args.parts.map(record) : [];
  const issues = Array.isArray(receipt.issues) ? receipt.issues.map(record).map(issue => {
    const indices = parts.flatMap((part, i) => part.name === issue.part ? [i] : []);
    const index = indices.length === 1 ? indices[0] : undefined;
    const fields = INPUT_FIELDS[String(issue.code)] || [];
    return { ...issue, ...(index === undefined ? {} : { partIndex: index }), inputPaths: fields.map(field => index === undefined ? field : `parts[${index}].${field}${field === 'holes' && Number.isInteger(issue.holeIndex) ? `[${issue.holeIndex}]` : ''}`) };
  }) : [];
  return { ...receipt, issues, repairPolicy: {
    maxCorrections: MAX_GEOMETRY_PREFLIGHT_CORRECTIONS, documentWritesPermittedDuringRepair: false,
    instruction: 'Fix the actual reported input paths. Changing minWall/tolerance alone cannot fix crossing/overlapping/self-intersecting boundaries. Preserve requested holes, dimensions and 3D topology; never delete features or weaken constraints solely to pass. Do not replay a committed or uncertain write. A different model can use different geometry tools; this helper is only for genuinely planar profile extrusions.',
  } };
}

/** Catch ineffective replans before another kernel call, not after another paid model loop. */
export function assertGeometryCorrection(args: RecordValue, calls: ChatToolCall[]): void {
  const previous = [...calls].reverse().find(call => call.toolName === SAFE_PROFILE_TOOL && call.resultJson);
  if (!previous || previous.status !== 'error') return;
  let receipt: RecordValue; let prior: RecordValue;
  try { receipt = JSON.parse(previous.resultJson!); prior = JSON.parse(previous.argumentsJson); } catch { return; }
  if (receipt.kind !== GEOMETRY_PREFLIGHT_REJECTION || receipt.documentChanged !== false) return;
  const parts = Array.isArray(args.parts) ? args.parts.map(record) : [];
  const oldParts = Array.isArray(prior.parts) ? prior.parts.map(record) : [];
  const issues = Array.isArray(receipt.issues) ? receipt.issues.map(record) : [];
  const blockers: RecordValue[] = [];
  for (const issue of issues) {
    const index = oldParts.findIndex(part => part.name === issue.part);
    if (index < 0 || !parts[index] || parts[index].name !== oldParts[index].name) continue;
    const before = oldParts[index], after = parts[index];
    const beforeHoles = Array.isArray(before.holes) ? before.holes : [];
    const afterHoles = Array.isArray(after.holes) ? after.holes : [];
    if (afterHoles.length < beforeHoles.length) {
      blockers.push({ code: 'feature_removed_during_repair', part: issue.part, partIndex: index, message: 'Deleting requested holes is not a repair. Preserve features and fix their geometry.' }); continue;
    }
    const hi = Number(issue.holeIndex), other = Number(issue.otherHoleIndex);
    const relevantHoleUnchanged = Number.isInteger(hi) && same(beforeHoles[hi], afterHoles[hi]);
    const crossingUnchanged = issue.code === 'hole_outside_or_crossing' && relevantHoleUnchanged && same(before.outer, after.outer);
    const overlapUnchanged = issue.code === 'holes_overlap_or_nested' && relevantHoleUnchanged && Number.isInteger(other) && same(beforeHoles[other], afterHoles[other]);
    if (crossingUnchanged || overlapUnchanged) blockers.push({ ...issue, code: 'ineffective_geometry_correction', originalCode: issue.code, partIndex: index,
      message: 'The offending boundaries are unchanged. minWall/tolerance/thickness/placement changes alone cannot resolve this containment/intersection error. Change the exact outer/hole geometry while preserving features.' });
  }
  if (!blockers.length && same(prior, args)) blockers.push({ code: 'unchanged_geometry_plan', message: 'The rejected plan was resubmitted unchanged. Correct its exact issues before another kernel call.' });
  if (blockers.length) throw new RhinoGeometryPreflightError({ version: 1, status: 'rejected', stage: 'preflight', documentChanged: false, dispatched: false,
    issues: blockers.slice(0, 16), issueCount: blockers.length, priorIssues: issues.slice(0, 16), kind: GEOMETRY_PREFLIGHT_REJECTION,
    instruction: 'Local correction check: the new plan does not address the verified geometry errors. No kernel/write call was dispatched. Correct the actual input paths; do not lower constraints or remove features as a workaround.' });
}

/** Plain-language summaries are shared by desktop, Rhino panel and final errors. */
export function geometryFailureSummary(value: unknown): string {
  const receipt = record(value);
  if (!Array.isArray(receipt.issues)) return '';
  return receipt.issues.slice(0, 6).map(raw => {
    const issue = record(raw);
    const part = typeof issue.part === 'string' ? issue.part : '几何计划';
    const hole = Number.isInteger(issue.holeIndex) ? ` · 孔 ${Number(issue.holeIndex) + 1}` : '';
    const descriptions: Record<string, string> = {
      hole_outside_or_crossing: '孔越出或穿过外轮廓，必须修改孔或外轮廓的位置/形状',
      wall_too_thin: '孔到外轮廓的壁厚不足', holes_overlap_or_nested: '孔之间相交、相切或嵌套',
      hole_web_too_thin: '孔间距不足', invalid_hole: '孔边界无效', invalid_part: '零件参数或边界无效',
      planar_region_count: '未形成唯一的有效平面区域', solid_invalid: '未形成有效闭合实体',
      solid_transform_failed: '零件坐标系或放置变换无效', ineffective_geometry_correction: '修正没有改变冲突边界，仅修改壁厚等参数不能消除相交',
      feature_removed_during_repair: '修正删除了原有孔，不能靠省略特征通过检查', unchanged_geometry_plan: '修正仍是原来的无效计划',
    };
    const actual = typeof issue.actualClearance === 'number' ? `；实际 ${issue.actualClearance.toFixed(3)}` : '';
    const required = typeof issue.requiredClearance === 'number' ? `，要求至少 ${issue.requiredClearance}` : '';
    return `${part}${hole}：${descriptions[String(issue.code)] || String(issue.message || issue.code || '预检失败').slice(0, 240)}${actual}${required}`;
  }).join('\n');
}
