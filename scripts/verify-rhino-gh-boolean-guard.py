# Execute after gh_script_tools.py, with _test_guard_source and
# _test_original_body. All GH writes are to a disposable detached GH_Document.
import math as _test_math
_test_results=[]
_test_active=_id_gh_document()
_test_before=[str(obj.InstanceGuid) for obj in _test_active.Objects]
_test_original_codes={str(obj.InstanceGuid):obj.Code for obj in _test_active.Objects if hasattr(obj,"Code")}
_test_doc=None

def _test_check(name,condition,detail=None):
    _test_results.append({"name":name,"passed":bool(condition),"detail":detail})
    if not condition:raise AssertionError(name+": "+str(detail))

def _test_metrics(brep):
    box=brep.GetBoundingBox(True)
    mass=_id_Rhino.Geometry.VolumeMassProperties.Compute(brep)
    try:return {"min":[box.Min.X,box.Min.Y,box.Min.Z],"max":[box.Max.X,box.Max.Y,box.Max.Z],"volume":abs(mass.Volume),"orientation":str(brep.SolidOrientation)}
    finally:mass.Dispose()

try:
    baseline={"x":1.8,"y":5.2}
    exec(compile(_test_original_body,"original_geometry_memory_only","exec"),baseline)
    _test_raw=_test_metrics(baseline["a"][0])
    _test_check("original inward union reproduces tiny fragment",_test_raw["max"][2]-_test_raw["min"][2]<7 and _test_raw["orientation"]=="Inward",_test_raw)
    source=_id_gh_instrument(_test_original_body,_test_guard_source,["a"])
    scope={"x":1.8,"y":5.2}
    exec(compile(source,"guarded_geometry_memory_only","exec"),scope)
    actual=_test_metrics(scope["a"][0])
    _test_check("guard restores outward complete bracket",actual["orientation"]=="Outward" and actual["max"][2]-actual["min"][2]>180 and actual["max"][1]-actual["min"][1]>260,actual)
    _test_check("union retains a volume at least as large as every input",actual["volume"]>=max(abs(_test_metrics(b)["volume"]) for b in scope["parts"]),actual)
    _test_check("preparation does not mutate input solid orientations",all(str(b.SolidOrientation)=="Inward" for b in scope["parts"]))
    _test_check("instrumentation is idempotent",_id_gh_instrument(source,_test_guard_source,["a"])==source)
    updated=_id_gh_instrument(source.replace("(0,-7,60)","(0,-8,60)"),_test_guard_source,["a"])
    _test_check("code replace remains editable without duplicated guard",updated.count(_ID_GH_PREFIX)==1 and "(0,-8,60)" in updated)
    appended=_id_gh_instrument(source+"\n_extra=7\n",_test_guard_source,["a"])
    _test_check("appended user code is preserved before renewed footer",appended.index("_extra=7")<appended.index(_ID_GH_FOOTER))
    future=_id_gh_instrument("from __future__ import division\n"+_test_original_body,_test_guard_source,["a"])
    _test_check("future import remains legal and survives second instrumentation",_id_gh_instrument(future,_test_guard_source,["a"])==future)
    unchanged="import Rhino.Geometry as rg\n# rg.Brep.CreateBooleanUnion(parts,.01)\na='rg.Brep.CreateBooleanUnion not code'\n"
    _test_check("comments and strings are not rewritten",_id_gh_instrument(unchanged,_test_guard_source,["a"])==unchanged)
    mesh="import Rhino.Geometry as rg\na=rg.Mesh.CreateBooleanUnion(meshes)\n"
    _test_check("mesh booleans are not rewritten as Brep booleans",_id_gh_instrument(mesh,_test_guard_source,["a"])==mesh)
    alias="from Rhino.Geometry import Brep as B\na=B.CreateBooleanUnion(parts,.01)\n"
    _test_check("imported Brep aliases are protected","a=_id_gh_guarded_union" in _id_gh_instrument(alias,_test_guard_source,["a"]))
    unicode_source="import Rhino.Geometry as rg\nlabel='\u652f\u67b6'; a=rg.Brep.CreateBooleanUnion(parts,.01)\n"
    protected_unicode=_id_gh_instrument(unicode_source,_test_guard_source,["a"])
    _test_check("AST UTF8 byte offsets preserve Chinese strings", "label='\u652f\u67b6'; a=_id_gh_guarded_union" in protected_unicode)
    try:
        scope["_id_gh_assert_union_complete"]([_test_metrics(b) for b in scope["parts"]],[_test_raw],.01)
        detected=False
    except ValueError:detected=True
    _test_check("old closed fragment fails range verification",detected)
    input_metric={"min":[0,0,0],"max":[10,10,10],"volume":1000}
    try:
        scope["_id_gh_assert_union_complete"]([input_metric],[{"min":[0,0,0],"max":[10,10,10],"volume":1}],.001)
        detected=False
    except ValueError:detected=True
    _test_check("matching extents cannot hide catastrophic volume loss",detected)
    try:
        scope["_id_gh_guarded_union"]([_id_Rhino.Geometry.PlaneSurface(_id_Rhino.Geometry.Plane.WorldXY,_id_Rhino.Geometry.Interval(0,1),_id_Rhino.Geometry.Interval(0,1)).ToBrep()],.01)
        detected=False
    except ValueError:detected=True
    _test_check("open Boolean operands are rejected",detected)
    # Real IronPython GH runtime, but not the user's active definition.
    _test_doc=_id_Grasshopper.Kernel.GH_Document()
    _test_doc.Enabled=True
    from System.Drawing import PointF as _test_PointF
    proxy=_id_Grasshopper.Instances.ComponentServer.EmitObjectProxy(_id_System.Guid("410755b1-224a-4c1e-a407-bf32fb45ea7e"))
    component=proxy.CreateInstance()
    component.CreateAttributes()
    component.Attributes.Pivot=_test_PointF(420,180)
    component.Params.Input[0].NickName="x"
    component.Params.Input[1].NickName="y"
    _test_doc.AddObject(component,False)
    sliders=[]
    for index,settings in enumerate([("Overall scale",.5,2,1.8),("Wall thickness mm",3,8,5.2)]):
        name,minimum,maximum,value=settings
        slider=_id_Grasshopper.Kernel.Special.GH_NumberSlider()
        slider.CreateAttributes()
        slider.NickName=name
        slider.Attributes.Pivot=_test_PointF(80,140+index*80)
        slider.Slider.Type=_id_Grasshopper.GUI.Base.GH_SliderAccuracy.Float
        slider.Slider.DecimalPlaces=3
        slider.Slider.Minimum=_id_System.Decimal(minimum)
        slider.Slider.Maximum=_id_System.Decimal(maximum)
        slider.SetSliderValue(_id_System.Decimal(value))
        _test_doc.AddObject(slider,False)
        component.Params.Input[index].AddSource(slider)
        sliders.append(slider)
    component.Code=source
    component.ExpireSolution(False)
    _test_doc.NewSolution(False)
    observation=_id_gh_observe([str(component.InstanceGuid)],_test_doc)
    _test_check("actual GH IronPython component computes verified complete solid",observation["status"]=="passed",observation)
    # Native adapter wraps the exact requested assignment, not a hand-edited copy.
    saved_document=_id_gh_document
    _id_gh_document=lambda:_test_doc
    _id_test_component=component
    _id_test_body=_test_original_body
    _id_gh_execute("_id_test_component.Code=_id_test_body\n_id_test_component.ExpireSolution(True)",_test_guard_source)
    _test_check("native assignment adapter injects trusted guard",component.Code.startswith(_ID_GH_PREFIX) and _id_gh_observe([str(component.InstanceGuid)],_test_doc)["status"]=="passed")
    _id_gh_execute("_id_test_component.Code += '\\n_extra=9\\n'\n_id_test_component.ExpireSolution(True)",_test_guard_source)
    _test_check("augmented GH Code assignment stays guarded", "_extra=9" in component.Code and _id_gh_observe([str(component.InstanceGuid)],_test_doc)["status"]=="passed")
    _id_gh_document=saved_document
    # Export a separate corrected definition and 3dm, never bake current Rhino.
    import GH_IO as _test_GH_IO
    archive=_test_GH_IO.Serialization.GH_Archive()
    if not archive.AppendObject(_test_doc,"Definition"):raise RuntimeError("Could not serialize test GH")
    if not archive.WriteToFile(_test_export_gh,True,False):raise RuntimeError("Could not save corrected GH file")
    reopened=_test_GH_IO.Serialization.GH_Archive()
    loaded=_id_Grasshopper.Kernel.GH_Document()
    try:
        ok=reopened.ReadFromFile(_test_export_gh) and reopened.ExtractObject(loaded,"Definition")
        if ok:
            loaded.Enabled=True
            loaded.NewSolution(False)
        check=_id_gh_observe([str(component.InstanceGuid)],loaded) if ok else {}
        _test_check("exported GH reopens and solves with intact sliders",ok and check.get("status")=="passed",check)
    finally:loaded.Dispose()
    model=_id_Rhino.FileIO.File3dm()
    try:
        model.Settings.ModelUnitSystem=_id_Rhino.UnitSystem.Millimeters
        for goo in component.Params.Output[1].VolatileData.AllData(True):
            value=goo.ScriptVariable()
            if isinstance(value,_id_Rhino.Geometry.Brep):model.Objects.AddBrep(value,_id_Rhino.DocObjects.ObjectAttributes())
        _test_check("corrected standalone 3dm writes from isolated output",len(list(model.Objects))==1 and model.Write(_test_export_3dm,8))
    finally:model.Dispose()
finally:
    if _test_doc:_test_doc.Dispose()
    _test_after=[str(obj.InstanceGuid) for obj in _test_active.Objects]
    _test_after_codes={str(obj.InstanceGuid):obj.Code for obj in _test_active.Objects if hasattr(obj,"Code")}
    _test_check("current GH component IDs and code unchanged",_test_before==_test_after and _test_original_codes==_test_after_codes)
    print("INSPIRATION_GH_TESTS:"+_id_json.dumps({"passed":sum(1 for item in _test_results if item["passed"]),"total":len(_test_results),"tests":_test_results},ensure_ascii=True))
