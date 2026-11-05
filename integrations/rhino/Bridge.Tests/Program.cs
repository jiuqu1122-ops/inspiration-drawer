using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;
using InspirationDrawer.Rhino;

var directory = Path.Combine(Path.GetTempPath(), "drawer-rhino-tests-" + Guid.NewGuid().ToString("N"));
var file = Path.Combine(directory, "connection.json");
var calledDocument = 0U;
using var server = new BetaServer(file, (name, args) =>
{
    calledDocument = args["documentId"]!.GetValue<uint>();
    if (calledDocument == 999) throw new InvalidOperationException("文档已关闭");
    return Task.FromResult<JsonNode>(new JsonObject { ["documentId"] = calledDocument, ["name"] = name });
}, id => Task.FromResult<JsonNode>(new JsonObject { ["documentId"] = id, ["name"] = "测试文档" }));
using var client = new HttpClient { BaseAddress = new Uri(server.Url) };
async Task<(HttpStatusCode Code, JsonNode Json)> Request(string path, JsonObject? body = null, bool auth = true, string? origin = null)
{
    using var message = new HttpRequestMessage(body == null ? HttpMethod.Get : HttpMethod.Post, path);
    if (auth) message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", server.Token);
    if (origin != null) message.Headers.Add("Origin", origin);
    if (body != null) message.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
    using var response = await client.SendAsync(message);
    return (response.StatusCode, JsonNode.Parse(await response.Content.ReadAsStringAsync())!);
}
var count = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); Console.WriteLine("PASS " + message); count++; }
try
{
    Check(File.Exists(file) && !string.IsNullOrEmpty(JsonNode.Parse(File.ReadAllText(file))?["token"]?.GetValue<string>()), "local discovery file exists");
    Check((await Request("panel/state?documentId=7", auth: false)).Code == HttpStatusCode.Unauthorized, "unauthenticated state rejected");
    Check((await Request("panel/state?documentId=7", origin: "https://evil.example")).Code == HttpStatusCode.Forbidden, "foreign browser origin rejected");
    Check((await Request("panel/state?documentId=0")).Code == HttpStatusCode.BadRequest, "invalid document binding rejected");
    var owner = Guid.NewGuid().ToString();
    JsonObject Heartbeat(string caller) => new() { ["owner"] = caller, ["state"] = new JsonObject { ["busy"] = false, ["conversationId"] = "chat-one" } };
    Check((await Request("drawer/heartbeat", Heartbeat(owner), origin: "http://tauri.localhost")).Code == HttpStatusCode.OK, "Tauri origin can establish owner lease");
    Check((await Request("drawer/heartbeat", Heartbeat(Guid.NewGuid().ToString()))).Code == HttpStatusCode.Conflict, "second runtime cannot steal live lease");
    var command = new JsonObject { ["id"] = "request-12345", ["kind"] = "send", ["content"] = "你好", ["documentId"] = 7 };
    Check((await Request("panel/command", command)).Code == HttpStatusCode.OK, "first send enqueued");
    Check((await Request("panel/command", command)).Code == HttpStatusCode.OK, "identical retry is idempotent");
    var conflicting = command.DeepClone().AsObject(); conflicting["content"] = "不同内容";
    Check((await Request("panel/command", conflicting)).Code == HttpStatusCode.Conflict, "same ID with different payload rejected");
    var duplicate = command.DeepClone().AsObject(); duplicate["id"] = "request-67890";
    Check((await Request("panel/command", duplicate)).Code == HttpStatusCode.Conflict, "concurrent paid command rejected");
    var heartbeat = await Request("drawer/heartbeat", Heartbeat(owner));
    Check(heartbeat.Json["command"]?["id"]?.GetValue<string>() == "request-12345", "pending command offered to owner");
    var ack = new JsonObject { ["owner"] = owner, ["id"] = "request-12345", ["status"] = "accepted" };
    Check((await Request("drawer/ack", ack)).Code == HttpStatusCode.OK, "command claimed before execution");
    Check((await Request("drawer/heartbeat", Heartbeat(owner))).Json["command"] == null, "accepted command is never automatically replayed");
    var stop = new JsonObject { ["id"] = "request-stop-123", ["kind"] = "stop", ["documentId"] = 7 };
    Check((await Request("panel/command", stop)).Code == HttpStatusCode.OK, "stop can be queued while chat executes");
    var rpc = new JsonObject { ["jsonrpc"] = "2.0", ["id"] = 1, ["method"] = "initialize" };
    Check((await Request("mcp", rpc)).Json["result"]?["protocolVersion"]?.GetValue<string>() == "2025-06-18", "MCP initialization");
    rpc["method"] = "tools/list";
    Check((await Request("mcp", rpc)).Json["result"]?["tools"]?.AsArray().Count == 4, "MCP exposes only four read/capture tools");
    rpc["method"] = "tools/call"; rpc["params"] = new JsonObject { ["name"] = "rhino_list_objects", ["arguments"] = new JsonObject { ["documentId"] = 7 } };
    Check((await Request("mcp", rpc)).Json["result"]?["isError"]?.GetValue<bool>() == false && calledDocument == 7, "tool called against explicit document");
    rpc["params"]!["name"] = "run_python";
    Check((await Request("mcp", rpc)).Json["result"]?["isError"]?.GetValue<bool>() == true, "arbitrary scripts are rejected");
    rpc["params"]!["name"] = "rhino_get_context"; rpc["params"]!["arguments"]!["documentId"] = 999;
    Check((await Request("mcp", rpc)).Json["result"]?["isError"]?.GetValue<bool>() == true, "closed-document tool error preserved");
    ack["status"] = "completed"; await Request("drawer/ack", ack);
    ack["status"] = "accepted";
    Check((await Request("drawer/ack", ack)).Json["status"]?.GetValue<string>() == "completed", "late acknowledgement cannot reopen a completed task");
    Console.WriteLine($"All {count} transport integration checks passed.");
}
finally { server.Dispose(); Directory.Delete(directory, true); }
