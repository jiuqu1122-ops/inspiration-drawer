using System.Text.Json.Nodes;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

internal static partial class Program
{
    private const int MaxCageVertices = 384;
    private const int MaxCageFaces = 512;
    private const int MaxCreaseEdges = 128;

    private static object Inspect(RhinoDoc doc, JsonObject input)
    {
        if (input["subdId"] == null) return new { units = "Millimeters", objects = Inventory(doc) };
        if (!Guid.TryParse(input["subdId"]!.GetValue<string>(), out var id) ||
            doc.Objects.FindId(id)?.Geometry is not SubD subd)
            throw new ArgumentException("Inspect needs an existing SubD object ID.");
        var vertices = new List<object>(subd.Vertices.Count);
        for (var vertex = subd.Vertices.First; vertex != null; vertex = vertex.Next)
            vertices.Add(new { id = vertex.Id, point = Coordinates(vertex.ControlNetPoint) });
        return new
        {
            units = "Millimeters",
            id,
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

    private static void AddSubD(RhinoDoc doc, JsonObject input, RhinoObject[] targets, string? name)
    {
        if (targets.Length > 1) throw new ArgumentException("A SubD cage may replace only one existing part.");
        if (targets.Length == 0 && doc.Objects.Count >= MaxParts) throw new ArgumentException("The document has reached its part limit.");
        if (input["cageVertices"] is not JsonArray vertices || vertices.Count is < 3 or > MaxCageVertices ||
            input["cageFaces"] is not JsonArray faces || faces.Count is < 1 or > MaxCageFaces)
            throw new ArgumentException($"A SubD cage needs 3–{MaxCageVertices} vertices and 1–{MaxCageFaces} faces.");

        var points = vertices.Select(Point).ToArray();
        if (points.Distinct().Count() != points.Length) throw new ArgumentException("Use one index per cage vertex and share it across adjoining faces.");
        using var mesh = new Mesh();
        mesh.Vertices.UseDoublePrecisionVertices = true;
        foreach (var point in points) mesh.Vertices.Add(point);
        var used = new HashSet<int>();
        foreach (var face in faces)
        {
            var indices = CageIndices(face, 3, 4, points.Length);
            used.UnionWith(indices);
            if (indices.Length == 3) mesh.Faces.AddFace(indices[0], indices[1], indices[2]);
            else mesh.Faces.AddFace(indices[0], indices[1], indices[2], indices[3]);
        }
        if (used.Count != points.Length || !mesh.IsValid || !mesh.IsManifold(true, out var oriented, out var hasBoundary) || !oriented)
            throw new ArgumentException("Use a valid manifold cage with consistent face winding and no unused vertices.");
        bool requireClosed = input["requireClosed"]?.GetValue<bool>() ?? false;
        if (requireClosed && hasBoundary) throw new ArgumentException("The cage has open edges. Cap or join them to create a closed SubD.");
        if (!hasBoundary && mesh.SolidOrientation() < 0) mesh.Flip(true, true, true);

        using var subd = SubD.CreateFromMesh(mesh, SubDCreationOptions.Smooth)
            ?? throw new ArgumentException("Rhino could not create a SubD from the cage.");
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
        using var attributes = PartAttributes(input, name, targets.FirstOrDefault()?.Name ?? "SubD");
        if (doc.Objects.AddSubD(subd, attributes) == Guid.Empty)
            throw new InvalidOperationException("Rhino did not add the SubD object.");
        if (targets.Length == 1 && !doc.Objects.Delete(targets[0].Id, true))
            throw new InvalidOperationException("Could not replace the previous part.");
    }

    private static void EditSubD(RhinoDoc doc, JsonObject input, RhinoObject[] targets)
    {
        if (targets.Length != 1 || targets[0].Geometry is not SubD original)
            throw new ArgumentException("Provide one SubD object ID from inspection.");
        var vertexEdits = input["cageEdits"] as JsonArray ?? [];
        var edgeEdits = input["creaseEdits"] as JsonArray ?? [];
        if (vertexEdits.Count > MaxCageVertices || edgeEdits.Count > MaxCreaseEdges || vertexEdits.Count + edgeEdits.Count == 0)
            throw new ArgumentException("Provide at least one control point or crease edit within the step limits.");

        using var subd = (SubD)original.Duplicate();
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
        if (!doc.Objects.Replace(targets[0].Id, subd))
            throw new InvalidOperationException("Rhino did not save the edited SubD.");
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

    private static (int, int) UndirectedEdge(int a, int b) => a < b ? (a, b) : (b, a);
}
