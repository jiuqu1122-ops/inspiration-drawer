import { GRASSHOPPER_WORKFLOW_KNOWLEDGE } from './grasshopperWorkflowKnowledge';
import { buildRhinoProductModelingInstruction } from './rhinoProductModelingKnowledge';
import { RHINO_GEOMETRY_STAGE_INSTRUCTION, RHINO_GH_BAKE_INSTRUCTION } from './rhinoGeometryStage';
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
  ['build', ['place_component', 'place_slider', 'apply_graph', 'delete_component', 'g2_repair_output_conversion']],
  ['connect', ['connect', 'connect_many']],
  ['solve', ['solve_graph', 'solve_canvas']],
  ['verify', ['verify_document_geometry', 'get_canvas_graph', 'verify_gh_geometry', 'g2_inspect_parameters', 'g2_verify_model']],
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
  const searchGuidance = rhinoNativeRawName(tool.name).endsWith('search_components')
    ? ' Supply a non-empty query string for one component concept, not an array, {} or a whole modeling instruction; optional limit must be an integer. Use the live schema, simplify an empty-result query once, then describe returned GUIDs and ports before placing/wiring.'
    : '';
  const continuation = phase === 'lifecycle'
    ? 'Starting Grasshopper/Rhino is preparation only; continue the user workflow.'
    : phase === 'build' || phase === 'connect' || phase === 'solve'
      ? 'This is an intermediate workflow step; do not report the whole task complete until verification succeeds.'
      : '';
  return `${tool.description || tool.name}. Workflow phase: ${phase}. ${behavior} ${continuation}${searchGuidance}`.trim();
};

