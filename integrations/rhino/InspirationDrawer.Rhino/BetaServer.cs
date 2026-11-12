using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;

namespace InspirationDrawer.Rhino;

/// <summary>Loopback-only Beta transport; never executes model requests itself.</summary>
internal sealed class BetaServer : IDisposable
{
    internal string Token { get; } = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
    internal string InstanceId { get; } = Guid.NewGuid().ToString("N");
    internal string Url { get; }
    private readonly TcpListener listener = new(IPAddress.Loopback, 0);
    private readonly CancellationTokenSource stopped = new();
    private readonly SemaphoreSlim connections = new(16);
    private readonly object gate = new();
    private readonly string descriptor;
    private readonly Func<string, JsonObject, Task<JsonNode>> callTool;
    private readonly Func<uint, Task<JsonNode>> getContext;
    private readonly Func<uint, Task<JsonNode>> getParts;
    private readonly NativeRhinoMcpClient? nativeMcp;
    private readonly Dictionary<uint, JsonObject> documentSnapshots = new();
    private readonly Dictionary<string, JsonObject> commands = new();
    private readonly Dictionary<string, (DateTime At, string Image)> imagePreviews = new();
    private JsonObject snapshot = new();
    private string? owner;
    private DateTime lastHeartbeat = DateTime.MinValue;

    internal BetaServer(string descriptor, Func<string, JsonObject, Task<JsonNode>> callTool, Func<uint, Task<JsonNode>> getContext, Func<uint, Task<JsonNode>> getParts, NativeRhinoMcpClient? nativeMcp = null)
    {
        this.descriptor = descriptor;
        this.callTool = callTool;
        this.getContext = getContext;
        this.getParts = getParts;
        this.nativeMcp = nativeMcp;
        listener.Start();
        Url = $"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/";
        var directory = Path.GetDirectoryName(descriptor)!;
        Directory.CreateDirectory(directory);
        var temporary = descriptor + "." + InstanceId + ".tmp";
        File.WriteAllText(temporary, new JsonObject { ["protocol"] = 1, ["url"] = Url, ["token"] = Token, ["instanceId"] = InstanceId, ["processId"] = Environment.ProcessId }.ToJsonString());
        File.Move(temporary, descriptor, true);
        _ = AcceptLoop();
    }

    internal Task WarmNativeMcp(uint documentId, Func<bool>? mayRun = null) => nativeMcp?.Warmup(documentId, mayRun) ?? Task.CompletedTask;

    private async Task AcceptLoop()
    {
        try
        {
            while (!stopped.IsCancellationRequested)
            {
                await connections.WaitAsync(stopped.Token);
                TcpClient client;
                try { client = await listener.AcceptTcpClientAsync(stopped.Token); }
                catch { connections.Release(); throw; }
                _ = Handle(client);
            }
        }
        catch (OperationCanceledException) { }
        catch (ObjectDisposedException) { }
        catch (SocketException) when (stopped.IsCancellationRequested) { }
    }

