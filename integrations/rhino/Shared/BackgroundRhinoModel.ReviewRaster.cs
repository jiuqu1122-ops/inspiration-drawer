using System.Drawing.Imaging;
using System.Runtime.InteropServices;

namespace InspirationDrawer.Rhino;

internal static partial class BackgroundRhinoModel
{
    // Deliberately independent of Rhino views, OpenGL, display settings and document cameras.
    internal readonly record struct ReviewPoint(double X, double Y, double Z);
    internal readonly record struct ReviewTriangle(ReviewPoint A, ReviewPoint B, ReviewPoint C, int Argb, int Part);
    internal static int LitColor(Color color, double nx, double ny, double nz)
    {
        var shade = 0.55 + 0.43 * Math.Abs(0.24 * nx - 0.45 * ny + 0.85 * nz);
        int Channel(byte component) => (int)((20 + 0.87 * component) * shade);
        return Color.FromArgb(Channel(color.R), Channel(color.G), Channel(color.B)).ToArgb();
    }

    private enum ReviewView { Front, Oblique, Right, Top }
    private const int TileWidth = 576, TileHeight = 362, HeaderHeight = 42, Padding = 20;

    private static ReviewPoint Project(ReviewView view, ReviewPoint p) => view switch
    {
        // Coordinates are screen right, screen down, toward camera (greater depth wins).
        ReviewView.Front => new(p.X, -p.Z, -p.Y),
        ReviewView.Right => new(p.Y, -p.Z, p.X),
        ReviewView.Top   => new(p.X, -p.Y, p.Z),
        _ => new((p.X + p.Y) / Math.Sqrt(2), (p.X - p.Y - 2 * p.Z) / Math.Sqrt(6), (p.X - p.Y + p.Z) / Math.Sqrt(3)),
    };

    internal static byte[] RenderReviewSheet(IReadOnlyList<ReviewTriangle> scene)
    {
        if (scene.Count == 0) throw new InvalidOperationException("There is no visible geometry to preview.");
        using var sheet = new Bitmap(2 * TileWidth, 2 * (HeaderHeight + TileHeight));
        using (var g = Graphics.FromImage(sheet))
        using (var label = new Font("Segoe UI", 18, FontStyle.Bold, GraphicsUnit.Pixel))
        using (var scaleLabel = new Font("Segoe UI", 14, FontStyle.Regular, GraphicsUnit.Pixel))
        using (var ink = new SolidBrush(Color.FromArgb(46, 58, 64)))
        {
            g.Clear(Color.White);
            (ReviewView View, string Label)[] views = [(ReviewView.Front, "FRONT  /  XZ"), (ReviewView.Oblique, "OBLIQUE"),
                (ReviewView.Right, "RIGHT  /  YZ"), (ReviewView.Top, "TOP  /  XY")];
            for (var i = 0; i < views.Length; i++)
            {
                var x = i % 2 * TileWidth;
                var y = i / 2 * (HeaderHeight + TileHeight);
                using var tile = RenderView(scene, views[i].View, out var pixelsPerMm);
                g.DrawImageUnscaled(tile, x, y + HeaderHeight);
                g.DrawString(views[i].Label, label, ink, x + Padding, y + 8);
                // Views fit independently. A labeled scale bar prevents false size comparisons.
                var targetMm = 90 / pixelsPerMm;
                var unit = Math.Pow(10, Math.Floor(Math.Log10(targetMm)));
                var barMm = unit * (targetMm / unit >= 5 ? 5 : targetMm / unit >= 2 ? 2 : 1);
                var end = x + TileWidth - Padding;
                var start = end - (float)(barMm * pixelsPerMm);
                var caption = FormattableString.Invariant($"{barMm:G3} mm");
                g.DrawString(caption, scaleLabel, ink, end - g.MeasureString(caption, scaleLabel).Width, y + 2);
                g.DrawLine(Pens.DimGray, start, y + 30, end, y + 30);
                g.DrawLine(Pens.DimGray, start, y + 26, start, y + 30);
                g.DrawLine(Pens.DimGray, end, y + 26, end, y + 30);
            }
            g.DrawLine(Pens.White, TileWidth, 0, TileWidth, sheet.Height);
        }
        using var buffer = new MemoryStream();
        sheet.Save(buffer, ImageFormat.Png);
        if (buffer.Length > 2_475_000) throw new InvalidOperationException("Review PNG exceeds the chat image limit.");
        return buffer.ToArray();
    }

