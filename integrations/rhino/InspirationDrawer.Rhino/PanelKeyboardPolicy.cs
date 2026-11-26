namespace InspirationDrawer.Rhino;

/// <summary>No global hotkey suppression: only removed messages owned by the focused browser child.</summary>
internal static class PanelKeyboardPolicy
{
    internal static bool ShouldDispatch(int hookCode, bool removed, uint message, bool targetOwned, bool focusOwned) =>
        hookCode >= 0 && removed && targetOwned && focusOwned && IsKeyboardMessage(message);

    // WM_KEYDOWN..WM_DEADCHAR, WM_UNICHAR, composition and IME messages; never WM_SYSKEY*.
    internal static bool IsKeyboardMessage(uint message) => message is >= 0x100 and <= 0x103 ||
        message is 0x109 or (>= 0x10D and <= 0x10F) or (>= 0x281 and <= 0x286) or 0x288 or 0x290 or 0x291;
}
