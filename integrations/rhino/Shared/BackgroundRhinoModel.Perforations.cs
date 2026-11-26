using System.Text.Json.Nodes;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    // Only the opt-in branch. Legacy extrude keeps its own profile closing and oblique vector semantics.
    private static Brep ExtrudePerforations(JsonObject input)
    {
        var points = Points(input["points"]);
        if (points[0] == points[^1]) points = points[..^1];
        if (points.Length < 3) throw new ArgumentException("Perforated extrude needs three distinct outer vertices.");
        var origin = points[0]; var direction = Vector(input["vector"]); var n = direction;
        if (direction.Length <= Tolerance || !n.Unitize()) throw new ArgumentException("Perforated extrude needs nonzero thickness above tolerance.");
        var u = points[1] - origin;
        u -= (u * n) * n;
        if (u.Length <= Tolerance || !u.Unitize()) throw new ArgumentException("Cannot define U from the first outer edge.");
        var v = Vector3d.CrossProduct(n, u);
        var ring = points.Select(p => {
            var d = p - origin;
            // Do not flatten an oblique or nonplanar section to make it pass.
            if (Math.Abs(d * n) > 1e-8) throw new ArgumentException("Perforated extrude needs a planar polygon perpendicular to vector (1e-8 mm).");
            return new PlateUV(d * u, d * v);
        }).ToArray();
        var layout = PerforationLayout.Create(input["perforations"], ring, Tolerance);
        if (layout.ReverseOuter) Array.Reverse(ring);
        using var outer = new PolylineCurve(ring.Append(ring[0]).Select(p => new Point3d(p.U, p.V, 0)));
        using var extrusion = new Extrusion();
        if (!outer.IsValid || !outer.IsClosed || !extrusion.SetPathAndUp(origin, origin + direction, v) || !extrusion.SetOuterProfile(outer, true))
            throw new ArgumentException("Could not set the closed exterior of the perforated plate.");
        for (int i = 0; i < layout.Centers.Length; i++)
        {
            var c = layout.Centers[i];
            var xy = new Plane(new Point3d(c.U, c.V, 0), Vector3d.XAxis, -Vector3d.YAxis); // clockwise inner loop
            using var hole = new Ellipse(xy, layout.Radii.U, layout.Radii.V).ToNurbsCurve();
            if (hole == null || !hole.IsValid || !hole.IsClosed || !extrusion.AddInnerProfile(hole))
                throw new ArgumentException($"Could not add closed elliptical profile {i}.");
        }
        int holes = layout.Centers.Length;
        if (extrusion.ProfileCount != holes + 1 || extrusion.CapCount != 2 || !extrusion.IsValid)
            throw new ArgumentException("Extrusion lost profiles or could not be capped.");
        var solid = extrusion.ToBrep(true) ?? throw new ArgumentException("Could not form the perforated Brep.");
        try
        {
            if (!solid.IsValid || !solid.IsSolid || !solid.IsManifold || solid.Faces.Count < 3)
                throw new ArgumentException("Perforated plate did not form a valid closed manifold solid.");
            // Extrusion.ToBrep places the caps last. Check actual trimmed topology on BOTH ends,
            // not merely profile counts / net volume or the presence of separate cutter objects.
            for (int i = solid.Faces.Count - 2; i < solid.Faces.Count; i++)
            {
                var cap = solid.Faces[i];
                if (!cap.IsPlanar(Tolerance) || cap.Loops.Count != holes + 1 ||
                    cap.Loops.Count(l => l.LoopType == BrepLoopType.Outer) != 1 ||
                    cap.Loops.Count(l => l.LoopType == BrepLoopType.Inner) != holes)
                    throw new ArgumentException($"Cap lacks the requested {holes} inner loops; no plate accepted.");
            }
            return solid;
        }
        catch { solid.Dispose(); throw; }
    }
}

// Pure UV preflight; no Rhino objects, document writes, clipping or dropped holes.
internal readonly record struct PlateUV(double U, double V)
{
    public static PlateUV operator -(PlateUV a, PlateUV b) => new(a.U - b.U, a.V - b.V);
    public double Dot(PlateUV b) => U * b.U + V * b.V;
    public double Cross(PlateUV b) => U * b.V - V * b.U;
}

internal sealed record PerforationLayout(PlateUV Radii, PlateUV[] Centers, bool ReverseOuter)
{
    private static double Number(JsonNode? node, string label, double min = -100_000)
    {
        if (node is not JsonValue ||
            !double.TryParse(node.ToJsonString(), System.Globalization.NumberStyles.Float,
                System.Globalization.CultureInfo.InvariantCulture, out var n) || !double.IsFinite(n) || n < min || n > 100_000)
            throw new ArgumentException($"perforations.{label}: expected a finite number between {min} and 100000.");
        return n;
    }

    private static int Count(JsonObject obj, string key)
    {
        var n = Number(obj[key], key, 1);
        return n <= 800 && n == (int)n ? (int)n : throw new ArgumentException($"perforations.{key}: expected integer 1..800.");
    }

