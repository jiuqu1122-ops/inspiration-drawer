using System.Text.Json.Nodes;

namespace InspirationDrawer.Rhino;

internal static class SubDToolDefinitions
{
    internal const string Inspect = "drawer_subd_inspect";
    internal const string Build = "drawer_subd_build";

    internal static bool Includes(string name) => name is Inspect or Build;

    internal static JsonObject[] Create() =>
    [
        Tool(Inspect, "List native Rhino SubD objects in the bound document, or inspect the control vertices and crease edges of one object by subdId. Use the returned IDs for edits.",
            true, [], new JsonObject { ["subdId"] = new JsonObject { ["type"] = "string" } }),
        Tool(Build, "Create an editable native Rhino SubD in the bound document with operation subd. Supply ordered cross-sections for tapered housings, or an explicit cage of consistently wound triangle or quad faces when the shape requires openings or branches. For edit_subd, inspect the target and supply subdId with control point or crease edits. All coordinates use the document units.",
            false, ["operation"], new JsonObject
            {
                ["operation"] = new JsonObject { ["type"] = "string", ["enum"] = new JsonArray("subd", "edit_subd") },
                ["name"] = new JsonObject { ["type"] = "string", ["maxLength"] = 100 },
                ["subdId"] = new JsonObject { ["type"] = "string", ["description"] = "Existing native SubD object ID for edit_subd." },
                ["cageVertices"] = ArrayOf(Xyz(), 3, 384, "XYZ control cage coordinates."),
                ["cageFaces"] = ArrayOf(ArrayOf(Index(), 3, 4), 1, 512, "Each triangle or quad uses shared zero-based cage vertex indices."),
                ["sections"] = ArrayOf(ArrayOf(Xyz(), 3, 80), 2, 12, "Alternative to cageVertices/cageFaces. Ordered rings with the same winding, start position and vertex count. Omit repeated endpoints; use at most 384 total vertices. Set requireClosed to cap both ends."),
                ["creaseEdges"] = ArrayOf(ArrayOf(Index(), 2, 2), 0, 128, "Pairs of cage indices identifying actual edges to crease."),
                ["requireClosed"] = new JsonObject { ["type"] = "boolean", ["description"] = "Require a closed SubD. Existing closed SubD remains closed when edited." },
                ["cageEdits"] = ArrayOf(ObjectSchema(["vertexId", "point"], new JsonObject { ["vertexId"] = Id(), ["point"] = Xyz() }), 1, 384),
                ["creaseEdits"] = ArrayOf(ObjectSchema(["edgeId", "crease"], new JsonObject { ["edgeId"] = Id(), ["crease"] = new JsonObject { ["type"] = "boolean" } }), 1, 128),
            }),
    ];

    private static JsonObject Tool(string name, string description, bool readOnly, string[] required, JsonObject properties) => new()
    {
        ["name"] = name, ["description"] = description, ["inputSchema"] = ObjectSchema(required, properties),
        ["annotations"] = new JsonObject { ["readOnlyHint"] = readOnly, ["destructiveHint"] = false },
    };

    private static JsonObject ObjectSchema(string[] required, JsonObject properties) => new()
    {
        ["type"] = "object", ["required"] = new JsonArray(required.Select(key => (JsonNode?)JsonValue.Create(key)).ToArray()),
        ["additionalProperties"] = false, ["properties"] = properties,
    };

    private static JsonObject ArrayOf(JsonObject items, int min, int max, string? description = null)
    {
        var schema = new JsonObject { ["type"] = "array", ["items"] = items, ["minItems"] = min, ["maxItems"] = max };
        if (description != null) schema["description"] = description;
        return schema;
    }

    private static JsonObject Xyz() => ArrayOf(new JsonObject { ["type"] = "number" }, 3, 3);
    private static JsonObject Index() => new() { ["type"] = "integer", ["minimum"] = 0, ["maximum"] = 383 };
    private static JsonObject Id() => new() { ["type"] = "integer", ["minimum"] = 1, ["maximum"] = uint.MaxValue };
}