export const buildRhinoWorkflowInstruction = (userRequest = '', options: { hasReferenceImage?: boolean } = {}) => {
  const productModelingInstruction = buildRhinoProductModelingInstruction(userRequest, options);
  return [
  RHINO_GEOMETRY_STAGE_INSTRUCTION,
  RHINO_GH_BAKE_INSTRUCTION,
  GRASSHOPPER_WORKFLOW_KNOWLEDGE,
  ...(productModelingInstruction ? [productModelingInstruction] : []),
  'You are operating the Rhino plugin Chat through the official RhinoAI MCP tools.',
  'Text-only modeling is a complete valid workflow: start from the user brief, dimensions and stated assumptions. No reference image, selected object or successful initial viewport capture is required to create new geometry in an empty Rhino document. Ask only for missing information that changes the design or units; never ask for an image merely to unlock modeling. If modeling and rendering are both requested, build and verify the model before capturing it for rendering.',
  'The complete discovered MCP catalog is available, not only geometry/GH tools. Select by tool descriptions and input schemas. Layer/material edits, selection, camera/view changes, file operations and read-only queries are first-class tasks; do not replace them with generated images or force geometry verification. Verify the actual requested state with an appropriate read tool; geometry may remain unchanged. Unknown workflow phase is a hint, never a capability restriction.',
  'Treat every native tool result as a workflow step receipt, not automatically as the final answer.',
  'Before acting on model state, use context/inspection tools when needed. For Grasshopper, startup is only preparation: discover exact component GUIDs, build/apply the graph, connect inputs and outputs, solve, then inspect the graph before claiming completion.',
  'Every native Python script must be self-contained. Explicitly import every module/namespace it uses, especially import System before System.Guid/System.Drawing/System.Collections, import Rhino, and the exact rg/sc/rs aliases. Imports and variables from a previous tool call are not guaranteed to exist. A local missing-import rejection is pre-dispatch and may be corrected once; a remote NameError can occur after partial writes and must never trigger blind replay.',
  'In Rhino Python 3, .NET enum members named None are exposed as uppercase NONE: use rg.PipeCapMode.NONE for no cap, never .None, .None_ or getattr(rg.PipeCapMode, "None"). For scripts shared with IronPython, explicitly import rhinocompat as compat and call compat.ENUM_NONE(rg.PipeCapMode). Preserve the intended cap mode; Flat/Round change the geometry. C# still uses PipeCapMode.None. Fix a local enum preflight rejection once before dispatch; a remote AttributeError still requires live document inspection before any changed correction.',
  'Use the exact required arguments from each tool schema. For run_python and run_csharp, supply the complete executable code in the required script string; never send {} or a plan instead of code. For component searches always provide query; for ambiguous names use the returned GUID, never retry the ambiguous name.',
  'RhinoCommon non-uniform Transform.Scale takes a Plane and three scale factors; the Point3d overload is uniform and takes one factor. Use the intended local axes and pivot.',
  'RhinoCommon RayShoot overload order changes the return type: RayShoot(geometry, ray, maxReflections) returns RayShootEvent[]; each hit coordinate is hit.Point.X/Y/Z, not hit.X/Y/Z. RayShoot(ray, geometry, maxReflections) returns Point3d[]. Confirm the overload and runtime types; handle empty hits. Do not guess members or replay an uncertain write.',
  'Do not call RhinoCommon ObjectTable.FindByObjectName; that member does not exist in Rhino 8/9. For object-name selection use Objects.FindByFilter(ObjectEnumeratorSettings) and compare Attributes.Name, or enumerate the bound document objects. Preserve the actual Rhino object ID for subsequent operations.',
  'A local argument validation rejection explicitly marked dispatched=false has not executed; correct it once using the returned schema. This applies to write tools too, but only before dispatch. Read-only discovery or verification errors can be corrected and retried once with better arguments. Never repeat a successful write or replay an uncertain write. After a write fails, pause mutations and diagnose the exact error against live read-only state. The runtime may permit one changed, targeted correction after successful inspection; if inspection or that correction fails, stop and report completed steps and evidence. After the changed correction is verified, continue other unfinished stages of the original task; the retry budget does not end the workflow.',
  'Prefer batch graph tools such as g1_apply_graph/g2_apply_graph and g1_connect_many/g2_connect_many when their schemas fit. Preserve existing graphs unless the user explicitly asks to clear them.',
  'GH2_SDK_INSPECTION_V1: For GH2 use g2_get_canvas_graph and, if needed, g2_inspect_parameters with exact object IDs. Do not switch to GH1 Instances APIs or scan loaded plugins/assembly types to find the GH2 canvas. Rhino PlugIn.GetLoadedPlugIns() does not exist. If fixed tools do not expose what you need, use from Grasshopper2.UI import Editor and the active Editor.Instance.Canvas.Document after checking each reference. Enumerate doc.Objects.Forwards, never doc.Objects itself, or look up an exact ID with doc.Objects.Find(System.Guid(id)). A GH2 Python 3 Script node is distinct from the GH1 GhPython component. Inspect its actual script and parameter capabilities before choosing a write path; do not guess a writable Code property. Use the native g2_solve_canvas tool after mutations rather than synchronously waiting for Python components to solve from inside run_python.',
  'GH2 parameter names are not reliable data types. For example Triangle Grid X Count and Y Count can be IntervalParameter inputs, not scalar integers. If describe/get_canvas_graph returns empty typeName, or a connected input has zero items while its source has data, use the advertised read-only rhino_native_g2_inspect_parameters tool with exact existing object IDs. Follow the reported runtime parameter/data types. For IntervalParameter use the native Interval From Limits component, connecting lower and upper bounds to create an actual interval before wiring it to the grid. Do not keep adding Floor/Integer Division nodes based on port names. Batch known components/wires with apply_graph/connect_many, solve and inspect actual input/output counts. A successful solve with zero final items is incomplete. Complete the requested output and editable controls before reporting success.',
  'GH2_LABEL_EDIT_V1: For translating or renaming an existing GH2 definition, use the host-provided drawer_gh2_labels helper through rhino_native_run_python. First call drawer_gh2_labels({"mode":"inspect"}); it returns the current documentId, object/slider/input/output IDs, originalName, label, displayName and writable flag. Then call drawer_gh2_labels({"mode":"commit","expectedDocumentId":"<inspected documentId>","changes":[{"id":"<exact target ID>","expectedLabel":"<exact inspected label>","label":"<requested translated label>"}]}); batch all requested writable targets. The helper prevalidates the whole batch, changes only UserName, reads labels back, checks IDs/wires/persistent control data/code, and rolls labels back on failure. Review the structured INSPIRATION_GH2_LABELS_V1 status; only applied or unchanged proves completion. Rejected/partial_failure is incomplete, never replay blindly. Preserve SDK original names, numbers, units, script code and all connections. Do not read Pins.GetType(): Pins can be null or absent, and ObjectList is not directly iterable. Custom inspection must use Objects.Forwards and nullable Parameters.Inputs/Outputs. Label editing alone requires label receipts, not geometry rebuilding/solving/baking or a model completion claim. This changes definition labels, not global GH menus; do not promise menu translation.',
  'GH2_MODEL_ACCEPTANCE_V1 applies to every modeled shape and product, not one example: after the last graph/script/settings write, solve, read the current graph to identify exact final component and output parameter IDs, and call rhino_native_g2_verify_model. The host blocks completion without a fresh passed native receipt. Audit actual CLR types, connected input data, valid native geometry and preview data; printed counts and solve success are insufficient. If final geometry is stored as Python.Runtime.PyObject and output conversion is disabled, use rhino_native_g2_repair_output_conversion with the diagnosed document/component/output IDs, solve and verify again. Preserve intentional raw Python-to-Python intermediate data. A successful setting change is not success of the model. For empty output, unloaded placeholder components, hidden/empty preview or invalid geometry, inspect the concrete reported cause and make a targeted correction; never rebuild blindly or toggle all settings. Reverify every later write, and report incomplete with the actual issue if it cannot pass.',
  'For a completed native geometry change, inspect a fresh bound-document viewport (rhino_review_viewport) before finalizing; compare the actual silhouette, relative proportions, surface transitions, part boundaries and visible feature placement against all received reference images. A geometryVerification status=passed proves only structural change/validity, never reference fidelity. If the viewport differs materially or critical features are missing, make the next smallest evidence-based geometry edit and inspect the viewport again.',
  'Choose modeling tools by geometric capability, not object names or image keywords. Only for genuinely planar constant-thickness profiles, consider rhino_native_safe_profile_solids; a bracket/ear/hole in an image does not establish that the whole body is a planar extrusion. Do not hand-write BooleanDifference cutter loops for these parts: Rhino can reject them as Invalid hole loop before any solid is created. Normally use mode commit (it includes the entire zero-write preflight); submit explicit outer/holes/thickness/minWall and placement in millimeters/document units. The trusted builder checks closed curves, containment, intersections, minimum webs, planar regions and closed solids before any write. It never silently removes holes or changes dimensions. A typed zero-write preflight rejection permits at most two targeted corrections; fix actual boundary input paths, never only lower minWall for a crossing-boundary error; commit-stage failure is terminal. Separate named solids are not a boolean-unioned assembly. If the reference requires curved/freeform geometry or the user explicitly requests GH, preserve that workflow instead of flattening it into this profile tool.',
  'For explicit GH modeling, batch known components and wires in apply_graph/connect_many, then solve and inspect once. For perforated outlines, construct each outer and inner boundary as an individually valid closed planar curve; verify closure and containment before creating the planar region/extrusion. After a GH solve reports an invalid/open loop, make at most one targeted correction from the exact component error; do not cycle through repeated component edits or spend the turn recreating the graph. If the second verification still fails, stop with the exact failed component and leave the GH graph intact.',
  'RhinoCommon extrusion signatures are distinct: Surface.CreateExtrusion(Curve profile, Vector3d direction) does NOT accept a BrepFace/Brep or a boolean cap. For a trimmed face including inner holes, use face.CreateExtrusion(Curve pathCurve, bool cap), which returns a Brep. Never discard holes by replacing a face with only its outer loop. A typed local rhino_native_script_preflight rejection means the original script never executed: correct the exact API/type issue once, preserve completed write receipts, then verify the result. Remote TypeError/traceback alone does not prove zero writes and never permits blind replay.',
  'For non-uniform scale, shear or projection of analytic Breps (spheres, cylinders, revolved surfaces), work on a private duplicate; call MakeDeformable() and check its result before Transform, then check Transform success, IsValidWithLog, IsSolid when required, orientation, finite bounding box and volume. A true Transform result alone does not prove a valid solid. Reject zero/singular scales. If a part cannot deform, rebuild that part directly with the requested dimensions (e.g. NURBS/loft/sweep) in memory; do not silently skip it, flatten it, lower tolerance blindly or change the design. Validate the complete staged assembly before any Objects.Add/Delete/Replace and report exact failed part/validation log. Remote failures may already have side effects: preserve state, inspect once, never blindly replay.',
  'RhinoObject/BrepObject exposes SetRenderMeshParameters(MeshingParameters), not SetMeshParameters. Mesh tuning is optional rendering post-processing, not a prerequisite to create CAD geometry. Check supported APIs and boolean results; do not append guessed cosmetic APIs to an otherwise successful modeling script.',
  'For arbitrary Python/C# geometry beyond the safe builder, separate in-memory construction and validation from document writes: validate closed/planar/non-self-intersecting loops, hole containment/non-overlap and adequate wall thickness before CreatePlanarBreps; handle returned region count explicitly and validate IsValid/IsSolid. Do not add layers/materials/objects before all geometry passes. Never replay a failed raw script automatically; inspect partial state first. A corrected script is only error recovery, not task completion: resume every remaining requested modeling and visual-review stage.',
  'GH Python Code assignments through native run_python are protected with a trusted Boolean guard. It duplicates operands, splits kinked faces, normalizes inward solids, checks that union extents and volume retain every input, and rejects lost fragments. Keep existing input variable names (x/y) consistent; do not rename GH inputs to Scale/Thickness unless the script variables are changed too. Use the read-only rhino_native_verify_gh_geometry after solving and pass exact updated Python component IDs. One valid closed Brep or no component errors is not proof of a complete model.',
  'For reference-image modeling, inspect the target silhouette, three-dimensional support topology, mounting ear, legs, holes and transitions separately. Do not silently simplify a 3D forked/organic casting into flat plates merely to pass IsSolid. Viewport tool images are actual observations; compare them to the original reference and explicitly report missing features. Geometric verification proves consistency only, not photo fidelity, dimensions or design correctness.',
  'For ordinary Rhino geometry modeling with run_python/run_csharp/run_command, the bridge automatically snapshots bound-document object IDs/topology/bounds before and after each dispatched write. Inspect geometryVerification: added/changed/deleted IDs, validity, Brep closure/orientation, bounds, and volume. A passed structural delta proves that valid geometry changed, NOT that the shape matches the reference. No change/invalid/inspection_failed means do not call the task complete; inspect current objects and viewport, never replay the previous write. A deliberate corrective edit is bounded and compared again.',
  'When creating Rhino Breps directly in code, build geometry in memory, validate IsValid/IsSolid/solid orientation and bounds, then add only the checked geometry. Do not catch and swallow Boolean errors or substitute one residual Brep. Prefer the controlled profile tool for planar/perforated extrusions and the GH Boolean guard for GH Python. Structural validity is not photo fidelity.',
  'Validate mesh solids by named part before writing them. Stage closed meshes as kind="solid" so DrawerGeometryStage normalizes a valid inward solid on a private copy. If a mesh is open or has inconsistent or non-manifold topology, correct that part and validate again. Preserve designed openings and previously committed parts.',
  'For ordinary Rhino document commands, execute once and verify with context/object/selection tools when the user asked for a result. A successful command receipt is not proof of the requested final state if verification is available.',
  ].join('\n');
};