    private static Bitmap RenderView(IReadOnlyList<ReviewTriangle> scene, ReviewView view, out double pixelsPerMm)
    {
        double left = double.PositiveInfinity, right = double.NegativeInfinity, top = left, bottom = right;
        foreach (var t in scene) { Include(t.A); Include(t.B); Include(t.C); }
        void Include(ReviewPoint vertex)
        {
            var p = Project(view, vertex);
            left = Math.Min(left, p.X); right = Math.Max(right, p.X);
            top = Math.Min(top, p.Y); bottom = Math.Max(bottom, p.Y);
        }
        // Fit the whole assembly once per view (never zoom each part separately).
        var dx = right - left; var dy = bottom - top;
        var scale = Math.Min((TileWidth - 2 * Padding) / dx, (TileHeight - 2 * Padding) / dy);
        if (!double.IsFinite(scale) || scale <= 0) throw new InvalidOperationException("Invalid projected model extents.");
        pixelsPerMm = scale;
        ReviewPoint Pixel(ReviewPoint v)
        {
            var p = Project(view, v);
            return new(((p.X - left) - dx / 2) * scale + TileWidth / 2.0, ((p.Y - top) - dy / 2) * scale + TileHeight / 2.0, p.Z);
        }
        var pixels = new int[TileWidth * TileHeight];
        Array.Fill(pixels, Color.FromArgb(240, 243, 245).ToArgb());
        var depth = new double[pixels.Length];
        Array.Fill(depth, double.NegativeInfinity);
        var owners = new int[pixels.Length];
        foreach (var t in scene) Rasterize(Pixel(t.A), Pixel(t.B), Pixel(t.C), t.Argb, t.Part, pixels, depth, owners);
        // A mating seam should remain legible even for two coplanar parts of identical color.
        for (var i = TileWidth; i < pixels.Length; ++i)
            if (owners[i] != 0 && ((owners[i - 1] != 0 && owners[i] != owners[i - 1]) ||
                (owners[i - TileWidth] != 0 && owners[i] != owners[i - TileWidth])))
                pixels[i] = (pixels[i] & 0xfefefe) >> 1;
        var tile = new Bitmap(TileWidth, TileHeight, PixelFormat.Format32bppRgb);
        var bits = tile.LockBits(new Rectangle(0, 0, TileWidth, TileHeight), ImageLockMode.WriteOnly, tile.PixelFormat);
        try { Marshal.Copy(pixels, 0, bits.Scan0, pixels.Length); }
        finally { tile.UnlockBits(bits); }
        return tile;
    }

    // Orthographic scan conversion with per-pixel depth. Average face sorting misorders long
    // overlapping faces and can hide precisely the insert / housing offsets under review.
    private static void Rasterize(ReviewPoint a, ReviewPoint b, ReviewPoint c, int color, int part, int[] pixels, double[] depth, int[] owners)
    {
        if (a.Y > b.Y) (a, b) = (b, a);
        if (b.Y > c.Y) (b, c) = (c, b);
        if (a.Y > b.Y) (a, b) = (b, a);
        static ReviewPoint Lerp(ReviewPoint p, ReviewPoint q, double f) =>
            new(p.X + (q.X - p.X) * f, p.Y + (q.Y - p.Y) * f, p.Z + (q.Z - p.Z) * f);
        void Plot(int x, int y, double z)
        {
            var index = y * TileWidth + x; // Fit guarantees all samples stay inside the padding.
            if (z <= depth[index]) return;
            depth[index] = z; pixels[index] = color; owners[index] = part;
        }
        var area = Math.Abs((b.X - a.X) * (c.Y - a.Y) - (c.X - a.X) * (b.Y - a.Y));
        if (area < 1e-7)
        {
            // A planar part viewed edge-on is a line, not an empty tile. Preserve nearest depth.
            Line(a, b); Line(b, c); Line(c, a);
            void Line(ReviewPoint p, ReviewPoint q)
            {
                var steps = Math.Max(1, (int)Math.Ceiling(Math.Max(Math.Abs(p.X - q.X), Math.Abs(p.Y - q.Y))));
                for (var i = 0; i <= steps; ++i)
                {
                    var v = Lerp(p, q, (double)i / steps);
                    Plot((int)Math.Round(v.X), (int)Math.Round(v.Y), v.Z);
                }
            }
            return;
        }
        for (var y = (int)Math.Ceiling(a.Y); y < c.Y; ++y)
        {
            var p = Lerp(a, c, (y - a.Y) / (c.Y - a.Y));
            var q = y < b.Y ? Lerp(a, b, (y - a.Y) / (b.Y - a.Y)) : Lerp(b, c, (y - b.Y) / (c.Y - b.Y));
            if (q.X < p.X) (p, q) = (q, p);
            var span = q.X - p.X;
            for (var x = (int)Math.Ceiling(p.X); x <= q.X; ++x)
                Plot(x, y, span > 0 ? p.Z + (q.Z - p.Z) * ((x - p.X) / span) : Math.Max(p.Z, q.Z));
        }
    }
}
