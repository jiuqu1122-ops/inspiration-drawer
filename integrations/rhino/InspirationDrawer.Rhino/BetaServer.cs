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
    private readonly Dictionary<string, JsonObject> commands = new();
    private JsonObject snapshot = new();
    private string? owner;
    private DateTime lastHeartbeat = DateTime.MinValue;

    internal BetaServer(string descriptor, Func<string, JsonObject, Task<JsonNode>> callTool, Func<uint, Task<JsonNode>> getContext)
    {
        this.descriptor = descriptor;
        this.callTool = callTool;
        this.getContext = getContext;
        listener.Start();
        Url = $"http://127.0.0.1:{((IPEndPoint)listener.LocalEndpoint).Port}/";
        var directory = Path.GetDirectoryName(descriptor)!;
        Directory.CreateDirectory(directory);
        var temporary = descriptor + "." + InstanceId + ".tmp";
        File.WriteAllText(temporary, new JsonObject { ["protocol"] = 1, ["url"] = Url, ["token"] = Token, ["instanceId"] = InstanceId }.ToJsonString());
        File.Move(temporary, descriptor, true);
        _ = AcceptLoop();
    }

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
            timeout.CancelAfter(TimeSpan.FromSeconds(30));
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
                if (first[0] == "GET" && uri.AbsolutePath is "/" or "/panel.js" or "/panel.css")
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
                        result = new JsonObject
                        {
                            ["connected"] = Connected, ["state"] = snapshot.DeepClone(), ["context"] = context,
                            ["commands"] = new JsonArray(commands.Values.TakeLast(8).Select(value => value.DeepClone()).ToArray()),
                        };
                }
                else if (first[0] != "POST") throw new ApiError(404, "接口不存在");
                else result = uri.AbsolutePath switch
                {
                    "/drawer/heartbeat" => Heartbeat(body),
                    "/drawer/ack" => Ack(body),
                    "/panel/command" => Enqueue(body),
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
        if (!Guid.TryParse(caller, out _)) throw new ApiError(400, "执行宿主身份无效");
        lock (gate)
        {
            if (owner != caller && Connected) throw new ApiError(409, "另一个抽屉窗口已拥有执行连接");
            owner = caller;
            lastHeartbeat = DateTime.UtcNow;
            snapshot = body["state"]?.DeepClone() as JsonObject ?? throw new ApiError(400, "缺少会话快照");
            var command = commands.Values.FirstOrDefault(value => value["status"]?.GetValue<string>() == "pending");
            return new JsonObject { ["command"] = command?["request"]?.DeepClone() };
        }
    }

    private JsonNode Enqueue(JsonObject body)
    {
        var id = body["id"]?.GetValue<string>() ?? "";
        var kind = body["kind"]?.GetValue<string>() ?? "";
        if (id.Length is < 8 or > 100 || id.Any(c => !char.IsAsciiLetterOrDigit(c) && c != '-')) throw new ApiError(400, "请求 ID 无效");
        if (kind is not ("send" or "stop" or "new" or "select" or "model" or "image-model")) throw new ApiError(400, "操作类型无效");
        if (body["documentId"]?.GetValue<uint>() is not > 0) throw new ApiError(400, "缺少目标文档");
        if (kind == "send" && (string.IsNullOrWhiteSpace(body["content"]?.GetValue<string>()) || body["content"]!.GetValue<string>().Length > 12_000)) throw new ApiError(400, "请输入 1–12000 字符的消息");
        lock (gate)
        {
            if (commands.TryGetValue(id, out var duplicate))
            {
                if (!JsonNode.DeepEquals(duplicate["request"], body)) throw new ApiError(409, "请求 ID 已用于另一项操作");
                return duplicate.DeepClone();
            }
            if (!Connected) throw new ApiError(503, "抽屉尚未连接。请启动配套 Beta 桌面端，并完成登录及模型设置");
            var active = commands.Values.Any(command => command["status"]?.GetValue<string>() is "pending" or "accepted");
            if (kind != "stop" && (active || snapshot["busy"]?.GetValue<bool>() == true)) throw new ApiError(409, "当前任务尚未结束，请等待或停止");
            if (kind == "stop" && commands.Values.Any(command => command["request"]?["kind"]?.GetValue<string>() == "stop" && command["status"]?.GetValue<string>() is "pending" or "accepted")) throw new ApiError(409, "已请求停止");
            if (commands.Count >= 300) throw new ApiError(409, "本次 Beta 会话已达到操作上限，请等待任务结束后重启插件");
            var item = new JsonObject { ["id"] = id, ["status"] = "pending", ["request"] = body.DeepClone() };
            commands.Add(id, item);
            return item.DeepClone();
        }
    }

    private JsonNode Ack(JsonObject body)
    {
        lock (gate)
        {
            if (body["owner"]?.GetValue<string>() != owner) throw new ApiError(409, "执行连接所有权已变化");
            var id = body["id"]?.GetValue<string>() ?? "";
            if (!commands.TryGetValue(id, out var item)) throw new ApiError(404, "请求不存在");
            var status = body["status"]?.GetValue<string>() ?? "";
            var previous = item["status"]?.GetValue<string>();
            if (status is not ("accepted" or "completed" or "failed")) throw new ApiError(400, "任务状态无效");
            if (previous is "completed" or "failed") return item.DeepClone();
            if (status != "accepted" && previous != "accepted") throw new ApiError(409, "请求未被执行宿主接受");
            item["status"] = status;
            item["error"] = body["error"]?.GetValue<string>() is string error ? error[..Math.Min(error.Length, 800)] : null;
            return item.DeepClone();
        }
    }

    private async Task<JsonNode> Mcp(JsonObject body)
    {
        var id = body["id"]?.DeepClone();
        var method = body["method"]?.GetValue<string>();
        JsonNode result;
        if (method == "initialize") result = new JsonObject
        {
            ["protocolVersion"] = "2025-06-18", ["capabilities"] = new JsonObject { ["tools"] = new JsonObject() },
            ["serverInfo"] = new JsonObject { ["name"] = "inspiration-drawer-rhino-beta", ["version"] = "0.1.0-beta.1" },
        };
        else if (method == "notifications/initialized") return new JsonObject();
        else if (method == "tools/list") result = new JsonObject
        {
            ["tools"] = new JsonArray(new[] { "rhino_get_context", "rhino_list_objects", "rhino_list_layers", "rhino_capture_viewport" }.Select(name => (JsonNode)new JsonObject
            {
                ["name"] = name, ["description"] = name == "rhino_capture_viewport" ? "导出绑定文档的当前视口 PNG" : "读取绑定 Rhino 文档数据",
                ["inputSchema"] = new JsonObject
                {
                    ["type"] = "object", ["required"] = new JsonArray("documentId"),
                    ["properties"] = new JsonObject { ["documentId"] = new JsonObject { ["type"] = "integer" }, ["layer"] = new JsonObject { ["type"] = "string" }, ["limit"] = new JsonObject { ["type"] = "integer", ["minimum"] = 1, ["maximum"] = 200 } },
                    ["additionalProperties"] = false,
                },
                ["annotations"] = new JsonObject { ["readOnlyHint"] = true },
            }).ToArray()),
        };
        else if (method == "tools/call")
        {
            try
            {
                var name = body["params"]?["name"]?.GetValue<string>() ?? "";
                if (name is not ("rhino_get_context" or "rhino_list_objects" or "rhino_list_layers" or "rhino_capture_viewport")) throw new InvalidOperationException("Beta 未开放该工具");
                var args = body["params"]?["arguments"]?.DeepClone() as JsonObject ?? throw new ArgumentException("缺少工具参数");
                if (args["documentId"]?.GetValue<uint>() is not > 0) throw new ArgumentException("缺少绑定文档 ID");
                var value = await callTool(name, args);
                var content = new JsonArray();
                if (name == "rhino_capture_viewport")
                {
                    content.Add(new JsonObject { ["type"] = "image", ["data"] = value["imageData"]?.GetValue<string>(), ["mimeType"] = "image/png" });
                    value.AsObject().Remove("imageData");
                }
                content.Add(new JsonObject { ["type"] = "text", ["text"] = value.ToJsonString() });
                result = new JsonObject { ["content"] = content, ["isError"] = false };
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
