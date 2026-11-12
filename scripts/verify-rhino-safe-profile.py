# Run after profile_solids.py, inside Rhino Python. This harness commits only
# to a disposable headless document, never to the user's __rhino_doc__.
import copy

_user_doc = __rhino_doc__
_before_user = {"objects": len(list(_user_doc.Objects)), "layers": len(list(_user_doc.Layers)), "materials": len(list(_user_doc.Materials)), "modified": _user_doc.Modified}
_test_results = []
_scratch = Rhino.RhinoDoc.CreateHeadless(None)
_scratch.ModelUnitSystem = Rhino.UnitSystem.Millimeters

def _check(name, condition, detail=None):
    _test_results.append({"name":name,"passed":bool(condition),"detail":detail})
    if not condition:
        raise AssertionError(name + ": " + str(detail))

def _reject(name, plan, code):
    before = len(list(_scratch.Objects))
    receipt = _id_profiles_build(plan, _scratch)
    _check(name, receipt.get("status") == "rejected" and receipt.get("documentChanged") is False and any(item.get("code")==code for item in receipt.get("issues",[])) and len(list(_scratch.Objects))==before, receipt)

def _with_holes(holes, wall=0.5):
    plan = copy.deepcopy(_simple_plan)
    plan["parts"][0]["holes"] = holes
    plan["parts"][0]["minWall"] = wall
    return plan

def _circle(x,y,r):
    return {"kind":"circle","center":[x,y],"radius":r}

