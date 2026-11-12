# Inspiration Drawer GH Boolean guard v1. Python 2/3 compatible.
import Rhino as _id_gh_Rhino
import math as _id_gh_math
import json as _id_gh_json
_id_gh_union_reports = []


def _id_gh_metrics(brep):
    box = brep.GetBoundingBox(True)
    mass = _id_gh_Rhino.Geometry.VolumeMassProperties.Compute(brep)
    try:
        if mass is None:
            raise ValueError("Could not compute solid volume")
        volume = float(mass.Volume)
    finally:
        if mass is not None:
            mass.Dispose()
    if _id_gh_math.isnan(volume) or _id_gh_math.isinf(volume) or volume <= 0:
        raise ValueError("Solid must have positive outward volume")
    return {"min": [box.Min.X, box.Min.Y, box.Min.Z], "max": [box.Max.X, box.Max.Y, box.Max.Z], "volume": volume}


def _id_gh_bounds(items):
    return {"min": [min(item["min"][i] for item in items) for i in range(3)], "max": [max(item["max"][i] for item in items) for i in range(3)]}


def _id_gh_assert_union_complete(inputs, outputs, tolerance):
    if not outputs:
        raise ValueError("Boolean union returned no solids")
    before = _id_gh_bounds(inputs)
    after = _id_gh_bounds(outputs)
    # Union must retain the extrema of every operand. A small valid/closed
    # overlap fragment is not a successful union.
    slack = max(tolerance * 5, max(before["max"][i]-before["min"][i] for i in range(3))*0.000001)
    if any(after["min"][i] > before["min"][i]+slack or after["max"][i] < before["max"][i]-slack for i in range(3)):
        raise ValueError("Boolean union lost input extents; rejecting partial fragment")
    if any(after["min"][i] < before["min"][i]-slack or after["max"][i] > before["max"][i]+slack for i in range(3)):
        raise ValueError("Boolean union unexpectedly expanded outside input bounds")
    largest = max(item["volume"] for item in inputs)
    total = sum(item["volume"] for item in inputs)
    actual = sum(item["volume"] for item in outputs)
    diagonal = sum((before["max"][i]-before["min"][i])**2 for i in range(3))**0.5
    volume_slack = max(total * 0.00001, min(largest * 0.02, tolerance * diagonal * diagonal * 2))
    if actual < largest-volume_slack or actual > total+volume_slack:
        raise ValueError("Boolean union volume violates input bounds; rejecting partial fragment")
    return {"inputBounds": before, "outputBounds": after, "inputVolumeSum": total, "largestInputVolume": largest, "outputVolume": actual, "inputCount": len(inputs), "outputCount": len(outputs), "status": "passed", "tolerance": tolerance}


def _id_gh_guarded_union(breps, tolerance, *options):
    tolerance = float(tolerance)
    if _id_gh_math.isnan(tolerance) or _id_gh_math.isinf(tolerance) or tolerance <= 0:
        raise ValueError("Boolean tolerance must be finite and positive")
    owned = []
    results = None
    succeeded = False
    try:
        for index, brep in enumerate(breps):
            if index >= 128:
                raise ValueError("At most 128 Boolean operands per operation")
            if not isinstance(brep, _id_gh_Rhino.Geometry.Brep) or not brep.IsValid or not brep.IsSolid:
                raise ValueError("Boolean union requires valid closed Brep operands")
            copy = brep.DuplicateBrep()
            owned.append(copy)
            copy.Faces.SplitKinkyFaces(_id_gh_Rhino.RhinoMath.DefaultAngleTolerance, True)
            if copy.SolidOrientation == _id_gh_Rhino.Geometry.BrepSolidOrientation.Inward:
                copy.Flip()
            if not copy.IsValid or not copy.IsSolid or copy.SolidOrientation != _id_gh_Rhino.Geometry.BrepSolidOrientation.Outward:
                raise ValueError("Could not prepare outward Boolean operand")
        if not owned:
            raise ValueError("Boolean union needs at least one operand")
        inputs = [_id_gh_metrics(brep) for brep in owned]
        results = _id_gh_Rhino.Geometry.Brep.CreateBooleanUnion(owned, tolerance, *options)
        if not results:
            raise ValueError("Boolean union failed; do not substitute partial geometry")
        for result in results:
            if result.SolidOrientation == _id_gh_Rhino.Geometry.BrepSolidOrientation.Inward:
                result.Flip()
            if not result.IsValid or not result.IsSolid:
                raise ValueError("Boolean union returned invalid or open geometry")
        report = _id_gh_assert_union_complete(inputs, [_id_gh_metrics(result) for result in results], tolerance)
        _id_gh_union_reports.append(report)
        succeeded = True
        return results
    finally:
        for brep in owned:
            brep.Dispose()
        if not succeeded and results:
            for brep in results:
                brep.Dispose()


def _id_gh_final_report(namespace, output_names):
    breps = []
    def collect(value, depth=0):
        if depth > 8:
            raise ValueError("Geometry output nesting is too deep")
        if isinstance(value, _id_gh_Rhino.Geometry.Brep):
            breps.append(value)
        elif isinstance(value, (list, tuple)):
            for child in value:
                collect(child, depth+1)
    for name in output_names:
        collect(namespace.get(name))
    if len(breps) > 512:
        raise ValueError("Too many output solids")
    metrics = []
    for brep in breps:
        if not brep.IsValid or not brep.IsSolid:
            raise ValueError("Final Brep output must be valid and closed")
        if brep.SolidOrientation == _id_gh_Rhino.Geometry.BrepSolidOrientation.Inward:
            brep.Flip()
        metrics.append(_id_gh_metrics(brep))
    if _id_gh_union_reports and metrics:
        # Detect selecting only one fragment after a multi-result final union.
        expected = _id_gh_union_reports[-1]["outputBounds"]
        actual = _id_gh_bounds(metrics)
        slack=max(5*_id_gh_union_reports[-1]["tolerance"],max(expected["max"][i]-expected["min"][i] for i in range(3))*0.000001)
        if any(actual["min"][i] > expected["min"][i]+slack or actual["max"][i] < expected["max"][i]-slack for i in range(3)):
            raise ValueError("Final output drops part of the last Boolean union")
    report = {"version":1,"status":"passed" if metrics else "no_solid_output", "solidCount":len(metrics), "bounds":_id_gh_bounds(metrics) if metrics else None, "volume":sum(item["volume"] for item in metrics), "unionChecks":_id_gh_union_reports}
    print("INSPIRATION_GH_GEOMETRY_V1:"+_id_gh_json.dumps(report, ensure_ascii=True))
    return report
