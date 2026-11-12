# coding: utf-8
# Controlled geometry program, never arbitrary model-generated code. No document
# writes until every profile and every solid passes native RhinoCommon checks.
import Rhino
import System
import json
import math
from Rhino.Geometry import Point3d, Vector3d, Plane, Curve, PolylineCurve, Circle, Brep, Transform, RegionContainment
from Rhino.Geometry.Intersect import Intersection

_ID_PROFILE_MARKER = "INSPIRATION_PROFILE_SOLIDS_V1:"
try:
    _id_strings = (basestring,)
except NameError:
    _id_strings = (str,)


def _id_number(value, label):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or math.isnan(value) or math.isinf(value) or abs(value) > 10000000:
        raise ValueError(label + " must be a finite bounded number")
    return float(value)


def _id_vector(value, label, size):
    if not isinstance(value, list) or len(value) != size:
        raise ValueError(label + " must have " + str(size) + " coordinates")
    return [_id_number(item, label) for item in value]


def _id_curve(spec, scale, tolerance, owned):
    if not isinstance(spec, dict):
        raise ValueError("A loop must be an object")
    kind = spec.get("kind")
    if kind == "circle":
        if set(spec) - set(["kind", "center", "radius"]):
            raise ValueError("Unsupported circle property")
        center = _id_vector(spec.get("center"), "center", 2)
        radius = _id_number(spec.get("radius"), "radius") * scale
        if radius <= tolerance:
            raise ValueError("Circle radius must exceed document tolerance")
        curve = Circle(Plane(Point3d(center[0]*scale, center[1]*scale, 0), Vector3d.ZAxis), radius).ToNurbsCurve()
    elif kind == "polygon":
        if set(spec) - set(["kind", "points", "filletRadius"]):
            raise ValueError("Unsupported polygon property")
        points = spec.get("points")
        if not isinstance(points, list) or not 3 <= len(points) <= 128:
            raise ValueError("Polygon needs 3 to 128 points")
        coords = [_id_vector(item, "polygon point", 2) for item in points]
        pts = [Point3d(item[0]*scale, item[1]*scale, 0) for item in coords]
        if pts[0].DistanceTo(pts[-1]) > tolerance:
            pts.append(pts[0])
        if any(pts[i].DistanceTo(pts[i+1]) <= tolerance for i in range(len(pts)-1)):
            raise ValueError("Repeated or near-duplicate polygon vertices")
        curve = PolylineCurve(pts)
        owned.append(curve)
        radius = _id_number(spec.get("filletRadius", 0), "filletRadius") * scale
        if radius < 0:
            raise ValueError("filletRadius must not be negative")
        if radius > 0:
            rounded = Curve.CreateFilletCornersCurve(curve, radius, tolerance, 0.01)
            if rounded is None:
                raise ValueError("Requested corner fillet failed; choose an explicit smaller radius or zero")
            curve = rounded
    else:
        raise ValueError("Loop kind must be polygon or circle")
    owned.append(curve)
    if not curve.IsValid or not curve.IsClosed or not curve.IsPlanar(tolerance):
        raise ValueError("Loop must be valid, closed and planar")
    crossings = Intersection.CurveSelf(curve, tolerance)
    if crossings is not None and crossings.Count > 0:
        raise ValueError("Loop self-intersects")
    return curve


def _id_gap(a, b):
    result = a.ClosestPoints(b)
    if not result[0]:
        raise ValueError("Could not verify minimum loop separation")
    return result[1].DistanceTo(result[2])


