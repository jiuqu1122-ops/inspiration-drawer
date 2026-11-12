using System.Net;
using System.Net.Http.Headers;
using System.Net.Sockets;
using System.Text;
using System.Text.Json.Nodes;
using InspirationDrawer.Rhino;

var directory = Path.Combine(Path.GetTempPath(), "drawer-rhino-tests-" + Guid.NewGuid().ToString("N"));
var file = Path.Combine(directory, "connection.json");
var calledDocument = 0U;
var calledTool = "";
using var server = new BetaServer(file, (name, args) =>
{
    calledTool = name;
    calledDocument = args["documentId"]!.GetValue<uint>();
    if (calledDocument == 999) throw new InvalidOperationException("The document is closed");
    return Task.FromResult<JsonNode>(new JsonObject { ["documentId"] = calledDocument, ["name"] = name });
}, id => Task.FromResult<JsonNode>(new JsonObject { ["documentId"] = id, ["name"] = "Test Rhino document" }),
    id => Task.FromResult<JsonNode>(new JsonObject { ["documentId"] = id, ["selectedObjectCount"] = 0, ["partCount"] = 0, ["visibleAreaMaskAvailable"] = false, ["layers"] = new JsonArray(new JsonObject { ["path"] = "Default", ["visible"] = true }), ["parts"] = new JsonArray() }));
