"""Deterministic fake-Rhino transaction tests, not a substitute for native geometry QA."""
import copy
import contextlib
import io
import pathlib
import sys
import types
import unittest


class Guid(str):
    Empty = "00000000-0000-0000-0000-000000000000"


class Attributes:
    def __init__(self, name="", material=4):
        self.Name, self.MaterialIndex = name, material
        self.Visible = True

    def Duplicate(self):
        return copy.deepcopy(self)


class Faces(list):
    @property
    def Count(self):
        return len(self)


class Face:
    def __init__(self, planar=True):
        self.planar = planar

    def IsPlanar(self, tolerance):
        return self.planar


class Geometry:
    IsValid = True
    crc = 1

    def Dispose(self):
        pass

    def Duplicate(self):
        return copy.deepcopy(self)

    def GetBoundingBox(self, accurate):
        return types.SimpleNamespace(IsValid=True, Min=types.SimpleNamespace(X=0, Y=0, Z=0), Max=types.SimpleNamespace(X=1, Y=1, Z=1))

    def GetType(self):
        return types.SimpleNamespace(FullName="Rhino.Geometry." + type(self).__name__)

    def DataCRC(self, seed):
        return self.crc


class Brep(Geometry):
    def __init__(self, closed=True, valid=True, caps=False, planar=True, inward=False, crc=1):
        self.IsSolid, self.IsValid, self.caps = closed, valid, caps
        self.SolidOrientation = "Inward" if inward else "Outward"
        self.Faces = Faces([Face(planar)])
        self.crc = crc

    def CapPlanarHoles(self, tolerance):
        return Brep() if self.caps else None

    def DuplicateNakedEdgeCurves(self, outer, inner):
        return [1, 2, 3] if not self.IsSolid else []

    def Flip(self):
        self.SolidOrientation = "Outward"


class Surface(Geometry):
    def ToBrep(self):
        return Brep(closed=False)


class Extrusion(Geometry):
    def ToBrep(self):
        return Brep()


class Curve(Geometry):
    pass


class Mesh(Geometry):
    def __init__(self, closed=False, valid=True, vertices=4, faces=2, orientation=1):
        self.IsClosed, self.IsValid, self.IsSolid = closed, valid, closed
        self.Vertices = types.SimpleNamespace(Count=vertices)
        self.Faces = types.SimpleNamespace(Count=faces)
        self.orientation = orientation if closed else 0
        self.vertices_data = [0., 0., 1., 1.]

    def SolidOrientation(self):
        return self.orientation

    def Flip(self, vertex_normals, face_normals, faces):
        self.orientation = -self.orientation


class SubD(Geometry):
    def __init__(self, closed=False, inward=False):
        self.IsSolid, self.inward = closed, inward

    def ToBrep(self):
        return Brep(closed=self.IsSolid, inward=self.inward)

    def Flip(self):
        self.inward = not self.inward
        return True


class Point3d:
    IsValid = True


class Point(Geometry):
    def __init__(self, location=None):
        self.Location = location or Point3d()


class PointCloud(Geometry):
    def __init__(self, count=3):
        self.Count = count


class Line:
    def ToNurbsCurve(self):
        return Curve()


class Arc(Line):
    pass


class Circle(Line):
    pass


class Ellipse(Line):
    pass


class Rectangle3d(Line):
    pass


class Polyline:
    def ToPolylineCurve(self):
        return Curve()


class Box:
    def ToBrep(self):
        return Brep()


class Goo:
    def __init__(self, value, valid=True, name="GH_Mesh"):
        self.value, self.IsValid, self.name = value, valid, name

    def GetType(self):
        return types.SimpleNamespace(FullName="Grasshopper.Kernel.Types." + self.name)

    def ScriptVariable(self):
        return self.value


class Tree:
    def __init__(self, *branches):
        self.Paths = ["{" + str(i) + "}" for i in range(len(branches))]
        self.Branches = list(branches)