def _id_profiles_build(plan, doc):
    owned = []
    solids = []
    added = []
    writing = False
    undo = 0
    try:
        if not isinstance(plan, dict) or set(plan) - set(["mode", "units", "parts"]):
            raise ValueError("Unsupported plan property")
        mode = plan.get("mode")
        if mode not in ("validate", "commit"):
            raise ValueError("mode must be validate or commit")
        units = plan.get("units")
        if units == "millimeters":
            if str(doc.ModelUnitSystem) in ("None", "Unset", "CustomUnits"):
                raise ValueError("Document units must be explicit before millimeter modeling")
            scale = Rhino.RhinoMath.UnitScale(Rhino.UnitSystem.Millimeters, doc.ModelUnitSystem)
        elif units == "document":
            scale = 1.0
        else:
            raise ValueError("units must be millimeters or document")
        tolerance = doc.ModelAbsoluteTolerance
        if math.isnan(scale) or math.isinf(scale):
            raise ValueError("Invalid document unit conversion")
        if scale <= 0 or tolerance <= 0:
            raise ValueError("Invalid scale or document tolerance")
        parts = plan.get("parts")
        if not isinstance(parts, list) or not 1 <= len(parts) <= 12:
            raise ValueError("Plan needs 1 to 12 parts")
        issues = []
        def issue(code, name, hole, message, extra=None):
            value = {"code": code, "part": name, "holeIndex": hole, "message": message}
            if extra:
                value.update(extra)
            issues.append(value)
        for index, part in enumerate(parts):
            name = "part_" + str(index+1)
            start_issues = len(issues)
            try:
                if not isinstance(part, dict) or set(part) - set(["name", "origin", "xAxis", "yAxis", "outer", "holes", "thickness", "minWall"]):
                    raise ValueError("Unsupported part property")
                name = part.get("name", name)
                if not isinstance(name, _id_strings) or not 1 <= len(name) <= 120:
                    raise ValueError("Part name needs 1 to 120 characters")
                origin = _id_vector(part.get("origin", [0, 0, 0]), "origin", 3)
                x = Vector3d(*_id_vector(part.get("xAxis", [1, 0, 0]), "xAxis", 3))
                y = Vector3d(*_id_vector(part.get("yAxis", [0, 1, 0]), "yAxis", 3))
                if not x.Unitize() or not y.Unitize() or abs(x*y) > 0.000001:
                    raise ValueError("Axes must be nonzero and perpendicular")
                plane = Plane(Point3d(*[item*scale for item in origin]), x, y)
                if not plane.IsValid:
                    raise ValueError("Invalid part plane")
                thickness = _id_number(part.get("thickness"), "thickness") * scale
                wall = _id_number(part.get("minWall", 0), "minWall") * scale
                if thickness <= tolerance * 2 or wall < 0:
                    raise ValueError("Thickness must exceed twice document tolerance; minWall must be nonnegative")
                clearance = max(wall, tolerance * 2)
                outer = _id_curve(part.get("outer"), scale, tolerance, owned)
                hole_specs = part.get("holes", [])
                if not isinstance(hole_specs, list) or len(hole_specs) > 64:
                    raise ValueError("At most 64 holes per part")
                holes = []
                for hi, spec in enumerate(hole_specs):
                    try:
                        hole = _id_curve(spec, scale, tolerance, owned)
                        holes.append((hi, hole))
                        relationship = Curve.PlanarClosedCurveRelationship(outer, hole, Plane.WorldXY, tolerance)
                        if relationship != RegionContainment.BInsideA:
                            extra = {"relationship": str(relationship)}
                            if spec.get("kind") == "circle":
                                center = _id_vector(spec.get("center"), "center", 2)
                                point = Point3d(center[0]*scale, center[1]*scale, 0)
                                closest = outer.ClosestPoint(point)
                                if closest[0]:
                                    extra["centerToBoundary"] = outer.PointAt(closest[1]).DistanceTo(point) / scale
                                    extra["maxRadiusAtThisCenter"] = max(0, extra["centerToBoundary"] - clearance / scale)
                                extra["requestedRadius"] = spec.get("radius")
                            issue("hole_outside_or_crossing", name, hi, "Hole must be strictly inside the outer loop; move it inward or explicitly revise its dimensions. No automatic shrinking/removal.", extra)
                        elif _id_gap(outer, hole) + tolerance < clearance:
                            issue("wall_too_thin", name, hi, "Hole-to-boundary clearance is smaller than minWall", {"requiredClearance": clearance/scale, "actualClearance": _id_gap(outer, hole)/scale})
                    except Exception as error:
                        issue("invalid_hole", name, hi, str(error))
                for ai in range(len(holes)):
                    for bi in range(ai+1, len(holes)):
                        ha, a = holes[ai]
                        hb, b = holes[bi]
                        relationship = Curve.PlanarClosedCurveRelationship(a, b, Plane.WorldXY, tolerance)
                        if relationship != RegionContainment.Disjoint:
                            issue("holes_overlap_or_nested", name, hb, "Holes must not intersect, touch or nest", {"otherHoleIndex": ha, "relationship": str(relationship)})
                        elif _id_gap(a, b) + tolerance < clearance:
                            issue("hole_web_too_thin", name, hb, "Gap between holes is smaller than minWall", {"otherHoleIndex": ha, "requiredClearance": clearance/scale, "actualClearance": _id_gap(a,b)/scale})
                if len(issues) != start_issues:
                    continue
                faces = Brep.CreatePlanarBreps([outer] + [item[1] for item in holes], tolerance)
                if faces:
                    owned.extend(list(faces))
                if not faces or len(faces) != 1:
                    issue("planar_region_count", name, None, "Expected one planar region after validated loops", {"actualRegionCount": len(faces) if faces else 0})
                    continue
                solid = Brep.CreateFromOffsetFace(faces[0].Faces[0], thickness, tolerance, False, True)
                if solid is not None:
                    owned.append(solid)
                if solid is None or not solid.IsValid or not solid.IsSolid:
                    issue("solid_invalid", name, None, "Extrusion/offset did not produce a valid closed solid")
                    continue
                if solid.SolidOrientation == Rhino.Geometry.BrepSolidOrientation.Inward:
                    solid.Flip()
                if not solid.Transform(Transform.PlaneToPlane(Plane.WorldXY, plane)) or not solid.IsValid or not solid.IsSolid:
                    issue("solid_transform_failed", name, None, "Part placement failed validation")
                    continue
                solids.append((name, solid))
            except Exception as error:
                issue("invalid_part", name, None, str(error))
        if issues:
            return {"version": 1, "status": "rejected", "stage": "preflight", "documentChanged": False, "issues": issues[:64], "issueCount": len(issues), "instruction": "Correct the actual reported geometry conflicts within the bounded repair budget. Crossing boundaries require boundary edits, not only a lower minWall. Keep the intended holes and dimensions unless explicitly revised; do not silently omit holes. No objects/layers/materials have been written."}
        if len(solids) != len(parts):
            raise ValueError("Not every requested part produced a verified solid")
        if mode == "validate":
            return {"version": 1, "status": "validated", "stage": "preflight", "documentChanged": False, "partCount": len(solids), "units": units, "valid": True, "solid": True}
        # Only additive object writes are permitted. No layers, materials, existing
        # geometry, selection, camera, units or GH graphs are modified.
        undo = doc.BeginUndoRecord("Inspiration Drawer validated profile solids")
        for name, solid in solids:
            attr = Rhino.DocObjects.ObjectAttributes()
            attr.Name = name
            attr.SetUserString("InspirationDrawer", "validated-profile-solids-v1")
            writing = True
            gid = doc.Objects.AddBrep(solid, attr)
            if gid == System.Guid.Empty:
                raise RuntimeError("Adding validated solid failed")
            added.append(gid)
        doc.Views.Redraw()
        return {"version": 1, "status": "committed", "stage": "commit", "documentChanged": True, "objectIds": [str(gid) for gid in added], "partNames": [item[0] for item in solids], "partCount": len(solids), "units": units, "valid": True, "solid": True}
    except Exception as error:
        if writing:
            rollback = True
            for gid in added:
                try:
                    if not doc.Objects.Delete(gid, True):
                        rollback = False
                except Exception:
                    rollback = False
            # A commit-stage error is terminal even when cleanup seems successful.
            # Do not retry automatically or infer the state of a failed AddBrep.
            return {"version": 1, "status": "commit_failed", "stage": "commit", "documentChanged": True, "rollbackAttempted": True, "knownAddedObjectsRemoved": rollback, "error": str(error), "instruction": "Stop and inspect the document; never automatically replay this commit."}
        return {"version": 1, "status": "rejected", "stage": "preflight", "documentChanged": False, "issues": [{"code": "invalid_plan", "message": str(error)}]}
    finally:
        if undo:
            doc.EndUndoRecord(undo)
        seen = set()
        for item in owned:
            if id(item) not in seen:
                seen.add(id(item))
                item.Dispose()
