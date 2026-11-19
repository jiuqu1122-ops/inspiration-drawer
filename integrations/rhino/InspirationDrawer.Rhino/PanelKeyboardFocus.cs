using System.Runtime.InteropServices;
using System.Text;
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
    private IntPtr hook, browser;
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
        if (message == "idraw:keyboard-release") { browser = IntPtr.Zero; return; }
        if (message != "idraw:keyboard-focus") return;
        // This is sent only by a user-focused control, not by the heartbeat or a timer.
        var focused = GetFocus();
        if (BrowserRoot(focused) == IntPtr.Zero) { view.Focus(); focused = GetFocus(); }
        browser = BrowserRoot(focused);
    }
    private IntPtr BrowserRoot(IntPtr hwnd)
    {
        // WebView2's renderer is a child in a different process. Match the
        // exact Eto view's public HwndHost/WinForms handle, not another plugin's browser.
        IntPtr host;
        try { host = view.ControlObject?.GetType().GetProperty("Handle")?.GetValue(view.ControlObject) is IntPtr handle ? handle : IntPtr.Zero; }
        catch { return IntPtr.Zero; }
        if (host == IntPtr.Zero || !IsWindow(host) || (hwnd != host && !IsChild(host, hwnd))) return IntPtr.Zero;
        for (var depth = 0; depth < 32 && hwnd != IntPtr.Zero && IsWindow(hwnd); depth++, hwnd = GetParent(hwnd))
        {
            GetWindowThreadProcessId(hwnd, out var processId);
            var name = new StringBuilder(256); GetClassName(hwnd, name, name.Capacity);
            if (processId == Environment.ProcessId && PanelKeyboardPolicy.IsBrowserClass(name.ToString())) return hwnd;
            if (hwnd == host) break;
        }
        return IntPtr.Zero;
    }
    private bool Owns(IntPtr hwnd) => browser != IntPtr.Zero && IsWindow(browser) &&
        (hwnd == browser || IsChild(browser, hwnd));
    private IntPtr OnMessage(int code, IntPtr removed, IntPtr data)
    {
        try
        {
            if (!disposed && !dispatching && code >= 0 && removed == new IntPtr(1) && data != IntPtr.Zero)
            {
                var message = Marshal.PtrToStructure<NativeMessage>(data);
                if (PanelKeyboardPolicy.ShouldDispatch(code, true, message.Message, Owns(message.Window), Owns(GetFocus())))
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
        var focused = GetFocus(); var foreground = GetForegroundWindow();
        var owner = owners.FirstOrDefault(owner => !owner.disposed && owner.Owns(focused));
        return new FocusRestore(owner, focused, foreground, mayRestore);
    }
    private sealed class FocusRestore(PanelKeyboardFocus? owner, IntPtr focused, IntPtr foreground, Func<bool> mayRestore) : IDisposable
    {
        public void Dispose()
        {
            // Only restore the focus displaced synchronously by our own MCPStart command.
            // Never activate a window, override a modal command, or steal focus from another app.
            if (owner != null && !owner.disposed && focused != IntPtr.Zero && mayRestore() && GetForegroundWindow() == foreground &&
                IsWindow(focused) && IsWindowVisible(focused) && IsWindowEnabled(focused))
            {
                owner.view.Focus();
                SetFocus(focused);
                owner.browser = owner.BrowserRoot(GetFocus());
            }
        }
    }
    public void Dispose()
    {
        if (disposed) return;
        disposed = true; browser = IntPtr.Zero; owners.Remove(this);
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
    [DllImport("user32.dll")] private static extern IntPtr GetParent(IntPtr hwnd);
    [DllImport("user32.dll")] private static extern bool IsChild(IntPtr parent, IntPtr child);
    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint processId);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern int GetClassName(IntPtr hwnd, StringBuilder text, int length);
    [DllImport("user32.dll")] private static extern bool TranslateMessage(ref NativeMessage message);
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] private static extern IntPtr DispatchMessage(ref NativeMessage message);
}
