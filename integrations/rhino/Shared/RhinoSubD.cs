using System.Text.Json.Nodes;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static class RhinoSubD
{
    private const int MaxCageVertices = 384;
    private const int MaxCageFaces = 512;
    private const int MaxCreaseEdges = 128;

    internal static object InspectCage(RhinoObject item, string units)
    {
        if (item.Geometry is not SubD subd) throw new ArgumentException("Inspect needs an existing SubD object ID.");
        var vertices = new List<object>(subd.Vertices.Count);
        for (var vertex = subd.Vertices.First; vertex != null; vertex = vertex.Next)
            vertices.Add(new { id = vertex.Id, point = Coordinates(vertex.ControlNetPoint) });
        return new
        {
            units,
            id = item.Id,
            geometryType = "SubD",
            closed = subd.IsSolid,
            vertices,
            edges = subd.Edges.Select(edge => new
            {
                id = edge.Id, from = edge.VertexFrom.Id, to = edge.VertexTo.Id,
                crease = edge.Tag == SubDEdgeTag.Crease, boundary = edge.FaceCount == 1,
            }).ToArray(),
        };
    }

    internal static SubD Create(JsonObject input)
    {
        bool requireClosed = input["requireClosed"]?.GetValue<bool>() ?? false;
        Point3d[] points;
        int[][] faceIndices;
        if (input["sections"] is JsonArray sections)
        {
            if (input["cageVertices"] != null || input["cageFaces"] != null)
                throw new ArgumentException("Provide either sections or an explicit cage, not both.");
            (points, faceIndices) = CreateSectionCage(sections, requireClosed);
        }
        else
        {
            if (input["cageVertices"] is not JsonArray vertices || vertices.Count is < 3 or > MaxCageVertices ||
                input["cageFaces"] is not JsonArray faces || faces.Count is < 1 or > MaxCageFaces)
                throw new ArgumentException($"A SubD cage needs 3–{MaxCageVertices} vertices and 1–{MaxCageFaces} faces.");
            points = vertices.Select((value, index) => ReadCageValue($"cageVertices[{index}]", () => Point(value))).ToArray();
            faceIndices = faces.Select((value, index) => ReadCageValue($"cageFaces[{index}]", () => CageIndices(value, 3, 4, points.Length))).ToArray();
        }
        var repeated = points.Select((point, index) => (point, index)).GroupBy(entry => entry.point).FirstOrDefault(group => group.Count() > 1);
        if (repeated != null)
            throw new ArgumentException($"Duplicate cageVertices at indices {string.Join(", ", repeated.Take(8).Select(entry => entry.index))}. Use one shared vertex index in the adjoining faces.");
        using var mesh = new Mesh();
        mesh.Vertices.UseDoublePrecisionVertices = true;
        foreach (var point in points) mesh.Vertices.Add(point);
        var used = new HashSet<int>();
        var edges = new Dictionary<(int, int), List<(int Face, bool Forward)>>();
        var loops = new HashSet<(int, int, int, int)>();
        for (var faceIndex = 0; faceIndex < faceIndices.Length; faceIndex++)
        {
            var indices = faceIndices[faceIndex];
            if (!loops.Add(FaceLoop(indices))) continue;
            used.UnionWith(indices);
            var added = indices.Length == 3 ? mesh.Faces.AddFace(indices[0], indices[1], indices[2])
                : mesh.Faces.AddFace(indices[0], indices[1], indices[2], indices[3]);
            if (added < 0) throw new ArgumentException($"Rhino rejected cageFaces[{faceIndex}]. Supply an ordered triangle or quad with distinct vertices.");
            for (var i = 0; i < indices.Length; i++)
            {
                var from = indices[i];
                var to = indices[(i + 1) % indices.Length];
                var edge = UndirectedEdge(from, to);
                if (!edges.TryGetValue(edge, out var adjacent)) edges[edge] = adjacent = [];
                adjacent.Add((faceIndex, from < to));
            }
        }
        if (used.Count != points.Length)
            throw new ArgumentException($"Unused cageVertices indices: {string.Join(", ", Enumerable.Range(0, points.Length).Where(index => !used.Contains(index)).Take(8))}. Reference them in cageFaces, or remove them and update face and crease indices.");
        foreach (var (edge, adjacent) in edges)
            if (adjacent.Count > 2)
                throw new ArgumentException($"Non-manifold edge {edge} is shared by cageFaces indices {string.Join(", ", adjacent.Take(8).Select(face => face.Face))}. At most two faces may share an edge.");
        if (!mesh.IsValidWithLog(out var validityLog))
        {
            validityLog ??= "";
            throw new ArgumentException($"Invalid cage mesh. {validityLog[..Math.Min(validityLog.Length, 400)].Trim()} Check for degenerate or crossed cageFaces.");
        }
        if (!mesh.IsManifold(true, out var oriented, out var hasBoundary))
            throw new ArgumentException("The cage contains non-manifold connections. Check for coincident vertices or overlapping faces.");
        if (!oriented)
        {
            // Work on the temporary cage only. Keep the same vertices, faces and crease indices.
            mesh.UnifyNormals();
            if (!mesh.IsManifold(true, out oriented, out hasBoundary) || !oriented)
            {
                var conflict = edges.FirstOrDefault(entry => entry.Value.Count == 2 && entry.Value[0].Forward == entry.Value[1].Forward);
                var location = conflict.Value == null ? "" : $" For example, original cageFaces[{conflict.Value[0].Face}] and cageFaces[{conflict.Value[1].Face}] share edge {conflict.Key} in the same direction.";
                throw new ArgumentException("The cage face directions cannot be made consistent." + location + " Reorder connected faces so each shared edge runs in opposite directions.");
            }
        }
        if (requireClosed && hasBoundary)
        {
            var openEdges = edges.Where(entry => entry.Value.Count == 1).Take(8).Select(entry => $"{entry.Key} on cageFaces[{entry.Value[0].Face}]");
            throw new ArgumentException($"The closed SubD request has boundary edges: {string.Join(", ", openEdges)}. Join or cap the intended boundary.");
        }
        if (!hasBoundary && mesh.SolidOrientation() < 0) mesh.Flip(true, true, true);

        var subd = SubD.CreateFromMesh(mesh, SubDCreationOptions.Smooth)
            ?? throw new ArgumentException("Rhino could not create a SubD from the cage.");
        try
        {
            if (input["creaseEdges"] is JsonArray { Count: > 0 } creases)
            {
                if (creases.Count > MaxCreaseEdges) throw new ArgumentException("Too many creases in one step.");
                var byPoint = points.Select((point, index) => (point, index)).ToDictionary(entry => entry.point, entry => entry.index);
                var nativeEdges = subd.Edges.ToDictionary(edge => UndirectedEdge(
                    byPoint[edge.VertexFrom.ControlNetPoint], byPoint[edge.VertexTo.ControlNetPoint]));
                var selected = creases.Select(crease =>
                {
                    var indices = CageIndices(crease, 2, 2, points.Length);
                    return nativeEdges.TryGetValue(UndirectedEdge(indices[0], indices[1]), out var edge)
                        ? edge : throw new ArgumentException("Each crease must follow an edge shared by the specified cage vertices.");
                }).DistinctBy(edge => edge.Id).ToArray();
                subd.Edges.SetEdgeTags(selected, SubDEdgeTag.Crease);
                if (selected.Any(edge => edge.Tag != SubDEdgeTag.Crease))
                    throw new InvalidOperationException("Rhino could not apply the requested creases.");
            }
            ValidateSubD(subd, requireClosed);
            return subd;
        }
        catch
        {
            subd.Dispose();
            throw;
        }
    }

    // Rotations and reversals identify the same loop. Sorting all four indices would
    // incorrectly discard a different quad loop with the same vertices.
    private static (int, int, int, int) FaceLoop(int[] face)
    {
        var start = Array.IndexOf(face, face.Min());
        var next = (start + 1) % face.Length;
        var prev = (start + face.Length - 1) % face.Length;
        return (face[start], Math.Min(face[next], face[prev]), face.Length == 3 ? Math.Max(face[next], face[prev]) : face[(start + 2) % 4],
            face.Length == 3 ? -1 : Math.Max(face[next], face[prev]));
    }

    private static (Point3d[], int[][]) CreateSectionCage(JsonArray sections, bool closed)
    {
        if (sections.Count is < 2 or > 12) throw new ArgumentException("Provide 2–12 ordered SubD sections.");
        var rings = sections.Select((node, index) =>
        {
            if (node is not JsonArray ring || ring.Count is < 3 or > 80)
                throw new ArgumentException($"sections[{index}] needs 3–80 ordered vertices, without a repeated endpoint.");
            return ring.Select((point, vertex) => ReadCageValue($"sections[{index}][{vertex}]", () => Point(point))).ToArray();
        }).ToArray();
        var width = rings[0].Length;
        if (width * rings.Length > MaxCageVertices || rings.Any(ring => ring.Length != width))
            throw new ArgumentException($"Sections need equal vertex counts and at most {MaxCageVertices} total vertices.");

        var faces = new List<int[]>();
        for (var row = 0; row + 1 < rings.Length; row++)
            for (var i = 0; i < width; i++)
            {
                var next = (i + 1) % width;
                faces.Add([row * width + i, row * width + next, (row + 1) * width + next, (row + 1) * width + i]);
            }
        if (closed)
        {
            AddSectionCap(rings[0], 0, faces);
            AddSectionCap(rings[^1], width * (rings.Length - 1), faces);
        }
        if (faces.Count > MaxCageFaces) throw new ArgumentException($"Sections generate more than {MaxCageFaces} cage faces.");
        return (rings.SelectMany(ring => ring).ToArray(), faces.ToArray());
    }

    private static void AddSectionCap(Point3d[] ring, int offset, List<int[]> faces)
    {
        using var cap = Mesh.CreateFromClosedPolyline(new Polyline(ring) { ring[0] });
        if (cap == null || !cap.IsValid || cap.Faces.Count != ring.Length - 2)
            throw new ArgumentException("Cannot cap a SubD section. Use a simple outline with consistent vertex order.");

        // The cap mesh stores single-precision coordinates. Reuse the ring indices
        // instead of introducing coincident vertices at the seam.
        var indices = new int[cap.Vertices.Count];
        for (var i = 0; i < indices.Length; i++)
        {
            var point = cap.Vertices.Point3dAt(i);
            var vertex = Array.FindIndex(ring, p => (float)p.X == (float)point.X && (float)p.Y == (float)point.Y && (float)p.Z == (float)point.Z);
            if (vertex < 0) throw new ArgumentException("The cap could not keep the section's original vertices.");
            indices[i] = offset + vertex;
        }
        if (indices.Distinct().Count() != ring.Length)
            throw new ArgumentException("The cap could not keep the section's original vertex indices.");
        foreach (var face in cap.Faces) faces.Add([indices[face.A], indices[face.B], indices[face.C]]);
    }

    internal static SubD Edit(SubD original, JsonObject input)
    {
        var vertexEdits = input["cageEdits"] as JsonArray ?? [];
        var edgeEdits = input["creaseEdits"] as JsonArray ?? [];
        if (vertexEdits.Count > MaxCageVertices || edgeEdits.Count > MaxCreaseEdges || vertexEdits.Count + edgeEdits.Count == 0)
            throw new ArgumentException("Provide at least one control point or crease edit within the step limits.");

        var subd = (SubD)original.Duplicate();
        try
        {
            var editedVertices = new HashSet<uint>();
            foreach (var node in vertexEdits)
            {
                var id = ComponentId(node?["vertexId"]);
                var vertex = subd.Vertices.Find(id);
                if (vertex == null || !editedVertices.Add(id))
                    throw new ArgumentException($"Control vertex {id} is missing or repeated. Inspect the target's control cage.");
                vertex.ControlNetPoint = Point(node?["point"]);
            }

            var editedEdges = new HashSet<uint>();
            var edgeTags = edgeEdits.Select(node =>
            {
                var id = ComponentId(node?["edgeId"]);
                var edge = subd.Edges.Find(id);
                if (edge == null || !editedEdges.Add(id))
                    throw new ArgumentException($"Control edge {id} is missing or repeated. Inspect the target's control cage.");
                var crease = node?["crease"]?.GetValue<bool>() ?? throw new ArgumentException("Specify the new crease state.");
                if (!crease && edge.FaceCount == 1) throw new ArgumentException("Open boundary edges must remain creased.");
                return (Edge: edge, Tag: crease ? SubDEdgeTag.Crease : SubDEdgeTag.Smooth);
            }).ToArray();
            foreach (var group in edgeTags.GroupBy(edit => edit.Tag))
                subd.Edges.SetEdgeTags(group.Select(edit => edit.Edge), group.Key);
            if (edgeTags.Any(edit => (edit.Edge.Tag == SubDEdgeTag.Crease) != (edit.Tag == SubDEdgeTag.Crease)))
                throw new InvalidOperationException("Rhino could not update the requested creases.");
            ValidateSubD(subd, original.IsSolid || input["requireClosed"]?.GetValue<bool>() == true);
            return subd;
        }
        catch
        {
            subd.Dispose();
            throw;
        }
    }

    private static void ValidateSubD(SubD subd, bool requireClosed)
    {
        subd.UpdateAllTagsAndSectorCoefficients();
        subd.ClearEvaluationCache();
        if (!subd.IsValid || !subd.GetBoundingBox(true).IsValid || (requireClosed && !subd.IsSolid))
            throw new ArgumentException("The operation did not produce the requested valid SubD. Check the cage topology, dimensions and edge tags.");
    }

    private static uint ComponentId(JsonNode? value)
    {
        var id = Number(value, 1, uint.MaxValue);
        if (Math.Truncate(id) != id) throw new ArgumentException("A component ID must be an integer.");
        return (uint)id;
    }

    private static T ReadCageValue<T>(string path, Func<T> read)
    {
        try { return read(); }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or FormatException)
        {
            throw new ArgumentException($"{path}: {error.Message}", error);
        }
    }

    private static int[] CageIndices(JsonNode? value, int min, int max, int vertexCount)
    {
        if (value is not JsonArray indices || indices.Count < min || indices.Count > max)
            throw new ArgumentException("Cage faces must have three or four vertices and crease edges exactly two.");
        var result = indices.Select(index =>
        {
            var value = Number(index, 0, vertexCount - 1);
            if (Math.Truncate(value) != value) throw new ArgumentException("Cage vertex indices must be integers.");
            return (int)value;
        }).ToArray();
        if (result.Distinct().Count() != result.Length) throw new ArgumentException("A face or crease cannot repeat a vertex.");
        return result;
    }

    internal static double[] Coordinates(Point3d point) => [point.X, point.Y, point.Z];

    private static Point3d Point(JsonNode? value) => value is JsonArray xyz && xyz.Count == 3
        ? new Point3d(Number(xyz[0], -100_000, 100_000), Number(xyz[1], -100_000, 100_000), Number(xyz[2], -100_000, 100_000))
        : throw new ArgumentException("An XYZ array needs exactly three numbers.");

    private static double Number(JsonNode? node, double min, double max)
    {
        var value = node?.GetValue<double>() ?? throw new ArgumentException("A numeric argument is missing.");
        return double.IsFinite(value) && value >= min && value <= max ? value : throw new ArgumentException("A numeric argument is out of range.");
    }

    private static (int, int) UndirectedEdge(int a, int b) => a < b ? (a, b) : (b, a);
}
