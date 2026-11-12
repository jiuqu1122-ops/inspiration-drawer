# Native CPython host adapter. Changes only the Code assignment requested by
# the original tool call; never clears, bakes or replaces the GH document.
import ast as _id_ast
import base64 as _id_base64
import json as _id_json
import System as _id_System
import Grasshopper as _id_Grasshopper
import Rhino as _id_Rhino

_ID_GH_PREFIX = "# INSPIRATION_GH_GUARD_V1_BEGIN\n"
_ID_GH_END = "# INSPIRATION_GH_GUARD_V1_END\n"
_ID_GH_FOOTER = "\n# INSPIRATION_GH_OUTPUT_CHECK_V1\n"


def _id_gh_instrument(source, guard_source, output_names):
    if not isinstance(source, str) or len(source) > 250000:
        raise ValueError("GH Python code must be a bounded string")
    # Keep the original body editable by c.Code.replace(...), but refresh our
    # own guard from trusted bytes rather than accepting an old edited guard.
    prior_future=[]
    was_guarded=source.startswith(_ID_GH_PREFIX)
    if was_guarded:
        end = source.find(_ID_GH_END)
        if end < 0:
            raise ValueError("Incomplete GH guard prefix")
        prefix=source[:end]
        for node in _id_ast.parse(prefix).body:
            if isinstance(node,_id_ast.ImportFrom) and node.module=="__future__":
                prior_future.append(_id_ast.get_source_segment(prefix,node)+"\n")
        source = source[end+len(_ID_GH_END):]
        footer=source.find(_ID_GH_FOOTER)
        if footer>=0:
            tail=source[footer+len(_ID_GH_FOOTER):]
            lines=tail.splitlines(True)
            if not lines or not lines[0].startswith("_id_gh_final_report(locals(), "):
                raise ValueError("Incomplete GH output guard footer")
            source=source[:footer]+"".join(lines[1:])
    tree = _id_ast.parse(source)
    lines = source.splitlines(True)
    offsets = [0]
    for line in lines:
        offsets.append(offsets[-1] + len(line))
    def position(line, byte_column):
        # CPython AST columns are UTF-8 byte offsets, not Unicode characters.
        return offsets[line-1] + len(lines[line-1].encode("utf-8")[:byte_column].decode("utf-8"))
    brep_names=set(["Brep"])
    for node in _id_ast.walk(tree):
        if isinstance(node,_id_ast.ImportFrom) and node.module=="Rhino.Geometry":
            for alias in node.names:
                if alias.name=="Brep":brep_names.add(alias.asname or alias.name)
    replacements = []
    for node in _id_ast.walk(tree):
        if isinstance(node, _id_ast.Attribute) and node.attr == "CreateBooleanUnion" and ((isinstance(node.value,_id_ast.Attribute) and node.value.attr=="Brep") or (isinstance(node.value,_id_ast.Name) and node.value.id in brep_names)):
            replacements.append((position(node.lineno,node.col_offset), position(node.end_lineno,node.end_col_offset), "_id_gh_guarded_union"))
    if not replacements and not was_guarded:
        # Point/curve/mesh scripts are not a closed-Brep Boolean task. Leave them
        # alone rather than making all existing GH tools require solid output.
        return source
    for start,end,text in sorted(replacements, reverse=True):
        source = source[:start]+text+source[end:]
    names = _id_json.dumps(output_names, ensure_ascii=True)
    # Keep __future__ imports legal in legacy GhPython.
    future = prior_future[:]
    body_lines = source.splitlines(True)
    for node in tree.body:
        if isinstance(node, _id_ast.ImportFrom) and node.module == "__future__":
            future.extend(body_lines[node.lineno-1:node.end_lineno])
            for index in range(node.lineno-1,node.end_lineno):
                body_lines[index] = "\n"
    source = "".join(body_lines)
    return _ID_GH_PREFIX + "".join(future) + guard_source + "\n" + _ID_GH_END + source + _ID_GH_FOOTER + "_id_gh_final_report(locals(), " + names + ")\n"


def _id_gh_document():
    canvas = _id_Grasshopper.Instances.ActiveCanvas
    if canvas is None or canvas.Document is None:
        raise ValueError("No active Grasshopper document")
    return canvas.Document


