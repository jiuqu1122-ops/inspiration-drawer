"""Read exact live GH2 parameter types; never change a document or canvas."""
import json as _g2_json
import System as _g2_system
import Rhino as _g2_rhino
from Grasshopper2.UI import Editor as _g2_editor


def _id_gh2_inspect_parameters(plan):
    if _g2_rhino.RhinoDoc.ActiveDoc is None or _g2_rhino.RhinoDoc.ActiveDoc.RuntimeSerialNumber != __rhino_doc__.RuntimeSerialNumber:
        raise ValueError("The bound Rhino document is no longer active")
    editor = _g2_editor.Instance
    doc = editor.Canvas.Document if editor is not None and editor.Canvas is not None else None
    if doc is None:
        raise ValueError("Start GH2 and read its current canvas before inspecting parameters")
    ids = plan.get("objectIds")
    if not isinstance(ids, list) or not 1 <= len(ids) <= 64:
        raise ValueError("Provide 1..64 exact GH2 object IDs")

    def describe(parameter):
        state = parameter.State
        tree = state.Data.Tree() if state is not None and state.Data is not None else None
        data_type = None
        if tree is not None:
            arguments = tree.GetType().GetGenericArguments()
            if len(arguments) == 1:
                data_type = arguments[0].FullName
        return {"id": str(parameter.InstanceId), "name": parameter.Nomen.Name,
                "runtimeParameterType": parameter.GetType().FullName,
                "solvedDataType": data_type,
                "items": tree.ItemCount if tree is not None else None,
                "sample": [str(value)[:200] for _, value in zip(range(3), tree.NonNullItems)] if tree is not None else [],
                "sources": [str(value) for value in parameter.Inputs.Forwards]}

    objects = []
    for value in ids:
        object_id = _g2_system.Guid(str(value))
        obj = doc.Objects.Find(object_id)
        if obj is None:
            raise ValueError("GH2 object not found on the active canvas: %s" % value)
        if hasattr(obj, "Parameters"):
            inputs = [describe(p) for p in obj.Parameters.Inputs]
            outputs = [describe(p) for p in obj.Parameters.Outputs]
        elif hasattr(obj, "PersistentData"):
            inputs, outputs = [], [describe(obj)]
        else:
            inputs, outputs = [], []
        objects.append({"id": str(obj.InstanceId), "name": obj.Nomen.Name,
                        "inputs": inputs, "outputs": outputs})
    return {"version": 1, "graphChanged": False, "objects": objects,
            "instruction": "Use exact runtime parameter types and solved item counts, not port names, to choose compatible native components. An empty connected input with a populated source needs investigation even when solve reports success. An IntervalParameter requires an interval: connect a native Interval From Limits component, not a scalar slider or Floor. Inspect actual output geometry before reporting completion."}
