using System.Text.Json.Nodes;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    private readonly record struct PreservedPart(Guid Id, uint GeometryCrc);

    private static uint PartCrc(RhinoDoc doc, Guid id)
    {
        var geometry = doc.Objects.FindId(id)?.Geometry;
        if (geometry is not (Brep or SubD)) throw new ArgumentException($"preserveIds: part {id} is missing or not a model part.");
        return geometry.DataCRC(0);
    }

    private static PreservedPart[] SnapshotPreservedParts(RhinoDoc doc, JsonObject input, string? op, Guid[] consumed)
    {
        if (!input.ContainsKey("preserveIds")) return [];
        if (op != "difference" || input["preserveIds"] is not JsonArray ids || ids.Count is < 1 or > 16)
            throw new ArgumentException("preserveIds requires difference and 1–16 distinct existing part IDs.");
        var seen = new HashSet<Guid>(consumed);
        return ids.Select(node => {
            if (node is not JsonValue v || !v.TryGetValue<string>(out var text) || !Guid.TryParse(text, out var id) || id == Guid.Empty)
                throw new ArgumentException("preserveIds needs valid object IDs from inventory.");
            if (!seen.Add(id)) throw new ArgumentException("preserveIds must be distinct and disjoint from all consumed IDs.");
            return new PreservedPart(id, PartCrc(doc, id));
        }).ToArray();
    }

    private static object? StoreBrepResults(RhinoDoc doc, RhinoObject[] targets, Brep[] shapes, ObjectAttributes attributes, Point3d[]? witnesses, PreservedPart[] preserved)
    {
        // This is a disposable per-call document. Nothing is checkpointed until Build succeeds.
        var targetIds = targets.Select(obj => obj.Id).ToArray();
        var resultIds = new Guid[shapes.Length];
        for (int i = 0; i < shapes.Length; i++)
        {
            resultIds[i] = doc.Objects.AddBrep(shapes[i], attributes);
            if (resultIds[i] == Guid.Empty) throw new InvalidOperationException("Rhino did not add the verified solid.");
        }
        Brep StoredResult(Guid id) => doc.Objects.FindId(id)?.Geometry as Brep
            ?? throw new InvalidOperationException("Verified difference result is missing from the working document.");
        if (witnesses != null)
        {
            // Check the geometry at the new IDs, not the cutter or the in-memory candidates.
            VerifyRemovedMaterial((Brep)targets[0].Geometry, resultIds.Select(StoredResult).ToArray(), witnesses);
        }
        foreach (var id in targetIds)
            if (!doc.Objects.Delete(id, true)) throw new InvalidOperationException("Could not replace a consumed object.");
        foreach (var part in preserved)
            if (PartCrc(doc, part.Id) != part.GeometryCrc) throw new InvalidOperationException($"preserveIds: geometry changed for {part.Id}.");
        if (witnesses == null) return null;
        foreach (var id in resultIds) _ = StoredResult(id); // Must still exist after consumption.
        return preserved.Length == 0 ? new { status = "passed", witnessCount = witnesses.Length, targetId = targetIds[0], resultIds }
            : new { status = "passed", witnessCount = witnesses.Length, targetId = targetIds[0], resultIds, preservedIds = preserved.Select(part => part.Id).ToArray() };
    }

    private static Point3d[]? ReadRemovedMaterialPoints(JsonObject input, string? op)
    {
        if (!input.ContainsKey("removedMaterialPoints")) return null;
        if (op != "difference" || input["removedMaterialPoints"] is not JsonArray points || points.Count is < 1 or > 32)
            throw new ArgumentException("removedMaterialPoints requires difference and 1–32 XYZ points.");
        return points.Select(Point).ToArray();
    }

    private static void VerifyRemovedMaterial(Brep body, Brep[] results, Point3d[] points)
    {
        if (!body.IsValid || !body.IsSolid || !body.IsManifold || results.Any(result => !result.IsValid || !result.IsSolid || !result.IsManifold))
            throw new ArgumentException("Material removal checks require manifold closed solids.");
        // Explicit clearance also rejects points ON or near trimmed faces and edges on either side.
        static bool ClearOfBoundary(Brep solid, Point3d p)
        {
            var nearest = solid.ClosestPoint(p);
            return nearest.IsValid && nearest.DistanceTo(p) > Tolerance;
        }
        for (int i = 0; i < points.Length; i++)
        {
            var p = points[i];
            if (!ClearOfBoundary(body, p) || !body.IsPointInside(p, Tolerance, true))
                throw new ArgumentException($"removedMaterialPoints[{i}] is not strictly inside the original body.");
            if (results.Any(result => !ClearOfBoundary(result, p) || result.IsPointInside(p, Tolerance, false)))
                throw new ArgumentException($"removedMaterialPoints[{i}] is not strictly outside every difference result.");
        }
    }
}
