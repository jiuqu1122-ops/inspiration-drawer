"""Fixed GH2 output audit and narrowly scoped output-marshalling repair."""
import json as _g2v_json
import System as _g2v_system
import clr as _g2v_clr
import Rhino as _g2v_rhino
from Grasshopper2.UI import Editor as _g2v_editor
from System.Linq import Enumerable as _g2v_enumerable
from System.Linq.Expressions import Expression as _g2v_expression, ParameterExpression as _g2v_parameter_expression


def _g2v_document():
    if _g2v_rhino.RhinoDoc.ActiveDoc is None or _g2v_rhino.RhinoDoc.ActiveDoc.RuntimeSerialNumber != __rhino_doc__.RuntimeSerialNumber:
        raise ValueError("The bound Rhino document is no longer active")
    editor = _g2v_editor.Instance
    doc = editor.Canvas.Document if editor is not None and editor.Canvas is not None else None
    if doc is None:
        raise ValueError("No active GH2 document")
    return doc


def _g2v_raw_type_selector():
    # Get CLR types before Python.NET can unwrap a stored PyObject on enumeration.
    # This fixed expression never invokes Python code or reflects assemblies.
    item = _g2v_expression.Parameter(_g2v_clr.GetClrType(_g2v_system.Object), "item")
    call = _g2v_expression.Call(item, _g2v_clr.GetClrType(_g2v_system.Object).GetMethod("GetType"))
    body = _g2v_expression.Property(call, "FullName")
    return _g2v_expression.Lambda[_g2v_system.Func[_g2v_system.Object, _g2v_system.String]](
        body, _g2v_system.Array[_g2v_parameter_expression]([item])).Compile()


def _g2v_preview(obj):
    cache = getattr(obj, "DisplayCache", None)
    clipping = getattr(cache, "Clipping", None) if cache is not None else None
    return {"display": str(getattr(obj, "Display", "unknown")),
            "cacheType": str(cache.GetType().FullName) if cache is not None else None,
            "hasFaces": bool(getattr(cache, "HasFaces", False)),
            "hasWires": bool(getattr(cache, "HasWires", False)),
            "boundsValid": bool(clipping is not None and clipping.IsValid)}


