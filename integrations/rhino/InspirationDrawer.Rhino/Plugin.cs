using System.Runtime.InteropServices;
using Eto.Forms;
using Rhino;
using Rhino.Commands;
using Rhino.PlugIns;
using Rhino.UI;

[assembly: Guid("b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5")]

namespace InspirationDrawer.Rhino;

public sealed class DrawerPlugin : PlugIn
{
    internal static BetaServer? Server { get; private set; }
    public override PlugInLoadTime LoadTime => PlugInLoadTime.AtStartup;
    private static DeferredMcpStartup startup = new();
    private static int stopping;
    private static bool loaded;
    private static readonly object serverGate = new();
    internal static BetaServer EnsureServer()
    {
        lock (serverGate)
        {
            if (Volatile.Read(ref stopping) != 0) throw new ObjectDisposedException(nameof(DrawerPlugin));
            if (Server != null) return Server;
            var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "InspirationDrawer", "RhinoBeta", $"connection-{Environment.ProcessId}.json");
            return Server = new BetaServer(path, RhinoTools.Call, RhinoTools.Context, id => RhinoTools.Parts(id), new NativeRhinoMcpClient(RhinoTools.Fingerprint, RhinoTools.RebindNativeMcp));
        }
    }

    internal static void EnsureNativeMcp(RhinoDoc? document)
    {
        if (document != null && Volatile.Read(ref stopping) == 0) startup.Request(document.RuntimeSerialNumber);
    }

    private static void OnIdle(object? sender, EventArgs e)
    {
        if (Volatile.Read(ref stopping) != 0 || !loaded) return;
        if (!startup.TryBegin(RhinoDoc.ActiveDoc != null && RhinoApp.InCommand == 0, out var targetId)) return;
        var owner = startup;
        if (RhinoDoc.FromRuntimeSerialNumber(targetId) == null) { owner.Complete(); return; }
        // Never invoke commands, construct a WebView or wait for HTTP in OnLoad.
        _ = WarmupAsync(targetId, owner);
    }
    private static async Task WarmupAsync(uint targetId, DeferredMcpStartup owner)
    {
        try
        {
            StartupDiagnostics.Write("mcp.warmup.begin");
            await EnsureServer().WarmNativeMcp(targetId, () => Volatile.Read(ref stopping) == 0);
            StartupDiagnostics.Write("mcp.warmup.completed");
        }
        catch (Exception error)
        {
            StartupDiagnostics.Write("mcp.warmup.failed", error);
            try { RhinoApp.WriteLine($"[InspirationDrawer] MCP startup deferred/failed: {error.Message}. Log: {StartupDiagnostics.PathName}"); } catch { }
        }
        finally { owner.Complete(); }
    }

    private static void OnActiveDocumentChanged(object? sender, DocumentEventArgs e) => EnsureNativeMcp(e.Document);
    private static void OnNewDocument(object? sender, DocumentEventArgs e) => EnsureNativeMcp(e.Document);
    private static void OnEndOpenDocumentInitialViewUpdate(object? sender, DocumentOpenEventArgs e) => EnsureNativeMcp(e.Document);

    protected override LoadReturnCode OnLoad(ref string errorMessage)
    {
        StartupDiagnostics.Write("plugin.load.begin");
        if (loaded) return LoadReturnCode.Success;
        Interlocked.Exchange(ref stopping, 0);
        startup = new DeferredMcpStartup();
        try
        {
            Panels.RegisterPanel(this, typeof(DrawerPanel), "灵感抽屉 Beta", null, PanelType.PerDoc);
            RhinoDoc.ActiveDocumentChanged += OnActiveDocumentChanged;
            RhinoDoc.NewDocument += OnNewDocument;
            RhinoDoc.EndOpenDocumentInitialViewUpdate += OnEndOpenDocumentInitialViewUpdate;
            RhinoApp.Idle += OnIdle;
            EnsureNativeMcp(RhinoDoc.ActiveDoc);
            loaded = true;
            StartupDiagnostics.Write("plugin.load.completed");
            return LoadReturnCode.Success;
        }
        catch (Exception error)
        {
            Unsubscribe(); startup.Stop();
            StartupDiagnostics.Write("plugin.load.failed", error);
            errorMessage = $"Inspiration Drawer initialization failed: {error.Message}\nDiagnostic log: {StartupDiagnostics.PathName}";
            // Required panel registration failure is real; do not suppress it.
            return LoadReturnCode.ErrorShowDialog;
        }
    }
    private static void Unsubscribe()
    {
        RhinoDoc.ActiveDocumentChanged -= OnActiveDocumentChanged;
        RhinoDoc.NewDocument -= OnNewDocument;
        RhinoDoc.EndOpenDocumentInitialViewUpdate -= OnEndOpenDocumentInitialViewUpdate;
        RhinoApp.Idle -= OnIdle;
    }

    protected override void OnShutdown()
    {
        Interlocked.Exchange(ref stopping, 1);
        loaded = false;
        Unsubscribe();
        startup.Stop();
        StartupDiagnostics.Write("plugin.shutdown");
        lock (serverGate)
        {
            Server?.Dispose();
            Server = null;
        }
        base.OnShutdown();
    }
}
public sealed class OpenDrawerCommand : global::Rhino.Commands.Command
{
    public override string EnglishName => "InspirationDrawer";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
        DrawerPlugin.EnsureNativeMcp(doc);
        DrawerPlugin.EnsureServer();
        Panels.OpenPanel(typeof(DrawerPanel).GUID);
        return Result.Success;
    }
}

