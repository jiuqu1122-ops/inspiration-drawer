import { parsePrototype, type PrototypeDocument, type PrototypeMotion } from './prototypeSchema';
/** Motion-only updates cannot rewrite colors, geometry, typography, nodes, or interactions. */
export function applyPrototypeMotions(source: PrototypeDocument, motions: unknown, replace = false): PrototypeDocument {
  if (!Array.isArray(motions) || motions.length > 2000) throw new Error('motions 必须是最多 2000 个受控动效');
  const original=parsePrototype(source);
  const updates=motions as PrototypeMotion[];
  const keys=new Set(updates.map(m=>m.targetId+':'+m.trigger));
  return parsePrototype({...original,motions:[...(replace?[]:(original.motions||[]).filter(m=>!keys.has(m.targetId+':'+m.trigger))),...updates]});
}
