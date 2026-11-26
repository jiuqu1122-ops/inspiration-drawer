using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Interop;
using System.Windows.Media;
using Eto.Forms;
using Rhino;
using Rhino.UI;

namespace InspirationDrawer.Rhino;

internal static class DrawerFloatingPanel
{
    internal static void ApplyInitialSize(WebView view)
    {
        try
        {
            var settingsDirectory = Path.GetDirectoryName(StartupDiagnostics.PathName)!;
            var initialized = Path.Combine(settingsDirectory, $"floating-panel-size-rhino{RhinoApp.Version.Major}.initialized");
            if (File.Exists(initialized)) return;

            var child = NativeHandle(view);
            var main = RhinoApp.MainWindowHandle();
            if (child == IntPtr.Zero || main == IntPtr.Zero) return;
            var host = GetAncestor(child, 2 /* GA_ROOT */);
            if (host == IntPtr.Zero || !IsWindowVisible(host)) return;
            var panelId = typeof(DrawerPanel).GUID;
            var dockBar = Panels.PanelDockBar(panelId);
            if (dockBar == Guid.Empty) return;

            // The WebView's own top-level ancestor can be an unowned Rhino floating window.
            GetWindowThreadProcessId(host, out var hostProcess);
            if (host != main && hostProcess == Environment.ProcessId &&
                !Panels.GetOpenPanelIds().Any(id => id != panelId && Panels.PanelDockBar(id) == dockBar) &&
                !IsZoomed(host) && !IsIconic(host) && GetWindowRect(host, out var bounds))
            {
                var workArea = System.Windows.Forms.Screen.FromHandle(host).WorkingArea;
                var current = new Size(bounds.Right - bounds.Left, bounds.Bottom - bounds.Top);
                var initial = DrawerPanelLayout.FirstFloatingSize(current, workArea.Size, GetDpiForWindow(host));
                if (initial != current)
                {
                    var left = Math.Clamp(bounds.Left, workArea.Left, Math.Max(workArea.Left, workArea.Right - initial.Width));
                    var top = Math.Clamp(bounds.Top, workArea.Top, Math.Max(workArea.Top, workArea.Bottom - initial.Height));
                    if (!SetWindowPos(host, IntPtr.Zero, left, top, initial.Width, initial.Height, 0x214 /* NOZORDER | NOACTIVATE | NOOWNERZORDER */)) return;
                    StartupDiagnostics.Write("panel.initial-size.applied");
                }
            }
            Directory.CreateDirectory(settingsDirectory);
            File.WriteAllText(initialized, string.Empty);
        }
        catch (Exception error) { StartupDiagnostics.Write("panel.initial-size.failed", error); }
    }

    internal static IntPtr NativeHandle(WebView view) => view.ControlObject switch
    {
        System.Windows.Forms.Control control when control.IsHandleCreated => control.Handle,
        Visual visual => FindWindowHost(visual)?.Handle ?? IntPtr.Zero,
        _ => IntPtr.Zero,
    };

    // Search only this WebView's visual subtree, not its containing Rhino window.
    private static HwndHost? FindWindowHost(Visual visual)
    {
        if (visual is HwndHost host) return host;
        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(visual); i++)
            if (VisualTreeHelper.GetChild(visual, i) is Visual child && FindWindowHost(child) is { } found) return found;
        return null;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct WindowRect { internal int Left, Top, Right, Bottom; }

    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsZoomed(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsIconic(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool GetWindowRect(IntPtr hwnd, out WindowRect bounds);
    [DllImport("user32.dll")] private static extern uint GetDpiForWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
}
