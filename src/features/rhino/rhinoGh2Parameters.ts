import program from './modeling/gh2_parameter_inspection.py?raw';
import type { RhinoNativeTool } from './rhinoProtocol';
import { RhinoNativeArgumentError } from './rhinoArgumentRecovery';

export const GH2_PARAMETERS_TOOL = 'rhino_native_g2_inspect_parameters';
export const gh2ParametersTool = (): RhinoNativeTool => ({
  name: GH2_PARAMETERS_TOOL, readOnly: true, destructive: false, workflowPhase: 'verify',
  description: 'Read exact runtime types, solved item counts, samples and source parameter IDs for known objects on the bound active GH2 canvas. Use when describe/get_canvas_graph typeName is empty, or a populated source feeds an empty input. Names such as X Count can actually mean IntervalParameter in GH2; do not guess a scalar/integer type from the name. Uses fixed read-only SDK inspection. Does not change geometry, graph, sliders, wires, selection or solve state. Supply exact object IDs from the current GH2 graph.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['objectIds'], properties: {
    objectIds: { type: 'array', minItems: 1, maxItems: 64, items: { type: 'string', pattern: '^[a-fA-F0-9-]{36}$' } },
  } },
});

export function buildGh2ParameterInspectionScript(plan: Record<string, unknown>): string {
  if (!Array.isArray(plan.objectIds) || plan.objectIds.length < 1 || plan.objectIds.length > 64 || plan.objectIds.some(id => typeof id !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id))) throw new RhinoNativeArgumentError('Supply 1..64 exact GH2 object IDs');
  let binary = '';
  for (const byte of new TextEncoder().encode(JSON.stringify({ objectIds: plan.objectIds }))) binary += String.fromCharCode(byte);
  return `${program}\nimport base64 as _g2_base64\n_g2_plan = _g2_json.loads(_g2_base64.b64decode('${btoa(binary)}').decode('utf-8'))\nprint('INSPIRATION_GH2_PARAMETERS_V1:' + _g2_json.dumps(_id_gh2_inspect_parameters(_g2_plan), ensure_ascii=True))\n`;
}
