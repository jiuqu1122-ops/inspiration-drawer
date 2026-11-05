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
    internal static BetaServer EnsureServer()
    {
        if (Server != null) return Server;
        var path = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "InspirationDrawer", "RhinoBeta", "connection.json");
        return Server = new BetaServer(path, RhinoTools.Call, RhinoTools.Context);
    }

    protected override LoadReturnCode OnLoad(ref string errorMessage)
    {
        Panels.RegisterPanel(this, typeof(DrawerPanel), "灵感抽屉 Beta", null, PanelType.PerDoc);
        return LoadReturnCode.Success;
    }

    protected override void OnShutdown()
    {
        Server?.Dispose();
        Server = null;
        base.OnShutdown();
    }
}

public sealed class OpenDrawerCommand : global::Rhino.Commands.Command
{
    public override string EnglishName => "InspirationDrawer";
    protected override Result RunCommand(RhinoDoc doc, RunMode mode)
    {
        DrawerPlugin.EnsureServer();
        Panels.OpenPanel(typeof(DrawerPanel).GUID);
        return Result.Success;
    }
}

[Guid("b4679b45-aa5b-4379-bb84-b3b871967bdd")]
public sealed class DrawerPanel : Eto.Forms.Panel
{
    public DrawerPanel() : this(RhinoDoc.ActiveDoc?.RuntimeSerialNumber ?? 0) { }
    public DrawerPanel(uint documentSerialNumber)
    {
        var server = DrawerPlugin.EnsureServer();
        var view = new WebView();
        // The token stays in the fragment, never in HTTP request URLs or logs.
        var target = new Uri($"{server.Url}?documentId={documentSerialNumber}#token={server.Token}");
        view.DocumentLoading += (_, e) =>
        {
            if (e.Uri == null || e.Uri.Scheme != "http" || e.Uri.Host != "127.0.0.1" || e.Uri.Port != new Uri(server.Url).Port)
                e.Cancel = true;
        };
        view.Url = target;
        Content = view;
        Padding = 0;
    }
}
