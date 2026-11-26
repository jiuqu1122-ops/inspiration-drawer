using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    private static byte[] ReviewSheet(ReviewPart[] parts)
    {
        var triangles = new List<ReviewTriangle>();
        using var parameters = MeshingParameters.Default;
        for (var partIndex = 0; partIndex < parts.Length; partIndex++)
        {
            var part = parts[partIndex];
            var meshes = part.Shape switch
            {
                Brep brep => Mesh.CreateFromBrep(brep, parameters),
                SubD subd when Mesh.CreateFromSubD(subd, 2) is { } mesh => [mesh],
                _ => null,
            };
            var start = triangles.Count;
            try
            {
                foreach (var mesh in meshes ?? [])
                {
                    if (mesh == null || mesh.Faces.Count == 0) throw new InvalidOperationException($"Incomplete preview mesh for {part.Id}.");
                    foreach (var f in mesh.Faces)
                    {
                        var a = mesh.Vertices.Point3dAt(f.A);
                        var b = mesh.Vertices.Point3dAt(f.B);
                        var c = mesh.Vertices.Point3dAt(f.C);
                        Add(a, b, c);
                        if (f.IsQuad) Add(a, c, mesh.Vertices.Point3dAt(f.D));
                    }
                }
            }
            finally { if (meshes != null) foreach (var mesh in meshes) mesh?.Dispose(); }
            if (start == triangles.Count) throw new InvalidOperationException($"No drawable preview geometry for {part.Id}.");

            void Add(Point3d a, Point3d b, Point3d c)
            {
                if (!a.IsValid || !b.IsValid || !c.IsValid) throw new InvalidOperationException($"Invalid preview vertex for {part.Id}.");
                var normal = Vector3d.CrossProduct(b - a, c - a);
                if (!normal.Unitize()) return;
                var rgb = LitColor(part.Color, normal.X, normal.Y, normal.Z);
                triangles.Add(new(new(a.X, a.Y, a.Z), new(b.X, b.Y, b.Z), new(c.X, c.Y, c.Z), rgb, partIndex + 1));
                if (triangles.Count > 200_000) throw new InvalidOperationException("The mesh is too complex for the chat preview.");
            }
        }
        return RenderReviewSheet(triangles);
    }
}
