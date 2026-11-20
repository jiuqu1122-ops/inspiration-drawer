# Execute after rhinoGeometryStage.py in a Rhino Python host. This fixture only
# mutates its own disposable headless document, never the bound user document.
import Rhino as _test_rhino
import Grasshopper as _test_gh
import System as _test_system
import json as _test_json

_user_doc = __rhino_doc__
_user_counts = (len(list(_user_doc.Objects)), _user_doc.Modified)
_scratch = _test_rhino.RhinoDoc.CreateHeadless(None)
_results = []
_completed = False


def _check(name, condition):
    if not condition:
        raise AssertionError(name)
    _results.append(name)


def _mesh():
    mesh = _test_rhino.Geometry.Mesh()
    for x, y in [(0, 0), (1, 0), (1, 1), (0, 1)]:
        mesh.Vertices.Add(x, y, 0)
    mesh.Faces.AddFace(0, 1, 2, 3)
    mesh.Normals.ComputeNormals()
    return mesh


try:
    __rhino_doc__ = _scratch
    tree = _test_gh.Kernel.Data.GH_Structure[_test_gh.Kernel.Types.IGH_Goo]()
    for i in range(225):
        tree.Append(_test_gh.Kernel.Types.GH_Mesh(_mesh()), _test_gh.Kernel.Data.GH_Path(i // 100))
    stage = DrawerGeometryStage()
    receipt = stage.add_tree("texture", tree)
    _check("225 real GH mesh wrappers staged across 3 branches", receipt["stagedCount"] == 225 and len(receipt["branches"]) == 3)
    _check("stage and preview do not add objects", stage.preview()["kinds"] == {"mesh": 225} and len(list(_scratch.Objects)) == 0)
    committed = stage.commit()
    _check("all 225 mesh items baked exactly once", committed["committedCount"] == 225 and len(list(_scratch.Objects)) == 225)
    _check("all baked objects remain valid open meshes", all(isinstance(obj.Geometry, _test_rhino.Geometry.Mesh) and obj.Geometry.IsValid and not obj.Geometry.IsClosed for obj in _scratch.Objects))
    _check("actual GH branch and item indices retained", committed["parts"][224]["source"] == {"path": "{2}", "index": 24})
    target = _test_system.Guid(committed["parts"][0]["id"])
    obj = _scratch.Objects.FindId(target)
    attributes = obj.Attributes.Duplicate()
    attributes.Name = "preserved texture"
    _check("set scratch-only attributes", _scratch.Objects.ModifyAttributes(target, attributes, True))
    stage = DrawerGeometryStage()
    mesh = stage.copy(target)
    mesh.Vertices.SetVertex(0, 0, 0, .2)
    stage.add("edited", mesh, replace_id=target)
    stage.commit()
    _check("mesh replacement preserves ID and name", _scratch.Objects.FindId(target).Name == "preserved texture" and len(list(_scratch.Objects)) == 225)
    stage = DrawerGeometryStage()
    stage.add("required solid", _mesh(), kind="solid")
    try:
        stage.commit()
        raise AssertionError("open mesh accepted as required solid")
    except ValueError as error:
        _check("open mesh fails explicit solid requirement with no write", "Open solid" in str(error) and len(list(_scratch.Objects)) == 225)
    stage = DrawerGeometryStage()
    stage.add("point", _test_gh.Kernel.Types.GH_Point(_test_rhino.Geometry.Point3d(2, 3, 4)))
    stage.add("curve", _test_gh.Kernel.Types.GH_Line(_test_rhino.Geometry.Line(0, 0, 0, 1, 1, 1)))
    _check("actual GH point and line value types normalize", stage.preview()["kinds"] == {"point": 1, "curve": 1})
    _completed = True
finally:
    __rhino_doc__ = _user_doc
    _scratch.Dispose()
    _check("user document untouched", (len(list(_user_doc.Objects)), _user_doc.Modified) == _user_counts)
    print("INSPIRATION_GH_BAKE_NATIVE_TESTS:" + _test_json.dumps({"success": _completed, "passed": len(_results), "tests": _results}))
