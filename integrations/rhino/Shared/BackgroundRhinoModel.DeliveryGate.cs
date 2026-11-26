namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    // Wire names of the per-object evidence returned to callers. No Rhino/native handles escape.
    internal sealed record ReviewObjectFacts(Guid id, string? name, string geometryType, bool valid, bool isMesh,
        bool solid, int boundaryEdgeCount, double[] min, double[] max);

    internal static object VerifyReadback<T>(T[] current, T[] saved, Func<T, ReviewObjectFacts> inspect, Func<T, T, string?> nativeMismatch, double tolerance)
    {
        if (saved.Length == 0 || saved.Length != current.Length)
            throw new InvalidDataException($"3DM readback: expected {current.Length} objects, found {saved.Length}.");
        var expected = current.Select(part => (part, facts: inspect(part))).ToDictionary(p => p.facts.id);
        var objects = saved.Select(part =>
        {
            var disk = inspect(part);
            InvalidDataException Changed(string detail) => new($"3DM readback: {disk.id} ({disk.geometryType}): {detail}.");
            if (disk.id == Guid.Empty || !expected.Remove(disk.id, out var live)) throw Changed("unexpected, empty or repeated object ID");
            var before = live.facts;
            if (!disk.valid || !before.valid) throw Changed($"valid live={before.valid}, file={disk.valid}");
            if (disk.geometryType != before.geometryType) throw Changed($"type {before.geometryType} -> {disk.geometryType}");
            if (disk.name != before.name) throw Changed($"name '{before.name}' -> '{disk.name}'");
            if (disk.isMesh != before.isMesh) throw Changed($"isMesh {before.isMesh} -> {disk.isMesh}");
            if (disk.solid != before.solid) throw Changed($"solid {before.solid} -> {disk.solid}");
            if (disk.boundaryEdgeCount != before.boundaryEdgeCount) throw Changed($"boundaryEdgeCount {before.boundaryEdgeCount} -> {disk.boundaryEdgeCount}");
            void CheckCorner(string label, double[] a, double[] b)
            {
                if (a.Length != 3 || b.Length != 3) throw Changed($"invalid bounds.{label} dimensions");
                for (int i = 0; i < 3; i++)
                    if (!(Math.Abs(a[i] - b[i]) <= tolerance)) throw Changed($"bounds.{label}.{"XYZ"[i]} {a[i]:R} -> {b[i]:R}, tolerance {tolerance:R}");
            }
            CheckCorner("min", before.min, disk.min); CheckCorner("max", before.max, disk.max);
            if (nativeMismatch(live.part, part) is { } reason) throw Changed(reason);
            return disk;
        }).ToArray();
        var meshCount = objects.Count(p => p.isMesh);
        return new { verified = true, units = "Millimeters", objectCount = objects.Length, solidCount = objects.Count(p => p.solid),
            meshCount, hasMesh = meshCount != 0, min = Enumerable.Range(0, 3).Select(i => objects.Min(p => p.min[i])).ToArray(),
            max = Enumerable.Range(0, 3).Select(i => objects.Max(p => p.max[i])).ToArray(), objects };
    }

    internal static object PublishReviewedFiles(string directory, int count, Action<string> save, Func<string, (object Proof, byte[] Png)> review)
    {
        var stem = Guid.NewGuid().ToString("N");
        var file = Path.Combine(directory, stem + ".3dm");
        var pending = Path.Combine(directory, stem + ".pending.3dm");
        var preview = Path.Combine(directory, stem + ".png");
        try
        {
            save(pending);
            var (readback, png) = review(pending);
            var size = new FileInfo(pending).Length;
            File.WriteAllBytes(preview, png);
            File.Move(pending, file); // Publish only the bytes actually read and reviewed.
            return new { files = new[] { new { id = stem, name = "Rhino 模型.3dm", path = file, format = "3dm", previewPath = preview, size } }, objectCount = count, readback };
        }
        catch
        {
            File.Delete(preview);
            throw; // Both background transports turn exceptions into errors, not completed file receipts.
        }
        finally { File.Delete(pending); }
    }
}