class Objects:
    def GetObjectList(self, kind):
        return list(self.rows.values())

    def __init__(self):
        self.rows = {}
        self.writes = []
        self.failure_on_add = None
        self.restore_fails = False
        self.add_count = 0

    def FindId(self, object_id):
        return self.rows.get(str(object_id))

    def Add(self, geometry, attributes):
        self.add_count += 1
        if self.add_count == self.failure_on_add:
            raise RuntimeError("fixture add failure")
        oid = Guid("fixture-" + str(self.add_count))
        self.rows[oid] = types.SimpleNamespace(Id=oid, Geometry=geometry.Duplicate(), Attributes=attributes.Duplicate(), Name=attributes.Name, ObjectType=type(geometry).__name__, IsDeleted=False, IsHidden=False, IsLocked=False)
        self.writes.append(("add", oid))
        return oid

    def Replace(self, oid, geometry):
        if str(oid) not in self.rows or self.restore_fails:
            return False
        self.rows[str(oid)].Geometry = geometry.Duplicate()
        self.writes.append(("replace", str(oid)))
        return True

    def ModifyAttributes(self, oid, attributes, quiet):
        self.rows[str(oid)].Attributes = attributes.Duplicate()
        return True

    def Delete(self, oid, quiet):
        if self.restore_fails:
            return False
        del self.rows[str(oid)]
        self.writes.append(("delete", str(oid)))
        return True


class Document:
    RuntimeSerialNumber = 73
    ModelUnitSystem = "Millimeters"
    ModelAbsoluteTolerance = 0.01

    def __init__(self):
        self.Objects = Objects()
        self.Views = types.SimpleNamespace(Redraw=lambda: None)
        self.ended = []

    def BeginUndoRecord(self, name):
        return 1

    def EndUndoRecord(self, undo):
        self.ended.append(undo)


def execute_program(doc, relative_path, other_doc=None):
    rg = types.ModuleType("Rhino.Geometry")
    for cls in (Brep, Surface, Extrusion, Curve, Mesh, Point, Point3d, PointCloud, SubD, Line, Arc, Circle, Ellipse, Rectangle3d, Polyline, Box):
        setattr(rg, cls.__name__, cls)
    rg.BrepSolidOrientation = types.SimpleNamespace(Inward="Inward", Outward="Outward")
    rg.VolumeMassProperties = types.SimpleNamespace(Compute=lambda geometry: types.SimpleNamespace(Volume=1.0, Dispose=lambda: None))
    rhino = types.ModuleType("Rhino")
    rhino.Geometry = rg
    rhino.DocObjects = types.ModuleType("Rhino.DocObjects")
    rhino.DocObjects.ObjectAttributes = Attributes
    rhino.DocObjects.ObjectType = types.SimpleNamespace(AnyObject=0)
    system = types.ModuleType("System")
    system.Guid = Guid
    context = types.ModuleType("scriptcontext")
    context.doc = other_doc or doc
    modules = {"Rhino": rhino, "Rhino.Geometry": rg, "Rhino.DocObjects": rhino.DocObjects, "System": system, "scriptcontext": context}
    previous = {name: sys.modules.get(name) for name in modules}
    namespace = {"__rhino_doc__": doc}
    try:
        sys.modules.update(modules)
        source = pathlib.Path(__file__).parents[2] / relative_path
        exec(compile(source.read_text(encoding="utf-8"), str(source), "exec"), namespace)
    finally:
        for name, value in previous.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value
    return namespace


def helper(doc, other_doc=None):
    return execute_program(doc, "src/features/rhino/rhinoGeometryStage.py", other_doc)["DrawerGeometryStage"]()


