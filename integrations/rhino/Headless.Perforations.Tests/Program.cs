using System.Text.Json.Nodes;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    private const double Tolerance = 0.01;
    private static Vector3d Vector(JsonNode? node) => new((double)node![0]!, (double)node[1]!, (double)node[2]!);
    private static Point3d[] Points(JsonNode? node) => node!.AsArray().Select(p => new Point3d((double)p![0]!, (double)p[1]!, (double)p[2]!)).ToArray();
    static int passed;
    static void Check(bool ok, string why) { if (!ok) throw new Exception(why); passed++; }
    static void Reject(Action f, string why) {
        try { f(); } catch (ArgumentException e) { Check(e.Message.Contains(why), $"Expected {why}: {e.Message}"); return; }
        throw new Exception("Should reject: " + why);
    }
    static JsonObject Spec() => JsonNode.Parse("""{"rows":20,"columns":40,"firstCenter":[2,2],"pitch":[3,3],"radii":[0.8,0.6],"oddRowOffset":1.5}""")!.AsObject();
    static JsonObject Edit(string patch) {
        var s = Spec(); foreach (var kv in JsonNode.Parse(patch)!.AsObject()) s[kv.Key] = kv.Value?.DeepClone(); return s;
    }
    static void Main()
    {
        PlateUV[] rectangle = [new(0,0),new(125,0),new(125,62),new(0,62)];
        PerforationLayout Plan(JsonNode? spec, PlateUV[]? ring = null) => PerforationLayout.Create(spec, ring ?? rectangle, Tolerance);
        var p = Plan(Spec());
        Check(p.Centers.Length==800 && p.Centers.Distinct().Count()==800 && p.Radii==new PlateUV(0.8,0.6), "800 unique holes");
        Check(p.Centers[0]==new PlateUV(2,2) && p.Centers[^1]==new PlateUV(120.5,59), "row-major stagger");
        var plain = Spec(); plain.Remove("oddRowOffset");
        Check(Plan(plain).Centers[40] == new PlateUV(2,5), "default aligned");
        Check(Plan(Edit("""{"oddRowOffset":-0.5}""")).Centers[40] == new PlateUV(1.5,5), "signed row offset");
        Check(Plan(Spec(),rectangle.Reverse().ToArray()).ReverseOuter, "CW ring");
        Reject(()=>Plan(Edit("""{"rows":21}""")), "exceeds 800");
        Reject(()=>Plan(Edit("""{"rows":2.5}""")), "integer");
        foreach(var bad in new[]{"{\"columns\":\"3\"}", "{\"radii\":[0.04,1]}", "{\"pitch\":[2]}", "{\"oddRowOffset\":null}", "{\"radii\":[true,1]}", "{\"columnz\":1}"})
            Reject(()=>Plan(Edit(bad)), "perforations");
        plain.Remove("firstCenter"); Reject(()=>Plan(plain), "firstCenter");
        Reject(()=>Plan(null), "requires an object");
        Reject(()=>Plan(Edit("""{"firstCenter":[0.8,2]}""")), "outer edge"); // tangent
        Reject(()=>Plan(Edit("""{"firstCenter":[0.803,2]}""")), "too close");
        Reject(()=>Plan(Edit("""{"firstCenter":[-3,2]}""")), "outside");
        Reject(()=>Plan(Edit("""{"firstCenter":[7,2]}""")), "outer edge"); // only late staggered rows overrun
        Reject(()=>Plan(Edit("""{"pitch":[1.6,3]}""")), "intersect");
        Reject(()=>Plan(Edit("""{"pitch":[3,0.8],"oddRowOffset":0.6}""")), "intersect");
        // Non-neighbor holes in alternating rows coincide despite generous intra-row pitch.
        Reject(()=>Plan(Edit("""{"pitch":[5,0.55],"oddRowOffset":2.5,"columns":3}""")), "intersect");
        PlateUV[] concave = [new(0,0),new(20,0),new(20,20),new(8,20),new(8,2),new(0,2)];
        var one=Edit("""{"rows":1,"columns":1,"radii":[1,0.5],"firstCenter":[8.4,10]}""");
        Reject(()=>Plan(one,concave), "outer edge"); // center inside, ellipse straddles notch
        one["firstCenter"] = new JsonArray(12,10); Check(Plan(one,concave).Centers.Length==1,"concavity allowed");
        Reject(()=>Plan(one,[new(0,0),new(20,20),new(0,20),new(20,0)]),"Outer edges");
        Reject(()=>Plan(one,[new(0,0),new(20,0),new(10,0),new(10,10)]),"Outer edges");

        // The native adapter itself with managed doubles: tilted YZ profile, positive X extrusion.
        var req=JsonNode.Parse("""{"operation":"extrude","points":[[5,10,1],[5,135,1],[5,135,63],[5,10,63],[5,10,1]],"vector":[0.5,0,0]}""")!.AsObject();
        req["perforations"] = Spec();
        using var solid = ExtrudePerforations(req); var e = Extrusion.Last!;
        Check(e.Start==new Point3d(5,10,1) && e.End==new Point3d(5.5,10,1) && e.Up==new Vector3d(0,0,1),"world placement");
        Check(e.Outer!.Points[2]==new Point3d(125,62,0) && e.Holes.Count==800 && e.Holes[40].Plane.Origin==new Point3d(3.5,5,0),"local profile and holes");
        Check(e.Holes.All(h=>h.Plane.YAxis==new Vector3d(0,-1,0)),"inner winding");
        Extrusion.DropLoop=true; Reject(()=>ExtrudePerforations(req),"Cap lacks"); Extrusion.DropLoop=false;
        Extrusion.Open=true; Reject(()=>ExtrudePerforations(req),"closed manifold"); Extrusion.Open=false;
        Extrusion.RejectInner=true; Reject(()=>ExtrudePerforations(req),"elliptical profile"); Extrusion.RejectInner=false;
        req["vector"]=JsonNode.Parse("[0.5,0.1,0]"); Reject(()=>ExtrudePerforations(req),"perpendicular");
        req["vector"]=JsonNode.Parse("[0,0,0]"); Reject(()=>ExtrudePerforations(req),"thickness");
        Console.WriteLine($"PASS {passed} offline perforation assertions (no Rhino host)");
    }
}
