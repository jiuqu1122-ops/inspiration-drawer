import { rhinoUserRequest } from './rhinoRequestIntent';

// A representation requirement, not permission to write. Match the requested output,
// not a command name, a source mesh, a negated example, or appended scene context.
const surface = /\b(?:nurb(?:u?s)?|b-?reps?|polysurfaces?)\b|多重曲面|可编辑(?:的)?\s*(?:(?:光顺|光滑)的?)?曲面|\beditable\s+surfaces?\b/i;
const mesh = /\bmesh(?:es)?\b|网格/i;
const forbidMesh = /(?:不要|不需要|不用|不许|禁止|不能|不接受|非|不是|别)\s*(?:再|使用|用|输出|生成|做成|是|任何|的)*\s*(?:网格(?!线)|mesh\b)|\b(?:no|not|non-|without|avoid|never use|(?:do not|don't) (?:use|want))\s*(?:(?:a|any|polygon)\s+)?mesh(?:es)?\b/i;
const negative = /不|没|并非|无[需须]|勿|别|禁止|而非|\b(?:not|no|never|without|avoid|optional|unnecessary|don't|isn't|needn't)\b/i;
const discussion = /如果|假如|例如|比如|举例|解释|对比|区别|是否|能否|怎么|如何|能用.{0,24}吗|教程|脚本|提示词|\b(?:if|whether|example|explain|compare|tutorial|script|prompt|difference|how to)\b|^(?:is|are|does|do (?:i|we|you)|can (?:i|we)|what|why|how)\b/i;
const permissive = /都行|均可|也行|就行|也许|可考虑|都可以|也可以|也可|也能|即可|可选|可接受|\b(?:maybe|perhaps|optional|allowed|acceptable|fine|ok(?:ay)?)\b/i;
const disjunction = /或者?|或是|\bor\b|\//i;
const otherOutput = /曲线|细分曲面|示意图|效果图|渲染图|截图|\b(?:curves?|sub-?d)\b/i;
const sourceMesh = /(?:使用|用)\s*(?:现有的?|原来的?)?\s*(?:网格|mesh)\s*(?:作为|作|做)(?:输入|参考)|\buse\s+(?:(?:the|a|this)\s+)?mesh\s+as\s+(?:(?:a|an)\s+)?(?:input|reference)\b/gi;
const meshOutput = /(?:用|要|生成|输出|接受|换成|改成|转成|转为|做成|替换为)\s*(?:一个|可编辑的?)?\s*(?:网格|mesh\b)|\b(?:want|use|make|build|create|output|into|to|as|with)\s+(?:(?:a|the|polygon|editable)\s+)*mesh(?:es)?\b/i;
// Check the complement of an instruction, rather than any verb anywhere in a
// clause ("我要检查是否是 NURBS" / "I want to inspect that NURBS" aren't specs).
const zhDirective = /(?:要求|要|必须|务必|给我|使用|用|做|建|生成|输出|交付|保留|重建|重构|换|改|转)(?:的|是|为|成|出|一个|一张|一组|一套|可编辑|原生|真正|光滑|光顺|连续|平滑|高质量|\s)*$/;
const enDirective = /\b(?:want|would like|need|require|use|make|create|build|rebuild|produce|deliver|keep|only|must be|output|convert .+? (?:in)?to|replace .+? with|(?:model|build|rebuild|deliver) .+? as)\s+(?:(?:an?|the|native|editable|smooth|true)\s+)*$/i;
const nounTail = /^(?:\s*(?:的|曲面|模型|实体|几何|建模|surfaces?|geometry|model))*\s*$/i;
const shorthand = /^(?:可编辑的?|原生的?|光顺的?|光滑的?|editable\s+|native\s+|smooth\s+|\s)*$/i;
const requirementSuffix = /^(?:\s*(?:曲面|模型|实体|surfaces?|geometry|model))?\s*(?:是必须的|才行|为准|only\b|(?:is |are )?(?:required|mandatory)\b)/i;

export function requiresEditableNurbs(userText: string): boolean {
  const request = rhinoUserRequest(userText.replace(/\r\n/g, '\n')).normalize('NFKC')
    .replace(/```[\s\S]*?(?:```|(?![\s\S]))|^\s*>[^\n]*|“[^”]*”|「[^」]*」|"[^"\n]*"/gm, ' ')
    .replace(/’/g, "'");
  const clauses = request.split(/[,;.!?，。；！？\n]+|但是|而是|\bbut\b/i).map(part => part.trim()).filter(Boolean);
  const bansMesh = clauses.some(part => !discussion.test(part) && forbidMesh.test(part) && !negative.test(part.replace(forbidMesh, '')));
  // A generic "surface" after a mesh ban is not a countermand of "no NURBS".
  const excludesSurface = clauses.some(part => surface.test(part) && negative.test(part) && !mesh.test(part));
  let wanted = false;
  for (const clause of clauses) {
    // Only the left side names the output in "NURBS rather than mesh".
    const [preferred, excluded] = clause.split(/而不是|而非|而不要|\brather than\b|\binstead of\b/i);
    const ban = forbidMesh.exec(preferred);
    // Do not turn "don't use mesh to build NURBS" into "build NURBS".
    const afterBan = ban ? preferred.slice(ban.index + ban[0].length).replace(/^\s*\)/, '').trim() : '';
    if (afterBan && !/^(?:我要|我想要|我需要|只要|而要|i (?:want|need)\b)/i.test(afterBan)) continue;
    const output = preferred.replace(forbidMesh, ' ').trim().replace(/[/（(]\s*[)）]?$/, '').trim();
    if (wanted && /^(?:(?:但|也|这)?(?:不是必须的?|不强制|非硬性要求)|(?:(?:it|this)\s+is\s+)?not\s+(?:required|mandatory|necessary))$/i.test(output)) return false;
    if (discussion.test(output) || negative.test(output)) continue;
    if (mesh.test(output) && (permissive.test(output) || disjunction.test(output) || meshOutput.test(output.replace(sourceMesh, ' ')))) return false;
    if (otherOutput.test(output) || (permissive.test(output) && !disjunction.test(output))) continue;
    // "NURBS or Brep" stays inside the contract; "NURBS or SubD" doesn't.
    if (disjunction.test(output) && !output.split(disjunction).every(variant => surface.test(variant))) continue;
    const match = surface.exec(output) ?? (bansMesh && !excludesSurface ? /曲面|\bsurfaces?\b/i.exec(output) : null);
    if (!match) continue;
    const prefix = output.slice(0, match.index);
    const suffix = output.slice(match.index + match[0].length);
    if (/^\s*(?:曲面|surfaces?)?\s*(?:作为参考|作参考|做参考|as (?:a )?reference)/i.test(suffix)) continue;
    const explicitSpec = /可编辑|\beditable\b/i.test(prefix + match[0]) || bansMesh || mesh.test(excluded ?? '');
    if (zhDirective.test(prefix) || enDirective.test(prefix) || requirementSuffix.test(suffix) || (explicitSpec && shorthand.test(prefix) && nounTail.test(suffix))) wanted = true;
  }
  return wanted;
}

export interface RhinoSurfaceAssessment {
  status: 'passed' | 'failed' | 'inconclusive';
  /** Representation only, even for a valid native NurbsSurface or MeshToNurb result. */
  smoothnessVerified: false;
  reasons: string[];
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const idKey = (id: unknown) => typeof id === 'string' ? id.trim().toLowerCase() : '';
const className = (type: unknown) => typeof type === 'string' ? type.trim().toLowerCase().replace(/^rhino\.geometry\./, '') : '';
const result = (status: RhinoSurfaceAssessment['status'], ...reasons: string[]): RhinoSurfaceAssessment =>
  ({ status, smoothnessVerified: false, reasons });

const nativeSurfaces = new Set(['brep', 'surface', 'nurbssurface', 'planesurface', 'revsurface', 'sumsurface']);
const nonSurfaces = new Set(['subd', 'curve', 'nurbscurve', 'polylinecurve', 'polycurve', 'arccurve', 'linecurve', 'point', 'pointcloud']);

function inspectRow(row: Record<string, unknown>): RhinoSurfaceAssessment {
  const native = className(row.geometryType);
  const type = className(row.type);
  if (row.isMesh === true || type === 'mesh' || native === 'mesh') return result('failed', 'Target is a Mesh.');
  if (row.valid === false || row.isValid === false) return result('failed', 'Target geometry is invalid.');
  if (row.isSubD === true || nonSurfaces.has(native) || nonSurfaces.has(type)) return result('failed', 'Target is not a surface/Brep.');
  // isBrep in the full snapshot also describes objects inspected via ToBrep().
  // Prefer the actual geometry class, falling back only to a native object type.
  if (!nativeSurfaces.has(native || type)) return result('inconclusive', 'Missing or unrecognized native surface/Brep type.');
  if (row.valid !== true && row.isValid !== true) return result('inconclusive', 'Target validity was not established.');
  return result('passed');
}

/** Assess compareDocumentGeometrySnapshots' post-write delta. Without IDs, every
 * added/changed object is a target. Never use unchanged, deleted, previous geometry
 * or tool receipts as evidence. Sharp edges are allowed: G1 needs a separate check
 * at explicitly requested locations and tolerances, not a blanket edge test. */
export function assessEditableNurbs(delta: unknown, targetIds?: readonly string[]): RhinoSurfaceAssessment {
  if (!record(delta)) return result('inconclusive', 'Missing post-write geometry delta.');
  const targets = targetIds === undefined ? undefined : new Set(targetIds.map(idKey));
  if (targets && (!targets.size || targets.has(''))) return result('inconclusive', 'Empty or invalid target IDs.');
  const failures: string[] = [];
  const unknown: string[] = [];
  const gaps: string[] = [];
  const seen = new Set<string>();
  if (delta.truncated !== false) gaps.push('Snapshot completeness was not established.');
  if (delta.documentChanged === false) gaps.push('Delta reports no document change.');
  for (const group of ['added', 'changed'] as const) {
    const rows = delta[group];
    if (!Array.isArray(rows)) { gaps.push(`Missing ${group} snapshot rows.`); continue; }
    // The producer caps EACH list independently, even when its global flag is false.
    if (delta[`${group}Count`] !== rows.length) gaps.push(`Incomplete ${group} snapshot rows.`);
    for (const row of rows) {
      if (!record(row) || !idKey(row.id)) { gaps.push(`Unidentified ${group} object.`); continue; }
      const key = idKey(row.id);
      if (seen.has(key)) gaps.push(`Duplicate post-write ID: ${key}.`);
      seen.add(key);
      if (targets && !targets.has(key)) continue;
      const check = inspectRow(row);
      if (check.status === 'failed') failures.push(`${key}: ${check.reasons[0]}`);
      if (check.status === 'inconclusive') unknown.push(`${key}: ${check.reasons[0]}`);
    }
  }
  if (!seen.size) gaps.push('No added/replaced target geometry was observed.');
  for (const key of targets ?? []) if (!seen.has(key)) gaps.push(`No post-write row for target ${key}.`);
  // Do not certify an incomplete delta; retain any definite violation for diagnosis.
  const reasons = [...gaps, ...failures, ...unknown];
  if (gaps.length) return result('inconclusive', ...reasons);
  if (failures.length) return result('failed', ...reasons);
  if (unknown.length) return result('inconclusive', ...reasons);
  return result('passed', 'All target representations are valid native surfaces/Breps; smoothness is unverified.');
}
