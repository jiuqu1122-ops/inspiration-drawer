"""Deterministic fake-Rhino transaction tests, not a substitute for native geometry QA."""
import copy
import pathlib
import sys
import types
import unittest


class Guid(str):
    Empty = "00000000-0000-0000-0000-000000000000"


class Attributes:
    def __init__(self, name="", material=4):
        self.Name, self.MaterialIndex = name, material

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

    def Duplicate(self):
        return copy.deepcopy(self)

    def GetBoundingBox(self, accurate):
        return types.SimpleNamespace(IsValid=True, Min=types.SimpleNamespace(X=0, Y=0, Z=0), Max=types.SimpleNamespace(X=1, Y=1, Z=1))

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


class Objects:
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
        self.rows[oid] = types.SimpleNamespace(Id=oid, Geometry=geometry.Duplicate(), Attributes=attributes.Duplicate(), IsDeleted=False)
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
    ModelAbsoluteTolerance = 0.01

    def __init__(self):
        self.Objects = Objects()
        self.Views = types.SimpleNamespace(Redraw=lambda: None)
        self.ended = []

    def BeginUndoRecord(self, name):
        return 1

    def EndUndoRecord(self, undo):
        self.ended.append(undo)


def helper(doc, other_doc=None):
    rg = types.ModuleType("Rhino.Geometry")
    for cls in (Brep, Surface, Extrusion, Curve):
        setattr(rg, cls.__name__, cls)
    rg.BrepSolidOrientation = types.SimpleNamespace(Inward="Inward", Outward="Outward")
    rg.VolumeMassProperties = types.SimpleNamespace(Compute=lambda geometry: types.SimpleNamespace(Volume=1.0, Dispose=lambda: None))
    rhino = types.ModuleType("Rhino")
    rhino.Geometry = rg
    rhino.DocObjects = types.ModuleType("Rhino.DocObjects")
    rhino.DocObjects.ObjectAttributes = Attributes
    system = types.ModuleType("System")
    system.Guid = Guid
    context = types.ModuleType("scriptcontext")
    context.doc = other_doc or doc
    modules = {"Rhino": rhino, "Rhino.Geometry": rg, "Rhino.DocObjects": rhino.DocObjects, "System": system, "scriptcontext": context}
    previous = {name: sys.modules.get(name) for name in modules}
    namespace = {"__rhino_doc__": doc}
    try:
        sys.modules.update(modules)
        source = pathlib.Path(__file__).parents[2] / "src/features/rhino/rhinoGeometryStage.py"
        exec(compile(source.read_text(encoding="utf-8"), str(source), "exec"), namespace)
    finally:
        for name, value in previous.items():
            if value is None:
                sys.modules.pop(name, None)
            else:
                sys.modules[name] = value
    return namespace["DrawerGeometryStage"]()


class StageTests(unittest.TestCase):
    def test_open_required_solid_rejects_entire_assembly_before_any_write(self):
        doc = Document()
        stage = helper(doc)
        stage.add("main body", Brep())
        stage.add("ornament", Brep(closed=False))
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
            stage.add("body", original, cap_planar=cap)
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


if __name__ == "__main__":
    unittest.main()