    private async Task Handle(TcpClient client)
    {
        using (client)
        using (var timeout = CancellationTokenSource.CreateLinkedTokenSource(stopped.Token))
        {
            timeout.CancelAfter(TimeSpan.FromSeconds(125));
            var stream = client.GetStream();
            string? origin = null;
            try
            {
                // One request per connection, bounded headers/body, no ambiguous transfer encoding.
                var bytes = new List<byte>();
                var one = new byte[1];
                while (true)
                {
                    if (bytes.Count >= 16_384) throw new ApiError(413, "请求头过大");
                    if (await stream.ReadAsync(one, timeout.Token) == 0) return;
                    bytes.Add(one[0]);
                    if (bytes.Count >= 4 && bytes[^4] == 13 && bytes[^3] == 10 && bytes[^2] == 13 && bytes[^1] == 10) break;
                }
                var lines = Encoding.ASCII.GetString(bytes.ToArray()).Split("\r\n", StringSplitOptions.None);
                var first = lines[0].Split(' ');
                if (first.Length != 3 || first[2] != "HTTP/1.1" || !first[1].StartsWith('/') || first[1].StartsWith("//")) throw new ApiError(400, "HTTP 请求无效");
                var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                foreach (var line in lines.Skip(1).Where(line => line.Length > 0))
                {
                    var colon = line.IndexOf(':');
                    if (colon < 1 || !headers.TryAdd(line[..colon], line[(colon + 1)..].Trim())) throw new ApiError(400, "HTTP 请求头无效或重复");
                }
                var uri = new Uri(Url.TrimEnd('/') + first[1]);
                if (headers.GetValueOrDefault("Host") != new Uri(Url).Authority || headers.ContainsKey("Transfer-Encoding")) throw new ApiError(400, "HTTP Host 或传输格式无效");
                origin = headers.GetValueOrDefault("Origin");
                var allowed = origin == null || origin == Url.TrimEnd('/') || origin is "http://tauri.localhost" or "https://tauri.localhost" or "tauri://localhost" or "http://localhost:1420" or "http://127.0.0.1:1420";
                if (!allowed) { origin = null; throw new ApiError(403, "不允许的连接来源"); }
                if (first[0] == "OPTIONS") { await Respond(stream, 204, "", "text/plain", origin); return; }
                if (first[0] == "GET" && uri.AbsolutePath is "/" or "/panel.js" or "/panel.css" or "/parts.css" or "/markdown.js" or "/markdown.css" or "/image-preview.js" or "/image-preview.css")
                {
                    var name = uri.AbsolutePath == "/" ? "index.html" : uri.AbsolutePath[1..];
                    var assembly = typeof(BetaServer).Assembly;
                    using var resource = assembly.GetManifestResourceStream($"InspirationDrawer.Rhino.Panel.{name}");
                    if (resource == null) throw new ApiError(404, "面板资源不存在");
                    using var reader = new StreamReader(resource);
                    await Respond(stream, 200, await reader.ReadToEndAsync(), name.EndsWith(".js") ? "application/javascript" : name.EndsWith(".css") ? "text/css" : "text/html", origin);
                    return;
                }
                var auth = headers.GetValueOrDefault("Authorization", "");
                var expected = Encoding.UTF8.GetBytes("Bearer " + Token);
                if (!CryptographicOperations.FixedTimeEquals(expected, Encoding.UTF8.GetBytes(auth))) throw new ApiError(401, "连接令牌无效，请重新打开面板");
                var length = 0;
                if (headers.TryGetValue("Content-Length", out var declared) && (!int.TryParse(declared, out length) || length < 0 || length > 8 * 1024 * 1024)) throw new ApiError(413, "请求体过大或无效");
                var payload = new byte[length];
                await stream.ReadExactlyAsync(payload, timeout.Token);
                var body = length == 0 ? new JsonObject() : JsonNode.Parse(payload) as JsonObject ?? throw new ApiError(400, "需要 JSON 对象");
                JsonNode result;
                if (first[0] == "GET" && uri.AbsolutePath == "/panel/state")
                {
                    var documentId = ParseDocumentQuery(uri.Query);
                    var context = await getContext(documentId);
                    lock (gate)
                    {
                        var documentCommands = commands.Values.Where(value => value["request"]?["documentId"]?.GetValue<uint>() == documentId).TakeLast(8);
                        var hasDocumentSnapshot = documentSnapshots.TryGetValue(documentId, out var savedSnapshot);
                        var documentSnapshot = hasDocumentSnapshot
                            ? savedSnapshot!.DeepClone() as JsonObject ?? new JsonObject()
                            : snapshot.DeepClone() as JsonObject ?? new JsonObject();
                        documentSnapshot["documentId"] = documentId;
                        if (!hasDocumentSnapshot)
                        {
                            documentSnapshot["conversationId"] = "";
                            documentSnapshot["conversations"] = new JsonArray();
                            documentSnapshot["messages"] = new JsonArray();
                            documentSnapshot["busy"] = false;
                            documentSnapshot["stoppable"] = false;
                        }
                        var activeDocumentCommand = commands.Values.Where(value =>
                            value["request"]?["documentId"]?.GetValue<uint>() == documentId &&
                            value["request"]?["kind"]?.GetValue<string>() == "send" &&
                            value["status"]?.GetValue<string>() is "pending" or "accepted").LastOrDefault();
                        if (activeDocumentCommand != null)
                        {
                            var stopAlreadyRequested = commands.Values.Any(value =>
                                value["request"]?["documentId"]?.GetValue<uint>() == documentId &&
                                value["request"]?["kind"]?.GetValue<string>() == "stop" &&
                                value["status"]?.GetValue<string>() is "pending" or "accepted");
                            documentSnapshot["busy"] = true;
                            documentSnapshot["stoppable"] = activeDocumentCommand["status"]?.GetValue<string>() == "accepted" && !stopAlreadyRequested;
                        }
                        result = new JsonObject
                        {
                            ["connected"] = Connected,
                            ["instanceId"] = InstanceId,
                            ["processId"] = Environment.ProcessId,
                            ["state"] = documentSnapshot,
                            ["context"] = context,
                            ["commands"] = new JsonArray(documentCommands.Select(value => value.DeepClone()).ToArray()),
                        };
                    }
                }
                else if (first[0] == "GET" && uri.AbsolutePath == "/panel/parts")
                    result = await getParts(ParseDocumentQuery(uri.Query));
                else if (first[0] != "POST") throw new ApiError(404, "接口不存在");
                else result = uri.AbsolutePath switch
                {
                    "/drawer/heartbeat" => Heartbeat(body),
                    "/drawer/ack" => Ack(body),
                    "/panel/command" => Enqueue(body),
                    "/panel/image" => PreviewImage(body),
                    "/mcp" => await Mcp(body),
                    _ => throw new ApiError(404, "接口不存在"),
                };
                await Respond(stream, 200, result.ToJsonString(), "application/json", origin);
            }
            catch (OperationCanceledException) { }
            catch (IOException) { }
            catch (Exception error)
            {
                try { await Respond(stream, error is ApiError api ? api.Status : error is System.Text.Json.JsonException ? 400 : 500, new JsonObject { ["error"] = error.Message }.ToJsonString(), "application/json", origin); }
                catch { /* Client already disconnected. */ }
            }
            finally { connections.Release(); }
        }
    }

