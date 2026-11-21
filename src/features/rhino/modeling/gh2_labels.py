"""GH2 label transactions. No graph construction, solving or geometry writes."""
import json as _g2l_json
import System as _g2l_system
import Rhino as _g2l_rhino
from Grasshopper2.UI import Editor as _g2l_editor


def _g2l_targets(doc):
    targets = {}
    for obj in doc.Objects.Forwards:
        targets[str(obj.InstanceId)] = (obj, "object", None)
        parameters = getattr(obj, "Parameters", None)
        if parameters is not None:
            for direction in ("Inputs", "Outputs"):
                ports = getattr(parameters, direction, None)
                for port in ports if ports is not None else []:
                    if port is not None:
                        targets[str(port.InstanceId)] = (port, direction.lower(), str(obj.InstanceId))
    return targets


def _g2l_label(obj):
    value = getattr(obj, "UserName", None)
    return str(value) if value is not None else ""


def _g2l_describe(key, target):
    obj, kind, parent = target
    prop = obj.GetType().GetProperty("UserName")
    nomen = getattr(obj, "Nomen", None)
    return {"id": key, "kind": kind, "parentId": parent,
            "type": obj.GetType().FullName,
            "originalName": str(nomen.Name) if nomen is not None else "",
            "label": _g2l_label(obj),
            "displayName": str(getattr(obj, "DisplayName", "") or ""),
            "writable": prop is not None and prop.CanWrite and prop.PropertyType.FullName == "System.String"}


def _g2l_snapshot(doc):
    targets = _g2l_targets(doc)
    wires, data, scripts = [], {}, {}
    for key, (obj, _, _) in targets.items():
        inputs = getattr(obj, "Inputs", None)
        if inputs is not None:
            wires.extend((key, str(source)) for source in inputs.Forwards)
        if hasattr(obj, "PersistentData"):
            data[key] = obj.PersistentData
        if hasattr(obj, "Code"):
            scripts[key] = obj.Code
    return (tuple(sorted(targets)), tuple(sorted(wires)), data, scripts)


def _g2l_unchanged(before, after):
    return (before[:2] == after[:2] and before[3] == after[3]
            and set(before[2]) == set(after[2])
            and all(_g2l_system.Object.ReferenceEquals(value, after[2][key])
                    for key, value in before[2].items()))


def _g2l_execute(doc, plan, active_check):
    """Internal entry permits isolated native-SDK QA without replacing the canvas."""
    report = {"version": 1, "status": "rejected", "documentId": str(doc.Identity),
              "labelsChanged": False, "graphChanged": False, "changes": []}
    changes, attempted = [], []
    before = None
    try:
        active_check()
        if not isinstance(plan, dict) or plan.get("mode") not in ("inspect", "validate", "commit"):
            raise ValueError("Use mode inspect, validate or commit")
        targets = _g2l_targets(doc)
        if plan["mode"] == "inspect":
            report.update(status="inspected", targets=[_g2l_describe(k, v) for k, v in targets.items()])
            return report
        if str(_g2l_system.Guid(str(plan.get("expectedDocumentId", "")))) != str(doc.Identity):
            raise ValueError("GH2 document changed; inspect the current canvas again")
        requested = plan.get("changes")
        if not isinstance(requested, list) or not 1 <= len(requested) <= 4096:
            raise ValueError("Provide 1..4096 changes with id, expectedLabel and label")
        seen = set()
        for change in requested:
            if not isinstance(change, dict):
                raise ValueError("Invalid label change")
            key = str(_g2l_system.Guid(str(change.get("id", ""))))
            if key in seen or key not in targets:
                raise ValueError("Duplicate or missing GH2 target: " + key)
            seen.add(key)
            obj = targets[key][0]
            label, expected = change.get("label"), change.get("expectedLabel")
            if (not isinstance(label, str) or not isinstance(expected, str) or len(label) > 256
                    or any(ord(c) < 32 or ord(c) == 127 for c in label)):
                raise ValueError("Labels must be strings of at most 256 characters without control characters")
            if not _g2l_describe(key, targets[key])["writable"]:
                raise ValueError("Target has no writable UserName: " + key)
            if _g2l_label(obj) != expected:
                raise ValueError("Label changed since inspection: " + key)
            if expected != label:
                changes.append((key, obj, obj.UserName, label))
        before = _g2l_snapshot(doc)
        if plan["mode"] == "validate":
            report.update(status="validated", pendingChanges=len(changes))
            return report
        active_check()
        for key, obj, old, label in changes:
            attempted.append((key, obj, old, label))
            obj.UserName = label
        active_check()
        if any(_g2l_label(obj) != label for _, obj, _, label in changes):
            raise ValueError("GH2 label readback failed")
        if not _g2l_unchanged(before, _g2l_snapshot(doc)):
            raise ValueError("Graph, control data or code changed during label editing")
        report.update(status="applied" if changes else "unchanged", labelsChanged=bool(changes),
                      changes=[{"id": key, "before": str(old) if old is not None else "", "label": label}
                               for key, _, old, label in changes])
    except Exception as error:
        rollback_errors = []
        for key, obj, old, _ in reversed(attempted):
            try:
                obj.UserName = old
                if obj.UserName != old:
                    raise ValueError("Label rollback readback failed")
            except Exception as rollback_error:
                rollback_errors.append({"id": key, "error": str(rollback_error)})
        try:
            graph_changed = before is not None and not _g2l_unchanged(before, _g2l_snapshot(doc))
        except Exception:
            graph_changed = True  # Cannot prove preservation; never report a clean rejection.
        report.update(status="partial_failure" if rollback_errors or graph_changed else "rejected",
                      labelsChanged=bool(rollback_errors), graphChanged=graph_changed,
                      error=str(error), rollbackErrors=rollback_errors)
    return report


def drawer_gh2_labels(plan):
    """Inspect first; commit exact IDs/old labels against the inspected document."""
    editor = _g2l_editor.Instance
    doc = editor.Canvas.Document if editor is not None and editor.Canvas is not None else None
    def active_check():
        active = _g2l_rhino.RhinoDoc.ActiveDoc
        if active is None or active.RuntimeSerialNumber != __rhino_doc__.RuntimeSerialNumber:
            raise ValueError("The bound Rhino document is no longer active")
        if _g2l_editor.Instance is None or _g2l_editor.Instance.Canvas is None or _g2l_editor.Instance.Canvas.Document != doc:
            raise ValueError("The GH2 canvas changed; inspect it again")
    if doc is None:
        report = {"version": 1, "status": "rejected", "labelsChanged": False, "graphChanged": False,
                  "error": "Open GH2 and its definition before editing labels"}
    else:
        report = _g2l_execute(doc, plan, active_check)
    print("INSPIRATION_GH2_LABELS_V1:" + _g2l_json.dumps(report, ensure_ascii=True))
    return report
