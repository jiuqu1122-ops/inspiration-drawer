import type { ChatMessage, ChatToolCall } from '../chat/model/chatTypes';
import { isRhinoModelingContinuation, rhinoUserRequest } from './rhinoRequestIntent';
import { assessEditableNurbs, requiresEditableNurbs } from './rhinoSurfaceContract';

type Row = Record<string, unknown>;
const row = (x: unknown): Row => x && typeof x === 'object' && !Array.isArray(x) ? x as Row : {};
const list = (x: unknown): Row[] => Array.isArray(x) ? x.map(row) : [];
const id = (x: unknown) => typeof x === 'string' ? x.toLowerCase() : '';
function read(s: unknown): Row { try { return row(JSON.parse(String(s))); } catch { return {}; } }
export function productRequest(text: string, history: Pick<ChatMessage,'role'|'content'>[]) {
  const current = rhinoUserRequest(text);
  if (!isRhinoModelingContinuation(current)) return current;
  return [...history].reverse().filter(m => m.role === 'user').map(m => rhinoUserRequest(m.content)).find(s => s && !isRhinoModelingContinuation(s)) || current;
}
// Only explicit subtractive instructions are a hard condition. Decorative/applied texture is legitimate otherwise.
export function requiresSampledRecess(text: string) {
  return rhinoUserRequest(text).split(/[，。；,;.!?\n]/).some(s => !/不要|不必|无需|不用|如何|为什么|怎么|是否|instead of|do not|don't|without/i.test(s) && /(?:真实|实际|布尔(?:差集|减)|切出|切入|挖出|减料).{0,18}(?:凹槽|凹纹|压纹|凹座)|(?:凹槽|凹纹|凹座).{0,12}(?:必须|需要|用).{0,6}(?:切入|切除|减料|布尔差)|(?:cut|subtract|boolean difference).{0,22}\b(?:recess|groove)\b/i.test(s));
}
export const PRODUCT_REPAIR_MARKER='Rhino product feature checks incomplete:';
export const PRODUCT_RULES = 'For product CAD, state the host and intended feature relation (cut, split, blended skin, independent insert, or applied decoration). Do not union separate moving parts or turn a requested physical recess into floating trim. For staged Python build on private copies; use stage.require_groove(part_name, samples, source_id=existing_body_id) for a replacement, or baseline=original_uncut_private_brep for a new part. Each sample: point on the uncut skin, inward and across directions, flankDistance, minDepth, maxDepth in document units. Use stage.require_preserved(existing_button_id) when an existing separate insert must remain untouched. Run stage.preview() before commit; the commit repeats the checks. These samples prove local removal, not global fit. In an isolated 3DM draft use difference.removedMaterialPoints at specified material locations; use preserveIds for existing independent inserts and never consume them as cutters. First validate primary silhouettes, then seams and detail. Never claim G1/G2 without measuring the requested joins; intentional sharp edges and panel gaps are not defects.';

// Only correlate a real commit marker in native stdout with a changed part of this actual document.
// Runtime helper evidence is NOT a grant to replay arbitrary Python or a claim of zero side effects.
function nativeCommitEvidence(stdoutBlocks: unknown, changed: Set<string>, removed: Set<string>) {
  const grooves = new Set<string>(), preserved = new Set<string>();
  if (typeof stdoutBlocks === 'string') for (const block of stdoutBlocks.split('\n')) {
    const stdout = read(block).stdout; if (typeof stdout !== 'string') continue;
    for (const line of stdout.split(/\r?\n/)) {
      const marker = 'IDRAW_FEATURE_COMMIT_V1:';
      if (!line.startsWith(marker) || line.length > 8192) continue;
      const report = read(line.slice(marker.length));
      const parts = new Set(Array.isArray(report.partIds) ? report.partIds.map(id) : []);
      if (![...parts].some(key => changed.has(key))) continue;
      for (const c of list(report.checks)) {
        const key = id(c.id); if(!key || c.passed !== true) continue;
        if (c.type === 'sampledGroove' && parts.has(key) && changed.has(key)) grooves.add(key);
        if (c.type === 'preservedObject' && !changed.has(key) && !removed.has(key)) preserved.add(key);
      }
    }
  }
  return { grooves, preserved };
}
export function productCompletionIssue(text: string, calls: ChatToolCall[]): string | undefined {
  const surface=requiresEditableNurbs(text), groove=requiresSampledRecess(text); if(!surface&&!groove) return;
  const preserveExisting = groove && /(?:保留|保持|勿改|不改|勿动|不要动).{0,8}(?:原有|现有|已有|原来的).{0,10}(?:独立|分件)|(?:keep|preserve).{0,10}existing.{0,10}separate/i.test(text);
  const live=new Map<string,Row>(), checkedGrooves=new Set<string>(), preserved=new Set<string>(); let complete=true, wrote=false;
  for(const call of calls){
    if(call.status!=='completed') continue;
    const receipt=read(call.resultJson); if(receipt.reusedCompletedReceipt===true)continue;
    if(call.toolName==='rhino_native_headless_build' && receipt.committed===true && Array.isArray(receipt.objects)){
      wrote=true; live.clear(); complete=true;
      for(const obj of list(receipt.objects)) live.set(id(obj.id),obj);
      for(const key of checkedGrooves) if(!live.has(key)) checkedGrooves.delete(key);
      const args=read(call.argumentsJson); if(Array.isArray(args.ids)) for(const target of args.ids) { checkedGrooves.delete(id(target));preserved.delete(id(target)); }
      for (const key of preserved) if (!live.has(key)) preserved.delete(key);
      const removal=row(receipt.materialRemoval); if(removal.status==='passed' && Number(removal.witnessCount)>0 && Array.isArray(removal.resultIds)) for(const key of removal.resultIds) if(live.has(id(key))) checkedGrooves.add(id(key));
      if(removal.status==='passed' && Array.isArray(removal.preservedIds)) for(const key of removal.preservedIds) if(live.has(id(key))) preserved.add(id(key));
      continue;
    }
    if(call.toolName==='rhino_native_safe_profile_solids' && receipt.status==='committed' && receipt.documentChanged===true){
      // A planar through-hole/solid receipt cannot certify a sampled blind groove.
      if(groove)wrote=true;
      continue;
    }
    if(call.toolName==='rhino_native_drawer_subd_build' && receipt.committed===true){
      wrote=true;const obj=row(receipt.object);live.set(id(obj.id),obj);checkedGrooves.delete(id(obj.id));continue;
    }
    if(!['rhino_native_run_python','rhino_native_run_csharp','rhino_native_run_command'].includes(call.toolName)) continue;
    const d=row(receipt.geometryVerification); if(d.documentChanged!==true)continue;
    wrote=true;
    const touched=[...list(d.added),...list(d.changed)]; const changed=new Set(touched.map(o=>id(o.id)));
    for(const o of [...touched,...list(d.deleted)]) { live.delete(id(o.id)); checkedGrooves.delete(id(o.id));preserved.delete(id(o.id)); }
    for(const o of touched)live.set(id(o.id),o);
    if(touched.length!==Number(d.addedCount)+Number(d.changedCount)||list(d.deleted).length!==d.deletedCount||d.truncated===true){
      // Do not certify a stale sampled point or partial inventory. A whole-delta representation check
      // performed on the original complete snapshot may still prove the types of omitted objects.
      checkedGrooves.clear(); preserved.clear(); if(row(d.surfaceRepresentation).status!=='passed')complete=false;
    }
    const evidence=nativeCommitEvidence(receipt.content,changed,new Set(list(d.deleted).map(o=>id(o.id))));
    for(const key of evidence.grooves) checkedGrooves.add(key);
    for(const key of evidence.preserved) preserved.add(key);
  }
  if(!wrote) return; // Ordinary no-write, pending, error and explicit GH paths have their own completion logic.
  if(surface){
    const targets=[...live.values()]; const result=assessEditableNurbs({truncated:!complete,addedCount:targets.length,added:targets,changed:[],changedCount:0});
    if(result.status!=='passed')return '要求可编辑曲面，但本轮结果尚未通过类型核验：'+ result.reasons.slice(0,2).join(' ');
  }
  if(preserveExisting && !preserved.size) return '要求保留的既有独立件缺少身份与几何保持不变的验收记录。';
  if(groove && !checkedGrooves.size) return '尚无指定母体在目标位置实际去料的有效回执；新增贴片或总体积减少不能代替凹槽验收。';
}