def _g2v_audit(plan, document=None):
    doc = document if document is not None else _g2v_document()
    component_ids = plan.get("componentIds", [])
    output_ids = set(str(value).lower() for value in plan.get("geometryOutputIds", []))
    if not 1 <= len(component_ids) <= 64 or not 1 <= len(output_ids) <= 64:
        raise ValueError("Select exact components and final geometry output IDs from the current GH2 graph")
    selector = _g2v_raw_type_selector()
    components, outputs, issues, found = [], [], [], set()
    def issue(code, object_id, detail):
        issues.append({"code": code, "objectId": str(object_id), "detail": detail})
    for component_id in component_ids:
        obj = doc.Objects.Find(_g2v_system.Guid(str(component_id)))
        if obj is None:
            raise ValueError("The requested GH2 component is missing: %s" % component_id)
        object_id = str(obj.InstanceId)
        settings = {}
        for name in ("MarshalOutputs", "MarshOutputs", "MarshalInputs", "MarshInputs", "MarshalGuids", "MarshGuids"):
            prop = obj.GetType().GetProperty(name)
            if prop is not None and prop.PropertyType == _g2v_clr.GetClrType(_g2v_system.Boolean):
                settings[name] = bool(prop.GetValue(obj))
        components.append({"id": object_id, "name": obj.Nomen.Name, "phase": str(obj.Phase),
                           "runtimeType": obj.GetType().FullName, "settings": settings,
                           "preview": _g2v_preview(obj)})
        if "Placeholder" in obj.GetType().FullName:
            issue("component_unavailable", object_id, "This is a placeholder, not a loaded executable component")
        if str(obj.Phase) != "Completed":
            issue("component_not_solved", object_id, "The component has not completed its current solution; stale output cannot pass")
        if obj.State is not None and obj.State.FaultException is not None:
            issue("component_fault", object_id, str(obj.State.FaultException)[:500])
        parameters = obj.Parameters if hasattr(obj, "Parameters") else None
        if parameters is not None:
            for parameter in parameters.Inputs:
                state = parameter.State
                tree = state.Data.Tree() if state is not None and state.Data is not None else None
                if tree is not None and tree.ItemCount == 0:
                    for source_id in parameter.Inputs.Forwards:
                        source = doc.Objects.FindParameter(source_id)
                        source_state = source.State if source is not None else None
                        source_tree = source_state.Data.Tree() if source_state is not None and source_state.Data is not None else None
                        if source_tree is not None and source_tree.ItemCount > 0:
                            issue("connected_input_empty", parameter.InstanceId, "Source has data but this input is empty; inspect exact runtime types and list/tree access")
            candidates = parameters.Outputs
        else:
            candidates = [obj] if hasattr(obj, "PersistentData") else []
        for parameter in candidates:
            parameter_id = str(parameter.InstanceId)
            if parameter_id.lower() not in output_ids:
                continue
            found.add(parameter_id.lower())
            state = parameter.State
            tree = state.Data.Tree() if state is not None and state.Data is not None else None
            row = {"id": parameter_id, "componentId": object_id, "name": parameter.Nomen.Name,
                   "items": tree.ItemCount if tree is not None else 0, "rawItemTypes": {},
                   "validGeometryItems": 0, "invalidGeometryItems": 0, "preview": _g2v_preview(parameter)}
            if tree is None or tree.ItemCount == 0:
                issue("geometry_output_empty", parameter_id, "The final geometry output contains no solved items")
            else:
                raw_types = _g2v_enumerable.Select[_g2v_system.Object, _g2v_system.String](tree.NonNullItems, selector)
                scanned = 0
                for raw_type, value in zip(raw_types, tree.NonNullItems):
                    scanned += 1
                    raw_type = str(raw_type)
                    row["rawItemTypes"][raw_type] = row["rawItemTypes"].get(raw_type, 0) + 1
                    if raw_type.startswith("Rhino.Geometry.") or raw_type.startswith("Grasshopper2.Types.Shapes."):
                        valid = getattr(value, "IsValid", None)
                        if valid is not None and not callable(valid):
                            row["validGeometryItems" if bool(valid) else "invalidGeometryItems"] += 1
                        elif row["preview"]["boundsValid"]:
                            row["validGeometryItems"] += 1
                row["nonNullItems"] = scanned
                if scanned < tree.ItemCount:
                    issue("geometry_output_nulls", parameter_id, "Final geometry contains null items")
                if row["validGeometryItems"] + row["invalidGeometryItems"] < scanned:
                    issue("non_geometry_output_items", parameter_id, "Final geometry output contains opaque or unsupported non-geometry items")
                if any("Python.Runtime.PyObject" in name for name in row["rawItemTypes"]):
                    issue("python_output_not_marshaled", object_id, "The final output stores Python.Runtime.PyObject, not native GH/Rhino geometry. Inspect output marshalling; a nonzero item count is not usable geometry")
                if row["validGeometryItems"] == 0:
                    issue("no_native_geometry", parameter_id, "No valid native geometry was found on this final output")
                if row["invalidGeometryItems"]:
                    issue("invalid_geometry", parameter_id, "The final output contains invalid geometry")
                if not (row["preview"]["boundsValid"] or row["preview"]["hasFaces"] or row["preview"]["hasWires"]):
                    issue("preview_cache_empty", parameter_id, "Geometry preview has no drawable data; inspect marshalling, preview and cache after solve")
            component_preview = components[-1]["preview"]
            if component_preview["display"] != "Visible" or row["preview"]["display"] != "Visible":
                issue("output_preview_hidden", parameter_id, "The final component/output is not in Visible display mode")
            outputs.append(row)
    if found != output_ids:
        raise ValueError("One or more final geometry outputs do not belong to the selected components")
    display = doc.Display
    display_settings = {name: bool(getattr(display, name)) for name in ("Enabled", "DrawWires", "DrawMeshes", "OnlySelected") if hasattr(display, name)}
    if display_settings.get("Enabled") is False or (display_settings.get("DrawWires") is False and display_settings.get("DrawMeshes") is False):
        issue("document_preview_disabled", doc.Identity, "The GH2 document's geometry preview is disabled")
    if display_settings.get("OnlySelected") and any(not doc.Objects.Find(_g2v_system.Guid(row["id"])).Selected for row in components):
        issue("preview_selection_filter", doc.Identity, "OnlySelected preview excludes an unselected final component")
    return {"version": 1, "status": "needs_attention" if issues else "passed", "documentId": str(doc.Identity),
            "componentIds": [str(value) for value in component_ids], "geometryOutputIds": sorted(output_ids),
            "graphChanged": False, "components": components, "outputs": outputs, "issues": issues,
            "display": display_settings, "previewAvailable": not issues,
            "photoFidelityVerified": False,
            "instruction": "This checks actual typed geometry and GH2 preview data, not camera framing or satisfaction of the entire design brief. Repair the specific reported defect, solve, and rerun this audit after the final write. Never report success from a console log, nonzero PyObject count, or solve success alone."}


def _g2v_repair_outputs(plan, document=None):
    doc = document if document is not None else _g2v_document()
    if str(doc.Identity).lower() != str(plan.get("expectedDocumentId", "")).lower():
        raise ValueError("The GH2 document changed after diagnosis; no settings were modified")
    report = _g2v_audit(plan, doc)
    affected = set(row["objectId"] for row in report["issues"] if row["code"] == "python_output_not_marshaled")
    targets = []
    for component in report["components"]:
        if component["id"] not in affected:
            continue
        obj = doc.Objects.Find(_g2v_system.Guid(component["id"]))
        for name in ("MarshalOutputs", "MarshOutputs"):
            prop = obj.GetType().GetProperty(name)
            if prop is not None and prop.CanWrite and prop.PropertyType == _g2v_clr.GetClrType(_g2v_system.Boolean):
                if not bool(prop.GetValue(obj)):
                    targets.append((obj, prop))
                break
    changed = []
    try:
        for obj, prop in targets:
            prop.SetValue(obj, True)
            changed.append((obj, prop))
            if not bool(prop.GetValue(obj)):
                raise RuntimeError("GH2 rejected the output marshalling setting")
    except Exception:
        for obj, prop in reversed(changed):
            prop.SetValue(obj, False)
        raise
    return {"version": 1, "status": "settings_changed" if changed else "no_eligible_change", "graphChanged": bool(changed),
            "documentId": str(doc.Identity), "changedComponentIds": [str(obj.InstanceId) for obj, _ in changed],
            "diagnosis": report, "modelVerified": False,
            "instruction": "Only output conversion was enabled on diagnosed final components. No code, geometry, sliders, wires, input/Guid marshalling or preview modes were changed. Solve with native g2_solve_canvas and rerun g2_verify_model; this setting-change receipt is never proof of a completed model."}