[Guid("b4679b45-aa5b-4379-bb84-b3b871967bdd")]
public sealed class DrawerPanel : Eto.Forms.Panel
{
    public DrawerPanel() : this(RhinoDoc.ActiveDoc?.RuntimeSerialNumber ?? 0) { }
    // Rhino's PerDoc factory supports the RhinoDoc constructor directly.
    public DrawerPanel(RhinoDoc doc) : this(doc.RuntimeSerialNumber) { }
    private readonly uint requestedDocument;
    private bool initialized;
    public DrawerPanel(uint documentSerialNumber)
    {
        requestedDocument = documentSerialNumber;
#if RHINO8
        MinimumSize = new Eto.Drawing.Size(DrawerPanelLayout.MinimumWidth, DrawerPanelLayout.MinimumHeight);
#endif
        Content = new Eto.Forms.Label { Text = "正在等待 Rhino 文档就绪…" };
        RhinoApp.Idle += InitializeWhenIdle;

    }
    protected override void Dispose(bool disposing)
    {
        if (disposing) RhinoApp.Idle -= InitializeWhenIdle;
        base.Dispose(disposing);
    }
    private void InitializeWhenIdle(object? sender, EventArgs e)
    {
        if (initialized || RhinoApp.IsExiting || RhinoApp.InCommand != 0) return;
        var doc = requestedDocument == 0 ? RhinoDoc.ActiveDoc : RhinoDoc.FromRuntimeSerialNumber(requestedDocument);
        if (doc == null) return;
        RhinoApp.Idle -= InitializeWhenIdle;
        try
        {
            StartupDiagnostics.Write("panel.initialize.begin");
            DrawerPlugin.EnsureNativeMcp(doc);
            var server = DrawerPlugin.EnsureServer();
            var view = new WebView();
            // Token remains in the fragment and is never written to startup logs.
            var target = new Uri($"{server.Url}?documentId={doc.RuntimeSerialNumber}#token={server.Token}");
            view.DocumentLoading += (_, args) =>
            {
                if (args.Uri == null || args.Uri.Scheme != "http" || args.Uri.Host != "127.0.0.1" || args.Uri.Port != new Uri(server.Url).Port) args.Cancel = true;
            };
            view.Url = target;
#if RHINO8
            // Do not give the native WebView a fixed Size: Rhino 8 can treat it as
            // a hard minimum, so its child surface then stays wider than a resized
            // dock/floating panel and paints over adjacent Rhino controls. Let the
            // expanding Eto layout calculate its size from the current host bounds.
            var layout = new DynamicLayout();
            layout.BeginVertical(Eto.Drawing.Padding.Empty, Eto.Drawing.Size.Empty, true, true);
            layout.Add(view, true, true);
            layout.EndVertical();
            Content = layout;
            Padding = 0;
#else
            Content = view;
            Padding = 0;
#endif
            initialized = true;
            StartupDiagnostics.Write("panel.initialize.completed");
        }
        catch (Exception error)
        {
            StartupDiagnostics.Write("panel.initialize.failed", error);
            var retry = new Eto.Forms.Button { Text = "重试打开面板" };
            retry.Click += (_, _) => { RhinoApp.Idle -= InitializeWhenIdle; RhinoApp.Idle += InitializeWhenIdle; };
            Content = new StackLayout { Items = { new Eto.Forms.Label { Text = $"面板初始化失败：{error.Message}\n日志：{StartupDiagnostics.PathName}" }, retry } };
        }
    }
}
