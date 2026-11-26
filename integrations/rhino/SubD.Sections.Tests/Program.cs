using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json.Nodes;
using Rhino.Geometry;
using Rhino.Runtime.InProcess;

// Run against the actual RHP, not a second implementation. Default: no RhinoCore.
// Add --native only on a licensed installation; geometry stays in the test process (no RhinoDoc).
internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length is < 2 or > 3 || (args.Length == 3 && args[2] != "--native"))
        {
            Console.Error.WriteLine("Usage: SubD.Sections.Tests <Rhino System directory> <plugin.rhp> [--native]");
            return 2;
        }
        try
        {
            RhinoInside.Resolver.Initialize(Path.GetFullPath(args[0]));
            Run(Assembly.LoadFrom(Path.GetFullPath(args[1])), args.Length == 3);
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error.GetBaseException().Message);
            return 1;
        }
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void Run(Assembly plugin, bool native)
    {
        var schemaType = plugin.GetType("InspirationDrawer.Rhino.SubDToolDefinitions", true)!;
        var subd = plugin.GetType("InspirationDrawer.Rhino.RhinoSubD", true)!;
        const BindingFlags flags = BindingFlags.Static | BindingFlags.NonPublic;
        T Call<T>(string method, params object[] args) => (T)subd.GetMethod(method, flags)!.Invoke(null, args)!;
        var passed = 0;
        void Check(bool ok, string label) { if (!ok) throw new Exception(label); passed++; }
        void Reject(JsonObject request, string reason)
        {
            try { using var result = Call<SubD>("Create", request); }
            catch (TargetInvocationException e) when (e.InnerException is ArgumentException a && a.Message.Contains(reason)) { passed++; return; }
            throw new Exception("Expected rejection: " + reason);
        }
        var tools = (JsonObject[])schemaType.GetMethod("Create", flags)!.Invoke(null, null)!;
        var schema = tools.Single(t => (string?)t["name"] == "drawer_subd_build")["inputSchema"]!;
        var prop = schema["properties"]!["sections"];
        Check(prop != null, "drawer_subd_build must accept sections");
        void Bounds(JsonNode node, int lo, int hi) => Check((int?)node["minItems"] == lo && (int?)node["maxItems"] == hi, $"schema bounds {lo}..{hi}");
        Bounds(prop!, 2, 12); Bounds(prop!["items"]!, 3, 80); Bounds(prop["items"]!["items"]!, 3, 3);
        Check(schema["required"]!.AsArray().Single()!.GetValue<string>() == "operation", "explicit cages remain valid");

        JsonArray Rings(int rows, int width) => new(Enumerable.Range(0, rows).Select(z => (JsonNode)new JsonArray(Enumerable.Range(0, width)
            .Select(i => (JsonNode)new JsonArray(Math.Cos(2 * Math.PI * i / width), Math.Sin(2 * Math.PI * i / width), (double)z)).ToArray())).ToArray());
        JsonObject Request(JsonArray rings) => new() { ["sections"] = rings };
        (Point3d[] Points, int[][] Faces) Cage(JsonArray rings, bool closed = false) => Call<(Point3d[], int[][])>("CreateSectionCage", rings, closed);
        var cage = Cage(Rings(3, 4));
        Check(cage.Points.Length == 12 && cage.Faces.Length == 8 && cage.Points[4].Z == 1, "ring-major cage");
        Check(cage.Faces[0].SequenceEqual(new[]{0,1,5,4}) && cage.Faces[^1].SequenceEqual(new[]{7,4,8,11}), "quad winding and seam wrap");
        Check(Cage(Rings(12, 32)).Points.Length == 384 && Cage(Rings(2, 80)).Faces.Length == 80, "limits inclusive");
        Reject(Request(Rings(1, 4)), "2–12"); Reject(Request(Rings(13, 3)), "2–12");
        Reject(Request(Rings(2, 2)), "sections[0]"); Reject(Request(Rings(2, 81)), "sections[0]");
        Reject(Request(Rings(5, 77)), "384");
        var uneven = Rings(2, 4); uneven[1]!.AsArray().RemoveAt(0); Reject(Request(uneven), "equal vertex counts");
        var invalid = Rings(2, 4); invalid[1]![2] = new JsonArray(); Reject(Request(invalid), "sections[1][2]");
        var repeat = Rings(2, 4); repeat[0]![3] = JsonNode.Parse(repeat[0]![0]!.ToJsonString()); Reject(Request(repeat), "Duplicate cageVertices");
        foreach (var field in new[]{"cageVertices", "cageFaces"}) { var mixed = Request(Rings(2, 4)); mixed[field] = new JsonArray(); Reject(mixed, "not both"); }

        (int,int,int,int) Loop(params int[] face) => Call<(int,int,int,int)>("FaceLoop", face);
        foreach (var face in new[]{new[]{2,5,7}, new[]{2,5,7,9}})
            foreach (var order in new[]{face, face.Reverse().ToArray()})
                for (var i = 0; i < face.Length; i++)
                    Check(Loop(order.Skip(i).Concat(order.Take(i)).ToArray()) == Loop(face), "rotated/reversed face");
        Check(Loop(2,5,7,9) != Loop(2,7,5,9) && Loop(2,5,7) != Loop(2,5,7,9), "distinct loops are not collapsed");

        if (native)
        {
            using var core = new RhinoCore(Array.Empty<string>(), WindowStyle.NoWindow);
            // Concave L, with non-float-exact coordinates: a cap must reuse the original ring indices.
            JsonArray Outline(double z) => new(new[]{(0,0),(4,0),(4,1),(1,1),(1,4),(0,4)}
                .Select(p => (JsonNode)new JsonArray(p.Item1 + .1234567, p.Item2 + .2345678, z)).ToArray());
            JsonArray Sections() => new(Outline(0), Outline(2));
            var caps = Cage(Sections(), true).Faces.Skip(6).ToArray();
            Check(caps.Length == 8 && caps.All(f => f.Length == 3), "n-2 triangles per concave cap");
            for (var end = 0; end < 2; end++) Check(caps.Skip(end*4).Take(4).SelectMany(f => f).ToHashSet().SetEquals(Enumerable.Range(end*6,6)), "original end ring indices");
            foreach (bool closed in new[]{false, true})
            {
                var request = Request(Sections()); request["requireClosed"] = closed;
                using var shape = Call<SubD>("Create", request);
                Check(shape.IsValid && shape.IsSolid == closed && shape.Vertices.Count == 12 && shape.Faces.Count == (closed ? 14 : 6), "native capped/open SubD");
            }
            var explicitCage = JsonNode.Parse("""{"cageVertices":[[0,0,0],[3,0,0],[3,2,0],[0,2,0]],"cageFaces":[[0,1,2,3],[1,2,3,0],[3,2,1,0]]}""")!.AsObject();
            using var sheet = Call<SubD>("Create", explicitCage);
            Check(sheet.IsValid && !sheet.IsSolid && sheet.Faces.Count == 1, "ignore duplicate faces before mesh/edge accounting");
            explicitCage["requireClosed"] = true; Reject(explicitCage, "boundary edges");
            Reject(JsonNode.Parse("""{"cageVertices":[[0,0,0],[1,0,0],[0,1,0],[0,-1,0],[0,0,1]],"cageFaces":[[0,1,2],[1,0,3],[0,1,4]]}""")!.AsObject(), "Non-manifold edge");
            var creased = Request(Sections()); creased["requireClosed"] = true;
            creased["creaseEdges"] = JsonNode.Parse("[[0,6],[6,7],[7,1],[1,0]]");
            using var creasedShape = Call<SubD>("Create", creased);
            Check(creasedShape.IsSolid && creasedShape.Edges.Count(e => e.Tag == SubDEdgeTag.Crease) == 4, "section indices identify the four requested creases");
        }
        Console.WriteLine($"PASS {passed} SubD assertions ({(native ? "including native geometry" : "managed only")})");
    }
}
