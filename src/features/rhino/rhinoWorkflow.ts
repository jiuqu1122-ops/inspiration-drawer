import type { RhinoNativeTool } from './rhinoProtocol';

export type RhinoNativeWorkflowPhase =
  | 'context'
  | 'lifecycle'
  | 'discover'
  | 'build'
  | 'connect'
  | 'solve'
  | 'verify'
  | 'write'
  | 'unknown';

const PHASES: Array<[RhinoNativeWorkflowPhase, string[]]> = [
  ['context', ['snapshot_document_geometry', 'get_context', 'get_selection', 'get_commands', 'list_objects', 'get_viewport_image']],
  ['lifecycle', ['g1_start', 'g2_start', 'open_doc', 'close_doc']],
  ['discover', ['search_components', 'describe_component']],
  ['build', ['place_component', 'place_slider', 'apply_graph', 'delete_component']],
  ['connect', ['connect', 'connect_many']],
  ['solve', ['solve_graph', 'solve_canvas']],
  ['verify', ['verify_document_geometry', 'get_canvas_graph', 'verify_gh_geometry']],
  ['write', ['safe_profile_solids', 'run_command', 'run_python', 'run_csharp', 'set_layer_material', 'set_selection', 'save_doc', 'zoom_to_layer', 'zoom_to_object', 'g1_clear_canvas', 'g2_clear_canvas']],
];

export const rhinoNativeRawName = (toolName: string) => (
  toolName.startsWith('rhino_native_') ? toolName.slice('rhino_native_'.length) : toolName
);

export const getRhinoNativeWorkflowPhase = (toolName: string): RhinoNativeWorkflowPhase => {
  const raw = rhinoNativeRawName(toolName);
  for (const [phase, names] of PHASES) {
    if (names.some(name => raw === name || raw.endsWith(`_${name}`))) return phase;
  }
  return 'unknown';
};

export const isRhinoNativeReadOnlyPhase = (phase: RhinoNativeWorkflowPhase) => (
  phase === 'context' || phase === 'discover' || phase === 'verify'
);

export const isRhinoNativeRecoverableError = (tool: Pick<RhinoNativeTool, 'name' | 'readOnly'> | string) => {
  const name = typeof tool === 'string' ? tool : tool.name;
  const readOnly = typeof tool === 'string' ? undefined : tool.readOnly;
  return typeof readOnly === 'boolean' ? readOnly : isRhinoNativeReadOnlyPhase(getRhinoNativeWorkflowPhase(name));
};

const schemaTypeMatches = (value: unknown, type: string) => {
  if (type === 'object') return Boolean(value && typeof value === 'object' && !Array.isArray(value));
  if (type === 'array') return Array.isArray(value);
  if (type === 'string') return typeof value === 'string';
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'integer') return typeof value === 'number' && Number.isInteger(value);
  return true;
};

export type RhinoNativeArgumentValidation = {
  valid: true;
} | {
  valid: false;
  message: string;
  missing?: string[];
  invalid?: string[];
};

/** Bounded schema validation before a native MCP call reaches RhinoAI. */
export const validateRhinoNativeArguments = (
  tool: Pick<RhinoNativeTool, 'name' | 'inputSchema'>,
  args: Record<string, unknown>,
): RhinoNativeArgumentValidation => {
  const schema = tool.inputSchema && typeof tool.inputSchema === 'object' ? tool.inputSchema : {};
  const required = Array.isArray(schema.required) ? schema.required.filter(value => typeof value === 'string') as string[] : [];
  const missing = required.filter(key => args[key] === undefined || args[key] === null || (typeof args[key] === 'string' && !args[key].trim()));
  if (missing.length > 0) return { valid: false, missing, message: `Missing required Rhino MCP argument(s): ${missing.join(', ')}` };
  const properties = schema.properties && typeof schema.properties === 'object' ? schema.properties as Record<string, unknown> : {};
  const invalid: string[] = [];
  for (const [key, definition] of Object.entries(properties)) {
    if (args[key] === undefined || !definition || typeof definition !== 'object') continue;
    const type = (definition as Record<string, unknown>).type;
    if (typeof type === 'string' && !schemaTypeMatches(args[key], type)) invalid.push(`${key} (${type})`);
  }
  if (invalid.length > 0) return { valid: false, invalid, message: `Invalid Rhino MCP argument type(s): ${invalid.join(', ')}` };
  return { valid: true };
};

