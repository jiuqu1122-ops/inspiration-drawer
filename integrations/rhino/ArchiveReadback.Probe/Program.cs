global using System.Drawing;
using System.Security.Cryptography;
using System.Text.Json;
using ObjectAttributes = Rhino.DocObjects.ObjectAttributes;
using Rhino.FileIO;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    // CI entry point independent of the trial folder. Auxiliary geometry must not disappear from
    // extraction: the delivery gate needs to see unexpected rows in order to reject the archive.
    private static void CheckSmallArchive()
    {
        var dir = Directory.CreateTempSubdirectory("idraw-manifest-");
        var path = Path.Combine(dir.FullName, "manifest.3dm");
        try
        {
            var first = new Point3d(4, 0, 1); var second = new Point3d(-2, 9, 1);
            using var file = new File3dm();
            using var a = new ObjectAttributes { Name = "unexpected guide 1" };
            using var b = new ObjectAttributes { Name = "unexpected guide 2" };
            var ids = new Dictionary<Guid, Point3d> { [file.Objects.AddPoint(first,a)] = first, [file.Objects.AddPoint(second,b)] = second };
            if (ids.Count != 2 || ids.ContainsKey(Guid.Empty) || !file.Write(path,8)) throw new Exception("Invalid standalone fixture");
            using var disk = File3dm.Read(path) ?? throw new InvalidDataException("Unopened standalone fixture");
            var rows = ReadArchiveParts(disk);
            if (rows.Length != 2 || rows.Any(p => !ids.Remove(p.Id,out var pt) || p.Shape is not global::Rhino.Geometry.Point point || point.Location != pt) || ids.Count != 0)
                throw new InvalidDataException("Archive manifest omitted, duplicated or mismatched a row");
            Console.WriteLine("PASS: standalone manifest, including both unexpected non-model objects.");
        }
        finally { File.Delete(path); dir.Delete(); }
    }

    // Use the independent pre-export INSPECT receipt for this checkpoint, not IDs found in the archive.
    private static int Main(string[] args)
    {
        if (args.Length == 0) { CheckSmallArchive(); return 0; }
        if (args.Length != 2) { Console.Error.WriteLine("Usage: ArchiveReadback.Probe <frozen-working.3dm> <inspect-receipt.json>"); return 2; }
        using var receipt = JsonDocument.Parse(File.ReadAllBytes(args[1]));
        var root = receipt.RootElement;
        string Hash() { using var file = File.OpenRead(args[0]); return Convert.ToHexString(SHA256.HashData(file)); }
        var hash = Hash();
        void Check(bool ok, string why) { if (!ok) throw new InvalidDataException(why); }
        Check(root.GetProperty("request").GetProperty("params").GetProperty("name").GetString() == "inspect" &&
            hash == root.GetProperty("beforeSha256").GetString() && hash == root.GetProperty("afterSha256").GetString(), "Wrong checkpoint or receipt");
        var expected = root.GetProperty("result").GetProperty("objects").EnumerateArray().ToDictionary(p => p.GetProperty("id").GetGuid());
        using var archive = File3dm.Read(args[0]) ?? throw new InvalidDataException("Unreadable checkpoint");
        // The full Rhino kernel and standalone openNURBS have different tight-box solvers.
        // Compare bounds across a real 3DM round trip with the SAME standalone reader;
        // production still compares live vs saved using RhinoCommon's tight boxes.
        var temp = Directory.CreateTempSubdirectory("idraw-archive-regression-");
        var path = Path.Combine(temp.FullName, "roundtrip.3dm");
        try
        {
            Check(archive.Write(path, 8), "Standalone archive write failed");
            using var disk = File3dm.Read(path) ?? throw new InvalidDataException("Could not reopen serialized archive");
            var saved = ReadArchiveParts(disk); // Exact production extraction; no substitute for enumeration.
            Check(saved.Length > 0 && saved.Length == expected.Count, "Object count mismatch");
            foreach (var part in saved)
            {
                Check(expected.Remove(part.Id, out var source), $"Unexpected/duplicate {part.Id}");
                var original = archive.Objects.FindId(part.Id) ?? throw new InvalidDataException($"Missing {part.Id}");
                var g = part.Shape; var box = g.GetBoundingBox(true); var before = original.Geometry.GetBoundingBox(true);
                Check(g.IsValid && source.GetProperty("valid").GetBoolean() && part.Name == source.GetProperty("name").GetString() &&
                    g.ObjectType.ToString() == source.GetProperty("geometryType").GetString() &&
                    (g is Brep { IsSolid: true } or SubD { IsSolid: true }) == source.GetProperty("closed").GetBoolean(), $"Changed {part.Id}");
                Check(box.IsValid && before.IsValid && box.Min.EpsilonEquals(before.Min,.01) && box.Max.EpsilonEquals(before.Max,.01), $"Changed standalone bounds for {part.Id}");
            }
            Check(expected.Count == 0 && Hash() == hash, "Missing objects or changed checkpoint");
            Console.WriteLine($"PASS: PID={Environment.ProcessId}; standalone File3dm round trip: {saved.Length} verified rows, checkpoint={hash}");
            // Diagnostic only. Exercise the old expression on the same archive; SDK/runtime dependent.
            try { _ = disk.Objects.Select(o => ReviewObject(o.Attributes, o.Geometry)).OrderBy(p => p.Id).ToArray(); }
            catch (NullReferenceException) { Console.WriteLine("Reproduced original IList projection failure on the same file."); }
            return 0;
        }
        finally { File.Delete(path); temp.Delete(); }
    }
}
