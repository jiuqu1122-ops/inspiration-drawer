import profileProgram from './modeling/profile_solids.py?raw';
import type { RhinoNativeTool } from './rhinoProtocol';
import { RhinoNativeArgumentError } from './rhinoArgumentRecovery';

export const SAFE_PROFILE_TOOL = 'rhino_native_safe_profile_solids';
export const PROFILE_RECEIPT_MARKER = 'INSPIRATION_PROFILE_SOLIDS_V1:';
export const GEOMETRY_PREFLIGHT_REJECTION = 'rhino_geometry_preflight';
export const SAFE_PROFILE_PROGRAM_MARKER = '# INSPIRATION_SAFE_PROFILE_CONTROLLED_PROGRAM_V1';

const numberArray = (size: number) => ({ type: 'array', items: { type: 'number' }, minItems: size, maxItems: size });
const loopSchema = {
  type: 'object', additionalProperties: false, required: ['kind'],
  properties: {
    kind: { type: 'string', enum: ['polygon', 'circle'] },
    points: { type: 'array', items: numberArray(2), minItems: 3, maxItems: 128 },
    center: numberArray(2), radius: { type: 'number', exclusiveMinimum: 0 },
    filletRadius: { type: 'number', minimum: 0, description: 'Polygon corners only; failure is explicit, never silently falls back.' },
  },
};
export const safeProfileTool = (): RhinoNativeTool => ({
  name: SAFE_PROFILE_TOOL, workflowPhase: 'write', readOnly: false, destructive: false,
  description: 'Specialized OPTIONAL tool only for parts genuinely expressible as planar constant-thickness closed profile extrusions. Never select this merely because an image shows a bracket, mounting ear, holes or any arbitrary model; curved/organic/branched/lofted bodies require the appropriate native geometry/GH workflow. Supply declarative loops, not Python. Uses the official RhinoAI run_python with a fixed trusted program. It validates all boundaries, holes, clearances and closed solids in memory before adding any objects. Preflight errors change nothing and return exact zero-based hole indices and constraints for at most two targeted zero-write corrections. Commit failures are terminal. Existing objects/layers/materials/cameras/GH remain untouched. No implicit hole resizing/removal. Mode validate is inspection only; mode commit performs the final additive write. Result is separate named closed solids, NOT a guaranteed boolean-unioned assembly.',
  inputSchema: {
    type: 'object', additionalProperties: false, required: ['mode', 'units', 'parts'],
    properties: {
      mode: { type: 'string', enum: ['validate', 'commit'] },
      units: { type: 'string', enum: ['millimeters', 'document'] },
      parts: { type: 'array', minItems: 1, maxItems: 12, items: {
        type: 'object', additionalProperties: false, required: ['name', 'outer', 'thickness'],
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 120 },
          origin: numberArray(3), xAxis: numberArray(3), yAxis: numberArray(3),
          outer: loopSchema,
          holes: { type: 'array', items: loopSchema, maxItems: 64 },
          thickness: { type: 'number', exclusiveMinimum: 0 },
          minWall: { type: 'number', minimum: 0, description: 'Minimum outer-hole and hole-hole web in input units; at least twice document tolerance is always enforced.' },
        },
      } },
    },
  },
});

export const canUseSafeProfileTool = (tools: RhinoNativeTool[]) => tools.some(tool => {
  if (tool.name !== 'rhino_native_run_python') return false;
  const schema = tool.inputSchema;
  const required = Array.isArray(schema.required) ? schema.required : [];
  return required.every(key => key === 'script');
});

