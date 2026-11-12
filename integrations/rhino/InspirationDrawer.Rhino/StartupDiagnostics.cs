using System.Text.Json.Nodes;
namespace InspirationDrawer.Rhino;
internal static class StartupDiagnostics
{
    private static readonly object gate = new();
    internal static string PathName => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "InspirationDrawer", "RhinoBeta", $"startup-{Environment.ProcessId}.log");
    internal static void Write(string phase, Exception? error = null)
    {
        try
        {
            lock (gate)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(PathName)!);
                // Bounded, local-only startup diagnostics; never include tokens or chat text.
                if (File.Exists(PathName) && new FileInfo(PathName).Length > 512 * 1024) File.WriteAllText(PathName, "");
                var record = new JsonObject { ["at"] = DateTimeOffset.Now.ToString("O"), ["phase"] = phase,
                    ["version"] = typeof(StartupDiagnostics).Assembly.GetName().Version?.ToString(), ["assembly"] = typeof(StartupDiagnostics).Assembly.Location,
                    ["exception"] = error?.ToString() };
                File.AppendAllText(PathName, record.ToJsonString() + Environment.NewLine);
            }
        }
        catch { /* Logging failure must not change host load semantics. */ }
    }
}
