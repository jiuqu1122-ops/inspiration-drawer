namespace InspirationDrawer.Rhino;

/// <summary>No global hotkey suppression: only removed messages owned by the focused browser child.</summary>
internal static class PanelKeyboardPolicy
{
    internal static bool ShouldDispatch(int hookCode, bool removed, uint message, bool targetOwned, bool focusOwned) =>
        hookCode >= 0 && removed && targetOwned && focusOwned &&
        (message is >= 0x100 and <= 0x103 || message is 0x109 or 0x286 or 0x290 or 0x291);
    internal static bool IsBrowserClass(string name) => name == "Internet Explorer_Server" ||
        name.StartsWith("Chrome_WidgetWin_", StringComparison.Ordinal) || name == "Chrome_RenderWidgetHostHWND";
}
