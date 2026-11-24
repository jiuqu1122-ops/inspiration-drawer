using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using Rhino;
using Rhino.DocObjects;
using Rhino.FileIO;
using Rhino.Geometry;
using Rhino.Runtime.InProcess;

internal static class Program
{
    private const double Tolerance = 0.01;
    private const int MaxParts = 256;

    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length != 2) return 2;
        Console.InputEncoding = System.Text.Encoding.UTF8;
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        var output = Console.Out;
        try
        {
            var rpc = JsonNode.Parse(Console.ReadLine() ?? "")!.AsObject();
            RhinoInside.Resolver.Initialize(args[0]);
            var result = Call(rpc, args[1]);
            output.WriteLine("IDRAW_MCP " + JsonSerializer.Serialize(new { jsonrpc = "2.0", id = 1, result }));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            output.WriteLine("IDRAW_MCP " + JsonSerializer.Serialize(new { jsonrpc = "2.0", id = 1, error = new { message = error.Message } }));
            return 1;
        }
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static object Call(JsonObject rpc, string directory)
    {
        if (rpc["method"]?.GetValue<string>() != "tools/call") throw new ArgumentException("Unsupported MCP method.");
        var parameters = rpc["params"]!.AsObject();
        var input = parameters["arguments"]?.AsObject() ?? new JsonObject();
        using var core = new RhinoCore();
        var checkpoint = Path.Combine(directory, "working.3dm");
        using var doc = File.Exists(checkpoint) ? RhinoDoc.OpenHeadless(checkpoint) : RhinoDoc.CreateHeadless(null);
        if (doc == null) throw new InvalidOperationException("Could not open the Rhino modeling document.");
        doc.ModelUnitSystem = UnitSystem.Millimeters;
        doc.ModelAbsoluteTolerance = Tolerance;
        return parameters["name"]?.GetValue<string>() switch
        {
            "context" => Context(doc),
            "inspect" => new { units = "Millimeters", objects = Inventory(doc) },
            "build" => CommitStep(doc, input, checkpoint),
            "preview" => new { mimeType = "image/png", data = Convert.ToBase64String(Preview(doc)) },
            "export" => Export(doc, directory),
            _ => throw new ArgumentException("Unknown background Rhino tool."),
        };
    }

    private static object CommitStep(RhinoDoc doc, JsonObject input, string checkpoint)
    {
        try { return Build(doc, input, checkpoint); }
        catch (Exception error) when (error is ArgumentException or InvalidOperationException or FormatException or OverflowException)
        {
            throw new InvalidOperationException("RHINO_HEADLESS_GEOMETRY_REJECTED: " + error.Message, error);
        }
    }

    private static object Context(RhinoDoc doc)
    {
        try
        {
            // Some Rhino releases can start in-process but fail their first geometry call.
            // Check the kernel before offering write tools, without touching the working document.
            using var check = BoxShape(Plane.WorldXY, new JsonArray(2.0, 3.0, 4.0));
            if (!check.IsValid || !check.IsSolid) throw new InvalidOperationException("Solid self-check failed.");
        }
        catch (Exception error)
        {
            throw new InvalidOperationException($"Rhino {RhinoApp.Version} 未通过后台几何检查。请升级 Rhino，或使用支持的本机 Rhino 内核。", error);
        }
        return new { document = "Background Rhino document", units = "Millimeters", rhinoVersion = RhinoApp.Version.ToString(), objects = Inventory(doc) };
    }

    private static object[] Inventory(RhinoDoc doc) => doc.Objects
        .GetObjectList(ObjectType.Brep)
        .Select(obj =>
        {
            var shape = (Brep)obj.Geometry;
            var bounds = shape.GetBoundingBox(true);
            using var volume = shape.IsSolid ? VolumeMassProperties.Compute(shape) : null;
            return (object)new
            {
                id = obj.Id, name = obj.Name, valid = shape.IsValid, closed = shape.IsSolid,
                min = Coordinates(bounds.Min), max = Coordinates(bounds.Max),
                volume = volume?.Volume,
            };
        }).ToArray();

    private static double[] Coordinates(Point3d p) => [p.X, p.Y, p.Z];

    private static object Build(RhinoDoc doc, JsonObject input, string checkpoint)
    {
        var op = input["operation"]?.GetValue<string>();
        var name = input["name"]?.GetValue<string>()?.Trim();
        var ids = (input["ids"] as JsonArray)?.Select(id => Guid.Parse(id!.GetValue<string>())).ToArray() ?? [];
        if (ids.Length > 16 || ids.Distinct().Count() != ids.Length) throw new ArgumentException("Provide up to 16 different object IDs.");
        var targets = ids.Select(id => doc.Objects.FindId(id) ?? throw new ArgumentException($"Object {id} does not exist. Inspect current geometry.")).ToArray();
        if (op == "remove")
        {
            if (targets.Length == 0) throw new ArgumentException("Remove requires explicit object IDs.");
            foreach (var target in targets)
                if (!doc.Objects.Delete(target.Id, true)) throw new InvalidOperationException("Could not remove the specified object.");
        }
        else if (op is "move" or "rotate")
        {
            if (targets.Length == 0) throw new ArgumentException("A transform requires object IDs.");
            var transform = op == "move"
                ? Transform.Translation(Vector(input["vector"]))
                : Transform.Rotation(Number(input["angleDegrees"], -360, 360) * Math.PI / 180, Direction(input["axis"]), Point(input["origin"]));
            foreach (var target in targets)
            {
                using var copy = target.Geometry.Duplicate();
                if (copy == null || !copy.Transform(transform) || !copy.IsValid || !doc.Objects.Replace(target.Id, (Brep)copy))
                    throw new InvalidOperationException("The transformation did not produce valid geometry.");
            }
        }
        else
        {
            var origin = input["origin"] == null ? Point3d.Origin : Point(input["origin"]);
            var plane = new Plane(origin, input["axis"] == null ? Vector3d.ZAxis : Direction(input["axis"]));
            Brep[] shapes = op switch
            {
                "box" => [BoxShape(plane, input["size"])],
                "cylinder" => [new Cylinder(new Circle(plane, Length(input["radius"])), Length(input["height"])).ToBrep(true, true)],
                "sphere" => [new Sphere(origin, Length(input["radius"])).ToBrep()],
                "extrude" => [Extrude(input)],
                "loft" => Loft(input["sections"]),
                "revolve" => [Revolve(plane, input["points"])],
                "union" when targets.Length >= 2 => Brep.CreateBooleanUnion(targets.Select(obj => (Brep)obj.Geometry), Tolerance) ?? [],
                "difference" when targets.Length >= 2 => Brep.CreateBooleanDifference(
                    new[] { (Brep)targets[0].Geometry }, targets.Skip(1).Select(obj => (Brep)obj.Geometry), Tolerance) ?? [],
                _ => throw new ArgumentException("Unsupported operation or missing target and cutter IDs."),
            };
            if (shapes.Length == 0 || shapes.Length > 16 || doc.Objects.Count + shapes.Length > MaxParts)
                throw new InvalidOperationException("The operation produced no usable solids or exceeded the document limit.");
            if (op == "union" && shapes.Length != 1)
                throw new InvalidOperationException("The parts did not join into one solid. Check the mating surfaces.");
            if (op is not ("union" or "difference") && targets.Length > 1)
                throw new ArgumentException("A new construction may replace only one existing part.");
            foreach (var shape in shapes)
            {
                if (shape == null || !shape.IsValid || !shape.IsSolid)
                    throw new InvalidOperationException("The operation did not produce a valid closed solid. Correct its profiles or intersections.");
                if (shape.SolidOrientation == BrepSolidOrientation.Inward) shape.Flip();
                using var mass = VolumeMassProperties.Compute(shape);
                if (shape.SolidOrientation != BrepSolidOrientation.Outward || mass == null || mass.Volume <= Tolerance * Tolerance * Tolerance)
                    throw new InvalidOperationException("The solid has invalid orientation or volume.");
            }
            if (op == "difference")
            {
                using var before = VolumeMassProperties.Compute((Brep)targets[0].Geometry);
                var after = shapes.Sum(shape => { using var mass = VolumeMassProperties.Compute(shape); return mass.Volume; });
                if (before == null || before.Volume - after <= Tolerance * Tolerance)
                    throw new InvalidOperationException("The cutter did not remove a measurable volume. Check the fit and penetration.");
            }
            var attributes = new ObjectAttributes { Name = string.IsNullOrWhiteSpace(name)
                ? targets.FirstOrDefault()?.Name ?? op ?? "Part" : name[..Math.Min(name.Length, 100)] };
            if (input["color"] is JsonValue color && color.TryGetValue<string>(out var rgb))
            {
                if (rgb.Length != 7 || rgb[0] != '#') throw new ArgumentException("Color must be #RRGGBB.");
                var value = Convert.ToInt32(rgb[1..], 16);
                attributes.ObjectColor = Color.FromArgb(255, Color.FromArgb(value));
                attributes.ColorSource = ObjectColorSource.ColorFromObject;
            }
            foreach (var target in targets)
                if (!doc.Objects.Delete(target.Id, true)) throw new InvalidOperationException("Could not replace a consumed object.");
            foreach (var shape in shapes)
            {
                using (shape)
                    if (doc.Objects.AddBrep(shape, attributes) == Guid.Empty)
                        throw new InvalidOperationException("Rhino did not add the verified solid.");
            }
        }
        var objects = Inventory(doc);
        Save(doc, checkpoint);
        return new { committed = true, operation = op, objects };
    }

    private static Brep BoxShape(Plane plane, JsonNode? dimensions)
    {
        var size = Vector(dimensions);
        var width = Length(size.X);
        var depth = Length(size.Y);
        using var profile = JoinLines([plane.Origin, plane.PointAt(width, 0), plane.PointAt(width, depth), plane.PointAt(0, depth), plane.Origin]);
        return Extrude(profile, plane.Normal * Length(size.Z));
    }

    private static Point3d[] Points(JsonNode? input)
    {
        if (input is not JsonArray points || points.Count is < 3 or > 80)
            throw new ArgumentException("A profile needs 3–80 3D points.");
        return points.Select(Point).ToArray();
    }

    private static PolyCurve JoinLines(Point3d[] points)
    {
        var curve = new PolyCurve();
        for (var index = 1; index < points.Length; index++)
        {
            if (points[index - 1].DistanceTo(points[index]) <= Tolerance) continue;
            using var segment = new LineCurve(points[index - 1], points[index]);
            if (curve.Append(segment)) continue;
            curve.Dispose();
            throw new ArgumentException("The profile segments could not be joined.");
        }
        return curve;
    }

    private static PolyCurve Profile(JsonNode? input)
    {
        var points = Points(input);
        if (points[0].DistanceTo(points[^1]) > Tolerance) points = [..points, points[0]];
        else points[^1] = points[0];
        var curve = JoinLines(points);
        if (!curve.IsValid || !curve.IsClosed || !curve.IsPlanar(Tolerance))
        {
            curve.Dispose();
            throw new ArgumentException("The profile must be closed, planar and valid.");
        }
        return curve;
    }

    private static Brep Extrude(JsonObject input)
    {
        using var profile = Profile(input["points"]);
        return Extrude(profile, Vector(input["vector"]));
    }

    private static Brep Extrude(Curve profile, Vector3d direction)
    {
        if (direction.Length <= Tolerance) throw new ArgumentException("The extrusion vector is too small.");
        using var surface = Surface.CreateExtrusion(profile, direction);
        using var sides = surface?.ToBrep();
        return sides?.CapPlanarHoles(Tolerance) ?? throw new ArgumentException("Could not cap the extrusion.");
    }

    private static Brep[] Loft(JsonNode? input)
    {
        if (input is not JsonArray sections || sections.Count is < 2 or > 12)
            throw new ArgumentException("Loft needs 2–12 ordered corresponding profiles.");
        var profiles = sections.Select(Profile).ToArray();
        try
        {
            var lofts = Brep.CreateFromLoft(profiles, Point3d.Unset, Point3d.Unset, LoftType.Normal, false) ?? [];
            return lofts.Select(loft => {
                using (loft) return loft.CapPlanarHoles(Tolerance) ?? throw new ArgumentException("Could not cap the loft.");
            }).ToArray();
        }
        finally { foreach (var profile in profiles) profile.Dispose(); }
    }

    private static Brep Revolve(Plane plane, JsonNode? points)
    {
        using var profile = JoinLines(Points(points));
        using var surface = RevSurface.Create(profile, new Line(plane.Origin, plane.Origin + plane.Normal), 0, 2 * Math.PI);
        return surface == null ? throw new ArgumentException("Could not revolve the profile around the specified axis.")
            : Brep.CreateFromRevSurface(surface, true, true);
    }

    private static double Number(JsonNode? node, double min = -100_000, double max = 100_000)
    {
        var value = node?.GetValue<double>() ?? throw new ArgumentException("A numeric argument is missing.");
        return double.IsFinite(value) && value >= min && value <= max ? value : throw new ArgumentException("A numeric argument is out of range.");
    }
    private static double Length(JsonNode? node) => Number(node, 0.05);
    private static double Length(double value) => value is >= 0.05 and <= 100_000 ? value : throw new ArgumentException("A dimension is out of range.");
    private static Vector3d Vector(JsonNode? node) => node is JsonArray xyz && xyz.Count == 3
        ? new Vector3d(Number(xyz[0]), Number(xyz[1]), Number(xyz[2])) : throw new ArgumentException("An XYZ array needs exactly three numbers.");
    private static Point3d Point(JsonNode? node) { var xyz = Vector(node); return new Point3d(xyz.X, xyz.Y, xyz.Z); }
    private static Vector3d Direction(JsonNode? node) { var vector = Vector(node); return vector.Unitize() ? vector : throw new ArgumentException("The axis cannot be zero."); }

    private static void Save(RhinoDoc doc, string path)
    {
        var temporary = path + ".tmp.3dm";
        try
        {
            if (!doc.Write3dmFile(temporary, new FileWriteOptions { FileVersion = 8, SuppressDialogBoxes = true }))
                throw new IOException("Rhino could not save the 3DM file.");
            File.Move(temporary, path, true);
        }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }

    private static object Export(RhinoDoc doc, string directory)
    {
        var objects = Inventory(doc);
        if (objects.Length == 0) throw new InvalidOperationException("There is no model to export.");
        var stem = Guid.NewGuid().ToString("N");
        var file = Path.Combine(directory, stem + ".3dm");
        var preview = Path.Combine(directory, stem + ".png");
        var raster = Preview(doc);
        Save(doc, file);
        File.WriteAllBytes(preview, raster);
        return new { files = new[] { new { id = stem, name = "Rhino 模型.3dm", path = file, format = "3dm", previewPath = preview, size = new FileInfo(file).Length } }, objectCount = objects.Length };
    }

    private static byte[] Preview(RhinoDoc doc)
    {
        var right = new Vector3d(0.7071, 0.7071, 0);
        var up = new Vector3d(-0.35355, 0.35355, 0.86603);
        var towardCamera = Vector3d.CrossProduct(right, up);
        var polygons = new List<(Point3d[] Points, double Depth, Color Color)>();
        foreach (var obj in doc.Objects.GetObjectList(ObjectType.Brep))
        {
            var color = obj.Attributes.ColorSource == ObjectColorSource.ColorFromObject
                ? obj.Attributes.ObjectColor : Color.FromArgb(137, 164, 177);
            var meshes = Mesh.CreateFromBrep((Brep)obj.Geometry, MeshingParameters.FastRenderMesh) ?? [];
            foreach (var mesh in meshes)
            {
                using (mesh)
                foreach (var f in mesh.Faces)
                {
                    Point3d[] points = f.IsQuad
                        ? [mesh.Vertices[f.A], mesh.Vertices[f.B], mesh.Vertices[f.C], mesh.Vertices[f.D]]
                        : [mesh.Vertices[f.A], mesh.Vertices[f.B], mesh.Vertices[f.C]];
                    var normal = Vector3d.CrossProduct(points[1] - points[0], points[2] - points[0]);
                    if (!normal.Unitize()) continue;
                    var light = Math.Abs(normal * new Vector3d(0.22, -0.45, 0.86));
                    var factor = 0.57 + 0.43 * Math.Clamp(light, 0, 1);
                    polygons.Add((points, points.Average(p => (p - Point3d.Origin) * towardCamera),
                        Color.FromArgb((int)(color.R * factor), (int)(color.G * factor), (int)(color.B * factor))));
                    if (polygons.Count > 100_000) throw new InvalidOperationException("The mesh is too complex for the chat preview.");
                }
            }
        }
        if (polygons.Count == 0) throw new InvalidOperationException("There are no visible solids to preview.");
        PointF Project(Point3d point)
        {
            var v = point - Point3d.Origin;
            return new PointF((float)(v * right), -(float)(v * up));
        }
        const int width = 840, height = 600;
        var projection = polygons.SelectMany(poly => poly.Points.Select(Project)).ToArray();
        var left = projection.Min(point => point.X); var top = projection.Min(point => point.Y);
        var dx = projection.Max(point => point.X) - left; var dy = projection.Max(point => point.Y) - top;
        var scale = Math.Min((width - 112) / Math.Max(dx, 0.01f), (height - 112) / Math.Max(dy, 0.01f));
        using var image = new Bitmap(width, height);
        using var graphics = Graphics.FromImage(image);
        graphics.Clear(Color.FromArgb(240, 243, 245));
        graphics.SmoothingMode = SmoothingMode.None;
        foreach (var poly in polygons.OrderBy(poly => poly.Depth))
        {
            var points = poly.Points.Select(p => {
                var pt = Project(p);
                return new PointF((pt.X - left - dx / 2) * scale + width / 2, (pt.Y - top - dy / 2) * scale + height / 2);
            }).ToArray();
            using var brush = new SolidBrush(poly.Color);
            graphics.FillPolygon(brush, points);
        }
        using var buffer = new MemoryStream();
        image.Save(buffer, ImageFormat.Png);
        return buffer.ToArray();
    }
}
