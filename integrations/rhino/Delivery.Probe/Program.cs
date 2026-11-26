using System.Text.Json;
using static InspirationDrawer.Rhino.BackgroundRhinoModel;

Console.WriteLine($"Offline managed fixture PID={Environment.ProcessId} (no Rhino assemblies).");
static void Check(bool value, string why) { if (!value) throw new Exception(why); }
static void Box(List<ReviewTriangle> scene, int part, int rgb, double x, double y, double z, double w, double d, double h)
{
    ReviewPoint[] p = [new(x,y,z), new(x+w,y,z), new(x+w,y+d,z), new(x,y+d,z),
        new(x,y,z+h), new(x+w,y,z+h), new(x+w,y+d,z+h), new(x,y+d,z+h)];
    foreach (var (a,b,c,e,axis) in new[] { (0,1,2,3,2), (4,5,6,7,2), (0,1,5,4,1), (1,2,6,5,0), (2,3,7,6,1), (3,0,4,7,0) })
    {
        var lit = LitColor(Color.FromArgb(rgb), axis == 0 ? 1 : 0, axis == 1 ? 1 : 0, axis == 2 ? 1 : 0);
        scene.Add(new(p[a],p[b],p[c],lit,part)); scene.Add(new(p[a],p[c],p[e],lit,part));
    }
}
var red = Color.IndianRed.ToArgb(); var blue = Color.SteelBlue.ToArgb();
List<ReviewTriangle> boxes = [];
Box(boxes, 1, red, 0,-14,0, 10,8,16);
Box(boxes, 2, blue, 0,  6,0, 10,8,16);
var png = RenderReviewSheet(boxes);
using var stream = new MemoryStream(png);
using var sheet = new Bitmap(stream);
Check(sheet.Width == 1152 && sheet.Height == 808 && png.Length * 4L / 3 < 3_300_000, "single readable image within review transport limit");
const int w = 576, h = 362, header = 42;
static (Rectangle Bounds, int Red, int Blue) Pixels(Bitmap sheet, int view)
{
    var x0 = view % 2 * w; var y0 = view / 2 * (h + header) + header;
    int l = w, r = -1, t = h, b = -1, reds = 0, blues = 0;
    for (var y = 0; y < h; y++) for (var x = 1; x < w; x++)
    {
        var c = sheet.GetPixel(x0+x, y0+y);
        if (c.R > 230 && c.G > 230 && c.B > 230) continue;
        reds += c.R > c.B ? 1 : 0; blues += c.B > c.R ? 1 : 0;
        l = Math.Min(l,x); r = Math.Max(r,x); t = Math.Min(t,y); b = Math.Max(b,y);
    }
    return (Rectangle.FromLTRB(l,t,r+1,b+1), reds, blues);
}
for (var i = 0; i < 4; i++)
{
    var (bounds, reds, blues) = Pixels(sheet, i);
    Check(bounds.Left >= 18 && bounds.Top >= 18 && bounds.Right <= w-18 && bounds.Bottom <= h-18, $"unclipped view {i}");
    Check(bounds.Width >= w-42 || bounds.Height >= h-42, $"fills available viewport {i}");
    Check(reds > 1000 && (i == 0 ? blues == 0 : blues > 1000), $"front overlap / separation in complementary view {i}");
}
// Thin details far from the origin: do not collapse them by converting world XYZ to float before fitting.
ReviewPoint Tiny(ReviewPoint v) => new(95000+v.X*.0001, -99000+v.Y*.0001, 98000+v.Z*.0001);
using (var smallStream = new MemoryStream(RenderReviewSheet(boxes.Select(t => t with { A=Tiny(t.A), B=Tiny(t.B), C=Tiny(t.C) }).ToArray())))
using (var small = new Bitmap(smallStream))
    for (var i=0; i<4; ++i) { var a=Pixels(sheet,i).Bounds; var b=Pixels(small,i).Bounds;
        Check(Math.Abs(a.Width-b.Width)<=2 && Math.Abs(a.Height-b.Height)<=2, $"stable scale in view {i}"); }
// Intersecting triangles exchange depth within a face. A painter sorted by centroid fails this test.
ReviewTriangle[] crossing = [new(new(-10,10,-6),new(10,-10,-6),new(0,0,6),red,1),
    new(new(-10,-10,-6),new(10,10,-6),new(0,0,6),blue,2)];
using (var crossStream = new MemoryStream(RenderReviewSheet(crossing))) using (var cross = new Bitmap(crossStream))
    Check(cross.GetPixel(w/2-80, header+h*2/3).ToArgb() == blue && cross.GetPixel(w/2+80, header+h*2/3).ToArgb() == red, "per-pixel depth ordering");
using (var flatStream = new MemoryStream(RenderReviewSheet([new(new(0,0,0),new(10,0,0),new(0,8,0),red,1)])))
using (var flat = new Bitmap(flatStream))
    Check(Pixels(flat, 0).Bounds is { Width: >500, Height: 1 } && Pixels(flat, 2).Bounds is { Width: >500, Height: 1 }, "edge-on planar part remains visible");
