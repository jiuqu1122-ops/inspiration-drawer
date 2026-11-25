using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Rhino;

namespace InspirationDrawer.Rhino;

internal static partial class RhinoTools
{
    // Build and preview only the desktop-owned workspace, never the active Rhino document.
    internal static Task<JsonNode> RunBackgroundModel(JsonObject args)
    {
        var conversation = WorkspaceComponent(args, "conversationId");
        var workspace = WorkspaceComponent(args, "workspaceId");
        var tool = args["tool"]?.GetValue<string>();
        if (tool is not ("context" or "inspect" or "build" or "preview" or "export"))
            throw new ArgumentException("Unknown background modeling tool.");
        if (args["rhinoMajor"]?.GetValue<int>() != RhinoApp.Version.Major)
            throw new InvalidOperationException("The Rhino version does not match the selected background kernel.");
        var directory = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "com.inspirationdrawer.app", "generated", "chat", conversation, "rhino", workspace);
        return OnUi(() =>
        {
            Directory.CreateDirectory(directory);
            return JsonSerializer.SerializeToNode(BackgroundRhinoModel.Execute(tool, args["arguments"]?.AsObject() ?? new JsonObject(), directory))!;
        }, waitForDispatchedWrite: true);
    }

    private static string WorkspaceComponent(JsonObject args, string key)
    {
        var value = args[key]?.GetValue<string>();
        if (value == null || !Regex.IsMatch(value, @"\A[A-Za-z0-9_-]{1,128}\z"))
            throw new ArgumentException("Invalid background workspace identifier.");
        return value;
    }
}