class StageTests(unittest.TestCase):
    def test_open_required_solid_rejects_entire_assembly_before_any_write(self):
        doc = Document()
        stage = helper(doc)
        stage.add("main body", Brep())
        stage.add("ornament", Brep(closed=False), kind="solid")
        with self.assertRaisesRegex(ValueError, "Open solid: ornament; naked edges=3"):
            stage.commit()
        self.assertEqual(doc.Objects.writes, [])

    def test_open_surface_or_curve_requires_explicit_role(self):
        doc = Document()
        stage = helper(doc)
        stage.add("relief", Surface(), kind="surface")
        stage.add("construction", Curve(), kind="curve")
        self.assertEqual(len(stage.commit()["parts"]), 2)

    def test_planar_caps_are_opt_in_and_cannot_silently_fix_non_planar_gaps(self):
        for cap, can_cap, success in [(False, True, False), (True, True, True), (True, False, False)]:
            doc = Document()
            stage = helper(doc)
            original = Brep(closed=False, caps=can_cap)
            stage.add("body", original, kind="solid", cap_planar=cap)
            if success:
                stage.commit()
                self.assertFalse(original.IsSolid)
            else:
                with self.assertRaises(ValueError):
                    stage.commit()
                self.assertEqual(doc.Objects.writes, [])

    def test_only_specifically_required_faces_must_be_planar(self):
        doc = Document()
        stage = helper(doc)
        stage.add("curved body", Brep(planar=False))
        stage.commit()
        stage = helper(doc)
        stage.add("straight wall", Brep(planar=False), planar_faces=[0])
        count = len(doc.Objects.writes)
        with self.assertRaisesRegex(ValueError, "Required planar face is curved"):
            stage.commit()
        self.assertEqual(len(doc.Objects.writes), count)

    def test_followup_preserves_id_material_attributes_and_unrelated_parts(self):
        doc = Document()
        body = doc.Objects.Add(Brep(), Attributes("original name", material=9))
        decoration = doc.Objects.Add(Brep(), Attributes("decoration"))
        other_doc = Document()
        stage = helper(doc, other_doc)
        private = stage.copy(body)
        private.crc = 2
        self.assertEqual(doc.Objects.FindId(body).Geometry.crc, 1)
        stage.add("replacement", private, replace_id=body)
        receipt = stage.commit()
        self.assertEqual(receipt["parts"][0]["id"], body)
        self.assertEqual(doc.Objects.FindId(body).Geometry.crc, 2)
        self.assertEqual(doc.Objects.FindId(body).Attributes.MaterialIndex, 9)
        self.assertEqual(doc.Objects.FindId(body).Attributes.Name, "original name")
        self.assertIn(decoration, doc.Objects.rows)
        self.assertEqual(other_doc.Objects.writes, [])
        with self.assertRaisesRegex(RuntimeError, "only once"):
            stage.commit()

    def test_changed_target_and_duplicate_target_are_rejected_before_writes(self):
        doc = Document()
        body = doc.Objects.Add(Brep(), Attributes())
        stage = helper(doc)
        private = stage.copy(body)
        doc.Objects.FindId(body).Geometry.crc = 99
        stage.add("replacement", private, replace_id=body)
        before = list(doc.Objects.writes)
        with self.assertRaisesRegex(ValueError, "Target changed"):
            stage.commit()
        self.assertEqual(doc.Objects.writes, before)
        stage = helper(doc)
        stage.add("one", Brep(), replace_id=body)
        stage.add("two", Brep(), replace_id=body)
        with self.assertRaisesRegex(ValueError, "more than once"):
            stage.commit()
        self.assertEqual(doc.Objects.writes, before)

    def test_failed_commit_restores_only_helper_owned_changes(self):
        doc = Document()
        body = doc.Objects.Add(Brep(crc=1), Attributes("old", 7))
        decoration = doc.Objects.Add(Brep(crc=5), Attributes("keep"))
        stage = helper(doc)
        stage.add("replacement", Brep(crc=2), replace_id=body)
        stage.add("added", Brep())
        stage.add("fails", Brep())
        doc.Objects.failure_on_add = 4
        with self.assertRaisesRegex(RuntimeError, "tracked helper writes restored"):
            stage.commit()
        self.assertEqual(set(doc.Objects.rows), {body, decoration})
        self.assertEqual(doc.Objects.FindId(body).Geometry.crc, 1)
        self.assertEqual(doc.Objects.FindId(body).Attributes.MaterialIndex, 7)
        self.assertEqual(doc.Objects.FindId(decoration).Geometry.crc, 5)
        self.assertEqual(doc.ended, [1])

    def test_rollback_failure_is_reported_not_silently_retried(self):
        doc = Document()
        stage = helper(doc)
        stage.add("one", Brep())
        stage.add("fails", Brep())
        doc.Objects.failure_on_add = 2
        doc.Objects.restore_fails = True
        with self.assertRaisesRegex(RuntimeError, "rollback incomplete"):
            stage.commit()
        with self.assertRaisesRegex(RuntimeError, "only once"):
            stage.commit()

    def test_redraw_failure_does_not_claim_successful_modeling_failed(self):
        doc = Document()
        doc.Views.Redraw = lambda: (_ for _ in ()).throw(RuntimeError("fixture renderer unavailable"))
        stage = helper(doc)
        stage.add("body", Brep())
        receipt = stage.commit()
        self.assertIn("redrawWarning", receipt)
        self.assertEqual(len(doc.Objects.rows), 1)

    def test_invalid_geometry_and_wrong_role_cannot_pass(self):
        for geometry, kind in [(Brep(valid=False), "solid"), (Curve(), "solid"), (Brep(), "curve")]:
            doc = Document()
            stage = helper(doc)
            stage.add("bad", geometry, kind=kind)
            with self.assertRaises(ValueError):
                stage.commit()
            self.assertEqual(doc.Objects.writes, [])