export const describeRhinoNativeTool = (tool: {
  name: string;
  description?: string;
  readOnly?: boolean;
  destructive?: boolean;
}) => {
  const phase = getRhinoNativeWorkflowPhase(tool.name);
  const behavior = tool.readOnly === true || (tool.readOnly === undefined && isRhinoNativeReadOnlyPhase(phase))
    ? 'This is a read/inspection step; if it fails with an argument or ambiguity error, inspect the error and continue without writing.'
    : 'This is a document/Grasshopper write step; execute it once, inspect its receipt, and do not replay it after an uncertain failure.';
  const continuation = phase === 'lifecycle'
    ? 'Starting Grasshopper/Rhino is preparation only; continue the user workflow.'
    : phase === 'build' || phase === 'connect' || phase === 'solve'
      ? 'This is an intermediate workflow step; do not report the whole task complete until verification succeeds.'
      : '';
  return `${tool.description || tool.name}. Workflow phase: ${phase}. ${behavior} ${continuation}`.trim();
};

export const buildRhinoWorkflowInstruction = () => [
  'You are operating the Rhino plugin Chat through the official RhinoAI MCP tools.',
  'The complete discovered MCP catalog is available, not only geometry/GH tools. Select by tool descriptions and input schemas. Layer/material edits, selection, camera/view changes, file operations and read-only queries are first-class tasks; do not replace them with generated images or force geometry verification. Verify the actual requested state with an appropriate read tool; geometry may remain unchanged. Unknown workflow phase is a hint, never a capability restriction.',
  'Treat every native tool result as a workflow step receipt, not automatically as the final answer.',
  'Before acting on model state, use context/inspection tools when needed. For Grasshopper, startup is only preparation: discover exact component GUIDs, build/apply the graph, connect inputs and outputs, solve, then inspect the graph before claiming completion.',
  'Every native Python script must be self-contained. Explicitly import every module/namespace it uses, especially import System before System.Guid/System.Drawing/System.Collections, import Rhino, and the exact rg/sc/rs aliases. Imports and variables from a previous tool call are not guaranteed to exist. A local missing-import rejection is pre-dispatch and may be corrected once; a remote NameError can occur after partial writes and must never trigger blind replay.',
  'Use the exact required arguments from each tool schema. For run_python and run_csharp, supply the complete executable code in the required script string; never send {} or a plan instead of code. For component searches always provide query; for ambiguous names use the returned GUID, never retry the ambiguous name.',
  'A local argument validation rejection explicitly marked dispatched=false has not executed; correct it once using the returned schema. This applies to write tools too, but only before dispatch. Read-only discovery or verification errors can be corrected and retried once with better arguments. Never repeat a successful write or replay an uncertain write. Stop and report completed steps if a write fails.',
  'Prefer batch graph tools such as g1_apply_graph/g2_apply_graph and g1_connect_many/g2_connect_many when their schemas fit. Preserve existing graphs unless the user explicitly asks to clear them.',
  'Choose modeling tools by geometric capability, not object names or image keywords. Only for genuinely planar constant-thickness profiles, consider rhino_native_safe_profile_solids; a bracket/ear/hole in an image does not establish that the whole body is a planar extrusion. Do not hand-write BooleanDifference cutter loops for these parts: Rhino can reject them as Invalid hole loop before any solid is created. Normally use mode commit (it includes the entire zero-write preflight); submit explicit outer/holes/thickness/minWall and placement in millimeters/document units. The trusted builder checks closed curves, containment, intersections, minimum webs, planar regions and closed solids before any write. It never silently removes holes or changes dimensions. A typed zero-write preflight rejection permits at most two targeted corrections; fix actual boundary input paths, never only lower minWall for a crossing-boundary error; commit-stage failure is terminal. Separate named solids are not a boolean-unioned assembly. If the reference requires curved/freeform geometry or the user explicitly requests GH, preserve that workflow instead of flattening it into this profile tool.',
  'For explicit GH modeling, batch known components and wires in apply_graph/connect_many, then solve and inspect once. For perforated outlines, construct each outer and inner boundary as an individually valid closed planar curve; verify closure and containment before creating the planar region/extrusion. After a GH solve reports an invalid/open loop, make at most one targeted correction from the exact component error; do not cycle through repeated component edits or spend the turn recreating the graph. If the second verification still fails, stop with the exact failed component and leave the GH graph intact.',
  'RhinoCommon extrusion signatures are distinct: Surface.CreateExtrusion(Curve profile, Vector3d direction) does NOT accept a BrepFace/Brep or a boolean cap. For a trimmed face including inner holes, use face.CreateExtrusion(Curve pathCurve, bool cap), which returns a Brep. Never discard holes by replacing a face with only its outer loop. A typed local rhino_native_script_preflight rejection means the original script never executed: correct the exact API/type issue once, preserve completed write receipts, then verify the result. Remote TypeError/traceback alone does not prove zero writes and never permits blind replay.',
  'For arbitrary Python/C# geometry beyond the safe builder, separate in-memory construction and validation from document writes: validate closed/planar/non-self-intersecting loops, hole containment/non-overlap and adequate wall thickness before CreatePlanarBreps; handle returned region count explicitly and validate IsValid/IsSolid. Do not add layers/materials/objects before all geometry passes. Never replay a failed raw script automatically; inspect partial state first.',
  'GH Python Code assignments through native run_python are protected with a trusted Boolean guard. It duplicates operands, splits kinked faces, normalizes inward solids, checks that union extents and volume retain every input, and rejects lost fragments. Keep existing input variable names (x/y) consistent; do not rename GH inputs to Scale/Thickness unless the script variables are changed too. Use the read-only rhino_native_verify_gh_geometry after solving and pass exact updated Python component IDs. One valid closed Brep or no component errors is not proof of a complete model.',
  'For reference-image modeling, inspect the target silhouette, three-dimensional support topology, mounting ear, legs, holes and transitions separately. Do not silently simplify a 3D forked/organic casting into flat plates merely to pass IsSolid. Viewport tool images are actual observations; compare them to the original reference and explicitly report missing features. Geometric verification proves consistency only, not photo fidelity, dimensions or design correctness.',
  'For ordinary Rhino geometry modeling with run_python/run_csharp/run_command, the bridge automatically snapshots bound-document object IDs/topology/bounds before and after each dispatched write. Inspect geometryVerification: added/changed/deleted IDs, validity, Brep closure/orientation, bounds, and volume. A passed structural delta proves that valid geometry changed, NOT that the shape matches the reference. No change/invalid/inspection_failed means do not call the task complete; inspect current objects and viewport, never replay the previous write. A deliberate corrective edit is bounded and compared again.',
  'When creating Rhino Breps directly in code, build geometry in memory, validate IsValid/IsSolid/solid orientation and bounds, then add only the checked geometry. Do not catch and swallow Boolean errors or substitute one residual Brep. Prefer the controlled profile tool for planar/perforated extrusions and the GH Boolean guard for GH Python. Structural validity is not photo fidelity.',
  'For ordinary Rhino document commands, execute once and verify with context/object/selection tools when the user asked for a result. A successful command receipt is not proof of the requested final state if verification is available.',
].join('\n');