/** JSON/base64 only: no user strings are interpolated as Python code. */
export const buildSafeProfileScript = (plan: Record<string, unknown>) => {
  const json = JSON.stringify(plan);
  if (json.length > 240_000) throw new RhinoNativeArgumentError('Geometry plan exceeds the 240000-character limit');
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${SAFE_PROFILE_PROGRAM_MARKER}\n${profileProgram}\nimport base64 as _id_base64\n_id_plan = json.loads(_id_base64.b64decode('${btoa(binary)}').decode('utf-8'))\n_id_receipt = _id_profiles_build(_id_plan, __rhino_doc__)\nprint(_ID_PROFILE_MARKER + json.dumps(_id_receipt, ensure_ascii=True))\n`;
};

export class RhinoGeometryPreflightError extends Error {
  constructor(public readonly receipt: Record<string, unknown>) {
    super('Geometry preflight rejected before any document write: ' + JSON.stringify(receipt.issues || []));
    this.name = 'RhinoGeometryPreflightError';
  }
}

export const parseSafeProfileResult = (blocks: Array<{ type: string; text?: string }>) => {
  const receipts: Array<Record<string, unknown>> = [];
  for (const block of blocks) {
    if (block.type !== 'text') continue;
    let stdout = '';
    try {
      const content = JSON.parse(block.text || '{}') as Record<string, unknown>;
      if (typeof content.stderr === 'string' && content.stderr.trim()) throw new Error(content.stderr);
      stdout = typeof content.stdout === 'string' ? content.stdout : '';
    } catch (error) { throw new Error('Safe geometry program returned an unreadable/error receipt: ' + String(error)); }
    for (const line of stdout.split(/\r?\n/)) {
      if (!line.startsWith(PROFILE_RECEIPT_MARKER)) continue;
      const parsed = JSON.parse(line.slice(PROFILE_RECEIPT_MARKER.length)) as Record<string, unknown>;
      if (parsed && parsed.version === 1) receipts.push(parsed);
    }
  }
  if (receipts.length !== 1) throw new Error('Safe geometry program returned no unique verified receipt; do not replay the call.');
  const receipt = receipts[0];
  if (receipt.status === 'rejected' && receipt.stage === 'preflight' && receipt.documentChanged === false) throw new RhinoGeometryPreflightError(receipt);
  if (receipt.status === 'commit_failed') throw new Error('Geometry commit failed; do not replay. ' + JSON.stringify(receipt));
  if (!['validated', 'committed'].includes(String(receipt.status)) || receipt.valid !== true || receipt.solid !== true) throw new Error('Unexpected geometry receipt; do not replay. ' + JSON.stringify(receipt));
  if (receipt.status === 'validated' && (receipt.stage !== 'preflight' || receipt.documentChanged !== false)) throw new Error('Invalid validation-only receipt; do not replay.');
  if (receipt.status === 'committed') {
    const ids = Array.isArray(receipt.objectIds) ? receipt.objectIds : [];
    if (receipt.stage !== 'commit' || receipt.documentChanged !== true || ids.length === 0 || receipt.partCount !== ids.length
      || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))) throw new Error('Incomplete commit receipt; do not replay.');
  }
  return receipt;
};

/** Reliability routing, not an arbitrary-code sandbox. Other native scripts remain available. */
export const assertSafePlanarRoute = (
  name: string,
  args: Record<string, unknown>,
  safeToolAvailable: boolean,
  userText = '',
) => {
  if (!safeToolAvailable || !['rhino_native_run_python', 'rhino_native_run_csharp'].includes(name)) return;
  const script = String(args.script || '');
  const writesGeometry = /\b(?:AddBrep|AddSurface|AddExtrusion)\s*\(/.test(script);
  const explicitPlanarRegion = /\bCreatePlanarBreps\s*\(/.test(script);
  const planarCurveConstruction = /\b(?:PolylineCurve|CreatePlanarBreps|CreateFromExtrusion|CreateExtrusion|Extrusion\.Create|CreateFromOffsetFace)\b/i.test(script);
  const makesBooleanCut = /\b(?:CreateBooleanDifference|BooleanDifference)\s*\(/.test(script);
  const handBuiltCutter = /\b(?:def\s+)?cutter\w*\s*\(/i.test(script)
    || /\b(?:hole|holes|cutout|perforat)\w*\b/i.test(script);
  const explicitlyGrasshopper = /(?:grasshopper|\bgh\b|\u8349\u56fe)/i.test(userText);
  const planarPerforatedRequest = /(?:\u652f\u67b6|\u5b89\u88c5\u8033|\u5e73\u677f|\u677f\u4ef6|\u9552\u7a7a|\u5b54\u6d1e|\u6253\u5b54|\bbracket\b|\bplate\b|\bperforat\w*\b|\bhole\w*\b)/i.test(userText);
  // A failed hand-written BooleanDifference cutter is the exact path that can
  // throw Rhino's "Invalid hole loop" before a trusted preflight ever runs.
  // Route only an explicitly planar/perforated request, or an unmistakable
  // planar-region script. Preserve explicit GH and freeform-modeling workflows.
  const mixed3dWorkflow = /(?:CreateFromLoft|CreatePipe|SweepOneRail|SweepTwoRail|CreateFromSweep|SubD|NurbsSurface|CreateFromRevSurface)/i.test(script) || /(?:\u81ea\u7531\u66f2\u9762|\u66f2\u9762\u9020\u578b|\u5206\u53c9|\u524d\u540e\u652f\u817f|\b(?:organic|branched|lofted|freeform)\b)/i.test(userText);
  const useControlledBuilder = writesGeometry && !mixed3dWorkflow && (
    (!explicitlyGrasshopper && explicitPlanarRegion)
    || (!explicitlyGrasshopper && makesBooleanCut && handBuiltCutter && (planarPerforatedRequest || planarCurveConstruction))
  );
  if (useControlledBuilder) {
    throw new RhinoNativeArgumentError(
      'Do not hand-build planar perforation cutters for this part: they can fail with Rhino "Invalid hole loop". Use rhino_native_safe_profile_solids with declarative outer/holes/thickness and placement. It validates all requested loops and minimum webs before any document write; it supports planar closed-profile extrusions, not arbitrary curved/freeform bodies.',
      SAFE_PROFILE_TOOL,
    );
  }
};
