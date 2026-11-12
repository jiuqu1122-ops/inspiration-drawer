# Read-only, document-bound RhinoCommon geometry snapshot.
# No Add/Delete/Transform/Select/View mutations are performed.
import Rhino as _id_doc_Rhino
import json as _id_doc_json
import math as _id_doc_math

_ID_DOC_SNAPSHOT_MARKER="INSPIRATION_DOCUMENT_GEOMETRY_V1:"

def _id_doc_num(value):
    value=float(value)
    if _id_doc_math.isnan(value) or _id_doc_math.isinf(value):return None
    return round(value,6)

def _id_doc_snapshot(doc):
    if doc is None or doc.RuntimeSerialNumber != __rhino_doc__.RuntimeSerialNumber:
        raise ValueError("Geometry inspection must target the bound active document")
    objects=[]
    for obj in doc.Objects.GetObjectList(_id_doc_Rhino.DocObjects.ObjectType.AnyObject):
        if obj.IsDeleted:continue
        geo=obj.Geometry
        if geo is None:continue
        if len(objects)>=5000:raise ValueError("Document geometry inspection limit exceeded")
        try:
            box=geo.GetBoundingBox(True)
            bbox_valid=bool(box.IsValid)
            minimum=[_id_doc_num(box.Min.X),_id_doc_num(box.Min.Y),_id_doc_num(box.Min.Z)] if bbox_valid else None
            maximum=[_id_doc_num(box.Max.X),_id_doc_num(box.Max.Y),_id_doc_num(box.Max.Z)] if bbox_valid else None
        except:
            bbox_valid=False
            minimum=None
            maximum=None
        try:geometry_valid=bool(geo.IsValid)
        except:geometry_valid=False
        item={"id":str(obj.Id),"type":str(obj.ObjectType),"geometryType":str(geo.GetType().FullName),"name":str(obj.Name or ""),"valid":bool(geometry_valid and bbox_valid),"bboxValid":bbox_valid,"visible":bool(obj.Attributes.Visible),"hidden":bool(obj.IsHidden),"locked":bool(obj.IsLocked),"min":minimum,"max":maximum}
        converted=False
        brep=geo if isinstance(geo,_id_doc_Rhino.Geometry.Brep) else (geo.ToBrep() if isinstance(geo,(_id_doc_Rhino.Geometry.Extrusion,_id_doc_Rhino.Geometry.Surface)) else None)
        converted=brep is not None and brep is not geo
        if brep is not None:
            item["isBrep"]=True
            item["isValid"]=bool(brep.IsValid)
            item["isSolid"]=bool(brep.IsSolid)
            item["solidOrientation"]=str(brep.SolidOrientation)
            item["faceCount"]=brep.Faces.Count
            item["loopCount"]=brep.Loops.Count
            item["edgeCount"]=brep.Edges.Count
            try:
                mass=_id_doc_Rhino.Geometry.VolumeMassProperties.Compute(brep) if brep.IsSolid else None
                try:item["volume"]=_id_doc_num(abs(mass.Volume)) if mass else None
                finally:
                    if mass:mass.Dispose()
            except:item["volume"]=None
            try:
                area=_id_doc_Rhino.Geometry.AreaMassProperties.Compute(brep)
                try:item["area"]=_id_doc_num(area.Area) if area else None
                finally:
                    if area:area.Dispose()
            except:item["area"]=None
        elif isinstance(geo,_id_doc_Rhino.Geometry.Curve):
            item["isCurve"]=True
            item["isClosed"]=bool(geo.IsClosed)
            item["isPlanar"]=bool(geo.IsPlanar(doc.ModelAbsoluteTolerance))
            item["length"]=_id_doc_num(geo.GetLength())
            item["degree"]=int(geo.Degree) if hasattr(geo,"Degree") else None
        elif isinstance(geo,_id_doc_Rhino.Geometry.Mesh):
            item["isMesh"]=True
            item["isClosed"]=bool(geo.IsClosed)
            item["vertexCount"]=geo.Vertices.Count
            item["faceCount"]=geo.Faces.Count
            try:item["volume"]=_id_doc_num(abs(geo.Volume)) if geo.IsClosed else None
            except:item["volume"]=None
        else:
            item["isBrep"]=False
        # Geometry-only fingerprint: attribute-only changes do not masquerade as
        # new geometry. Topology + bounds + measures detect in-place edits.
        item["fingerprint"]=_id_doc_json.dumps({key:item.get(key) for key in ("geometryType","valid","bboxValid","isValid","isSolid","solidOrientation","faceCount","loopCount","edgeCount","isCurve","isClosed","isPlanar","length","degree","isMesh","vertexCount","min","max","volume","area")},sort_keys=True,separators=(",",":"))
        objects.append(item)
        if converted:brep.Dispose()
    objects.sort(key=lambda value:value["id"])
    return {"version":1,"documentId":int(doc.RuntimeSerialNumber),"units":str(doc.ModelUnitSystem),"tolerance":float(doc.ModelAbsoluteTolerance),"objectCount":len(objects),"objects":objects,"documentChanged":False,"readOnly":True}

print(_ID_DOC_SNAPSHOT_MARKER+_id_doc_json.dumps(_id_doc_snapshot(__rhino_doc__),ensure_ascii=True))
