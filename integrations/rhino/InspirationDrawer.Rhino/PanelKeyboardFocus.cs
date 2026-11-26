using System.Runtime.InteropServices;
using Eto.Forms;

namespace InspirationDrawer.Rhino;

/// <summary>
/// Rhino owns the modeless panel message pump. Dispatch only this WebView's focused
/// child messages before Rhino interprets them as command-line input. Never synthesize
/// JS keystrokes, inspect text, hook other threads, or consume Rhino/OS accelerators.
/// </summary>
internal sealed class PanelKeyboardFocus : IDisposable
{
    private readonly WebView view;
    private readonly Hook callback; // Keep the unmanaged callback rooted until unhooked.
    private IntPtr hook;
    private bool dispatching, disposed;
    private static readonly HashSet<PanelKeyboardFocus> owners = new(); // Rhino UI thread only.
    internal PanelKeyboardFocus(WebView view)
    {
        this.view = view;
        callback = OnMessage;
#if !RHINO8
        view.MessageReceived += OnBrowserMessage;
#endif
        view.DocumentTitleChanged += OnBrowserTitle;
        hook = SetWindowsHookEx(3 /* WH_GETMESSAGE */, callback, IntPtr.Zero, GetCurrentThreadId());
        if (hook == IntPtr.Zero) StartupDiagnostics.Write("panel.keyboard.hook.unavailable");
        owners.Add(this);
    }
#if !RHINO8
    private void OnBrowserMessage(object? sender, WebViewMessageEventArgs args) => ReceiveFocusSignal(args.Message);
#endif
    private void OnBrowserTitle(object? sender, WebViewTitleEventArgs args)
    {
        // Rhino 8's bundled Eto predates WebView.MessageReceived/window.eto.
        if (args.Title.StartsWith("idraw:keyboard-focus:", StringComparison.Ordinal)) ReceiveFocusSignal("idraw:keyboard-focus");
        else if (args.Title.StartsWith("idraw:keyboard-release:", StringComparison.Ordinal)) ReceiveFocusSignal("idraw:keyboard-release");
    }
    private void ReceiveFocusSignal(string message)
    {
        if (disposed) return;
        if (message != "idraw:keyboard-focus") return;
        // A delayed DOM signal is not permission to take focus from Rhino or another app.
        var host = DrawerFloatingPanel.NativeHandle(view);
        if (Owns(host, ReadFocusedWindow()) || host == IntPtr.Zero || !IsWindowVisible(host) ||
            !IsWindowEnabled(host) || GetAncestor(host, 2 /* GA_ROOT */) != GetForegroundWindow()) return;
        if (GetCursorPos(out var point) && Owns(host, WindowFromPoint(point))) view.Focus();
    }
    private static IntPtr ReadFocusedWindow()
    {
        var info = new GuiThreadInfo { Size = Marshal.SizeOf<GuiThreadInfo>() };
        return GetGUIThreadInfo(0, ref info) ? info.Focus : GetFocus();
    }
    private static bool Owns(IntPtr host, IntPtr hwnd) => host != IntPtr.Zero && hwnd != IntPtr.Zero &&
        (host == hwnd || IsChild(host, hwnd));
    private IntPtr OnMessage(int code, IntPtr removed, IntPtr data)
    {
        try
        {
            if (!disposed && !dispatching && code >= 0 && removed == new IntPtr(1) && data != IntPtr.Zero)
            {
                var message = Marshal.PtrToStructure<NativeMessage>(data);
                if (!PanelKeyboardPolicy.IsKeyboardMessage(message.Message)) return CallNextHookEx(hook, code, removed, data);
                var host = DrawerFloatingPanel.NativeHandle(view);
                if (PanelKeyboardPolicy.ShouldDispatch(code, true, message.Message, Owns(host, message.Window), Owns(host, ReadFocusedWindow())))
                {
                    dispatching = true;
                    try { TranslateMessage(ref message); DispatchMessage(ref message); }
                    finally { dispatching = false; }
                    // The original message has been handled exactly once. Do not let Rhino replay it.
                    message.Message = 0; message.WParam = UIntPtr.Zero; message.LParam = IntPtr.Zero;
                    Marshal.StructureToPtr(message, data, false);
                }
            }
        }
        catch (Exception error) { StartupDiagnostics.Write("panel.keyboard.dispatch.failed", error); }
        return CallNextHookEx(hook, code, removed, data);
    }
    internal static IDisposable PreserveBrowserFocus(Func<bool> mayRestore)
    {
        var focused = ReadFocusedWindow(); var foreground = GetForegroundWindow();
        var owner = owners.FirstOrDefault(owner => !owner.disposed && Owns(DrawerFloatingPanel.NativeHandle(owner.view), focused));
        return new FocusRestore(owner, focused, foreground, mayRestore);
    }
    private sealed class FocusRestore(PanelKeyboardFocus? owner, IntPtr focused, IntPtr foreground, Func<bool> mayRestore) : IDisposable
    {
        public void Dispose()
        {
            // Only restore the focus displaced synchronously by our own MCPStart command.
            // Never activate a window, override a modal command, or steal focus from another app.
            if (owner != null && !owner.disposed && focused != IntPtr.Zero && mayRestore() && GetForegroundWindow() == foreground &&
                IsWindow(focused) && Owns(DrawerFloatingPanel.NativeHandle(owner.view), focused) && IsWindowVisible(focused) && IsWindowEnabled(focused))
            {
                owner.view.Focus();
                SetFocus(focused);
            }
        }
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true; owners.Remove(this);
#if !RHINO8
        view.MessageReceived -= OnBrowserMessage;
#endif
        view.DocumentTitleChanged -= OnBrowserTitle;
        if (hook != IntPtr.Zero) { UnhookWindowsHookEx(hook); hook = IntPtr.Zero; }
        GC.KeepAlive(callback);
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct NativeMessage
    {
        internal IntPtr Window; internal uint Message; internal UIntPtr WParam; internal IntPtr LParam;
        internal uint Time; internal int X, Y; internal uint Private;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct GuiThreadInfo
    {
        internal int Size; internal uint Flags;
        internal IntPtr Active, Focus, Capture, MenuOwner, MoveSize, Caret;
        internal int Left, Top, Right, Bottom;
    }
    [StructLayout(LayoutKind.Sequential)]
    private struct Point { internal int X, Y; }
    private delegate IntPtr Hook(int code, IntPtr wParam, IntPtr lParam);
    [DllImport("user32.dll", SetLastError = true)] private static extern IntPtr SetWindowsHookEx(int idHook, Hook callback, IntPtr module, uint threadId);
    [DllImport("user32.dll")] private static extern bool UnhookWindowsHookEx(IntPtr hook);
    [DllImport("user32.dll")] private static extern IntPtr CallNextHookEx(IntPtr hook, int code, IntPtr wParam, IntPtr lParam);
    [DllImport("kernel32.dll")] private static extern uint GetCurrentThreadId();
    [DllImport("user32.dll")] private static extern IntPtr GetFocus();
    [DllImport("user32.dll")] private static extern IntPtr SetFocus(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] private static extern bool IsWindow(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsWindowEnabled(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern IntPtr GetAncestor(IntPtr hwnd, uint flags);
    [DllImport("user32.dll")] private static extern bool IsChild(IntPtr parent, IntPtr child);
    [DllImport("user32.dll")] private static extern bool GetGUIThreadInfo(uint threadId, ref GuiThreadInfo info);
    [DllImport("user32.dll")] private static extern bool GetCursorPos(out Point point);
    [DllImport("user32.dll")] private static extern IntPtr WindowFromPoint(Point point);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref NativeMessage message);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr DispatchMessage(ref NativeMessage message);
}
