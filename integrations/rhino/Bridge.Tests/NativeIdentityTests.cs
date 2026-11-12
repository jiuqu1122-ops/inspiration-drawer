using System.Text.Json.Nodes;
using InspirationDrawer.Rhino;

internal static class NativeIdentityTests
{
    internal static void Run(Action<bool, string> check)
    {
        const string id = "11111111-1111-1111-1111-111111111111";
        JsonObject Local(int count = 1) => new()
        {
            ["identityComplete"] = true, ["objectCount"] = count, ["layerCount"] = 1,
            ["objectIdentityMultiplicity"] = 1, ["fingerprintMultiplicity"] = 1,
            ["objectIds"] = count == 0 ? new JsonArray() : new JsonArray(id), ["selection"] = new JsonArray(),
            ["camera"] = new JsonObject { ["position"] = new JsonArray(0.0,0.0,10.0), ["target"] = new JsonArray(0.0,0.0,0.0) },
        };
        JsonObject Native(int count = 1) => new()
        {
            ["document"] = new JsonObject { ["objectCount"] = count, ["layerCount"] = 1 }, ["selection"] = new JsonArray(),
            ["activeViewport"] = new JsonObject { ["camera"] = new JsonObject { ["location"] = new JsonArray(0.0,0.0,10.0), ["target"] = new JsonArray(0.0,0.0,0.0) } },
        };
        JsonObject Inventory(int count = 1) => new() { ["count"] = count, ["truncated"] = false,
            ["objects"] = count == 0 ? new JsonArray() : new JsonArray(new JsonObject { ["id"] = id }) };
        bool Match(JsonObject a, JsonObject b, JsonObject c) => NativeRhinoMcpClient.IsMatch(a,b,c,out _);
        var local=Local(); var native=Native(); var objects=Inventory();
        native["activeViewport"]!["camera"]!["location"] = new JsonArray(100.0,200.0,300.0);
        native["selection"] = new JsonArray(new JsonObject { ["id"] = id });
        check(Match(local,native,objects), "nonempty unique complete object identity survives camera and selection changes between tool calls");
        local["objectIdentityMultiplicity"] = 2;
        check(!Match(local,native,objects), "cloned documents with equal IDs stay blocked even when camera fingerprints differ");
        local=Local(); objects["objects"]![0]!["id"] = "22222222-2222-2222-2222-222222222222";
        check(!Match(local,native,objects), "camera tolerance never allows a foreign object inventory");
        objects=Inventory(); objects["truncated"]=true;
        check(!Match(local,native,objects), "truncated inventory is never accepted for view or geometry operations");
        objects=Inventory(); objects["objects"]=new JsonArray();
        check(!Match(local,native,objects), "a matching reported count cannot hide missing object IDs");
        objects=Inventory(); local["identityComplete"]=false;
        check(!Match(local,native,objects), "incomplete local identity still disables all native dispatch");
        local=Local(); local.Remove("objectIdentityMultiplicity");
        check(!Match(local,native,objects), "legacy fingerprints keep strict camera/selection comparison rather than weakening identity");
        local=Local(0); native=Native(0); objects=Inventory(0);
        check(Match(local,native,objects), "one unambiguous empty document still matches strict camera context");
        native["activeViewport"]!["camera"]!["location"]=new JsonArray(100.0,0.0,10.0);
        check(!Match(local,native,objects), "empty documents never bypass camera matching because an ID inventory is empty");
        native=Native(0); local["fingerprintMultiplicity"]=2;
        check(!Match(local,native,objects), "indistinguishable empty documents remain blocked");
    }
}
