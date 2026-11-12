namespace InspirationDrawer.Rhino;

/// <summary>Compact native panel minimum size, in Eto logical pixels.</summary>
internal static class DrawerPanelLayout
{
    // Keep the floating panel compact enough to fit in a narrow Rhino workspace.
    // At this width the panel CSS switches model controls to a single column.
    internal const int MinimumWidth = 340;
    internal const int MinimumHeight = 420;
}
