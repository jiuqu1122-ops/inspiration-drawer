using Microsoft.UI.Xaml.Media.Imaging;
using Microsoft.UI.Xaml.Media;

namespace InspirationDrawer.Native.Models;

public sealed class DrawerFolder
{
    public string Id { get; set; } = "";

    public string Name { get; set; } = "";

    public string Color { get; set; } = "#64748b";
}

public sealed class DrawerItem
{
    public string Id { get; set; } = "";

    public string Type { get; set; } = "text";

    public string Content { get; set; } = "";

    public string Name { get; set; } = "";

    public string Path { get; set; } = "";

    public string Url { get; set; } = "";

    public string Thumbnail { get; set; } = "";

    public string FolderId { get; set; } = "";

    public long CreatedAt { get; set; }
}

public sealed class FolderSummary(string id, string name, string color, int count)
{
    public string Id { get; set; } = id;

    public string Name { get; set; } = name;

    public string Color { get; set; } = color;

    public SolidColorBrush ColorBrush { get; set; } = new(ParseColor(color));

    public int Count { get; set; } = count;

    private static Windows.UI.Color ParseColor(string value)
    {
        var hex = value.Trim().TrimStart('#');
        if (hex.Length is 6 &&
            byte.TryParse(hex[..2], System.Globalization.NumberStyles.HexNumber, null, out var r) &&
            byte.TryParse(hex[2..4], System.Globalization.NumberStyles.HexNumber, null, out var g) &&
            byte.TryParse(hex[4..6], System.Globalization.NumberStyles.HexNumber, null, out var b))
        {
            return Windows.UI.Color.FromArgb(255, r, g, b);
        }

        return Windows.UI.Color.FromArgb(255, 100, 116, 139);
    }
}

public sealed class DrawerCard
{
    public string Id { get; set; } = "";

    public string Type { get; set; } = "text";

    public string TypeLabel { get; set; } = "文本";

    public string Name { get; set; } = "";

    public string Description { get; set; } = "";

    public string FolderName { get; set; } = "未分类";

    public string CreatedLabel { get; set; } = "";

    public string IconGlyph { get; set; } = "\uE8A5";

    public BitmapImage? Image { get; set; }

    public bool HasImage => Image is not null;

    public bool HasNoImage => !HasImage;
}
