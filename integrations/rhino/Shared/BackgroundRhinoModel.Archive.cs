using Rhino.DocObjects;
using Rhino.FileIO;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    // Geometry wrappers are borrowed from the owning headless document / File3dm, never ActiveDoc.
    private sealed record ReviewPart(Guid Id, string? Name, GeometryBase Shape, Color Color);

    private static ReviewPart ReviewObject(ObjectAttributes attributes, GeometryBase shape) =>
        new(attributes.ObjectId, attributes.Name, shape, attributes.ColorSource == ObjectColorSource.ColorFromObject
            ? attributes.ObjectColor : Color.FromArgb(137, 164, 177));

    private static ReviewPart[] ReadArchiveParts(File3dm archive)
    {
        // Rhino 8's File3dmObjectTable implements IList for compatibility, but model geometry
        // component indices are not ordinal row numbers. LINQ Select(...).ToArray() takes
        // the IList fast path and can get null from table[i] even for a valid archive (038).
        // Traverse the actual manifest, including extras; never look up just the expected IDs.
        var table = archive.Objects;
        var count = table.Count;
        var parts = new List<ReviewPart>(count);
        foreach (var obj in table)
        {
            if (obj?.Attributes is not { } attributes || obj.Geometry is not { } geometry)
                throw new InvalidDataException($"3DM readback: missing object, attributes or geometry at enumerated row {parts.Count} of {count}.");
            parts.Add(ReviewObject(attributes, geometry));
        }
        if (parts.Count != count)
            throw new InvalidDataException($"3DM readback: table reports {count} objects but enumerated {parts.Count}.");
        return parts.OrderBy(p => p.Id).ToArray(); // Sort managed rows, not the native table.
    }
}
