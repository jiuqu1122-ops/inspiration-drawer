using System.Text.Json;
using System.Text.Json.Nodes;

namespace InspirationDrawer.Rhino;

internal static class JsonNodeCompat
{
#if NET7_0
    internal static JsonNode DeepClone(this JsonNode node) => JsonNode.Parse(node.ToJsonString())!;
#endif
    internal static bool DeepEquals(JsonNode? left, JsonNode? right)
    {
        if (left is null || right is null) return left is null && right is null;
        if (left is JsonObject a && right is JsonObject b)
            return a.Count == b.Count && a.All(pair => b.TryGetPropertyValue(pair.Key, out var value) && DeepEquals(pair.Value, value));
        if (left is JsonArray aa && right is JsonArray bb)
            return aa.Count == bb.Count && aa.Zip(bb).All(pair => DeepEquals(pair.First, pair.Second));
        if (left is not JsonValue || right is not JsonValue) return false;
        using var ad = JsonDocument.Parse(left.ToJsonString());
        using var bd = JsonDocument.Parse(right.ToJsonString());
        var av = ad.RootElement;
        var bv = bd.RootElement;
        if (av.ValueKind != bv.ValueKind) return false;
        return av.ValueKind switch
        {
            JsonValueKind.String => av.GetString() == bv.GetString(),
            JsonValueKind.Number => av.TryGetDecimal(out var an) && bv.TryGetDecimal(out var bn) ? an == bn : av.GetDouble() == bv.GetDouble(),
            _ => av.GetRawText() == bv.GetRawText(),
        };
    }
}
