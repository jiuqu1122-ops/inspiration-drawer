using System.Text.Json.Nodes;
using Rhino.Geometry;
using Rhino.Geometry.Intersect;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    private static Brep[] Loft(JsonObject input)
    {
        if (input["sections"] is not JsonArray sections || sections.Count is < 2 or > 12)
            throw new ArgumentException("Loft needs 2–12 ordered corresponding profiles.");
        var mode = input.ContainsKey("profileCurve") ? input["profileCurve"]?.GetValue<string>() : "polyline";
        if (mode is not ("polyline" or "smooth")) throw new ArgumentException("profileCurve must be polyline or smooth.");
        var profiles = new List<Curve>();
        var capped = new List<Brep>();
        try
        {
            Point3d[]? previous = null;
            foreach (var section in sections)
            {
                if (mode == "polyline") profiles.Add(Profile(section));
                else
                {
                    var ring = SmoothRing(section, previous);
                    profiles.Add(SmoothProfile(ring));
                    previous = ring;
                }
            }
            var lofts = Brep.CreateFromLoft(profiles, Point3d.Unset, Point3d.Unset, LoftType.Normal, false) ?? [];
            try
            {
                if (mode == "smooth" && lofts.Length != 1) throw new ArgumentException("Smooth profiles did not loft to one shell.");
                foreach (var loft in lofts)
                    capped.Add(loft.CapPlanarHoles(Tolerance) ?? throw new ArgumentException("Could not cap the loft."));
                return capped.ToArray(); // Build owns these; it checks validity, closure, orientation and volume.
            }
            finally { foreach (var loft in lofts) loft.Dispose(); }
        }
        catch { foreach (var solid in capped) solid.Dispose(); throw; }
        finally { foreach (var profile in profiles) profile.Dispose(); }
    }

    private static Curve SmoothProfile(Point3d[] ring)
    {
        // Uniform periodic knots keep corresponding samples at corresponding parameters on each ring.
        var curve = Curve.CreateInterpolatedCurve([..ring, ring[0]], 3, CurveKnotStyle.UniformPeriodic)
            ?? throw new ArgumentException("Could not interpolate the smooth loft section.");
        try
        {
            if (curve is not NurbsCurve || !curve.IsValid || !curve.IsPeriodic || !curve.IsClosed || !curve.IsPlanar(Tolerance))
                throw new ArgumentException("Smooth loft sections must interpolate to valid planar, closed periodic NURBS.");
            using var crossings = Intersection.CurveSelf(curve, Tolerance);
            if (crossings == null || crossings.Count != 0) throw new ArgumentException("Smooth loft section is not a simple closed curve.");
            return curve;
        }
        catch { curve.Dispose(); throw; }
    }
}
