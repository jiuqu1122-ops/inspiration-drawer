using Rhino;
using Rhino.DocObjects;
using Rhino.FileIO;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    private static ReviewPart[] CurrentReviewParts(RhinoDoc doc) => doc.Objects.GetObjectList(ModelObjectTypes)
        .Select(obj => ReviewObject(obj.Attributes, obj.Geometry)).OrderBy(p => p.Id).ToArray();

    private static object ExportVerified(RhinoDoc doc, string directory)
    {
        var current = CurrentReviewParts(doc);
        if (current.Length == 0) throw new InvalidOperationException("There is no model to export.");
        return PublishReviewedFiles(directory, current.Length, path => Save(doc, path), path => ReviewSavedFile(path, current));
    }

    private static (object Readback, byte[] Png) ReviewSavedFile(string path, ReviewPart[] current)
    {
        using var archive = File3dm.Read(path) ?? throw new InvalidDataException("Rhino could not read back the exported 3DM.");
        if (archive.Settings.ModelUnitSystem != UnitSystem.Millimeters) throw new InvalidDataException("3DM readback: expected millimeters.");
        // Do not filter the archive: an extra standalone mesh (unlike a Brep render mesh),
        // consumed cutter or other unexpected object must fail the delivery.
        var saved = ReadArchiveParts(archive);
        var proof = VerifyReadback(current, saved, Describe, NativeMismatch, Tolerance);
        return (proof, ReviewSheet(saved));
    }

    private static ReviewObjectFacts Describe(ReviewPart part)
    {
        var shape = part.Shape;
        if (shape == null || !shape.IsValid) throw new InvalidDataException($"3DM review: invalid geometry for {part.Id}.");
        // GetBoundingBox(true) on doc-owned geometry may call CRhinoObject's solver, while
        // a File3dm row uses ON_Geometry. Compare world bounds with the same geometry-only
        // solver on both sides, not bounds computed by two different owners (receipt 084).
        using var detached = shape.Duplicate();
        if (detached == null || !detached.IsValid) throw new InvalidDataException($"3DM review: could not detach valid geometry for {part.Id}.");
        var box = detached.GetBoundingBox(true);
        if (!box.IsValid) throw new InvalidDataException($"3DM review: invalid bounds for {part.Id}.");
        return new(part.Id, part.Name, shape.ObjectType.ToString(), shape.IsValid, shape is Mesh,
            shape is Brep { IsSolid: true } or SubD { IsSolid: true }, shape switch
            {
                Brep b => b.Edges.Count(e => e.Valence == EdgeAdjacency.Naked),
                SubD s => s.Edges.Count(e => e.FaceCount == 1),
                _ => 0,
            }, Coordinates(box.Min), Coordinates(box.Max));
    }

    // IDs and bounding boxes alone cannot detect a stale cut or a changed interior cage vertex.
    private static string? NativeMismatch(ReviewPart live, ReviewPart saved)
    {
        if (live.Color.ToArgb() != saved.Color.ToArgb()) return $"color ARGB {live.Color.ToArgb():X8} -> {saved.Color.ToArgb():X8}";
        if (live.Shape is SubD s && saved.Shape is SubD t) return SameCage(s,t) ? null : "SubD control cage mismatch";
        if (live.Shape is not Brep a || saved.Shape is not Brep b) return "unsupported or changed native geometry type";
        const double tolerance = 1e-9;
        if (a.IsSolid != b.IsSolid || a.SolidOrientation != b.SolidOrientation) return "Brep solidity/orientation mismatch";
        if (a.IsDuplicate(b, tolerance)) return null;

        // Mixed-owner IsDuplicate can be false even for identical Breps. Do not accept a CRC
        // alone or increase the tolerance. Require unchanged topology counts, source CRC and
        // the same native strict geometry comparison on two independent, owner-free copies.
        if (a.Faces.Count != b.Faces.Count || a.Edges.Count != b.Edges.Count || a.Vertices.Count != b.Vertices.Count ||
            a.Trims.Count != b.Trims.Count || a.Loops.Count != b.Loops.Count) return "Brep topology counts mismatch";
        var liveCrc = a.DataCRC(0); var diskCrc = b.DataCRC(0);
        if (liveCrc != diskCrc) return $"Brep IsDuplicate failed and geometry CRC differs ({liveCrc:X8} -> {diskCrc:X8})";
        using var left = a.DuplicateBrep();
        using var right = b.DuplicateBrep();
        return left != null && right != null && left.IsValid && right.IsValid && left.IsDuplicate(right, tolerance)
            ? null : "native Brep geometry differs (detached IsDuplicate, tolerance 1e-9)";
    }

    private static bool SameCage(SubD a, SubD b)
    {
        if (a.IsSolid != b.IsSolid || a.Vertices.Count != b.Vertices.Count || a.Edges.Count != b.Edges.Count || a.Faces.Count != b.Faces.Count) return false;
        for (var v = a.Vertices.First; v != null; v = v.Next)
            if (b.Vertices.Find(v.Id) is not { } w || v.ControlNetPoint != w.ControlNetPoint || v.Tag != w.Tag) return false;
        foreach (var e in a.Edges)
            if (b.Edges.Find(e.Id) is not { } f || e.Tag != f.Tag || e.VertexFrom.Id != f.VertexFrom.Id || e.VertexTo.Id != f.VertexTo.Id) return false;
        foreach (var face in a.Faces)
        {
            var other = b.Faces.Find(face.Id);
            if (other == null || other.VertexCount != face.VertexCount) return false;
            for (var i = 0; i < face.VertexCount; ++i)
                if (face.VertexAt(i).Id != other.VertexAt(i).Id) return false;
        }
        return true;
    }
}
