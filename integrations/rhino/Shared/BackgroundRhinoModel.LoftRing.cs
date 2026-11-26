using System.Text.Json.Nodes;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    private static Point3d[] Points(JsonNode? input)
    {
        if (input is not JsonArray points || points.Count is < 3 or > 80)
            throw new ArgumentException("A profile needs 3–80 3D points.");
        return points.Select(Point).ToArray();
    }

    private static Point3d[] SmoothRing(JsonNode? section, Point3d[]? previous)
    {
        var ring = Points(section); // Existing finite XYZ, coordinate and per-ring limits.
        if (ring[0].DistanceTo(ring[^1]) <= Tolerance) ring = ring[..^1];
        if (ring.Length < 4 || (previous != null && previous.Length != ring.Length))
            throw new ArgumentException("Smooth loft sections need matching counts of at least four distinct points.");
        for (int i = 1; i < ring.Length; i++)
            for (int j = 0; j < i; j++)
                if (ring[i].DistanceTo(ring[j]) <= Tolerance) throw new ArgumentException("Smooth loft section points coincide.");
        if (previous == null) return ring;

        // Rhino does not adjust seams/directions for CreateFromLoft. Match all cyclic shifts
        // in both directions to the preceding aligned ring. Centering removes translation;
        // uniform scale does not affect which permutation minimizes squared distance.
        static Point3d Center(Point3d[] p) => new(p.Average(v => v.X), p.Average(v => v.Y), p.Average(v => v.Z));
        var translation = Center(previous) - Center(ring);
        int n = ring.Length, bestStart = 0, bestStep = 1;
        double best = double.PositiveInfinity;
        for (int step = 1; step >= -1; step -= 2)
            for (int start = 0; start < n; start++)
            {
                double score = 0;
                for (int i = 0; i < n; i++)
                    score += previous[i].DistanceToSquared(ring[(start + step * i + n) % n] + translation);
                if (score < best) (best, bestStart, bestStep) = (score, start, step);
            }
        return Enumerable.Range(0, n).Select(i => ring[(bestStart + bestStep * i + n) % n]).ToArray();
    }
}