class BakeTests(unittest.TestCase):
    def test_bakes_225_open_meshes_from_all_branches_without_brep_conversion_or_fixed_count(self):
        doc = Document()
        stage = helper(doc)
        meshes = [Mesh() for _ in range(225)]
        tree = Tree([], [Goo(mesh) for mesh in meshes[:100]], [Goo(mesh) for mesh in meshes[100:]])
        result = stage.add_tree("texture", tree)
        self.assertEqual(result["stagedCount"], 225)
        self.assertEqual([b["count"] for b in result["branches"]], [0, 100, 125])
        self.assertEqual(doc.Objects.writes, [])
        self.assertEqual(stage.preview(), {"stagedCount": 225, "kinds": {"mesh": 225}, "documentWrites": False})
        receipt = stage.commit()
        self.assertEqual(receipt["committedCount"], 225)
        self.assertEqual(receipt["parts"][100]["source"], {"path": "{2}", "index": 0})
        self.assertEqual(receipt["parts"][224]["source"], {"path": "{2}", "index": 124})
        self.assertTrue(all(isinstance(obj.Geometry, Mesh) for obj in doc.Objects.rows.values()))
        self.assertTrue(all(not obj.Geometry.IsSolid for obj in doc.Objects.rows.values()))
        self.assertEqual(meshes[0].vertices_data, [0., 0., 1., 1.])
        with self.assertRaisesRegex(RuntimeError, "only once"):
            stage.commit()

    def test_arbitrary_counts_and_duplicate_geometry_are_never_truncated_or_deduplicated(self):
        for count in [1, 2, 17, 225, 376]:
            doc = Document()
            stage = helper(doc)
            mesh = Mesh()
            stage.add_tree("texture", Tree([Goo(mesh)] * count))
            self.assertEqual(stage.commit()["committedCount"], count)
            self.assertEqual(len(doc.Objects.rows), count)

    def test_auto_supports_mixed_native_and_gh_geometry_without_lowering_explicit_solid_rules(self):
        doc = Document()
        stage = helper(doc)
        items = [Goo(Mesh()), Goo(Brep()), Goo(Brep(closed=False)), Goo(Curve()), Goo(Point3d(), name="GH_Point"),
                 Goo(Line(), name="GH_Line"), PointCloud(), SubD(), Extrusion(), Polyline(), Rectangle3d(), Box()]
        stage.add_tree("mixed", Tree(items))
        self.assertEqual(stage.preview()["kinds"], {"mesh": 1, "solid": 3, "surface": 1, "curve": 4, "point": 1, "pointcloud": 1, "subd": 1})
        self.assertEqual(stage.commit()["committedCount"], len(items))

    def test_explicit_solid_mesh_rejects_open_mesh_but_normalizes_private_closed_copy(self):
        doc = Document()
        stage = helper(doc)
        stage.add("must be closed", Mesh(), kind="solid")
        with self.assertRaisesRegex(ValueError, "Open solid"):
            stage.commit()
        self.assertEqual(doc.Objects.writes, [])
        stage = helper(doc)
        mesh = Mesh(closed=True, orientation=-1)
        stage.add("closed mesh", mesh, kind="solid")
        stage.commit()
        self.assertEqual(mesh.orientation, -1)
        self.assertEqual(list(doc.Objects.rows.values())[0].Geometry.orientation, 1)

    def test_bake_preserves_mesh_orientation_when_a_solid_was_not_requested(self):
        doc = Document()
        stage = helper(doc)
        stage.add("source mesh", Mesh(closed=True, orientation=-1))
        stage.commit()
        self.assertEqual(list(doc.Objects.rows.values())[0].Geometry.orientation, -1)

    def test_null_unresolved_or_non_geometry_tree_does_not_silently_skip_items(self):
        for invalid in [None, Goo(Mesh(), valid=False), Goo("225", name="GH_String"), object()]:
            doc = Document()
            stage = helper(doc)
            stage.add("preexisting staged", Curve())
            with self.assertRaisesRegex(ValueError, r"GH bake item \{1\}\[0\]"):
                stage.add_tree("bad", Tree([Goo(Mesh())], [invalid]))
            self.assertEqual(len(stage.parts), 1)
            self.assertEqual(doc.Objects.writes, [])

    def test_invalid_mesh_and_empty_output_do_not_write(self):
        for mesh in [Mesh(valid=False), Mesh(vertices=0), Mesh(faces=0)]:
            doc = Document()
            stage = helper(doc)
            stage.add_tree("invalid", Tree([Goo(mesh)]))
            with self.assertRaises(ValueError):
                stage.commit()
            self.assertEqual(doc.Objects.writes, [])
        stage = helper(Document())
        with self.assertRaisesRegex(ValueError, "contains no geometry"):
            stage.add_tree("empty", Tree([], []))

    def test_limits_and_inconsistent_tree_reject_without_partial_append_or_writes(self):
        for tree in [Tree([Mesh()] * 2001), Tree(*([[]] * 2001))]:
            doc = Document()
            stage = helper(doc)
            with self.assertRaisesRegex(ValueError, "2000"):
                stage.add_tree("too large", tree)
            self.assertEqual(stage.parts, [])
            self.assertEqual(doc.Objects.writes, [])
        stage = helper(Document())
        malformed = Tree([Mesh()])
        malformed.Paths = []
        with self.assertRaisesRegex(ValueError, "inconsistent"):
            stage.add_tree("bad tree", malformed)

    def test_mesh_replacement_preserves_material_id_and_other_geometry(self):
        doc = Document()
        target = doc.Objects.Add(Mesh(), Attributes("texture", 12))
        unrelated = doc.Objects.Add(Brep(), Attributes("original body", 7))
        stage = helper(doc)
        mesh = stage.copy(target)
        mesh.vertices_data[2] = 0.3
        stage.add("edited mesh", mesh, kind="mesh", replace_id=target)
        stage.commit()
        self.assertEqual(doc.Objects.FindId(target).Attributes.MaterialIndex, 12)
        self.assertEqual(doc.Objects.FindId(target).Attributes.Name, "texture")
        self.assertEqual(doc.Objects.FindId(target).Geometry.vertices_data[2], 0.3)
        self.assertEqual(doc.Objects.FindId(unrelated).Attributes.MaterialIndex, 7)

    def test_mesh_bake_failure_rolls_back_own_additions_and_keeps_original_model(self):
        doc = Document()
        body = doc.Objects.Add(Brep(), Attributes())
        doc.Objects.failure_on_add = 4
        stage = helper(doc)
        stage.add_tree("texture", Tree([Goo(Mesh())] * 10))
        with self.assertRaisesRegex(RuntimeError, "tracked helper writes restored"):
            stage.commit()
        self.assertEqual(set(doc.Objects.rows), {body})
        with self.assertRaisesRegex(RuntimeError, "only once"):
            stage.commit()

    def test_planar_caps_or_face_constraints_are_not_applied_to_mesh(self):
        for options in [{"kind": "solid", "cap_planar": True}, {"planar_faces": [0]}]:
            doc = Document()
            stage = helper(doc)
            stage.add("mesh", Mesh(closed=True), **options)
            with self.assertRaises(ValueError):
                stage.commit()
            self.assertEqual(doc.Objects.writes, [])