using var client = new HttpClient { BaseAddress = new Uri(server.Url) };
async Task<(HttpStatusCode Code, JsonNode Json)> Request(string path, JsonObject? body = null, bool auth = true, string? origin = null)
{
    using var message = new HttpRequestMessage(body == null ? HttpMethod.Get : HttpMethod.Post, path);
    if (auth) message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", server.Token);
    if (origin != null) message.Headers.Add("Origin", origin);
    if (body != null) message.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");
    // An unauthenticated request is rejected before its body is read. Avoid a TCP reset from unread upload bytes.
    if (!auth && body != null) message.Headers.ExpectContinue = true;
    using var response = await client.SendAsync(message);
    return (response.StatusCode, JsonNode.Parse(await response.Content.ReadAsStringAsync())!);
}
async Task<(HttpStatusCode Code, string Text)> RequestText(string path)
{
    using var response = await client.GetAsync(path);
    return (response.StatusCode, await response.Content.ReadAsStringAsync());
}
var count = 0;
void Check(bool condition, string message) { if (!condition) throw new Exception(message); Console.WriteLine("PASS " + message); count++; }
async Task TestNativeMcpRebind()
{
    using var reservation = new TcpListener(IPAddress.Loopback, 0);
    reservation.Start();
    var port = (ushort)((IPEndPoint)reservation.LocalEndpoint).Port;
    reservation.Stop();

    using var nativeServer = new HttpListener();
    nativeServer.Prefixes.Add($"http://127.0.0.1:{port}/");
    nativeServer.Start();
    var rebound = false;
    var rebindCount = 0;
    var writeEntered = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var writeRelease = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
    var forwarded = new List<string>();
    var serverLoop = Task.Run(async () =>
    {
        while (nativeServer.IsListening)
        {
            HttpListenerContext context;
            try { context = await nativeServer.GetContextAsync(); }
            catch (HttpListenerException) { break; }
            catch (ObjectDisposedException) { break; }
            try
            {
                using var reader = new StreamReader(context.Request.InputStream, context.Request.ContentEncoding);
                var request = JsonNode.Parse(await reader.ReadToEndAsync())!.AsObject();
                var id = request["id"]?.DeepClone();
                var method = request["method"]?.GetValue<string>();
                JsonObject response;
                if (method == "tools/list")
                {
                    response = new JsonObject
                    {
                        ["jsonrpc"] = "2.0", ["id"] = id,
                        ["result"] = new JsonObject { ["tools"] = new JsonArray(
                            new JsonObject { ["name"] = "get_context" },
                            new JsonObject { ["name"] = "list_objects" },
                            new JsonObject { ["name"] = "set_layer_material" },
                            new JsonObject { ["name"] = "set_camera" },
                            new JsonObject { ["name"] = "zoom_to_layer" },
                            new JsonObject { ["name"] = "set_selection" },
                            new JsonObject { ["name"] = "save_doc" }) },
                    };
                }
                else
                {
                    var name = request["params"]?["name"]?.GetValue<string>();
                    if (name == "set_layer_material") { writeEntered.TrySetResult(); await writeRelease.Task; }
                    if (name is not ("get_context" or "list_objects") && name != null) forwarded.Add(name);
                    var documentCount = rebound ? 1 : 0;
                    JsonObject payload = name == "get_context"
                        ? new JsonObject
                        {
                            ["selection"] = new JsonArray(),
                            ["document"] = new JsonObject { ["objectCount"] = documentCount, ["layerCount"] = 1 },
                            ["activeViewport"] = new JsonObject { ["camera"] = new JsonObject
                                { ["location"] = new JsonObject { ["x"] = 0.0, ["y"] = 0.0, ["z"] = 10.0 }, ["target"] = new JsonObject { ["x"] = 0.0, ["y"] = 0.0, ["z"] = 0.0 } } },
                        }
                        : new JsonObject
                        {
                            ["count"] = documentCount, ["truncated"] = false,
                            ["objects"] = rebound
                                ? new JsonArray(new JsonObject { ["id"] = "11111111-1111-1111-1111-111111111111" })
                                : new JsonArray(),
                        };
                    response = new JsonObject
                    {
                        ["jsonrpc"] = "2.0", ["id"] = id,
                        ["result"] = new JsonObject { ["content"] = new JsonArray(new JsonObject { ["type"] = "text", ["text"] = payload.ToJsonString() }) },
                    };
                }
                var bytes = Encoding.UTF8.GetBytes(response.ToJsonString());
                context.Response.ContentType = "application/json";
                context.Response.ContentLength64 = bytes.Length;
                await context.Response.OutputStream.WriteAsync(bytes);
                context.Response.Close();
            }
            catch
            {
                try { context.Response.Abort(); } catch { }
            }
        }
    });

    var local = new JsonObject
    {
        ["identityComplete"] = true, ["fingerprintMultiplicity"] = 1, ["objectIdentityMultiplicity"] = 1,
        ["objectCount"] = 1, ["layerCount"] = 1,
        ["selection"] = new JsonArray(),
        ["objectIds"] = new JsonArray("11111111-1111-1111-1111-111111111111"),
        ["camera"] = new JsonObject
        {
            ["position"] = new JsonObject { ["x"] = 0.0, ["y"] = 0.0, ["z"] = 10.0 },
            ["target"] = new JsonObject { ["x"] = 0.0, ["y"] = 0.0, ["z"] = 0.0 },
        },
    };
    var native = new NativeRhinoMcpClient(
        _ => Task.FromResult((JsonObject)local.DeepClone()),
        _ => { rebound = true; rebindCount++; return Task.CompletedTask; },
        () => [port]);
    try
    {
        var listed = await native.ListTools(123);
        var tools = listed["tools"]?.AsArray() ?? new JsonArray();
        Check(listed["available"]?.GetValue<bool>() == true && tools.Any(tool => tool?["name"]?.GetValue<string>() == "set_layer_material") && rebindCount == 1,
            "native MCP retries document fingerprint matching after rebind and exposes all tools for the bound document");
        var materialCall = native.Call(123, "set_layer_material", new JsonObject { ["layer"] = "Default", ["color"] = "#c08040" });
        await writeEntered.Task.WaitAsync(TimeSpan.FromSeconds(5));
        var warmup = native.Warmup(456);
        await Task.Delay(30);
        Check(rebindCount == 1 && !warmup.IsCompleted, "automatic MCP startup cannot rebind the listener during an active material write");
        writeRelease.TrySetResult();
        await materialCall; await warmup;
        Check(rebindCount == 2, "queued document warmup resumes only after the dispatched tool finishes");
        foreach (var name in new[] { "set_camera", "set_selection", "save_doc" }) await native.Call(123, name, new JsonObject());
        Check(forwarded.SequenceEqual(new[] { "set_layer_material", "set_camera", "set_selection", "save_doc" }), "material, camera, selection and document tools forward exactly once without geometry assumptions");
        // Simulate an active-viewport change after set_camera/get_viewport_image.
        // The official context reports one view while Rhino's latest active view differs.
        local["camera"]!["position"] = new JsonArray(120.0, 40.0, 15.0);
        var beforeZoomRebinds = rebindCount;
        var zoom = await native.Call(123, "zoom_to_layer", new JsonObject { ["layer"] = "Desktop Camera" });
        Check(zoom != null && forwarded.Count(name => name == "zoom_to_layer") == 1,
            "zoom after camera changes reaches the same uniquely identified document exactly once");
        Check(rebindCount == beforeZoomRebinds, "view-only drift does not require a disruptive MCP restart or replay modeling");
        local["objectIdentityMultiplicity"] = 2;
        var blockedZoom = await native.Call(123, "zoom_to_layer", new JsonObject { ["layer"] = "Desktop Camera" });
        Check(blockedZoom == null && forwarded.Count(name => name == "zoom_to_layer") == 1,
            "later cloned-document ambiguity still blocks the view call before dispatch");
    }
    finally
    {
        nativeServer.Stop();
        await serverLoop;
    }
}
async Task TestIndependentRhinoInstances()
{
    // Same serial on distinct listeners reproduces two independent Rhino.exe processes.
    const uint serial = 268435457;
    var leftPath=Path.Combine(directory,"connection-left.json");
    var rightPath=Path.Combine(directory,"connection-right.json");
    Func<string,JsonObject,Task<JsonNode>> tool=(name,args)=>Task.FromResult<JsonNode>(new JsonObject{["documentId"]=args["documentId"]!.GetValue<uint>()});
    Func<uint,Task<JsonNode>> context=id=>Task.FromResult<JsonNode>(new JsonObject{["documentId"]=id,["name"]="Untitled Rhino document"});
    using var left=new BetaServer(leftPath,tool,context,context);
    using var right=new BetaServer(rightPath,tool,context,context);
    using var http=new HttpClient();
    async Task<JsonNode> Send(BetaServer target,string path,JsonObject? body=null)
    {
        using var message=new HttpRequestMessage(body==null?HttpMethod.Get:HttpMethod.Post,new Uri(new Uri(target.Url),path));
        message.Headers.Authorization=new AuthenticationHeaderValue("Bearer",target.Token);
        if(body!=null)message.Content=new StringContent(body.ToJsonString(),Encoding.UTF8,"application/json");
        using var response=await http.SendAsync(message);
        if(!response.IsSuccessStatusCode)throw new Exception("Multi-instance transport failed: "+response.StatusCode);
        return JsonNode.Parse(await response.Content.ReadAsStringAsync())!;
    }
    JsonObject Beat(string ownerId,string conversationId,string status)=>new()
    {
        ["owner"]=ownerId,["state"]=new JsonObject{
            ["documentId"]=serial,["conversationId"]=conversationId,
            ["conversations"]=new JsonArray(new JsonObject{["id"]=conversationId,["title"]="Rhino chat"}),
            ["messages"]=new JsonArray(new JsonObject{["id"]="assistant-"+conversationId,["content"]=status}),["busy"]=true,
        }
    };
    var leftOwner=Guid.NewGuid().ToString();var rightOwner=Guid.NewGuid().ToString();
    await Send(left,"drawer/heartbeat",Beat(leftOwner,"left-chat","old task started"));
    await Send(right,"drawer/heartbeat",Beat(rightOwner,"right-chat","new task started"));
    await Send(left,"drawer/heartbeat",Beat(leftOwner,"left-chat","old task progressed"));
    var a=await Send(left,$"panel/state?documentId={serial}");
    var b=await Send(right,$"panel/state?documentId={serial}");
    Check(File.Exists(leftPath)&&File.Exists(rightPath),"two Rhino instances retain separate connection announcements");
    Check(a["connected"]!.GetValue<bool>()&&b["connected"]!.GetValue<bool>(),"both Rhino panels remain connected when their document serials are identical");
    Check(a["instanceId"]!.GetValue<string>()!=b["instanceId"]!.GetValue<string>(),"instance identity disambiguates reused document serials");
    Check(a["state"]?["conversationId"]?.GetValue<string>()=="left-chat"&&b["state"]?["conversationId"]?.GetValue<string>()=="right-chat","same-serial documents never share conversations across Rhino processes");
    Check(a["state"]?["messages"]?[0]?["content"]?.GetValue<string>()=="old task progressed","the original Rhino task keeps refreshing after the new window connects");
    right.Dispose();
    Check(File.Exists(leftPath)&&!File.Exists(rightPath),"closing one Rhino instance removes only its own descriptor");
    await Send(left,"drawer/heartbeat",Beat(leftOwner,"left-chat","old task finished"));
    a=await Send(left,$"panel/state?documentId={serial}");
    Check(a["state"]?["messages"]?[0]?["content"]?.GetValue<string>()=="old task finished","surviving Rhino panel continues updating after the other listener closes");
}
try
{
    Check(File.Exists(file) && !string.IsNullOrEmpty(JsonNode.Parse(File.ReadAllText(file))?["token"]?.GetValue<string>()), "local discovery file exists");
    await TestNativeMcpRebind();
    Check((await Request("panel/state?documentId=7", auth: false)).Code == HttpStatusCode.Unauthorized, "unauthenticated state rejected");
    Check((await Request("panel/state?documentId=7", origin: "https://evil.example")).Code == HttpStatusCode.Forbidden, "foreign browser origin rejected");
    Check((await Request("panel/state?documentId=0")).Code == HttpStatusCode.BadRequest, "invalid document binding rejected");
    var parts = await Request("panel/parts?documentId=7");
    Check(parts.Code == HttpStatusCode.OK && parts.Json["documentId"]?.GetValue<uint>() == 7 && parts.Json["visibleAreaMaskAvailable"]?.GetValue<bool>() == false,
        "parts inventory is document-bound and reports that no visible-area mask is available");
    Check((await Request("panel/parts?documentId=7", auth: false)).Code == HttpStatusCode.Unauthorized, "parts inventory requires instance authentication");
    var baseCss = await RequestText("/panel.css");
    Check(DrawerPanelLayout.MinimumWidth == 340 && DrawerPanelLayout.MinimumHeight == 420, "Rhino panel can shrink to the responsive 340x420 compact minimum");
    Check(baseCss.Code == HttpStatusCode.OK && !baseCss.Text.Contains("min-width:280px") && baseCss.Text.Contains("overflow-x:hidden"), "edge-docked panel does not enforce a horizontal minimum width");
    Check(baseCss.Text.Contains("grid-template-columns:1fr 1fr") && baseCss.Text.Contains("@media (max-width: 340px)") && baseCss.Text.Contains("grid-template-columns:minmax(0,1fr)"), "edge-docked compact settings stay grouped in the bottom composer and stack only below 340px");
    var panelCss = await RequestText("/parts.css");
    Check(panelCss.Code == HttpStatusCode.OK && panelCss.Text.Contains(".parts-list"), "panel part styles are served from the embedded plugin resources");
    Check((await Request("panel/parts?documentId=0")).Code == HttpStatusCode.BadRequest, "parts inventory rejects an invalid document binding");
    var owner = Guid.NewGuid().ToString();
    JsonObject Heartbeat(string caller, bool busy = false, bool awaitingApproval = false, uint documentId = 7)
    {
        var state = new JsonObject { ["documentId"] = documentId, ["busy"] = busy, ["conversationId"] = "chat-one", ["messages"] = new JsonArray(), ["conversations"] = new JsonArray(new JsonObject { ["id"] = "chat-one", ["title"] = "Rhino chat" }) };
        if (awaitingApproval)
            state["messages"] = new JsonArray(new JsonObject
            {
                ["tools"] = new JsonArray(new JsonObject { ["id"] = "native-call-1", ["name"] = "rhino_native_run_csharp", ["status"] = "awaiting-approval" }),
            });
        return new JsonObject { ["owner"] = caller, ["state"] = state };
    }
    Check((await Request("drawer/heartbeat", Heartbeat(owner), origin: "http://tauri.localhost")).Code == HttpStatusCode.OK, "Tauri origin can establish owner lease");
    foreach (var kind in new[] { "image-aspect-ratio", "image-resolution", "image-quality" })
    {
        var id = "setting-" + Guid.NewGuid().ToString("N");
        var settingsCommand = new JsonObject { ["id"] = id, ["kind"] = kind, ["value"] = "4k", ["documentId"] = 7, ["conversationId"] = "chat-one" };
        Check((await Request("panel/command", settingsCommand)).Code == HttpStatusCode.OK, kind + " control is accepted by transport");
        await Request("drawer/heartbeat", Heartbeat(owner));
        await Request("drawer/ack", new JsonObject { ["id"] = id, ["owner"] = owner, ["status"] = "accepted" });
        await Request("drawer/ack", new JsonObject { ["id"] = id, ["owner"] = owner, ["status"] = "completed" });
    }
    Check((await Request("drawer/heartbeat", Heartbeat(Guid.NewGuid().ToString()))).Code == HttpStatusCode.Conflict, "second runtime cannot steal live lease");
    var command = new JsonObject { ["id"] = "request-12345", ["kind"] = "send", ["content"] = "Build a box", ["documentId"] = 7 };
    Check((await Request("panel/command", command)).Code == HttpStatusCode.OK, "first send enqueued");
    Check((await Request("panel/command", command)).Code == HttpStatusCode.OK, "identical retry is idempotent");
    var conflicting = command.DeepClone().AsObject(); conflicting["content"] = "娑撳秴鎮撻崘鍛啇";
    Check((await Request("panel/command", conflicting)).Code == HttpStatusCode.Conflict, "same ID with different payload rejected");
    var duplicate = command.DeepClone().AsObject(); duplicate["id"] = "request-67890";
    Check((await Request("panel/command", duplicate)).Code == HttpStatusCode.Conflict, "concurrent paid command rejected");
    var heartbeat = await Request("drawer/heartbeat", Heartbeat(owner));
    Check(heartbeat.Json["command"]?["id"]?.GetValue<string>() == "request-12345", "pending command offered to owner");
    var ack = new JsonObject { ["owner"] = owner, ["id"] = "request-12345", ["status"] = "accepted" };
    Check((await Request("drawer/ack", ack)).Code == HttpStatusCode.OK, "command claimed before execution");
    Check((await Request("drawer/heartbeat", Heartbeat(owner))).Json["command"] == null, "accepted command is never automatically replayed");
    var busyPanelState = await Request("panel/state?documentId=7");
    Check(busyPanelState.Json["state"]?["busy"]?.GetValue<bool>() == true && busyPanelState.Json["state"]?["stoppable"]?.GetValue<bool>() == true,
        "per-document panel state exposes the active native task and Stop availability");
    var secondDocumentSend = new JsonObject { ["id"] = "request-doc8-send", ["kind"] = "send", ["content"] = "Build only in Rhino document 8", ["documentId"] = 8 };
    Check((await Request("panel/command", secondDocumentSend)).Code == HttpStatusCode.OK, "a new Rhino document can queue an independent task while document 7 is busy");
    var secondDocumentPoll = await Request("drawer/heartbeat", Heartbeat(owner, documentId: 8));
    Check(secondDocumentPoll.Json["command"]?["id"]?.GetValue<string>() == "request-doc8-send", "pending work is routed only to its target Rhino document runtime");
    var secondDocumentAck = new JsonObject { ["owner"] = owner, ["id"] = "request-doc8-send", ["status"] = "accepted" };
    await Request("drawer/ack", secondDocumentAck);
    Check((await Request("panel/state?documentId=8")).Json["state"]?["documentId"]?.GetValue<uint>() == 8, "each Rhino panel receives the snapshot for its own document");
    Check((await Request("drawer/heartbeat", Heartbeat(owner, documentId: 7))).Json["command"] == null, "the active document 8 workflow cannot leak into document 7");
    secondDocumentAck["status"] = "completed"; await Request("drawer/ack", secondDocumentAck);
    var stop = new JsonObject { ["id"] = "request-stop-123", ["kind"] = "stop", ["documentId"] = 7 };
    Check((await Request("panel/command", stop)).Code == HttpStatusCode.OK, "stop can be queued while chat executes");
    var stopPoll = await Request("drawer/heartbeat", Heartbeat(owner));
    Check(stopPoll.Json["command"]?["id"]?.GetValue<string>() == "request-stop-123", "queued stop is delivered to the active runtime");
    var stopAck = new JsonObject { ["owner"] = owner, ["id"] = "request-stop-123", ["status"] = "accepted" };
    await Request("drawer/ack", stopAck);
    await Request("drawer/heartbeat", Heartbeat(owner, busy: true, awaitingApproval: true));
    var busySend = new JsonObject { ["id"] = "request-send-busy", ["kind"] = "send", ["content"] = "must not start", ["documentId"] = 7, ["conversationId"] = "chat-one" };
    Check((await Request("panel/command", busySend)).Code == HttpStatusCode.Conflict, "busy runtime still rejects unrelated chat commands");
    var staleApproval = new JsonObject { ["id"] = "request-approve-stale", ["kind"] = "approve-tool", ["documentId"] = 7, ["conversationId"] = "chat-one", ["toolCallId"] = "not-pending", ["approved"] = true };
    Check((await Request("panel/command", staleApproval)).Code == HttpStatusCode.Conflict, "approval rejects tool calls not awaiting confirmation");
    var approval = new JsonObject { ["id"] = "request-approve-123", ["kind"] = "approve-tool", ["documentId"] = 7, ["conversationId"] = "chat-one", ["toolCallId"] = "native-call-1", ["approved"] = true };
    Check((await Request("panel/command", approval)).Code == HttpStatusCode.OK, "matching native tool approval is allowed while its runtime is busy");
    var approvalPoll = await Request("drawer/heartbeat", Heartbeat(owner, busy: true, awaitingApproval: true));
    Check(approvalPoll.Json["command"]?["id"]?.GetValue<string>() == "request-approve-123", "pending approval reaches the owning runtime during execution");
    var approvalAck = new JsonObject { ["owner"] = owner, ["id"] = "request-approve-123", ["status"] = "accepted" };
    await Request("drawer/ack", approvalAck);
    var duplicateApproval = approval.DeepClone().AsObject(); duplicateApproval["id"] = "request-approve-456";
    Check((await Request("panel/command", duplicateApproval)).Code == HttpStatusCode.Conflict, "the same pending native tool cannot be approved twice");
    approvalAck["status"] = "completed"; await Request("drawer/ack", approvalAck);
    var denial = new JsonObject { ["id"] = "request-deny-123", ["kind"] = "approve-tool", ["documentId"] = 7, ["conversationId"] = "chat-one", ["toolCallId"] = "native-call-1", ["approved"] = false };
    Check((await Request("panel/command", denial)).Code == HttpStatusCode.OK, "matching native tool denial is allowed while its runtime is busy");
    var denialPoll = await Request("drawer/heartbeat", Heartbeat(owner, busy: true, awaitingApproval: true));
    Check(denialPoll.Json["command"]?["id"]?.GetValue<string>() == "request-deny-123", "native tool denial reaches the owning runtime");
    var denialAck = new JsonObject { ["owner"] = owner, ["id"] = "request-deny-123", ["status"] = "accepted" };
    await Request("drawer/ack", denialAck);
    denialAck["status"] = "completed"; await Request("drawer/ack", denialAck);
    stopAck["status"] = "completed"; await Request("drawer/ack", stopAck);
    var rpc = new JsonObject { ["jsonrpc"] = "2.0", ["id"] = 1, ["method"] = "initialize" };
    Check((await Request("mcp", rpc)).Json["result"]?["protocolVersion"]?.GetValue<string>() == "2025-06-18", "MCP initialization");
    rpc["method"] = "tools/list";
    var listedTools = (await Request("mcp", rpc)).Json["result"]?["tools"]?.AsArray();
    Check(listedTools?.Count == 7, "MCP exposes five local read tools plus two native MCP bridge operations");
    var partSchema = listedTools?.FirstOrDefault(tool => tool?["name"]?.GetValue<string>() == "rhino_list_parts")?["inputSchema"];
    Check(partSchema?["properties"]?["limit"] != null && partSchema["properties"]?["layer"] == null,
        "parts-tool schema exposes only the supported limit filter");
    var captureSchema = listedTools?.FirstOrDefault(tool => tool?["name"]?.GetValue<string>() == "rhino_capture_viewport")?["inputSchema"];
    Check(captureSchema?["properties"]?["includeMask"] != null && captureSchema["properties"]?["maskLayer"] != null
        && captureSchema["properties"]?["rendered"] != null && captureSchema["properties"]?["shaded"] != null,
        "viewport capture schema exposes rendered and shaded modes, optional mask, and layer source");
    var nativeCall = listedTools?.FirstOrDefault(tool => tool?["name"]?.GetValue<string>() == "rhino_call_native_tool");
    Check(nativeCall?["annotations"]?["readOnlyHint"]?.GetValue<bool>() == false
        && nativeCall["inputSchema"]?["properties"]?["toolName"] != null
        && nativeCall["inputSchema"]?["properties"]?["arguments"] != null,
        "native MCP proxy is declared as a write-capable tool with an explicit native tool name and arguments");
    rpc["method"] = "tools/call"; rpc["params"] = new JsonObject { ["name"] = "rhino_list_native_tools", ["arguments"] = new JsonObject { ["documentId"] = 7 } };
    var nativeList = await Request("mcp", rpc);
    var nativeListText = nativeList.Json["result"]?["content"]?[0]?["text"]?.GetValue<string>();
    Check(nativeList.Json["result"]?["isError"]?.GetValue<bool>() == false && JsonNode.Parse(nativeListText!)?["available"]?.GetValue<bool>() == false,
        "native MCP discovery fails closed when no native connector is configured");
    rpc["params"] = new JsonObject { ["name"] = "rhino_call_native_tool", ["arguments"] = new JsonObject { ["documentId"] = 7, ["toolName"] = "run_command", ["arguments"] = new JsonObject { ["command"] = "_Box" } } };
    Check((await Request("mcp", rpc)).Json["result"]?["isError"]?.GetValue<bool>() == true,
        "native modeling calls fail closed without a matched RhinoAI MCP listener");
    rpc["method"] = "tools/call"; rpc["params"] = new JsonObject { ["name"] = "rhino_list_objects", ["arguments"] = new JsonObject { ["documentId"] = 7 } };
    Check((await Request("mcp", rpc)).Json["result"]?["isError"]?.GetValue<bool>() == false && calledDocument == 7, "tool called against explicit document");
    rpc["params"]!["name"] = "rhino_list_parts";
    var partsCall = await Request("mcp", rpc);
    Check(partsCall.Json["result"]?["isError"]?.GetValue<bool>() == false && calledTool == "rhino_list_parts" && calledDocument == 7,
        "read-only parts tool is registered and uses the bound document");
    rpc["params"]!["name"] = "run_python";
    Check((await Request("mcp", rpc)).Json["result"]?["isError"]?.GetValue<bool>() == true, "arbitrary scripts are rejected");
    rpc["params"]!["name"] = "rhino_get_context"; rpc["params"]!["arguments"]!["documentId"] = 999;
    Check((await Request("mcp", rpc)).Json["result"]?["isError"]?.GetValue<bool>() == true, "closed-document tool error preserved");
    ack["status"] = "completed"; await Request("drawer/ack", ack);
    ack["status"] = "accepted";
    Check((await Request("drawer/ack", ack)).Json["status"]?.GetValue<string>() == "completed", "late acknowledgement cannot reopen a completed task");
    var deletion = new JsonObject { ["id"] = "request-delete-123", ["kind"] = "delete", ["documentId"] = 7, ["conversationId"] = "chat-one" };
    Check((await Request("panel/command", deletion, auth: false)).Code == HttpStatusCode.Unauthorized, "conversation deletion requires authentication");
    await Request("drawer/heartbeat", Heartbeat(owner, busy: true));
    Check((await Request("panel/command", deletion)).Code == HttpStatusCode.Conflict, "busy Chat cannot delete its conversation");
    await Request("drawer/heartbeat", Heartbeat(owner));
    var staleDeletion = deletion.DeepClone().AsObject(); staleDeletion["conversationId"] = "another-chat";
    Check((await Request("panel/command", staleDeletion)).Code == HttpStatusCode.Conflict, "deletion rejects a switched conversation");
    var noSelection = deletion.DeepClone().AsObject(); noSelection.Remove("conversationId");
    Check((await Request("panel/command", noSelection)).Code == HttpStatusCode.Conflict, "deletion rejects a missing target ID");
    var missing = Heartbeat(owner); missing["state"]!["conversations"] = new JsonArray();
    await Request("drawer/heartbeat", missing);
    Check((await Request("panel/command", deletion)).Code == HttpStatusCode.Conflict, "deletion rejects IDs absent from the Rhino session list");
    await Request("drawer/heartbeat", Heartbeat(owner));
    Check((await Request("panel/command", deletion)).Code == HttpStatusCode.OK, "current idle conversation deletion can be enqueued");
    Check((await Request("panel/command", deletion)).Code == HttpStatusCode.OK, "delete request retry is idempotent");
    var repeated = deletion.DeepClone().AsObject(); repeated["id"] = "request-delete-456";
    Check((await Request("panel/command", repeated)).Code == HttpStatusCode.Conflict, "concurrent deletion is rejected");
    var deletionPoll = await Request("drawer/heartbeat", Heartbeat(owner));
    Check(deletionPoll.Json["command"]?["kind"]?.GetValue<string>() == "delete", "delete reaches the owning runtime");
    var deletionAck = new JsonObject { ["owner"] = owner, ["id"] = "request-delete-123", ["status"] = "accepted" };
    await Request("drawer/ack", deletionAck);
    Check((await Request("drawer/heartbeat", Heartbeat(owner))).Json["command"] == null, "accepted deletion is never replayed");
    deletionAck["status"] = "completed"; await Request("drawer/ack", deletionAck);
    var previewState = Heartbeat(owner, busy: true);
    previewState["state"]!["messages"] = new JsonArray(new JsonObject { ["id"] = "generated-message", ["images"] = new JsonArray("data:image/jpeg;base64,aW1hZ2U="), ["imageIndices"] = new JsonArray(0) });
    await Request("drawer/heartbeat", previewState);
    var imageConversation = previewState["state"]!["conversationId"]!.GetValue<string>();
    var previewCommand = new JsonObject { ["id"] = "request-image-123", ["kind"] = "preview-image", ["documentId"] = 7, ["conversationId"] = imageConversation, ["messageId"] = "generated-message", ["imageIndex"] = 0 };
    Check((await Request("panel/command", auth: false)).Code == HttpStatusCode.Unauthorized, "image preview requires authentication");
    var stalePreview = previewCommand.DeepClone().AsObject(); stalePreview["conversationId"] = "wrong-conversation";
    Check((await Request("panel/command", stalePreview)).Code == HttpStatusCode.Conflict, "image preview rejects a foreign conversation");
    stalePreview["conversationId"] = imageConversation; stalePreview["messageId"] = "missing";
    Check((await Request("panel/command", stalePreview)).Code == HttpStatusCode.Conflict, "image preview rejects absent message IDs");
    Check((await Request("panel/command", previewCommand)).Code == HttpStatusCode.OK, "read-only preview works while modeling is busy");
    var previewPoll = await Request("drawer/heartbeat", previewState);
    Check(previewPoll.Json["command"]?["kind"]?.GetValue<string>() == "preview-image", "preview reaches the desktop without invoking MCP");
    var previewQuery = new JsonObject { ["id"] = "request-image-123", ["documentId"] = 7, ["conversationId"] = imageConversation };
    Check((await Request("panel/image", auth: false)).Code == HttpStatusCode.Unauthorized, "full preview endpoint requires authentication");
    var previewAck = new JsonObject { ["owner"] = owner, ["id"] = "request-image-123", ["status"] = "accepted" };
    await Request("drawer/ack", previewAck);
    previewAck["status"] = "completed"; previewAck["image"] = "data:image/svg+xml;base64,PHN2Zy8+";
    Check((await Request("drawer/ack", previewAck)).Code == HttpStatusCode.BadRequest, "preview rejects active SVG content");
    previewAck["image"] = "data:image/jpeg;base64,aW1hZ2U=";
    Check((await Request("drawer/ack", previewAck)).Code == HttpStatusCode.OK, "bounded raster preview is stored separately");
    var previewResult = await Request("panel/image", previewQuery);
    Check(previewResult.Json["image"]?.GetValue<string>() == "data:image/jpeg;base64,aW1hZ2U=", "preview is returned only to the bound document and conversation");
    var wrongDocument = previewQuery.DeepClone().AsObject(); wrongDocument["documentId"] = 8;
    Check((await Request("panel/image", wrongDocument)).Code == HttpStatusCode.Conflict, "another Rhino document cannot read the preview");
    var leanState = await Request("panel/state?documentId=7");
    Check(!leanState.Json["commands"]!.ToJsonString().Contains("base64"), "large preview data never enters heartbeat command history");
    var switchedState = previewState.DeepClone().AsObject(); switchedState["state"]!["conversationId"] = "new-rhino-chat";
    await Request("drawer/heartbeat", switchedState);
    Check((await Request("panel/image", previewQuery)).Code == HttpStatusCode.Conflict, "switching conversation invalidates its old full preview");
    var panelHtml = await RequestText("/");
    Check(panelHtml.Code == HttpStatusCode.OK && panelHtml.Text.Contains("id=\"delete-conversation\"") && panelHtml.Text.Contains("id=\"delete-confirmation\""), "embedded panel exposes delete and inline confirmation controls");
    Check(panelHtml.Code == HttpStatusCode.OK && panelHtml.Text.Contains("id=\"image-preview\"") && panelHtml.Text.Contains("/markdown.js") && panelHtml.Text.Contains("/image-preview.js"), "embedded panel exposes Markdown messages and a full-size image preview");
    var markdownJs = await RequestText("/markdown.js");
    Check(markdownJs.Code == HttpStatusCode.OK && markdownJs.Text.Contains("rhinoMarkdown") && markdownJs.Text.Contains("createTextNode"), "Markdown rendering builds safe semantic DOM without displaying markup fences");
    var imagePreviewJs = await RequestText("/image-preview.js");
    Check(imagePreviewJs.Code == HttpStatusCode.OK && imagePreviewJs.Text.Contains("data-preview-src") && imagePreviewJs.Text.Contains("Escape"), "generated image preview opens on click and closes on Escape");
    Check(!ViewportCaptureValidation.HasVisibleContent(1000, 600, (_, _) => unchecked((int)0xff9da3aa)),
        "uniform gray Rendered capture is rejected before generation");
    Check(!ViewportCaptureValidation.HasVisibleContent(1000, 600, (_, _) => 0),
        "fully transparent viewport capture is rejected");
    Check(!ViewportCaptureValidation.HasVisibleContent(1000, 600, (x, y) =>
        x < 10 || y < 10 ? unchecked((int)0xffeeeeee) : unchecked((int)0xff9da3aa)),
        "print border cannot make an empty viewport pass validation");
    Check(ViewportCaptureValidation.HasVisibleContent(1000, 600, (x, y) =>
        x > 400 && x < 580 && y > 180 && y < 420 ? unchecked((int)0xffedb2b3) : unchecked((int)0xff9da3aa)),
        "rendered pink model region passes viewport validation");
    Check(ViewportCaptureValidation.HasVisibleContent(1000, 600, (x, y) =>
        x > 400 && x < 580 && y > 180 && y < 420 ? unchecked((int)0xffdddddd) : unchecked((int)0xffeeeeee)),
        "low contrast rendered geometry passes viewport validation");
    Check(JsonNodeCompat.DeepEquals(JsonNode.Parse("{\"a\":1,\"b\":true}"), JsonNode.Parse("{\"b\":true,\"a\":1.0}")),
        "Rhino 8 JSON equality ignores object property order and numeric formatting");
    Check(!JsonNodeCompat.DeepEquals(JsonNode.Parse("[1,2]"), JsonNode.Parse("[2,1]")),
        "Rhino 8 JSON equality preserves array order for idempotent requests");
    var deferred = new DeferredMcpStartup();
    deferred.Request(7); deferred.Request(8);
    Check(!deferred.TryBegin(false, out _), "plugin loading never dispatches MCP before host idle readiness");
    Check(deferred.TryBegin(true, out var queuedDoc) && queuedDoc == 8, "startup coalesces document changes and warms only the latest bound document");
    deferred.Request(9);
    Check(!deferred.TryBegin(true, out _), "an in-flight warmup cannot be entered twice");
    deferred.Complete();
    Check(deferred.TryBegin(true, out queuedDoc) && queuedDoc == 9, "a document switch during warmup resumes on the next ready idle");
    deferred.Stop(); deferred.Complete(); deferred.Request(10);
    Check(!deferred.TryBegin(true, out _), "shutdown discards pending startup and prevents reactivation");
    NativeIdentityTests.Run(Check);
    await TestIndependentRhinoInstances();
    Console.WriteLine($"All {count} transport integration checks passed.");
}
finally { server.Dispose(); Directory.Delete(directory, true); }