    private static PlateUV Pair(JsonObject obj, string key, double min)
    {
        if (obj[key] is not JsonArray { Count: 2 } a) throw new ArgumentException($"perforations.{key}: expected [u,v].");
        return new(Number(a[0], key, min), Number(a[1], key, min));
    }

    // Squared distance from origin to the closed segment [a,b]. Also used in ellipse-scaled space.
    private static double ToSegment2(PlateUV a, PlateUV b)
    {
        var edge = b - a;
        var dd = edge.Dot(edge);
        var t = dd == 0 ? 0 : Math.Clamp(-a.Dot(edge) / dd, 0, 1);
        var u = a.U + t * edge.U;
        var v = a.V + t * edge.V;
        return u * u + v * v;
    }

    private static double CheckRing(PlateUV[] ring, double tol)
    {
        if (ring.Length is < 3 or > 80 || ring.Any(p => !double.IsFinite(p.U) || !double.IsFinite(p.V)))
            throw new ArgumentException("Perforated extrude requires a finite simple polygon (3..80 vertices).");
        double area2 = 0, tol2 = tol * tol;
        for (int i = 0, n = ring.Length; i < n; i++)
        {
            var a = ring[i]; var b = ring[(i + 1) % n]; var prev = ring[(i + n - 1) % n];
            var edge = b - a;
            if (edge.Dot(edge) <= tol2 || ToSegment2(prev - b, a - b) <= tol2 || ToSegment2(b - prev, a - prev) <= tol2)
                throw new ArgumentException($"Invalid outer edge/corner at vertex {i} (short or backtracking).");
            area2 += a.Cross(b);
            for (int j = i + 2; j < n; j++)
            {
                if (i == 0 && j == n - 1) continue; // adjacent across the closing seam
                var c = ring[j]; var d = ring[(j + 1) % n]; var other = d - c;
                bool crosses = Math.Sign(edge.Cross(c-a)) * Math.Sign(edge.Cross(d-a)) < 0 &&
                               Math.Sign(other.Cross(a-c)) * Math.Sign(other.Cross(b-c)) < 0;
                if (crosses || ToSegment2(a-c,b-c) <= tol2 || ToSegment2(a-d,b-d) <= tol2 ||
                    ToSegment2(c-a,d-a) <= tol2 || ToSegment2(c-b,d-b) <= tol2)
                    throw new ArgumentException($"Outer edges {i} and {j} touch, cross or lack clearance.");
            }
        }
        if (Math.Abs(area2) <= 2 * tol2) throw new ArgumentException("Degenerate outer profile area.");
        return area2;
    }

    internal static PerforationLayout Create(JsonNode? config, PlateUV[] ring, double tol)
    {
        if (config is not JsonObject obj || obj.Any(x => x.Key is not ("rows" or "columns" or "firstCenter" or "pitch" or "radii" or "oddRowOffset")))
            throw new ArgumentException("perforations requires an object with only rows, columns, firstCenter, pitch, radii, optional oddRowOffset.");
        int rows = Count(obj, "rows"), cols = Count(obj, "columns");
        if (rows * cols > 800) throw new ArgumentException("perforations.rows * columns exceeds 800.");
        var start = Pair(obj, "firstCenter", -100_000); var pitch = Pair(obj, "pitch", 0.05); var radii = Pair(obj, "radii", 0.05);
        double offset = obj.ContainsKey("oddRowOffset") ? Number(obj["oddRowOffset"], "oddRowOffset") : 0;
        double area2 = CheckRing(ring, tol);
        // In this affine frame all ellipses are unit circles. Expanding the thresholds by
        // tol / minRadius conservatively guarantees model-space webs > model tolerance.
        PlateUV Scale(PlateUV p) => new(p.U / radii.U, p.V / radii.V);
        double pad = tol / Math.Min(radii.U, radii.V), edgeLimit2 = Math.Pow(1 + pad, 2), pairLimit2 = Math.Pow(2 + pad, 2);
        var centers = new List<PlateUV>(rows * cols);
        for (int row = 0; row < rows; row++)
        for (int col = 0; col < cols; col++)
        {
            var p = new PlateUV(start.U + col * pitch.U + (row % 2) * offset, start.V + row * pitch.V);
            bool inside = false;
            for (int i = 0; i < ring.Length; i++)
            {
                var a = ring[i] - p; var b = ring[(i + 1) % ring.Length] - p;
                if (ToSegment2(Scale(a), Scale(b)) <= edgeLimit2)
                    throw new ArgumentException($"Hole [{row},{col}] touches/crosses or is too close to outer edge {i}.");
                if ((a.V > 0) != (b.V > 0) && a.U + (b.U-a.U) * (-a.V / (b.V-a.V)) > 0) inside = !inside;
            }
            if (!inside) throw new ArgumentException($"Hole [{row},{col}] is outside the outer profile.");
            for (int j = 0; j < centers.Count; j++)
            {
                var d = Scale(p - centers[j]);
                if (d.Dot(d) <= pairLimit2) throw new ArgumentException($"Holes [{row},{col}] and [{j/cols},{j%cols}] intersect or lack clearance.");
            }
            centers.Add(p);
        }
        return new(radii, centers.ToArray(), area2 < 0);
    }
}
