using System.Text.Json;
using System.Text.Json.Nodes;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class RhinoTools
{
    private static JsonNode InspectSubD(RhinoDoc doc, JsonObject args)
    {
        var units = doc.ModelUnitSystem.ToString();
        if (args["subdId"] != null)
            return JsonSerializer.SerializeToNode(RhinoSubD.InspectCage(FindSubD(doc, args), units))!;

        var items = doc.Objects.GetObjectList(ObjectType.SubD).Where(obj => !obj.IsDeleted).Take(201).ToArray();
        return JsonSerializer.SerializeToNode(new
        {
            documentId = doc.RuntimeSerialNumber, units, truncated = items.Length > 200,
            objects = items.Take(200).Select(item => SubDInfo(item.Id, item.Name, (SubD)item.Geometry)).ToArray(),
        })!;
    }

    private static JsonNode BuildSubD(RhinoDoc doc, JsonObject args)
    {
        if (RhinoApp.InCommand != 0) throw new ArgumentException("Finish the open Rhino command before editing SubD.");
        var operation = args["operation"]?.GetValue<string>();
        var target = operation == "edit_subd" ? FindSubD(doc, args) : null;
        if (target != null && (target.IsLocked || target.IsReference || doc.Layers.FindIndex(target.Attributes.LayerIndex)?.IsLocked == true))
            throw new ArgumentException("The selected SubD is locked or referenced.");
        using var candidate = operation switch
        {
            "subd" when args["subdId"] == null => RhinoSubD.Create(args),
            "edit_subd" when target != null => RhinoSubD.Edit((SubD)target.Geometry, args),
            _ => throw new ArgumentException("Use subd to create a part or edit_subd with its inspected object ID."),
        };
        var name = target?.Name ?? args["name"]?.GetValue<string>()?.Trim();
        if (name?.Length > 100 && target == null) throw new ArgumentException("Names can contain up to 100 characters.");
        if (target != null && GeometryBase.GeometryEquals(target.Geometry, candidate))
        {
            return JsonSerializer.SerializeToNode(new
            {
                committed = false, unchanged = true, operation, documentId = doc.RuntimeSerialNumber,
                @object = SubDInfo(target.Id, target.Name, (SubD)target.Geometry),
            })!;
        }
        var undo = doc.BeginUndoRecord("Inspiration Drawer SubD");
        if (undo == 0) throw new InvalidOperationException("Rhino could not start an undo record for SubD modeling.");
        Guid id;
        try
        {
            if (target == null)
            {
                using var attributes = new ObjectAttributes { Name = string.IsNullOrEmpty(name) ? "SubD" : name };
                id = doc.Objects.AddSubD(candidate, attributes);
                if (id == Guid.Empty) throw new InvalidOperationException("Rhino did not add the SubD.");
            }
            else
            {
                id = target.Id;
                if (!doc.Objects.Replace(id, candidate)) throw new InvalidOperationException("Rhino did not replace the edited SubD.");
            }
        }
        finally { doc.EndUndoRecord(undo); }
        doc.Views.Redraw();
        return JsonSerializer.SerializeToNode(new
        {
            committed = true, operation, documentId = doc.RuntimeSerialNumber, units = doc.ModelUnitSystem.ToString(),
            @object = SubDInfo(id, doc.Objects.FindId(id)?.Name, candidate),
        })!;
    }

    private static RhinoObject FindSubD(RhinoDoc doc, JsonObject args)
    {
        if (!Guid.TryParse(args["subdId"]?.GetValue<string>(), out var id) ||
            doc.Objects.FindId(id) is not { Geometry: SubD } item || item.IsDeleted)
            throw new ArgumentException("Provide an existing SubD object ID from this document.");
        return item;
    }

    private static object SubDInfo(Guid id, string? name, SubD subd)
    {
        var bounds = subd.GetBoundingBox(true);
        return new
        {
            id, name, geometryType = "SubD", closed = subd.IsSolid, valid = subd.IsValid,
            min = RhinoSubD.Coordinates(bounds.Min), max = RhinoSubD.Coordinates(bounds.Max),
            controlVertices = subd.Vertices.Count, controlFaces = subd.Faces.Count,
        };
    }
}
