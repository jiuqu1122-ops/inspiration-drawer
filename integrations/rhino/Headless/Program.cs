using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using InspirationDrawer.Rhino;
using Rhino.Runtime.InProcess;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        if (args.Length != 2) return 2;
        Console.InputEncoding = System.Text.Encoding.UTF8;
        Console.OutputEncoding = System.Text.Encoding.UTF8;
        var output = Console.Out;
        try
        {
            var rpc = JsonNode.Parse(Console.ReadLine() ?? "")!.AsObject();
            RhinoInside.Resolver.Initialize(args[0]);
            var result = Call(rpc, args[1]);
            output.WriteLine("IDRAW_MCP " + JsonSerializer.Serialize(new { jsonrpc = "2.0", id = 1, result }));
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            output.WriteLine("IDRAW_MCP " + JsonSerializer.Serialize(new { jsonrpc = "2.0", id = 1, error = new { message = error.Message } }));
            return 1;
        }
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static object Call(JsonObject rpc, string directory)
    {
        if (rpc["method"]?.GetValue<string>() != "tools/call") throw new ArgumentException("Unsupported MCP method.");
        var parameters = rpc["params"]!.AsObject();
        var tool = parameters["name"]?.GetValue<string>() ?? throw new ArgumentException("Missing background tool name.");
        using var core = new RhinoCore();
        return BackgroundRhinoModel.Execute(tool, parameters["arguments"]?.AsObject() ?? new JsonObject(), directory);
    }
}