class SnapshotTests(unittest.TestCase):
    @staticmethod
    def snapshot(doc):
        with contextlib.redirect_stdout(io.StringIO()):
            namespace = execute_program(doc, "src/features/rhino/modeling/document_geometry_snapshot.py")
        return namespace["_id_doc_snapshot"](doc)

    def test_mesh_snapshot_uses_mesh_topology_orientation_and_native_mass_api(self):
        doc = Document()
        doc.Objects.Add(Mesh(), Attributes("open"))
        doc.Objects.Add(Mesh(closed=True), Attributes("solid"))
        before = list(doc.Objects.writes)
        report = self.snapshot(doc)
        self.assertEqual(report["objectCount"], 2)
        open_mesh, solid_mesh = report["objects"]
        self.assertTrue(open_mesh["isMesh"])
        self.assertFalse(open_mesh["isSolid"])
        self.assertEqual(open_mesh["solidOrientation"], "None")
        self.assertIsNone(open_mesh["volume"])
        self.assertEqual(solid_mesh["volume"], 1.)
        self.assertEqual(solid_mesh["solidOrientation"], "Outward")
        self.assertEqual(doc.Objects.writes, before)

    def test_same_bounds_same_counts_mesh_data_change_is_detected_but_attributes_are_not_geometry(self):
        doc = Document()
        target = doc.Objects.Add(Mesh(), Attributes())
        first = self.snapshot(doc)["objects"][0]["fingerprint"]
        doc.Objects.FindId(target).Geometry.crc = 99
        changed = self.snapshot(doc)["objects"][0]["fingerprint"]
        self.assertNotEqual(first, changed)
        doc.Objects.FindId(target).Attributes.MaterialIndex = 8
        self.assertEqual(changed, self.snapshot(doc)["objects"][0]["fingerprint"])


if __name__ == "__main__":
    unittest.main()