    private static uint ParseDocumentQuery(string query)
    {
        if (!query.StartsWith("?documentId=") || !uint.TryParse(query[12..], out var id) || id == 0) throw new ApiError(400, "文档 ID 无效");
        return id;
    }
    private bool Connected => (DateTime.UtcNow - lastHeartbeat).TotalSeconds < 8;

    private JsonNode Heartbeat(JsonObject body)
    {
        var caller = body["owner"]?.GetValue<string>() ?? "";
        if (!Guid.TryParse(caller, out _)) throw new ApiError(400, "Invalid runtime owner");
        lock (gate)
        {
            if (owner != caller && Connected) throw new ApiError(409, "Another desktop Chat runtime owns the bridge");
            owner = caller;
            lastHeartbeat = DateTime.UtcNow;
            snapshot = body["state"]?.DeepClone() as JsonObject ?? throw new ApiError(400, "Missing runtime state");
            if (snapshot["documents"] is JsonArray documentStates)
            {
                foreach (var node in documentStates.OfType<JsonObject>())
                {
                    var documentId = node["documentId"]?.GetValue<uint>() ?? 0;
                    if (documentId > 0) documentSnapshots[documentId] = node.DeepClone().AsObject();
                }
            }
            var activeDocumentId = snapshot["documentId"]?.GetValue<uint>() ?? 0;
            if (activeDocumentId > 0) documentSnapshots[activeDocumentId] = snapshot.DeepClone().AsObject();
            // The renderer is shared, but each pending operation remains pinned
            // to its Rhino document and is checked against that document's runtime.
            var command = commands.Values.FirstOrDefault(value => value["status"]?.GetValue<string>() == "pending");
            return new JsonObject { ["command"] = command?["request"]?.DeepClone() };
        }
    }

