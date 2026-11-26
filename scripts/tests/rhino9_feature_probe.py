"""Callable native fixture for a separately authorized isolated Rhino 9 host (not auto-run).
Pass the production helper loaded with __rhino_doc__ bound to the same fresh headless doc.
This fixture does not launch/exit Rhino, open/save files or read the active document.
"""
from __future__ import print_function
import json


def run(doc, DrawerGeometryStage, DrawerFeatureAcceptanceError):
    import Rhino
    import Rhino.Geometry as rg
    assert DrawerGeometryStage().doc.RuntimeSerialNumber == doc.RuntimeSerialNumber
    assert Rhino.RhinoApp.Version.Major == 9 and doc.IsHeadless and doc.Objects.Count == 0 and not doc.Path
    doc.ModelAbsoluteTolerance = 0.01
    doc.ModelUnitSystem = Rhino.UnitSystem.Millimeters
    pt = rg.Point3d
    solid = rg.Cylinder(rg.Circle(pt.Origin, 10), 20).ToBrep(True, True)
    def box(x0, y0, z0, x1, y1, z1):
        return rg.Brep.CreateFromBox(rg.BoundingBox(pt(x0, y0, z0), pt(x1, y1, z1)))
    def cut(cutter):
        result = rg.Brep.CreateBooleanDifference(solid, cutter, doc.ModelAbsoluteTolerance)
        assert result is not None and len(result) == 1 and result[0].IsValid
        return result[0]
    def station(z):
        return dict(point=[0, 10, z], inward=[0, -1, 0], across=[1, 0, 0],
                    flankDistance=2.5, minDepth=1.9, maxDepth=2.1)
    plan = [station(7), station(9)]
    host = doc.Objects.AddBrep(solid)
    cap = doc.Objects.AddBrep(box(20, 1, 1, 21, 2, 2))
    recessed = cut(box(-1, 8, 5, 1, 12, 11))
    wrong = cut(box(-1, 8, 13, 1, 12, 19))
    patch = box(-1, 9.9, 5, 1, 10.1, 11)

    def inventory():
        return sorted((str(o.Id), int(o.RuntimeSerialNumber), o.Geometry.DataCRC(0))
                      for o in doc.Objects.GetObjectList(Rhino.DocObjects.ObjectType.AnyObject))
    def staged(candidate, target=host, samples=plan, source=host):
        s = DrawerGeometryStage()
        s.require_groove("body", samples, source_id=source)
        s.require_preserved(cap)
        s.add("body", candidate, kind="solid", replace_id=target)
        return s
    def preview(s):
        state = inventory()
        r = s.preview()
        assert not r["documentWrites"] and state == inventory()
        a = r["featureAcceptance"]
        assert a["schema"] == "drawer.featureAcceptance.v1" and a["phase"] == "preview"
        return json.loads(json.dumps(a, allow_nan=False))
    def reject(name, s, reason, check_index=0):
        a = preview(s)
        assert not a["passed"] and reason in a["checks"][check_index]["reason"], (name, a)
        state = inventory()
        try:
            s.commit()
        except DrawerFeatureAcceptanceError as error:
            a = error.receipt
            assert a["phase"] == "precommit" and not a["passed"] and reason in a["checks"][check_index]["reason"], a
        else:
            raise AssertionError("False acceptance: " + name)
        assert inventory() == state, name
        print("PASS reject", name, a["checks"][check_index]["reason"])
        return a

    # Decorative geometry is on a sibling, not evidence from the mother object.
    s = staged(solid)
    s.add("thin applique", patch)
    reject("applique", s, "volume uncertainty")
    a = reject("cut at wrong station", staged(wrong), "declared depth")
    assert a["checks"][0]["removedVolume"] > 0 and abs(a["checks"][0]["samples"][0]["center"]["frontDelta"]) < 0.01
    moved = solid.DuplicateBrep()
    moved.Translate(1, 2, 3)
    reject("rigid translation", staged(moved), "volume uncertainty")
    shifted = recessed.DuplicateBrep()
    shifted.Translate(0, -1, 0)
    reject("cut plus moved body", staged(shifted), "opposite wall")
    reject("untrimmed flanks required", staged(cut(box(-4, 8, 5, 4, 12, 11))), "flank surface")
    reject("through cut", staged(cut(box(-1, -12, 5, 1, 12, 11))), "crossings")
    a = reject("one station is not the whole plan", staged(recessed, samples=[station(7), station(15)]), "Sample 1")
    assert [row["passed"] for row in a["checks"][0]["samples"]] == [True, False]
    reject("other mother", staged(recessed, target=cap), "not bound")
    s = staged(recessed)
    s.add("body", recessed)
    reject("ambiguous name", s, "exactly one")
    s = staged(recessed)
    s.add("other claim", wrong, replace_id=host)
    reject("ambiguous host", s, "Ambiguous")
    s = staged(recessed)
    s.add("same looking replacement", doc.Objects.FindId(cap).Geometry, replace_id=cap)
    reject("protected geometry targeted", s, "protected object", 1)

    s = DrawerGeometryStage()
    base = solid.DuplicateBrep()
    s.require_groove("new body", plan, baseline=base)
    base.Translate(100, 0, 0)  # registration froze a private copy
    s.add("new body", recessed)
    a = preview(s)
    assert a["passed"], a
    r = s.commit()
    assert r["featureAcceptance"]["passed"] and r["parts"][0]["replaced"] is False
    print("PASS add-only private baseline")

    s = staged(recessed)
    assert preview(s)["passed"]
    assert doc.Objects.Delete(cap, True)  # simulated external deletion, in the headless fixture only
    replacement = doc.Objects.AddBrep(box(20, 1, 1, 21, 2, 2))
    assert replacement != cap
    reject("deleted independent piece, identical sibling present", s, "no longer exists", 1)
    cap = replacement
    s = staged(recessed)
    assert preview(s)["passed"]
    assert doc.Objects.Replace(cap, box(20, 1, 1, 21, 2, 3))
    reject("same GUID, edited independent geometry", s, "changed", 1)
    original_cap = doc.Objects.FindId(cap).Geometry.Duplicate()
    s = staged(recessed)
    a = preview(s)
    assert a["passed"], a
    rows = a["checks"][0]["samples"]
    assert all(abs(row["center"]["frontDelta"] - 2) < 0.01 for row in rows)
    r = s.commit()
    a = r["featureAcceptance"]
    assert a["passed"] and a["phase"] == "precommit" and a["checks"][0]["samples"] == rows
    assert r["committedCount"] == 1 and r["parts"][0]["id"] == str(host) and not r["photoFidelityVerified"]
    assert rg.GeometryBase.GeometryEquals(doc.Objects.FindId(host).Geometry, recessed)
    assert rg.GeometryBase.GeometryEquals(doc.Objects.FindId(cap).Geometry, original_cap)
    print("PASS curved mother", json.dumps(a, allow_nan=False))
    return a
