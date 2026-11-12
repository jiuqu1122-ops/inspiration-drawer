# Native RhinoCommon read-only snapshot regression. All geometry mutations are
# confined to a disposable headless document; the active user's document is read only.
import Rhino as _tRhino
import System as _tSystem
import json as _tJson
_user=__rhino_doc__
_user_before={"objects":len(list(_user.Objects)),"layers":len(list(_user.Layers)),"materials":len(list(_user.Materials)),"modified":_user.Modified}
_active_bound=__rhino_doc__
_scratch=_tRhino.RhinoDoc.CreateHeadless(None)
__rhino_doc__=_scratch
_results=[]
def _check(name,ok,detail=None):
 _results.append({"name":name,"passed":bool(ok),"detail":detail})
 if not ok:raise AssertionError(name+": "+str(detail))
def _snapshot():return _id_doc_snapshot(_scratch)
try:
 _scratch.ModelUnitSystem=_tRhino.UnitSystem.Millimeters
 before=_snapshot()
 _check("empty isolated document baseline",before["objectCount"]==0,before)
 box1=_tRhino.Geometry.Box(_tRhino.Geometry.Plane.WorldXY,_tRhino.Geometry.Interval(0,10),_tRhino.Geometry.Interval(0,10),_tRhino.Geometry.Interval(0,10)).ToBrep()
 oid=_scratch.Objects.AddBrep(box1)
 after_add=_snapshot()
 first=after_add["objects"][0]
 _check("new closed outward Brep includes volume and topology",oid!=_tSystem.Guid.Empty and first["isSolid"] and first["solidOrientation"]=="Outward" and abs(first["volume"]-1000)<.01,first)
 box2=_tRhino.Geometry.Box(_tRhino.Geometry.Plane.WorldXY,_tRhino.Geometry.Interval(0,20),_tRhino.Geometry.Interval(0,10),_tRhino.Geometry.Interval(0,10)).ToBrep()
 _check("in-place same-ID object replacement succeeds",_scratch.Objects.Replace(oid,box2))
 after_change=_snapshot()
 second=after_change["objects"][0]
 _check("same ID geometry fingerprint detects dimensional edits",first["id"]==second["id"] and first["fingerprint"]!=second["fingerprint"] and abs(second["volume"]-2000)<.01,second)
 _check("read-only inspection never changes its target document",before["documentChanged"] is False and after_add["documentChanged"] is False and after_change["documentChanged"] is False)
 class _FakeDocument(object):
  RuntimeSerialNumber=-1
 try:
  _id_doc_snapshot(_FakeDocument())
  _check("foreign Rhino document rejected",False)
 except ValueError as error:
  _check("foreign Rhino document rejected","bound active document" in str(error),str(error))
finally:
 __rhino_doc__=_active_bound
 _scratch.Dispose()
 _user_after={"objects":len(list(_user.Objects)),"layers":len(list(_user.Layers)),"materials":len(list(_user.Materials)),"modified":_user.Modified}
 _check("user document unchanged",_user_before==_user_after,{"before":_user_before,"after":_user_after})
 print("INSPIRATION_DOCUMENT_GEOMETRY_TESTS:"+_tJson.dumps({"passed":sum(1 for x in _results if x["passed"]),"total":len(_results),"tests":_results,"userBefore":_user_before,"userAfter":_user_after},ensure_ascii=True))