_simple_plan = {"mode":"validate","units":"millimeters","parts":[{"name":"test_plate","outer":{"kind":"polygon","points":[[0,0],[10,0],[10,10],[0,10]]},"holes":[_circle(5,5,1)],"thickness":2,"minWall":1}]}
try:
    original = _id_profiles_build(_original_fixture, _scratch)
    _check("actual failure fixture identifies both crossing circles after native fillets",original.get("status")=="rejected" and sorted(item["holeIndex"] for item in original["issues"] if item["code"]=="hole_outside_or_crossing")==[12,13],original)
    corrected = _id_profiles_build(_corrected_fixture, _scratch)
    _check("all three corrected reference parts validate as closed solids",corrected.get("status")=="validated" and corrected.get("partCount")==3 and corrected.get("solid") is True,corrected)
    _reject("crossing hole",_with_holes([_circle(.5,5,1)]),"hole_outside_or_crossing")
    _reject("tangent hole",_with_holes([_circle(1,5,1)]),"hole_outside_or_crossing")
    _reject("minimum wall",_with_holes([_circle(1.2,5,1)]),"wall_too_thin")
    _reject("nested holes",_with_holes([_circle(5,5,1),_circle(5,5,.4)]),"holes_overlap_or_nested")
    _reject("overlapping holes",_with_holes([_circle(3,5,1),_circle(4,5,1)]),"holes_overlap_or_nested")
    _reject("tangent holes",_with_holes([_circle(3,5,1),_circle(5,5,1)]),"holes_overlap_or_nested")
    _reject("thin inter-hole web",_with_holes([_circle(3,5,1),_circle(5.2,5,1)]),"hole_web_too_thin")
    bad=copy.deepcopy(_simple_plan);bad["parts"][0]["outer"]["points"]=[[0,0],[10,10],[0,10],[10,0]]
    _reject("self-intersecting outer loop",bad,"invalid_part")
    bad=copy.deepcopy(_simple_plan);bad["parts"][0]["holes"]=[{"kind":"polygon","points":[[2,2],[7,7],[2,7],[7,2]]}]
    _reject("self-intersecting hole",bad,"invalid_hole")
    bad=copy.deepcopy(_simple_plan);bad["parts"][0]["yAxis"]=[1,1,0]
    _reject("nonperpendicular placement axes",bad,"invalid_part")
    bad=copy.deepcopy(_simple_plan);bad["parts"][0]["thickness"]=-1
    _reject("negative thickness",bad,"invalid_part")
    bad=copy.deepcopy(_simple_plan);bad["parts"][0]["holes"][0]["radius"]=float("nan")
    _reject("nonfinite radius",bad,"invalid_hole")
    bad=copy.deepcopy(_simple_plan);bad["parts"][0]["outer"]["points"].insert(1,[0,0])
    _reject("duplicate outline points",bad,"invalid_part")
    bad=copy.deepcopy(_simple_plan);bad["mode"]="commit";bad["parts"].append(copy.deepcopy(_original_fixture["parts"][0]))
    _reject("second-part failure leaves the entire commit unwritten",bad,"hole_outside_or_crossing")
    _check("all validation tests added no objects",len(list(_scratch.Objects))==0)
    commit=copy.deepcopy(_simple_plan);commit["mode"]="commit"
    layers_before=len(list(_scratch.Layers));materials_before=len(list(_scratch.Materials))
    committed=_id_profiles_build(commit,_scratch)
    _check("commit verified additive solid to isolated scratch document",committed.get("status")=="committed" and committed.get("partCount")==1 and len(list(_scratch.Objects))==1,committed)
    obj=_scratch.Objects.FindId(System.Guid(committed["objectIds"][0]))
    volume=Rhino.Geometry.VolumeMassProperties.Compute(obj.Geometry)
    try:
        expected=(100-math.pi)*2
        _check("committed geometry is solid with an actual through hole",obj.Geometry.IsSolid and obj.Geometry.IsValid and abs(volume.Volume-expected)<.01,{"volume":volume.Volume,"expected":expected})
    finally:
        volume.Dispose()
    _check("commit creates no layers or materials",layers_before==len(list(_scratch.Layers)) and materials_before==len(list(_scratch.Materials)))
    _scratch.Objects.Delete(obj.Id,True)
    commit=copy.deepcopy(_corrected_fixture);commit["mode"]="commit"
    committed=_id_profiles_build(commit,_scratch)
    _check("three reference parts commit as valid named independent solids in scratch",committed.get("status")=="committed" and committed.get("partCount")==3 and all(_scratch.Objects.FindId(System.Guid(gid)).Geometry.IsValid and _scratch.Objects.FindId(System.Guid(gid)).Geometry.IsSolid for gid in committed.get("objectIds",[])),committed)
    for gid in committed["objectIds"]:
        _scratch.Objects.Delete(System.Guid(gid),True)
    class _FailingObjects(object):
        def __init__(self):self.calls=0
        def AddBrep(self,solid,attr):
            self.calls+=1
            if self.calls==2:return System.Guid.Empty
            return _scratch.Objects.AddBrep(solid,attr)
        def Delete(self,gid,quiet):return _scratch.Objects.Delete(gid,quiet)
    class _FaultDoc(object):
        ModelUnitSystem=_scratch.ModelUnitSystem
        ModelAbsoluteTolerance=_scratch.ModelAbsoluteTolerance
        Objects=_FailingObjects()
        Views=_scratch.Views
        def BeginUndoRecord(self,name):return _scratch.BeginUndoRecord(name)
        def EndUndoRecord(self,serial):return _scratch.EndUndoRecord(serial)
    fault=copy.deepcopy(_simple_plan);fault["mode"]="commit";fault["parts"].append(copy.deepcopy(fault["parts"][0]))
    failed=_id_profiles_build(fault,_FaultDoc())
    _check("commit failure is terminal and removes only newly added known objects",failed.get("status")=="commit_failed" and failed.get("documentChanged") is True and failed.get("knownAddedObjectsRemoved") is True and len(list(_scratch.Objects))==0,failed)
    _scratch.ModelUnitSystem=Rhino.UnitSystem.Inches
    receipt=_id_profiles_build(_simple_plan,_scratch)
    _check("millimeter input converts in an inch document",receipt.get("status")=="validated",receipt)
finally:
    _scratch.Dispose()
    _after_user={"objects":len(list(_user_doc.Objects)),"layers":len(list(_user_doc.Layers)),"materials":len(list(_user_doc.Materials)),"modified":_user_doc.Modified}
    _check("user document counts and modified state unchanged",_before_user==_after_user,{"before":_before_user,"after":_after_user})
    print("INSPIRATION_GEOMETRY_TESTS:"+json.dumps({"tests":_test_results,"passed":sum(1 for item in _test_results if item["passed"]),"total":len(_test_results),"userDocumentBefore":_before_user,"userDocumentAfter":_after_user},ensure_ascii=True))
