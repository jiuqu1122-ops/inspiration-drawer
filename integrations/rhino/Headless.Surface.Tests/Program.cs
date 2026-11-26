using System.Text.Json;
using System.Text.Json.Nodes;
using Rhino;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    private const double Tolerance = 0.01;
    // The production common XYZ parser is outside this fixture. Its scalar conversion is not under test here.
    private static Point3d Point(JsonNode? node) => new((double)node![0]!, (double)node[1]!, (double)node[2]!);
    private static int passed;
    private static void Check(bool ok, string label) {
        if (!ok) throw new Exception(label);
        Console.WriteLine("PASS " + label); passed++;
    }
    private static void Reject(Action call, string message) {
        try { call(); }
        catch (Exception e) when ((e is ArgumentException or InvalidOperationException) && e.Message.Contains(message)) { Check(true, message); return; }
        throw new Exception("Expected rejection: " + message);
    }

    private static void Main()
    {
        static JsonArray Ring(params Point3d[] pts) => new(pts.Select(p => (JsonNode)new JsonArray(p.X,p.Y,p.Z)).ToArray());
        Point3d[] first = [new(2, 8, 0), new(9, 7, 0), new(7, 2, 0), new(1, 1, 0)];
        Check(SmoothRing(Ring([..first, first[0]]), null).SequenceEqual(first), "first ring keeps its seam and strips a duplicate end");
        var upper = first.Select(p => p + new Vector3d(30, -4, 12)).ToArray();
        for (int i = 0; i < upper.Length; i++)
        {
            var shifted = upper.Skip(i).Concat(upper.Take(i)).ToArray();
            Check(SmoothRing(Ring(shifted), first).SequenceEqual(upper), "align translated cyclic seam " + i);
            Check(SmoothRing(Ring(shifted.Reverse().ToArray()), first).SequenceEqual(upper), "align opposite winding " + i);
        }
        Reject(() => SmoothRing(Ring(first[..3]), null), "at least four");
        Reject(() => SmoothRing(Ring([..upper, new(4, 1, 12)]), first), "matching counts");
        Reject(() => SmoothRing(Ring(first[0], first[1], first[0], first[3]), null), "coincide");
        Reject(() => SmoothRing(Ring(new Point3d[81]), null), "3\u201380");
        var body = new Brep(0, 10);
        Brep[] split = [new(0, 4), new(6, 10)];
        Point3d[] gap = [new(5, 5, 5), new(5.5, 5, 5)];
        JsonObject With(JsonNode? value) => new() { ["removedMaterialPoints"] = value };
        Check(ReadRemovedMaterialPoints(new(), "difference") == null, "unprobed differences remain opt-in");
        foreach (var op in new[] { "box", "loft", "remove", "union" })
            Reject(() => ReadRemovedMaterialPoints(With(JsonNode.Parse("[[5,5,5]]")), op), "requires difference");
        foreach (var value in new JsonNode?[] { null, new JsonArray(), new JsonArray(new JsonNode?[33]) })
            Reject(() => ReadRemovedMaterialPoints(With(value), "difference"), "1–32");
        Check(ReadRemovedMaterialPoints(With(JsonNode.Parse("[[5,5,5]]")), "difference")![0] == gap[0], "XYZ witness read");

        VerifyRemovedMaterial(body, split, gap);
        Check(true, "all witnesses are in original material but in neither result");
        foreach (var x in new[] { -2.0, 0, 0.005 })
            Reject(() => VerifyRemovedMaterial(body, split, [new(x, 5, 5)]), "not strictly inside");
        foreach (var x in new[] { 3.0, 7, 4, 4.005, 6 })
            Reject(() => VerifyRemovedMaterial(body, split, [gap[0], new(x, 5, 5)]), "[1] is not strictly outside");
        Reject(() => VerifyRemovedMaterial(body, [body], gap), "not strictly outside");  // no cut; adding a cover is not evidence
        Reject(() => VerifyRemovedMaterial(body, [new(0, 7)], gap), "not strictly outside"); // volume removed elsewhere
        Reject(() => VerifyRemovedMaterial(body, [new(0, 4, false)], gap), "manifold");

        // IDs must come from this write, not from names, inputs, earlier receipts, or unrelated objects.
        (RhinoDoc doc, Guid target, Guid cutter, Guid existing) Fresh() {
            var d = new RhinoDoc();
            return (d, d.Objects.AddBrep(body, new()), d.Objects.AddBrep(new(4, 6), new()), d.Objects.AddBrep(new(20, 30), new()));
        }
        var (doc, target, cutter, existing) = Fresh();
        object? Store(Point3d[]? witnesses, PreservedPart[]? preserved = null) => StoreBrepResults(doc, [doc.Objects.FindId(target)!, doc.Objects.FindId(cutter)!], split, new(), witnesses, preserved ?? []);
        var proof = JsonSerializer.SerializeToNode(Store(gap))!;
        Check((string?)proof["status"] == "passed" && (int?)proof["witnessCount"] == 2 && proof["targetId"]!.GetValue<Guid>() == target, "receipt status, count and original target ID");
        var ids = proof["resultIds"]!.Deserialize<Guid[]>()!;
        Check(ids.Length == 2 && ids.Distinct().Count() == 2 && ids.All(id => id != existing && doc.Objects.FindId(id) != null)
            && doc.Objects.Ids.ToHashSet().SetEquals(ids.Append(existing)), "receipt identifies only the surviving new results; unrelated geometry retained");
        (doc, target, cutter, existing) = Fresh();
        Check(Store(null) == null, "ordinary difference produces no proof");
        (doc, target, cutter, existing) = Fresh();
        doc.Objects.SimulateDifferentStoredShape = body;
        Reject(() => Store(gap), "not strictly outside");
        Check(doc.Objects.FindId(target) != null && doc.Objects.FindId(cutter) != null, "failed readback verification does not consume operands");
        (doc, target, cutter, existing) = Fresh();
        doc.Objects.SimulateLostResultAfterDelete = true;
        Reject(() => Store(gap), "missing from the working document");
        (doc, target, cutter, existing) = Fresh();
        PreservedPart[] Snapshot(params Guid[] protect) => SnapshotPreservedParts(doc,
            new JsonObject { ["preserveIds"] = JsonSerializer.SerializeToNode(protect) }, "difference", [target, cutter]);
        Reject(() => Snapshot(target), "disjoint");
        Reject(() => Snapshot(cutter), "disjoint");
        Reject(() => Snapshot(existing, existing), "distinct");
        Reject(() => Snapshot(Guid.NewGuid()), "missing");
        Reject(() => Snapshot(Guid.Empty), "valid object IDs");
        foreach (var list in new[] { Array.Empty<Guid>(), new Guid[17] }) Reject(() => Snapshot(list), "1–16");
        Reject(() => SnapshotPreservedParts(doc, new JsonObject { ["preserveIds"] = null }, "box", []), "requires difference");
        var withPreservation = JsonSerializer.SerializeToNode(Store(gap, Snapshot(existing)))!;
        Check(withPreservation["preservedIds"]!.Deserialize<Guid[]>()!.SequenceEqual([existing]), "receipt contains the CRC-checked surviving part ID");
        Check(proof["preservedIds"] == null, "absent preservation request does not claim preservation");
        (doc, target, cutter, existing) = Fresh();
        Check(Store(null, Snapshot(existing)) == null, "preservation alone cannot fabricate materialRemoval");
        (doc, target, cutter, existing) = Fresh();
        doc.Objects.SimulateGeometryChangeOnDelete = existing;
        Reject(() => Store(gap, Snapshot(existing)), "geometry changed");
        (doc, target, cutter, existing) = Fresh();
        doc.Objects.SimulateLossOnDelete = existing;
        Reject(() => Store(null, Snapshot(existing)), "missing");
        Console.WriteLine($"{passed} offline assertions passed (no Rhino runtime).");
    }
}
