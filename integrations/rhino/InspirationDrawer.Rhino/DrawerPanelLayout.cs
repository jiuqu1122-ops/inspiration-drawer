namespace InspirationDrawer.Rhino;

/// <summary>Compact and initial floating sizes, in logical pixels.</summary>
internal static class DrawerPanelLayout
{
    // Keep the floating panel compact enough to fit in a narrow Rhino workspace.
    // At this width the panel CSS switches model controls to a single column.
    internal const int MinimumWidth = 340;
    internal const int MinimumHeight = 420;

    internal static System.Drawing.Size FirstFloatingSize(System.Drawing.Size current, System.Drawing.Size workArea, uint dpi)
    {
        int Pixels(int logical) => (int)Math.Round(logical * (dpi == 0 ? 96 : dpi) / 96d);
        if (current.Width >= Pixels(420) && current.Height >= Pixels(520)) return current;
        return new System.Drawing.Size(
            Math.Max(current.Width, Math.Min(Pixels(480), workArea.Width)),
            Math.Max(current.Height, Math.Min(Pixels(680), workArea.Height)));
    }
}
