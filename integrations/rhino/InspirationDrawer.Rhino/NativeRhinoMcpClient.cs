using System.Diagnostics;
using System.Net.Http;
using System.Text;
using System.Text.Json.Nodes;

namespace InspirationDrawer.Rhino;

/// <summary>Discovers the official RhinoAI MCP listeners and forwards calls only after matching the bound document.</summary>
internal sealed class NativeRhinoMcpClient
{
    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(115) };
    // The official listener is process-scoped and may be rebound to a target
    // document. Serialize resolve+call so concurrent Rhino documents cannot race
    // that mutable listener context and write into the wrong file.
    private readonly SemaphoreSlim documentCallGate = new(1, 1);
    private readonly Func<uint, Task<JsonObject>> fingerprint;
    private readonly Func<uint, Task>? rebind;
    private readonly Func<IEnumerable<ushort>> listenerPorts;
    internal string LastDiscoveryDiagnostic { get; private set; } = "RhinoAI MCP not checked";

    internal NativeRhinoMcpClient(
        Func<uint, Task<JsonObject>> fingerprint,
        Func<uint, Task>? rebind = null,
        Func<IEnumerable<ushort>>? listenerPorts = null)
    {
        this.fingerprint = fingerprint;
        this.rebind = rebind;
        this.listenerPorts = listenerPorts ?? (() => ReadListeners().Select(listener => listener.Port).ToArray());
    }

    internal static bool IsCurrentProcessListening() => ReadListeners().Any();

    // Startup/rebind uses the same gate as resolve+call; a document-switch timer
    // must not change the official listener context during a dispatched tool.
    internal async Task Warmup(uint documentId, Func<bool>? mayRun = null)
    {
        if (rebind == null) return;
        await documentCallGate.WaitAsync();
        try { if (mayRun?.Invoke() != false) await rebind(documentId); }
        finally { documentCallGate.Release(); }
    }

    internal async Task<JsonObject?> Call(uint documentId, string toolName, JsonObject arguments)
    {
        await documentCallGate.WaitAsync();
        try
        {
            var binding = await Resolve(documentId);
            if (binding == null) return null;
            var listing = await Post(binding.Port, new JsonObject
            {
                ["jsonrpc"] = "2.0", ["id"] = Guid.NewGuid().ToString("N"), ["method"] = "tools/list", ["params"] = new JsonObject(),
            });
            var tools = listing["result"]?["tools"]?.AsArray();
            if (toolName.StartsWith("_router_", StringComparison.OrdinalIgnoreCase))
                throw new InvalidOperationException("Router-internal tools are not exposed to Chat.");
            if (tools == null || !tools.Any(tool => string.Equals(tool?["name"]?.GetValue<string>(), toolName, StringComparison.Ordinal)))
                throw new InvalidOperationException("Rhino \u539f\u751f MCP \u5de5\u5177\u5217\u8868\u5df2\u53d8\u5316\uff0c\u5df2\u963b\u6b62\u8c03\u7528");
            var body = new JsonObject
            {
                ["jsonrpc"] = "2.0",
                ["id"] = Guid.NewGuid().ToString("N"),
                ["method"] = "tools/call",
                ["params"] = new JsonObject { ["name"] = toolName, ["arguments"] = arguments.DeepClone() },
            };
            var response = await Post(binding.Port, body);
            if (response["error"] is JsonObject error)
                throw new InvalidOperationException(error["message"]?.GetValue<string>() ?? "Rhino 原生 MCP 工具调用失败");
            var result = response["result"]?.DeepClone() as JsonObject
                ?? throw new InvalidOperationException("Rhino 原生 MCP 没有返回工具结果");
            if (result["isError"]?.GetValue<bool>() == true)
            {
                var text = result["content"]?.AsArray().Select(item => item?["text"]?.GetValue<string>() ?? string.Empty).Where(text => text.Length > 0);
                throw new InvalidOperationException(string.Join("\n", text ?? []));
            }
            return result;
    
        }
        finally { documentCallGate.Release(); }
    }

    internal async Task<JsonObject> ListTools(uint documentId)
    {
        await documentCallGate.WaitAsync();
        try
        {
            var binding = await Resolve(documentId);
            if (binding == null)
                return new JsonObject { ["available"] = false, ["reason"] = LastDiscoveryDiagnostic, ["tools"] = new JsonArray() };
            var response = await Post(binding.Port, new JsonObject
            {
                ["jsonrpc"] = "2.0", ["id"] = Guid.NewGuid().ToString("N"), ["method"] = "tools/list", ["params"] = new JsonObject(),
            });
            var tools = response["result"]?["tools"]?.DeepClone().AsArray() ?? [];
            LastDiscoveryDiagnostic = $"Connected to native MCP port {binding.Port}; discovered {tools.Count} tools.";
            return new JsonObject { ["available"] = true, ["reason"] = LastDiscoveryDiagnostic, ["tools"] = tools };
    
        }
        finally { documentCallGate.Release(); }
    }

    private async Task<Listener?> Resolve(uint documentId) => await ResolveCore(documentId, allowRebind: true);

    private async Task<Listener?> ResolveCore(uint documentId, bool allowRebind)
    {
        JsonObject local;
        try { local = await fingerprint(documentId); }
        catch (Exception error) { LastDiscoveryDiagnostic = "Could not read the bound document fingerprint: " + error.Message; return null; }
        var listeners = listenerPorts().Where(port => port is > 0 and <= 65535).Distinct().Select(port => new Listener(port, [])).ToArray();
        if (listeners.Length == 0)
            LastDiscoveryDiagnostic = $"No native MCP listener announcement for current Rhino process {Environment.ProcessId}.";
        var matches = new List<Listener>();
        var failures = new List<string>();
        // The RhinoAI listener is process-scoped and can announce several stale files
        // after document switches. Probe every live listener, then match by document
        // fingerprint; never treat the first reachable port as authoritative.
        foreach (var listener in listeners)
        {
            try
            {
                var response = await Post(listener.Port, new JsonObject
                {
                    ["jsonrpc"] = "2.0", ["id"] = Guid.NewGuid().ToString("N"), ["method"] = "tools/list", ["params"] = new JsonObject(),
                });
                var tools = response["result"]?["tools"]?.AsArray();
                if (tools == null || !tools.Any(tool => tool?["name"]?.GetValue<string>() == "get_context"))
                { failures.Add($"port {listener.Port}: get_context is missing"); continue; }
                var context = await CallRaw(listener.Port, "get_context", new JsonObject());
                var native = ExtractContext(context);
                if (native == null) { failures.Add($"port {listener.Port}: get_context returned no JSON context"); continue; }
                var objects = await CallRaw(listener.Port, "list_objects", new JsonObject { ["limit"] = 10_001, ["includeHidden"] = true, ["includeLocked"] = true });
                var objectList = ExtractContext(objects);
                if (objectList == null) { failures.Add($"port {listener.Port}: list_objects returned no JSON list"); continue; }
                // UI/camera/selection can change while the read-only MCP probes are awaited.
                // Refresh the original bound document, never substitute ActiveDoc.
                local = await fingerprint(documentId);
                if (!IsMatch(local, native, objectList, out var mismatch)) { failures.Add($"port {listener.Port}: document mismatch ({mismatch})"); continue; }
                matches.Add(new Listener(listener.Port, tools.DeepClone().AsArray()));
            }
            catch (Exception error) { failures.Add($"port {listener.Port}: {error.Message}"); }
        }
        if (matches.Count > 1)
        {
            // Same port can be announced by stale duplicate files. Collapse exact
            // duplicates; only different matching ports are ambiguous.
            var uniquePorts = matches.Select(item => item.Port).Distinct().ToArray();
            if (uniquePorts.Length == 1)
            {
                LastDiscoveryDiagnostic = $"Unique document match on native MCP port {uniquePorts[0]} (duplicate listener announcements collapsed).";
                return matches[0] with { Port = uniquePorts[0] };
            }
            LastDiscoveryDiagnostic = "Multiple native MCP listeners matched this document; writes are disabled.";
            return null;
        }
        if (matches.Count == 1)
        {
            LastDiscoveryDiagnostic = $"Unique document match on native MCP port {matches[0].Port}.";
            return matches[0];
        }
        LastDiscoveryDiagnostic = failures.Count == 0 ? "No native MCP listener exposed the expected tools." : string.Join("; ", failures.Take(3));
        if (allowRebind && rebind != null)
        {
            try
            {
                await rebind(documentId);
                await Task.Delay(350);
                return await ResolveCore(documentId, allowRebind: false);
            }
            catch (Exception error)
            {
                LastDiscoveryDiagnostic += $"; automatic MCP rebind failed: {error.Message}";
            }
        }
        return null;
    }

    private static JsonNode? Get(JsonObject? value, string name)
    {
        if (value == null) return null;
        if (value[name] is JsonNode exact) return exact;
        return value.FirstOrDefault(pair => string.Equals(pair.Key, name, StringComparison.OrdinalIgnoreCase)).Value;
    }

    internal static bool IsMatch(JsonObject local, JsonObject native, JsonObject nativeObjectList, out string mismatch)
    {
        mismatch = string.Empty;
        if (Get(local, "identityComplete")?.GetValue<bool>() != true) { mismatch = "local object ID inventory is incomplete"; return false; }
        var nativeDocument = Get(native, "document") as JsonObject;
        var localObjectCount = Get(local, "objectCount")?.GetValue<int>() ?? -1;
        var contextObjectCount = Get(nativeDocument, "objectCount")?.GetValue<int>() ?? -1;
        if (localObjectCount != contextObjectCount) { mismatch = $"document object counts differ (local {localObjectCount}, native {contextObjectCount})"; return false; }
        if (localObjectCount != (Get(nativeObjectList, "count")?.GetValue<int>() ?? -1)) { mismatch = "native list_objects count differs"; return false; }
        if (Get(nativeObjectList, "truncated")?.GetValue<bool>() != false) { mismatch = "native object inventory is truncated"; return false; }
        var localLayerCount = Get(local, "layerCount")?.GetValue<int>() ?? -1;
        var nativeLayerCount = Get(nativeDocument, "layerCount")?.GetValue<int>() ?? -1;
        if (localLayerCount != nativeLayerCount) { mismatch = $"layer counts differ (local {localLayerCount}, native {nativeLayerCount})"; return false; }
        var localIds = Ids(Get(local, "objectIds"));
        var nativeIds = Ids(Get(nativeObjectList, "objects"));
        if (localObjectCount < 0 || localIds.Count != localObjectCount || nativeIds.Count != localObjectCount ||
            localIds.Distinct(StringComparer.OrdinalIgnoreCase).Count() != localIds.Count || nativeIds.Distinct(StringComparer.OrdinalIgnoreCase).Count() != nativeIds.Count)
        { mismatch = "object ID inventory count or uniqueness is invalid"; return false; }
        if (!localIds.SequenceEqual(nativeIds, StringComparer.OrdinalIgnoreCase)) { mismatch = "full object ID inventories differ"; return false; }
        // For nonempty documents the complete ID set, proven unique among all
        // open documents, is stronger identity than mutable camera/selection.
        // Copies with identical IDs remain ambiguous even if their views differ.
        var objectMultiplicity = Get(local, "objectIdentityMultiplicity")?.GetValue<int>();
        if (localObjectCount > 0 && objectMultiplicity.HasValue)
        {
            if (objectMultiplicity != 1) { mismatch = "multiple open documents share the complete object identity"; return false; }
            return true;
        }
        // Empty/legacy fingerprints cannot prove stable object identity. Keep
        // strict context matching here; never choose the first listener.
        if ((Get(local, "fingerprintMultiplicity")?.GetValue<int>() ?? 0) != 1) { mismatch = "multiple open documents have the same fingerprint"; return false; }
        if (!Ids(Get(local, "selection")).SequenceEqual(Ids(Get(native, "selection")), StringComparer.OrdinalIgnoreCase)) { mismatch = "selected IDs differ"; return false; }
        var localCamera = Get(local, "camera") as JsonObject;
        var nativeViewport = Get(native, "activeViewport") as JsonObject;
        var nativeCamera = Get(nativeViewport, "camera") as JsonObject;
        if (localCamera == null || nativeCamera == null)
        {
            var equal = localCamera == null && nativeCamera == null;
            if (!equal) mismatch = "active viewport state differs";
            return equal;
        }
        if (!Close(Get(localCamera, "position"), Get(nativeCamera, "location"))) { mismatch = "camera positions differ"; return false; }
        if (!Close(Get(localCamera, "target"), Get(nativeCamera, "target"))) { mismatch = "camera targets differ"; return false; }
        return true;
    }

    private static List<string> Ids(JsonNode? value) => value is JsonArray array
        ? array.Select(item =>
            {
                if (item is JsonValue scalar)
                {
                    try { return scalar.GetValue<string>(); } catch { return string.Empty; }
                }
                return Get(item as JsonObject, "id")?.GetValue<string>() ?? string.Empty;
            })
            .Where(id => id.Length > 0)
            .OrderBy(id => id, StringComparer.OrdinalIgnoreCase)
            .ToList()
        : [];
    private static bool Close(JsonNode? left, JsonNode? right)
    {
        static double[]? Values(JsonNode? value)
        {
            if (value is JsonArray array && array.Count == 3)
            {
                try { return array.Select(item => item!.GetValue<double>()).ToArray(); } catch { return null; }
            }
            if (value is JsonObject point)
            {
                try { return [Get(point, "x")!.GetValue<double>(), Get(point, "y")!.GetValue<double>(), Get(point, "z")!.GetValue<double>()]; } catch { return null; }
            }
            return null;
        }
        var a = Values(left);
        var b = Values(right);
        return a != null && b != null && a.Zip(b).All(pair => Math.Abs(pair.First - pair.Second) < 1e-5);
    }

    private static JsonObject? ExtractContext(JsonObject response)
    {
        var result = Get(response, "result") as JsonObject;
        foreach (var item in Get(result, "content")?.AsArray() ?? [])
        {
            var text = Get(item as JsonObject, "text")?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(text)) continue;
            try { if (JsonNode.Parse(text) is JsonObject value) return value; } catch { }
        }
        return null;
    }

    private static async Task<JsonObject> CallRaw(ushort port, string name, JsonObject arguments)
        => await Post(port, new JsonObject
        {
            ["jsonrpc"] = "2.0", ["id"] = Guid.NewGuid().ToString("N"), ["method"] = "tools/call",
            ["params"] = new JsonObject { ["name"] = name, ["arguments"] = arguments },
        });

    private static async Task<JsonObject> Post(ushort port, JsonObject body)
    {
        using var content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
        using var response = await Http.PostAsync($"http://127.0.0.1:{port}/", content);
        var text = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode) throw new InvalidOperationException($"Rhino 原生 MCP 返回 HTTP {(int)response.StatusCode}");
        return JsonNode.Parse(text)?.AsObject() ?? throw new InvalidOperationException("Rhino 原生 MCP 返回了无效 JSON");
    }

    private static IEnumerable<Listener> ReadListeners()
    {
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "McNeel", "Rhinoceros", "ai", "listeners");
        if (!Directory.Exists(directory)) yield break;
        string[] files;
        try { files = Directory.EnumerateFiles(directory, "*.json").Take(256).ToArray(); } catch { yield break; }
        var seenPorts = new HashSet<ushort>();
        foreach (var file in files)
        {
            JsonObject? value;
            try
            {
                var info = new FileInfo(file);
                if (info.Length > 4096) continue;
                value = JsonNode.Parse(File.ReadAllText(file))?.AsObject();
            }
            catch { continue; }
            int version, pid, port;
            try
            {
                version = value?["v"]?.GetValue<int>() ?? 0;
                pid = value?["pid"]?.GetValue<int>() ?? 0;
                port = value?["port"]?.GetValue<int>() ?? 0;
            }
            catch { continue; }
            if (version != 1 || pid <= 0 || port is < 1 or > 65535 || pid != Environment.ProcessId) continue;
            if (!string.Equals(Path.GetFileName(file), $"{pid}-{port}.json", StringComparison.OrdinalIgnoreCase)) continue;
            try
            {
                using var process = Process.GetProcessById(pid);
                if (!string.Equals(process.ProcessName, "Rhino", StringComparison.OrdinalIgnoreCase)) continue;
            }
            catch { continue; }
            if (seenPorts.Add((ushort)port)) yield return new Listener((ushort)port, []);
        }
    }

    private sealed record Listener(ushort Port, JsonArray Tools);
}