def _id_gh_observe(component_ids=None, document=None):
    doc = document or _id_gh_document()
    ids = set(str(value).lower() for value in (component_ids or []))
    objects = [obj for obj in doc.Objects if (str(obj.InstanceGuid).lower() in ids if ids else hasattr(obj,"Code"))]
    if ids and len(objects) != len(ids):
        raise ValueError("One or more requested GH component IDs are missing")
    if len(objects) > 128:
        raise ValueError("Too many GH components to verify")
    reports=[]
    for obj in objects:
        errors=[str(message) for message in obj.RuntimeMessages(_id_Grasshopper.Kernel.GH_RuntimeMessageLevel.Error)] if hasattr(obj,"RuntimeMessages") else []
        geometry=[]
        guards=[]
        if hasattr(obj,"Params"):
            for output in obj.Params.Output:
                for index,goo in enumerate(output.VolatileData.AllData(True)):
                    if index > 1024:
                        raise ValueError("GH verification output limit exceeded")
                    value=goo.ScriptVariable() if hasattr(goo,"ScriptVariable") else goo
                    if isinstance(value,str):
                        for line in value.splitlines():
                            if line.startswith("INSPIRATION_GH_GEOMETRY_V1:"):
                                guards.append(_id_json.loads(line.split(":",1)[1]))
                    if isinstance(value,_id_Rhino.Geometry.Brep):
                        box=value.GetBoundingBox(True)
                        mass=_id_Rhino.Geometry.VolumeMassProperties.Compute(value) if value.IsSolid else None
                        try:
                            geometry.append({"valid":value.IsValid,"solid":value.IsSolid,"orientation":str(value.SolidOrientation),"min":[box.Min.X,box.Min.Y,box.Min.Z],"max":[box.Max.X,box.Max.Y,box.Max.Z],"volume":float(mass.Volume) if mass else None})
                        finally:
                            if mass:mass.Dispose()
        guarded=bool(guards) and guards[-1].get("status")=="passed"
        valid=bool(geometry) and all(item["valid"] and item["solid"] and item["orientation"]=="Outward" for item in geometry)
        phase=str(obj.Phase) if hasattr(obj,"Phase") else "unknown"
        if guarded and valid:
            actual_min=[min(item["min"][i] for item in geometry) for i in range(3)]
            actual_max=[max(item["max"][i] for item in geometry) for i in range(3)]
            expected=guards[-1].get("bounds")
            guarded=bool(expected) and guards[-1].get("solidCount")==len(geometry)
            if guarded:
                slack=max(0.000001,max(actual_max[i]-actual_min[i] for i in range(3))*0.000001)
                guarded=all(abs(actual_min[i]-expected["min"][i])<=slack and abs(actual_max[i]-expected["max"][i])<=slack for i in range(3))
                actual_volume=sum(item["volume"] for item in geometry)
                guarded=guarded and abs(actual_volume-guards[-1].get("volume",0))<=max(0.000001,actual_volume*0.00001)
        status="passed" if not errors and guarded and valid and phase=="Computed" else "needs_attention"
        reports.append({"componentId":str(obj.InstanceGuid),"name":obj.NickName,"phase":phase,"status":status,"errors":errors,"guard":guards[-1] if guards else None,"geometry":geometry})
    return {"version":1,"status":"passed" if reports and all(item["status"]=="passed" for item in reports) else "needs_attention","components":reports,"documentWrites":False,"photoFidelityVerified":False}


def _id_gh_execute(original_source, guard_source):
    updated=[]
    def wrapped_code(target, value):
        try:
            kind=str(target.GetType().FullName)
        except Exception:
            return value
        if not kind.startswith("GhPython."):
            return value
        names=[str(param.NickName) for param in target.Params.Output if str(param.NickName)!="out"]
        guarded=_id_gh_instrument(value,guard_source,names)
        if guarded.startswith(_ID_GH_PREFIX):
            updated.append(target)
        return guarded
    class Transformer(_id_ast.NodeTransformer):
        def visit_Assign(self,node):
            self.generic_visit(node)
            if len(node.targets)==1 and isinstance(node.targets[0],_id_ast.Attribute) and node.targets[0].attr=="Code":
                target=node.targets[0].value
                node.value=_id_ast.copy_location(_id_ast.Call(func=_id_ast.Name(id="_id_wrapped_gh_code",ctx=_id_ast.Load()),args=[target,node.value],keywords=[]),node.value)
            return node
        def visit_AugAssign(self,node):
            self.generic_visit(node)
            if isinstance(node.target,_id_ast.Attribute) and node.target.attr=="Code":
                import copy
                value=copy.deepcopy(node.target)
                value.ctx=_id_ast.Load()
                expression=_id_ast.BinOp(left=value,op=node.op,right=node.value)
                call=_id_ast.Call(func=_id_ast.Name(id="_id_wrapped_gh_code",ctx=_id_ast.Load()),args=[copy.deepcopy(node.target.value),expression],keywords=[])
                return _id_ast.copy_location(_id_ast.Assign(targets=[node.target],value=call),node)
            return node
        def visit_Call(self,node):
            self.generic_visit(node)
            if isinstance(node.func,_id_ast.Name) and node.func.id=="setattr" and len(node.args)==3 and isinstance(node.args[1],_id_ast.Constant) and node.args[1].value=="Code":
                node.args[2]=_id_ast.copy_location(_id_ast.Call(func=_id_ast.Name(id="_id_wrapped_gh_code",ctx=_id_ast.Load()),args=[node.args[0],node.args[2]],keywords=[]),node.args[2])
            return node
    namespace=globals()
    namespace["_id_wrapped_gh_code"]=wrapped_code
    tree=Transformer().visit(_id_ast.parse(original_source))
    _id_ast.fix_missing_locations(tree)
    exec(compile(tree,"inspiration_guarded_native_python","exec"),namespace,namespace)
    if updated:
        report=_id_gh_observe([str(obj.InstanceGuid) for obj in updated])
        report["operation"]="script_update"
        # Assignment did modify GH; this does not claim the whole tool was read-only.
        report["grasshopperCodeChanged"]=True
        print("INSPIRATION_GH_OBSERVATION_V1:"+_id_json.dumps(report,ensure_ascii=True))