if (args.Length == 1) File.WriteAllBytes(args[0], png);
Console.WriteLine($"Raster PASS: 4 independently fitted views, complementary visibility, small far-origin geometry, depth crossing, edge-on surface; {png.Length} PNG bytes.");

// JSON fixtures, not simulated Rhino sessions. Native extraction/comparison is the untested adapter;
// the identity gate, evidence aggregation, failure cleanup and legacy receipt are production code.
var dir = Directory.CreateTempSubdirectory("idraw-delivery-fixture-");
try
{
    var a = new Fixture(new(Guid.NewGuid(), "Housing", "Brep", true, false, true, 0, [0,0,0], [10,8,16]), "housing-cut-v2");
    var b = new Fixture(new(Guid.NewGuid(), "Insert", "SubD", true, false, false, 4, [-7,20,0], [8,28,16]), "cage-v1");
    Fixture[] live = [a, b];
    object Deliver(string fileContents) => PublishReviewedFiles(dir.FullName, live.Length,
        path => File.WriteAllText(path, fileContents), path =>
        {
            var read = JsonSerializer.Deserialize<Fixture[]>(File.ReadAllText(path))!;
            return (VerifyReadback(live, read, p => p.Facts, (x,y) => x.Shape == y.Shape ? null : "native shape mismatch", .01), png);
        });
    string Rejected(string reason, params Fixture[] items)
    {
        try { Deliver(JsonSerializer.Serialize(items)); }
        catch (InvalidDataException ex) { Check(!dir.EnumerateFiles().Any(), $"{reason}: published a file"); return ex.Message; }
        throw new Exception(reason + ": returned success");
    }
    try { Deliver("{"); throw new Exception("corrupt fixture accepted"); }
    catch (JsonException) { Check(!dir.EnumerateFiles().Any(), "read error left files"); }
    Rejected("missing object", a); Rejected("extra object", a,b,b); Rejected("duplicate object",a,a);
    Rejected("different ID",a,b with { Facts=b.Facts with { id=Guid.NewGuid() } });
    Rejected("mesh replacement",a,b with { Facts=b.Facts with { geometryType="Mesh", isMesh=true } });
    Rejected("invalid geometry",a,b with { Facts=b.Facts with { valid=false } });
    Check(Rejected("changed cage same ID and bounds",a,b with { Shape="cage-v0" }).Contains("native shape mismatch"), "specific shape diagnostic");
    Check(Rejected("changed bounds",a,b with { Facts=b.Facts with { max=[8,30,16] } }).Contains("bounds.max.Y"), "specific bbox diagnostic");
    // Same ID/type/shape token cannot excuse even a 0.0101 mm genuine bounds discrepancy.
    Check(Rejected("near-limit genuine bbox drift",a,b with { Facts=b.Facts with { min=[-7.0101,20,0] } }).Contains("bounds.min.X"), "0.01 mm gate preserved");
    Check(Rejected("stale Brep cut same ID and bounds",a with { Shape="housing-cut-v1" },b).Contains("native shape mismatch"), "no same-bounds Brep shortcut");
    Check(Rejected("corrupt closure metadata",a with { Facts=a.Facts with { boundaryEdgeCount=2 } },b).Contains("boundaryEdgeCount"), "boundary gate preserved");
    Rejected("lost closure",a with { Facts=a.Facts with { solid=false, boundaryEdgeCount=2 } },b);
    var receipt = JsonSerializer.SerializeToNode(Deliver(JsonSerializer.Serialize(new[] { b, a })))!;
    var proof = receipt["readback"]!; var file = receipt["files"]![0]!;
    Check((bool)proof["verified"]! && (int)proof["solidCount"]! == 1 && (int)proof["meshCount"]! == 0 && !(bool)proof["hasMesh"]!
        && proof["min"]!.ToJsonString() == "[-7,0,0]" && proof["max"]!.ToJsonString() == "[10,28,16]"
        && proof["objects"]!.AsArray().Count == 2 && (int)proof["objects"]![0]!["boundaryEdgeCount"]! == 4, "disk evidence");
    Check((int)receipt["objectCount"]! == 2 && (string)file["format"]! == "3dm" && (string)file["name"]! == "Rhino 模型.3dm"
        && Path.GetFileNameWithoutExtension((string)file["path"]!) == (string)file["id"]! && new FileInfo((string)file["path"]!).Length == (long)file["size"]!
        && png.SequenceEqual(File.ReadAllBytes((string)file["previewPath"]!)), "legacy receipt and published files");
    Console.WriteLine("Delivery gate PASS: independent fixture read, aggregate/per-object facts, legacy files, corrupt/stale/missing/extra/duplicate/changed geometry all fail closed.");
}
finally { foreach (var file in dir.EnumerateFiles()) file.Delete(); dir.Delete(); }
internal sealed record Fixture(ReviewObjectFacts Facts, string Shape);