    private JsonNode Enqueue(JsonObject body)
    {
        var id = body["id"]?.GetValue<string>() ?? "";
        var kind = body["kind"]?.GetValue<string>() ?? "";
        if (id.Length is < 8 or > 100 || id.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-')) throw new ApiError(400, "Invalid command id");
        if (kind is not ("send" or "stop" or "new" or "select" or "delete" or "model" or "image-model" or "image-aspect-ratio" or "image-resolution" or "image-quality" or "mask-mode" or "approve-tool" or "preview-image")) throw new ApiError(400, "Invalid command kind");
        var documentId = body["documentId"]?.GetValue<uint>() ?? 0;
        if (documentId == 0) throw new ApiError(400, "Missing target document");
        if (kind == "send" && (string.IsNullOrWhiteSpace(body["content"]?.GetValue<string>()) || body["content"]!.GetValue<string>().Length > 12_000)) throw new ApiError(400, "Message length must be 1..12000 characters");
        lock (gate)
        {
            if (commands.TryGetValue(id, out var duplicate))
            {
                if (!JsonNodeCompat.DeepEquals(duplicate["request"], body)) throw new ApiError(409, "Command id was reused with a different payload");
                return duplicate.DeepClone();
            }
            if (!Connected) throw new ApiError(503, "No live desktop Chat runtime is connected");
            var documentSnapshot = documentSnapshots.TryGetValue(documentId, out var saved)
                ? saved
                : snapshot;
            var snapshotDocumentId = documentSnapshot["documentId"]?.GetValue<uint>() ?? 0;
            var sameDocumentSnapshot = snapshotDocumentId == documentId;
            PruneImagePreviews();
            if (kind == "preview-image")
            {
                var conversationId = body["conversationId"]?.GetValue<string>();
                var messageId = body["messageId"]?.GetValue<string>();
                var imageIndex = body["imageIndex"]?.GetValue<int>() ?? -1;
                if (!sameDocumentSnapshot || string.IsNullOrWhiteSpace(conversationId) || conversationId != documentSnapshot["conversationId"]?.GetValue<string>() ||
                    string.IsNullOrWhiteSpace(messageId) || imageIndex is < 0 or > 100 ||
                    documentSnapshot["messages"] is not JsonArray messages ||
                    !messages.OfType<JsonObject>().Any(message => message["id"]?.GetValue<string>() == messageId && message["images"] is JsonArray images && images.Count > 0 && (message["imageIndices"] is JsonArray indices ? indices.Any(index => index?.GetValue<int>() == imageIndex) : imageIndex < images.Count)))
                    throw new ApiError(409, "Image is stale or belongs to another Rhino conversation");
                if (commands.Values.Count(command => command["request"]?["kind"]?.GetValue<string>() == "preview-image" && command["status"]?.GetValue<string>() is "pending" or "accepted") >= 4)
                    throw new ApiError(409, "Too many image previews are loading");
            }
            if (kind == "delete")
            {
                var conversationId = body["conversationId"]?.GetValue<string>();
                if (!sameDocumentSnapshot || string.IsNullOrWhiteSpace(conversationId) || conversationId != documentSnapshot["conversationId"]?.GetValue<string>() ||
                    documentSnapshot["conversations"] is not JsonArray conversations ||
                    !conversations.OfType<JsonObject>().Any(item => item["id"]?.GetValue<string>() == conversationId))
                    throw new ApiError(409, "Selected Rhino conversation changed or no longer belongs to this document");
            }
            var active = commands.Values.Any(command =>
                command["request"]?["documentId"]?.GetValue<uint>() == documentId &&
                command["status"]?.GetValue<string>() is "pending" or "accepted");
            if (kind == "approve-tool")
            {
                var toolCallId = body["toolCallId"]?.GetValue<string>();
                var conversationId = body["conversationId"]?.GetValue<string>();
                var approved = body["approved"]?.GetValue<bool>();
                if (!sameDocumentSnapshot || string.IsNullOrWhiteSpace(toolCallId) || approved is null ||
                    string.IsNullOrWhiteSpace(conversationId) || conversationId != documentSnapshot["conversationId"]?.GetValue<string>() ||
                    !HasAwaitingNativeApproval(documentSnapshot, toolCallId))
                    throw new ApiError(409, "Native Rhino approval is stale or no longer available");
                if (commands.Values.Any(command => command["request"]?["kind"]?.GetValue<string>() == "approve-tool" &&
                    command["request"]?["documentId"]?.GetValue<uint>() == documentId &&
                    command["request"]?["toolCallId"]?.GetValue<string>() == toolCallId &&
                    command["status"]?.GetValue<string>() is "pending" or "accepted"))
                    throw new ApiError(409, "This native tool approval has already been submitted");
            }
            else if (kind is not ("stop" or "preview-image") && (active || (sameDocumentSnapshot && documentSnapshot["busy"]?.GetValue<bool>() == true)))
                throw new ApiError(409, "Another command for this Rhino document is active; wait or stop that document's task");
            if (kind == "stop" && commands.Values.Any(command =>
                command["request"]?["documentId"]?.GetValue<uint>() == documentId &&
                command["request"]?["kind"]?.GetValue<string>() == "stop" &&
                command["status"]?.GetValue<string>() is "pending" or "accepted"))
                throw new ApiError(409, "A stop has already been requested for this document");
            if (commands.Count >= 300) throw new ApiError(409, "Beta command history is full; restart the plugin after tasks finish");
            var item = new JsonObject { ["id"] = id, ["status"] = "pending", ["request"] = body.DeepClone() };
            commands.Add(id, item);
            return item.DeepClone();
        }
    }

    private static bool HasAwaitingNativeApproval(JsonObject snapshot, string toolCallId)
    {
        if (snapshot["messages"] is not JsonArray messages) return false;
        return messages
            .OfType<JsonObject>()
            .SelectMany(message => message["tools"] is JsonArray tools
                ? tools.OfType<JsonObject>()
                : Enumerable.Empty<JsonObject>())
            .Any(tool => tool["id"]?.GetValue<string>() == toolCallId &&
                tool["status"]?.GetValue<string>() == "awaiting-approval" &&
                (tool["name"]?.GetValue<string>() ?? "").StartsWith("rhino_native_", StringComparison.Ordinal));
    }

    private JsonNode Ack(JsonObject body)
    {
        lock (gate)
        {
            if (body["owner"]?.GetValue<string>() != owner) throw new ApiError(409, "Desktop Chat runtime lease changed");
            var id = body["id"]?.GetValue<string>() ?? "";
            if (!commands.TryGetValue(id, out var item)) throw new ApiError(404, "Command not found");
            var status = body["status"]?.GetValue<string>() ?? "";
            var previous = item["status"]?.GetValue<string>();
            if (status is not ("accepted" or "completed" or "failed")) throw new ApiError(400, "Invalid command status");
            if (previous is "completed" or "failed") return item.DeepClone();
            if (status != "accepted" && previous != "accepted") throw new ApiError(409, "Command was not accepted by its runtime");
            if (item["request"]?["kind"]?.GetValue<string>() == "preview-image" && status == "completed")
            {
                var image = body["image"]?.GetValue<string>() ?? "";
                if (image.Length > 4 * 1024 * 1024 || !(image.StartsWith("data:image/jpeg;base64,", StringComparison.Ordinal) || image.StartsWith("data:image/png;base64,", StringComparison.Ordinal) || image.StartsWith("data:image/webp;base64,", StringComparison.Ordinal)))
                    throw new ApiError(400, "Invalid preview image");
                try { Convert.FromBase64String(image[(image.IndexOf(',') + 1)..]); }
                catch (FormatException) { throw new ApiError(400, "Invalid preview encoding"); }
                PruneImagePreviews();
                if (imagePreviews.Count >= 8) imagePreviews.Remove(imagePreviews.OrderBy(pair => pair.Value.At).First().Key);
                imagePreviews[id] = (DateTime.UtcNow, image);
            }
            item["status"] = status;
            item["error"] = body["error"]?.GetValue<string>() is string error ? error[..Math.Min(error.Length, 800)] : null;
            return item.DeepClone();
        }
    }

    private void PruneImagePreviews()
    {
        foreach (var key in imagePreviews.Where(pair => (DateTime.UtcNow - pair.Value.At).TotalSeconds > 60).Select(pair => pair.Key).ToArray()) imagePreviews.Remove(key);
        // Image reads do not exhaust modeling command history.
        foreach (var key in commands.Where(pair => pair.Value["request"]?["kind"]?.GetValue<string>() == "preview-image" && pair.Value["status"]?.GetValue<string>() is "completed" or "failed").Take(Math.Max(0, commands.Count - 16)).Select(pair => pair.Key).ToArray())
        { commands.Remove(key); imagePreviews.Remove(key); }
    }

    private JsonNode PreviewImage(JsonObject body)
    {
        lock (gate)
        {
            PruneImagePreviews();
            var id = body["id"]?.GetValue<string>() ?? "";
            var documentId = body["documentId"]?.GetValue<uint>() ?? 0;
            var conversationId = body["conversationId"]?.GetValue<string>() ?? "";
            if (!commands.TryGetValue(id, out var command) || command["request"]?["kind"]?.GetValue<string>() != "preview-image" || documentId == 0 ||
                command["request"]?["documentId"]?.GetValue<uint>() != documentId || command["request"]?["conversationId"]?.GetValue<string>() != conversationId ||
                !documentSnapshots.TryGetValue(documentId, out var current) || current["conversationId"]?.GetValue<string>() != conversationId)
                throw new ApiError(409, "Image preview belongs to a different document or conversation");
            if (command["status"]?.GetValue<string>() == "completed")
            {
                if (!imagePreviews.TryGetValue(id, out var image)) throw new ApiError(410, "Image preview expired; open it again");
                return new JsonObject { ["status"] = "completed", ["image"] = image.Image };
            }
            return new JsonObject { ["status"] = command["status"]?.DeepClone(), ["error"] = command["error"]?.DeepClone() };
        }
    }

    private static JsonObject ToolSchema(string name)
    {
        var properties = new JsonObject { ["documentId"] = new JsonObject { ["type"] = "integer" } };
        if (name is "rhino_list_objects" or "rhino_list_parts")
            properties["limit"] = new JsonObject { ["type"] = "integer", ["minimum"] = 1, ["maximum"] = 200 };
        if (name == "rhino_list_objects") properties["layer"] = new JsonObject { ["type"] = "string" };
        if (name == "rhino_capture_viewport")
        {
            properties["includeMask"] = new JsonObject { ["type"] = "boolean" };
            properties["shaded"] = new JsonObject { ["type"] = "boolean", ["description"] = "capture in a clean Shaded mode and restore the previous display mode" };
            properties["rendered"] = new JsonObject { ["type"] = "boolean", ["description"] = "capture in a clean Rendered mode and restore the previous display mode" };
            properties["maskLayer"] = new JsonObject { ["type"] = "string", ["description"] = "selection\uff08\u5f53\u524d\u9009\u62e9\uff09\u6216\u5b8c\u6574\u56fe\u5c42\u8def\u5f84" };
        }
        if (name == "rhino_call_native_tool")
        {
            properties["toolName"] = new JsonObject { ["type"] = "string", ["minLength"] = 1, ["maxLength"] = 128 };
            properties["arguments"] = new JsonObject { ["type"] = "object", ["additionalProperties"] = true };
        }
        var required = new JsonArray("documentId");
        if (name == "rhino_call_native_tool") required.Add("toolName");
        return new JsonObject
        {
            ["type"] = "object", ["required"] = required,
            ["properties"] = properties, ["additionalProperties"] = false,
        };
    }

    private async Task<JsonNode> Mcp(JsonObject body)
    {
        var id = body["id"]?.DeepClone();
        var method = body["method"]?.GetValue<string>();
        JsonNode result;
        if (method == "initialize") result = new JsonObject
        {
            ["protocolVersion"] = "2025-06-18", ["capabilities"] = new JsonObject { ["tools"] = new JsonObject() },
            ["serverInfo"] = new JsonObject { ["name"] = "inspiration-drawer-rhino-beta", ["version"] = "0.1.0-beta.32" },
        };
        else if (method == "notifications/initialized") return new JsonObject();
        else if (method == "tools/list")
        {
            var names = new[] { "rhino_get_context", "rhino_list_objects", "rhino_list_layers", "rhino_list_parts", "rhino_capture_viewport", "rhino_list_native_tools", "rhino_call_native_tool" };
            var listed = new JsonArray(names.Select(name => (JsonNode)new JsonObject
            {
                ["name"] = name, ["description"] = name switch
                {
                    "rhino_capture_viewport" => "\u5bfc\u51fa\u65e0\u9009\u62e9\u9ad8\u4eae\u7684\u89c6\u53e3 PNG\uff1bincludeMask=true \u65f6\u6309\u5f53\u524d\u9009\u62e9\u6216\u6307\u5b9a\u56fe\u5c42\u5bfc\u51fa\u540c\u76f8\u673a Mask PNG",
                    "rhino_list_parts" => "\u5217\u51fa Rhino \u5f53\u524d\u9009\u4e2d\u5bf9\u8c61\u7684\u5206\u4ef6\u3001\u56fe\u5c42\u3001\u6750\u8d28\u3001\u9762\u6750\u8d28\u548c\u5757\u5b9e\u4f8b\u53d8\u6362\uff1b\u4e0d\u751f\u6210\u53ef\u89c1\u533a\u906e\u7f69",
                    "rhino_list_native_tools" => "\u679a\u4e3e\u4e0e\u5f53\u524d\u7ed1\u5b9a Rhino \u6587\u6863\u552f\u4e00\u5339\u914d\u7684 RhinoAI \u539f\u751f MCP \u5de5\u5177",
                    "rhino_call_native_tool" => "\u8c03\u7528\u5df2\u5339\u914d\u7684 RhinoAI \u539f\u751f MCP \u5de5\u5177\uff1b\u6a21\u578b\u5199\u64cd\u4f5c\u987b\u5148\u7531\u7528\u6237\u786e\u8ba4",
                    _ => "\u8bfb\u53d6\u7ed1\u5b9a Rhino \u6587\u6863\u6570\u636e",
                },
                ["inputSchema"] = ToolSchema(name),
                ["annotations"] = new JsonObject { ["readOnlyHint"] = name != "rhino_call_native_tool", ["destructiveHint"] = name == "rhino_call_native_tool" },
            }).ToArray());
            result = new JsonObject { ["tools"] = listed };
        }
        else if (method == "tools/call")
        {
            try
            {
                var name = body["params"]?["name"]?.GetValue<string>() ?? "";
                if (name == "rhino_list_native_tools")
                {
                    var args = body["params"]?["arguments"]?.AsObject() ?? throw new ArgumentException("\u7f3a\u5c11\u5de5\u5177\u53c2\u6570");
                    var documentId = args["documentId"]?.GetValue<uint>() ?? 0;
                    if (documentId == 0) throw new ArgumentException("\u7f3a\u5c11\u7ed1\u5b9a\u6587\u6863 ID");
                    JsonNode payload = nativeMcp == null
                        ? new JsonObject { ["available"] = false, ["reason"] = "Native MCP client is not configured", ["tools"] = new JsonArray() }
                        : await nativeMcp.ListTools(documentId);
                    result = new JsonObject { ["isError"] = false, ["content"] = new JsonArray(new JsonObject { ["type"] = "text", ["text"] = payload.ToJsonString() }) };
                }
                else if (name == "rhino_call_native_tool")
                {
                    var args = body["params"]?["arguments"]?.AsObject() ?? throw new ArgumentException("\u7f3a\u5c11\u5de5\u5177\u53c2\u6570");
                    var documentId = args["documentId"]?.GetValue<uint>() ?? 0;
                    var toolName = args["toolName"]?.GetValue<string>()?.Trim();
                    if (documentId == 0) throw new ArgumentException("\u7f3a\u5c11\u7ed1\u5b9a\u6587\u6863 ID");
                    if (string.IsNullOrWhiteSpace(toolName) || !System.Text.RegularExpressions.Regex.IsMatch(toolName, "^[A-Za-z0-9_-]{1,128}$")) throw new ArgumentException("Rhino MCP \u5de5\u5177\u540d\u79f0\u65e0\u6548");
                    var nativeArgs = args["arguments"]?.DeepClone() as JsonObject ?? new JsonObject();
                    result = nativeMcp == null ? throw new InvalidOperationException("\u672a\u914d\u7f6e Rhino \u539f\u751f MCP \u5ba2\u6237\u7aef") : await nativeMcp.Call(documentId, toolName, nativeArgs)
                        ?? throw new InvalidOperationException("没有发现与当前文档唯一匹配的 Rhino 原生 MCP，本次工具尚未派发。自动匹配/重绑定未通过：" + nativeMcp.LastDiscoveryDiagnostic + "。已完成的操作不会重放；请检查连接与文档状态。");
                }
                else
                {
                    if (name is not ("rhino_get_context" or "rhino_list_objects" or "rhino_list_layers" or "rhino_list_parts" or "rhino_capture_viewport")) throw new InvalidOperationException("Beta \u672a\u5f00\u653e\u8be5\u5de5\u5177");
                    var args = body["params"]?["arguments"]?.DeepClone() as JsonObject ?? throw new ArgumentException("\u7f3a\u5c11\u5de5\u5177\u53c2\u6570");
                    if (args["documentId"]?.GetValue<uint>() is not > 0) throw new ArgumentException("\u7f3a\u5c11\u7ed1\u5b9a\u6587\u6863 ID");
                    var value = await callTool(name, args);
                    var content = new JsonArray();
                    if (name == "rhino_capture_viewport")
                    {
                        content.Add(new JsonObject { ["type"] = "image", ["data"] = value["imageData"]?.GetValue<string>(), ["mimeType"] = "image/png" });
                        value.AsObject().Remove("imageData");
                        if (value["maskImageData"]?.GetValue<string>() is string maskData)
                        {
                            content.Add(new JsonObject { ["type"] = "image", ["data"] = maskData, ["mimeType"] = "image/png" });
                            value.AsObject().Remove("maskImageData");
                        }
                    }
                    content.Add(new JsonObject { ["type"] = "text", ["text"] = value.ToJsonString() });
                    result = new JsonObject { ["content"] = content, ["isError"] = false };
                }
            }
            catch (Exception error) { result = new JsonObject { ["isError"] = true, ["content"] = new JsonArray(new JsonObject { ["type"] = "text", ["text"] = error.Message }) }; }
        }
        else return new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["error"] = new JsonObject { ["code"] = -32601, ["message"] = "Method not found" } };
        return new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["result"] = result };
    }

    private static async Task Respond(NetworkStream stream, int status, string text, string mime, string? origin)
    {
        var data = Encoding.UTF8.GetBytes(text);
        var cors = origin == null ? "" : $"Access-Control-Allow-Origin: {origin}\r\nVary: Origin\r\n";
        var header = $"HTTP/1.1 {status} {(status < 400 ? "OK" : "Error")}\r\nContent-Type: {mime}; charset=utf-8\r\nContent-Length: {data.Length}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nContent-Security-Policy: default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src data:; base-uri 'none'; frame-ancestors 'none'\r\n{cors}Access-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Authorization, Content-Type\r\n\r\n";
        await stream.WriteAsync(Encoding.ASCII.GetBytes(header));
        await stream.WriteAsync(data);
    }

    public void Dispose()
    {
        stopped.Cancel();
        listener.Stop();
        try
        {
            if (File.Exists(descriptor) && JsonNode.Parse(File.ReadAllText(descriptor))?["instanceId"]?.GetValue<string>() == InstanceId) File.Delete(descriptor);
        }
        catch (IOException) { }
    }

    private sealed class ApiError(int status, string message) : Exception(message) { internal int Status => status; }
}
