namespace InspirationDrawer.Rhino;

/// <summary>Conservatively rejects empty/near-uniform captures before they can become AI references.</summary>
internal static class ViewportCaptureValidation
{
    internal static bool HasVisibleContent(int width, int height, Func<int, int, int> readArgb)
    {
        if (width < 2 || height < 2) return false;
        var columns = Math.Min(64, width);
        var rows = Math.Min(64, height);
        var pixels = new List<int>(columns * rows);
        var histogram = new Dictionary<int, int>();
        // Ignore the outer 2% so a print margin/one-pixel border cannot make an
        // otherwise empty background look like a valid model reference.
        for (var y = 0; y < rows; y++)
        for (var x = 0; x < columns; x++)
        {
            var px = Math.Min(width - 1, (int)((0.02 + 0.96 * (x + 0.5) / columns) * width));
            var py = Math.Min(height - 1, (int)((0.02 + 0.96 * (y + 0.5) / rows) * height));
            var argb = readArgb(px, py);
            if ((uint)argb >> 24 < 16) continue;
            var rgb = argb & 0x00ffffff;
            pixels.Add(rgb);
            histogram[rgb] = histogram.GetValueOrDefault(rgb) + 1;
        }
        if (pixels.Count < 4) return false;
        var background = histogram.MaxBy(pair => pair.Value).Key;
        var varied = pixels.Count(rgb => Math.Max(
            Math.Abs(((rgb >> 16) & 255) - ((background >> 16) & 255)),
            Math.Max(Math.Abs(((rgb >> 8) & 255) - ((background >> 8) & 255)),
                Math.Abs((rgb & 255) - (background & 255)))) >= 12);
        return varied >= Math.Max(4, pixels.Count / 1000);
    }
}
