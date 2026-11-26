using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.Text.Json.Nodes;
using Rhino;
using Rhino.DocObjects;
using Rhino.FileIO;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    private const double Tolerance = 0.01;
    private const int MaxParts = 256;

    internal static object Execute(string tool, JsonObject input, string directory)
    {
        using var workspaceLock = new FileStream(Path.Combine(directory, "kernel.lock"), FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None);
        var checkpoint = Path.Combine(directory, "working.3dm");
        using var doc = File.Exists(checkpoint) ? RhinoDoc.OpenHeadless(checkpoint) : RhinoDoc.CreateHeadless(null);
        if (doc == null) throw new InvalidOperationException("Could not open the Rhino modeling document.");
        doc.ModelUnitSystem = UnitSystem.Millimeters;
        doc.ModelAbsoluteTolerance = Tolerance;
        return tool switch
        {
            "context" => Context(doc),
            "inspect" => Inspect(doc, input),
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
        catch (global::Rhino.Runtime.NotLicensedException error)
        {
            throw new InvalidOperationException($"Rhino {RhinoApp.Version} 的独立后台进程未获得授权。", error);
        }
        catch (Exception error)
        {
            throw new InvalidOperationException($"Rhino {RhinoApp.Version} 未通过后台几何检查。可打开目标 Rhino 文档，在灵感抽屉插件面板继续建模。", error);
        }
        return new { document = "Background Rhino document", units = "Millimeters", rhinoVersion = RhinoApp.Version.ToString(),
            capabilities = new { smoothLoftProfiles = true, removedMaterialPoints = true, preserveIds = true, planarPerforations = true }, objects = Inventory(doc) };
    }

    private const ObjectType ModelObjectTypes = ObjectType.Brep | ObjectType.SubD;

    private static object[] Inventory(RhinoDoc doc) => doc.Objects
        .GetObjectList(ModelObjectTypes)
        .Select(obj =>
        {
            var shape = obj.Geometry;
            var bounds = shape.GetBoundingBox(true);
            var brep = shape as Brep;
            var subd = shape as SubD;
            using var volume = brep is { IsSolid: true } ? VolumeMassProperties.Compute(brep) : null;
            return (object)new
            {
                id = obj.Id, name = obj.Name, valid = shape.IsValid,
                geometryType = subd == null ? "Brep" : "SubD",
                closed = subd?.IsSolid ?? brep?.IsSolid ?? false,
                min = Coordinates(bounds.Min), max = Coordinates(bounds.Max),
                volume = volume?.Volume, controlVertices = subd?.Vertices.Count, controlFaces = subd?.Faces.Count,
            };
        }).ToArray();

    private static double[] Coordinates(Point3d p) => [p.X, p.Y, p.Z];

    private static object Build(RhinoDoc doc, JsonObject input, string checkpoint)
    {
        var op = input["operation"]?.GetValue<string>();
        if (input.ContainsKey("profileCurve") && op != "loft")
            throw new ArgumentException("profileCurve is only supported for loft.");
        if (input.ContainsKey("perforations") && op != "extrude")
            throw new ArgumentException("perforations is only supported for extrude.");
        var removedPoints = ReadRemovedMaterialPoints(input, op);
        object? materialRemoval = null;
        var name = input["name"]?.GetValue<string>()?.Trim();
        var ids = (input["ids"] as JsonArray)?.Select(id => Guid.Parse(id!.GetValue<string>())).ToArray() ?? [];
        if (ids.Length > 16 || ids.Distinct().Count() != ids.Length) throw new ArgumentException("Provide up to 16 different object IDs.");
        var targets = ids.Select(id => doc.Objects.FindId(id) ?? throw new ArgumentException($"Object {id} does not exist. Inspect current geometry.")).ToArray();
        var preserved = SnapshotPreservedParts(doc, input, op, ids);
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
                if (copy == null || !copy.Transform(transform) || !copy.IsValid || !ReplaceGeometry(doc, target.Id, copy))
                    throw new InvalidOperationException("The transformation did not produce valid geometry.");
            }
        }
        else if (op == "subd") AddSubD(doc, input, targets, name);
        else if (op == "edit_subd") EditSubD(doc, input, targets);
        else
        {
            if ((op is "union" or "difference") && targets.Any(target => target.Geometry is not Brep))
                throw new ArgumentException("This Boolean operation takes Brep solids. Keep SubD parts editable and model the matching opening in the control cage.");
            var origin = input["origin"] == null ? Point3d.Origin : Point(input["origin"]);
            var plane = new Plane(origin, input["axis"] == null ? Vector3d.ZAxis : Direction(input["axis"]));
            Brep[] shapes = op switch
            {
                "box" => [BoxShape(plane, input["size"])],
                "cylinder" => [new Cylinder(new Circle(plane, Length(input["radius"])), Length(input["height"])).ToBrep(true, true)],
                "sphere" => [new Sphere(origin, Length(input["radius"])).ToBrep()],
                "extrude" => [input.ContainsKey("perforations") ? ExtrudePerforations(input) : Extrude(input)],
                "loft" => Loft(input),
                "revolve" => [Revolve(plane, input["points"])],
                "union" when targets.Length >= 2 => Brep.CreateBooleanUnion(targets.Select(obj => (Brep)obj.Geometry), Tolerance) ?? [],
                "difference" when targets.Length >= 2 => Brep.CreateBooleanDifference(
                    new[] { (Brep)targets[0].Geometry }, targets.Skip(1).Select(obj => (Brep)obj.Geometry), Tolerance) ?? [],
                _ => throw new ArgumentException("Unsupported operation or missing target and cutter IDs."),
            };
            try
            {
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
                    if (shape.SolidOrientation != BrepSolidOrientation.Outward || mass == null || !double.IsFinite(mass.Volume) || mass.Volume <= Tolerance * Tolerance * Tolerance)
                        throw new InvalidOperationException("The solid has invalid orientation or volume.");
                }
                if (op == "difference")
                {
                    using var before = VolumeMassProperties.Compute((Brep)targets[0].Geometry);
                    var after = shapes.Sum(shape => { using var mass = VolumeMassProperties.Compute(shape); return mass.Volume; });
                    if (before == null || !double.IsFinite(before.Volume - after) || before.Volume - after <= Tolerance * Tolerance)
                        throw new InvalidOperationException("The cutter did not remove a measurable volume. Check the fit and penetration.");
                }
                using var attributes = PartAttributes(input, name, targets.FirstOrDefault()?.Name ?? op ?? "Part");
                materialRemoval = StoreBrepResults(doc, targets, shapes, attributes, removedPoints, preserved);
            }
            finally { foreach (var shape in shapes) shape?.Dispose(); }
        }
        var objects = Inventory(doc);
        Save(doc, checkpoint);
        return materialRemoval == null ? new { committed = true, operation = op, objects }
            : new { committed = true, operation = op, objects, materialRemoval };
    }

    private static bool ReplaceGeometry(RhinoDoc doc, Guid id, GeometryBase geometry) => geometry switch
    {
        Brep brep => doc.Objects.Replace(id, brep),
        SubD subd => doc.Objects.Replace(id, subd),
        _ => false,
    };

    private static ObjectAttributes PartAttributes(JsonObject input, string? name, string defaultName)
    {
        var color = Color.Empty;
        if (input["color"] is JsonValue value && value.TryGetValue<string>(out var rgb))
        {
            if (rgb.Length != 7 || rgb[0] != '#') throw new ArgumentException("Color must be #RRGGBB.");
            color = Color.FromArgb(255, Color.FromArgb(Convert.ToInt32(rgb[1..], 16)));
        }
        var attributes = new ObjectAttributes
        {
            Name = string.IsNullOrWhiteSpace(name) ? defaultName : name[..Math.Min(name.Length, 100)],
        };
        if (!color.IsEmpty)
        {
            attributes.ObjectColor = color;
            attributes.ColorSource = ObjectColorSource.ColorFromObject;
        }
        return attributes;
    }

    private static Brep BoxShape(Plane plane, JsonNode? dimensions)
    {
        var size = Vector(dimensions);
        var width = Length(size.X);
        var depth = Length(size.Y);
        using var profile = JoinLines([plane.Origin, plane.PointAt(width, 0), plane.PointAt(width, depth), plane.PointAt(0, depth), plane.Origin]);
        return Extrude(profile, plane.Normal * Length(size.Z));
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

    private static object Export(RhinoDoc doc, string directory) => ExportVerified(doc, directory);

    private static byte[] Preview(RhinoDoc doc) => ReviewSheet(CurrentReviewParts(doc));
}
