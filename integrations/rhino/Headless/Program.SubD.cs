using System.Text.Json.Nodes;
using InspirationDrawer.Rhino;
using Rhino;
using Rhino.DocObjects;
using Rhino.Geometry;

internal static partial class Program
{
    private static object Inspect(RhinoDoc doc, JsonObject input)
    {
        if (input["subdId"] == null) return new { units = "Millimeters", objects = Inventory(doc) };
        if (!Guid.TryParse(input["subdId"]!.GetValue<string>(), out var id) || doc.Objects.FindId(id) is not { } item)
            throw new ArgumentException("Inspect needs an existing SubD object ID.");
        return RhinoSubD.InspectCage(item, "Millimeters");
    }

    private static void AddSubD(RhinoDoc doc, JsonObject input, RhinoObject[] targets, string? name)
    {
        if (targets.Length > 1) throw new ArgumentException("A SubD cage may replace only one existing part.");
        if (targets.Length == 0 && doc.Objects.Count >= MaxParts) throw new ArgumentException("The document has reached its part limit.");
        using var subd = RhinoSubD.Create(input);
        using var attributes = PartAttributes(input, name, targets.FirstOrDefault()?.Name ?? "SubD");
        if (doc.Objects.AddSubD(subd, attributes) == Guid.Empty)
            throw new InvalidOperationException("Rhino did not add the SubD object.");
        if (targets.Length == 1 && !doc.Objects.Delete(targets[0].Id, true))
            throw new InvalidOperationException("Could not replace the previous part.");
    }

    private static void EditSubD(RhinoDoc doc, JsonObject input, RhinoObject[] targets)
    {
        if (targets.Length != 1 || targets[0].Geometry is not SubD original)
            throw new ArgumentException("Provide one SubD object ID from inspection.");
        using var subd = RhinoSubD.Edit(original, input);
        if (!doc.Objects.Replace(targets[0].Id, subd))
            throw new InvalidOperationException("Rhino did not save the edited SubD.");
    }
}
