import { MAX_STAGE_RECORD, SAFE_PYTHON_MESSAGE, STAGE_FAILURE_MARK, STAGE_REASON_PREFIXES, UNSAFE_DIAGNOSTIC_LABEL } from './rhinoErrorDiagnostic';
import program from './rhinoGeometryStage.py?raw';

/** Opt-in helper on the already authorized Python tool; not a sandbox or proof of zero side effects. */
export function guardRhinoGeometryStageScript(script: string): string {
  if (!/\bDrawerGeometryStage\s*\(/.test(script)) return script;
  // Keep source literals off traceback-producing lines. Execute once, with the same
  // document globals as before. The failure path must not serialize frames, source,
  // arbitrary exception arguments or repr() of Rhino/Python objects.
  return String.raw`def _drawer_run_stage(namespace):
    import json, re
    from builtins import Exception, RuntimeError, SyntaxError, getattr, int, isinstance, len, print, str, type
    helper_source = ${JSON.stringify(program)}
    user_source = ${JSON.stringify(script)}
    def label(value):
        if (type(value) is str and 0 < len(value) <= 48 and re.fullmatch(r"[\w .{}\[\];-]+", value)
                and not re.search(r"${UNSAFE_DIAGNOSTIC_LABEL.source}", value, re.I)):
            return value.strip()
        return ""
    def failure_record(error):
        record = {"type": label(type(error).__name__) or "Exception"}
        module = type(error).__module__
        if module in ("System", "System.IO", "Rhino", "Rhino.Geometry"):
            record["type"] = module + "." + record["type"]
        tb = error.__traceback__
        while tb is not None:
            frame, code = tb.tb_frame, tb.tb_frame.f_code
            if code.co_filename == "<drawer-user-script>":
                record.update(line=tb.tb_lineno, fn=label(code.co_name),
                              stage=label(frame.f_locals.get("stage_name")), part=label(frame.f_locals.get("part_name")))
            elif code.co_filename == "<drawer-geometry-stage>":
                if not code.co_name.startswith("_") or code.co_name == "__init__":
                    record["stage"] = label(code.co_name)
                if code.co_name in ("add", "add_tree", "_part", "_validate"):
                    record["part"] = label(frame.f_locals.get("name"))
                elif "part_name" in frame.f_locals:
                    record["part"] = label(frame.f_locals["part_name"])
            tb = tb.tb_next
        if ("line" not in record and isinstance(error, SyntaxError) and error.filename == "<drawer-user-script>"
                and type(error.lineno) is int and 0 < error.lineno <= 2147483647):
            record["line"] = error.lineno
        # Only a known message grammar or a constant constraint, never repr(error).
        msg = error.args[0] if error.args and type(error.args[0]) is str else ""
        if not msg and module == "System":
            managed_message = getattr(error, "Message", None)
            if type(managed_message) is str:
                msg = managed_message
        if len(msg) <= 180 and re.fullmatch(r"${SAFE_PYTHON_MESSAGE.source}", msg) and not re.search(r"${UNSAFE_DIAGNOSTIC_LABEL.source}", msg, re.I):
            record["message"] = msg
        for prefix in ${JSON.stringify(STAGE_REASON_PREFIXES)}:
            if msg == prefix or msg.startswith(prefix + ":") or msg.startswith(prefix + " "):
                record["reason"] = prefix
                break
        if "; rollback incomplete" in msg:
            record["rollbackIncomplete"] = True
        return record
    try:
        exec(compile(helper_source, "<drawer-geometry-stage>", "exec"), namespace)
        exec(compile(user_source, "<drawer-user-script>", "exec"), namespace)
    except Exception as error:
        try:
            record = failure_record(error)
        except Exception:
            record = {"type": label(type(error).__name__) or "Exception"}
        def encode(data):
            return "${STAGE_FAILURE_MARK}" + json.dumps(data, ensure_ascii=True, separators=(",", ":"))
        marker = encode(record)
        if len(marker) > ${MAX_STAGE_RECORD}:
            record.pop("message", None)  # Keep the bounded frame/labels even after Unicode escaping.
            marker = encode(record)
        try:
            print("\n" + marker, flush=True)
        finally:
            raise RuntimeError(marker) from None
_drawer_run_stage(globals())`;
}

export const RHINO_GEOMETRY_STAGE_INSTRUCTION = 'For Python geometry creation and follow-up edits use the available DrawerGeometryStage helper: stage=DrawerGeometryStage(); original=stage.copy(object_id) returns a private duplicate from the bound document; build all candidate parts in memory; stage.add(name,geometry,kind="auto"|"solid"|"surface"|"curve"|"mesh"|"point"|"pointcloud"|"subd",replace_id=object_id or None,cap_planar=False,planar_faces=[]) declares intent (default auto preserves the actual native type); print(stage.commit()) validates the complete assembly before any helper write. Replacements preserve object IDs and existing attributes/materials; unrelated objects are untouched. Mesh output is NOT a Brep: use auto/mesh for an open texture mesh; use solid only for a deliberately required closed oriented manifold (Brep, Mesh or SubD). Name the failed constraint in validation errors instead of using a bare assert. For context use short, non-sensitive stage_name and part_name labels in the failing function; never include source, credentials or object dumps in diagnostics. Never convert Mesh to Brep or cap holes merely to make baking pass. Use cap_planar=True only for intentionally closed Brep solids with planar openings; it fails if capping cannot produce a valid closed solid. Open solid or a curved required planar face are geometry errors, not loss of chat context or unavailable MCP. A decorative curve/open relief may use curve/surface only if consistent with the user request, never demote a required solid to pass checks. Do not assert all curved ornament faces are planar; planar_faces is only for specifically required planar faces. Straight walls require matching cross-sections/planes, not arbitrary scaling of a bulged shape. Keep caps/decorations/materials unless the user asked to replace them. Check the current document IDs and inspect before every follow-up; never assume Python globals/imports from a previous run survive. The helper is NOT a sandbox and its message is NOT authorization to retry raw scripts. On commit failure it attempts to restore only its own writes and reports any incomplete rollback; inspect the document, never blindly replay. Structural validity does not verify reference-image fidelity.';


export const RHINO_GH_BAKE_INSTRUCTION = 'For Grasshopper baking, inspect the current graph and exact geometry output parameter first. Preserve the GH graph and bake only the user-selected component/output, not every intermediate output or the text/log output. In Python, stage=DrawerGeometryStage(); receipt=stage.add_tree("output-name", output.VolatileData, kind="auto"); print(receipt); print(stage.preview()); print(stage.commit()) snapshots every actual branch/item then commits exactly once, after all checks pass. add_tree unwraps supported Grasshopper.Kernel.Types wrappers and preserves branch path/item index and actual native type. Empty branches are fine, but null/invalid/unsupported items fail explicitly before helper writes: inspect and select the correct output, do not silently skip them. The actual output count is data, not a hard-coded invariant: do not invent len(items)==N checks, slice to an expected number, zip away extra outputs, silently deduplicate geometry, or bake only the first branch. Only a count explicitly required by the user or a verified source plan can be a design constraint. Arbitrary existing script failures are not proven zero-write by their wording and cannot be retried blindly. After baking verify returned object IDs, committedCount, document type/topology and bounds; a normal valid open texture mesh is not a failed Brep solid. Keep reference fidelity separate from structural validity. add_tree/preview are preparation, NOT a successful bake. The helper has a 2000-object/branch budget and requires an explicit smaller selection on overflow, never truncates. No new shell, plugin or execution permission is granted.';
