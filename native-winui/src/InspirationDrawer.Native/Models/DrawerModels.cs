using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;

namespace InspirationDrawer.Native.Models;

public sealed class DrawerFolder
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("color")]
    public string Color { get; set; } = "#64748b";

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; set; }
}

public sealed class DrawerItem
{
    [JsonPropertyName("id")]
    public string Id { get; set; } = "";

    [JsonPropertyName("type")]
    public string Type { get; set; } = "text";

    [JsonPropertyName("content")]
    public string Content { get; set; } = "";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("path")]
    public string Path { get; set; } = "";

    [JsonPropertyName("url")]
    public string Url { get; set; } = "";

    [JsonPropertyName("thumbnail")]
    public string Thumbnail { get; set; } = "";

    [JsonPropertyName("cover")]
    public string? Cover { get; set; }

    [JsonPropertyName("createdAt")]
    public long CreatedAt { get; set; }

    [JsonPropertyName("isQuickAccess")]
    public bool? IsQuickAccess { get; set; }

    [JsonPropertyName("isFloatingNote")]
    public bool? IsFloatingNote { get; set; }

    [JsonPropertyName("remark")]
    public string? Remark { get; set; }

    [JsonPropertyName("remarks")]
    public IReadOnlyList<string>? Remarks { get; set; }

    [JsonPropertyName("folderId")]
    public string FolderId { get; set; } = "";

    [JsonPropertyName("isDirectory")]
    public bool? IsDirectory { get; set; }

    [JsonPropertyName("isUrl")]
    public bool? IsUrl { get; set; }

    [JsonPropertyName("sourceUrl")]
    public string? SourceUrl { get; set; }

    [JsonPropertyName("pageUrl")]
    public string? PageUrl { get; set; }

    [JsonPropertyName("originalUrl")]
    public string? OriginalUrl { get; set; }

    [JsonPropertyName("alchemy")]
    public JsonElement? Alchemy { get; set; }

    [JsonExtensionData]
    public Dictionary<string, JsonElement>? Extra { get; set; }
}

public sealed class FolderSummary(string id, string name, string color, int count, bool isActive = false)
{
    public string Id { get; set; } = id;

    public string Name { get; set; } = name;

    public string Color { get; set; } = color;

    public SolidColorBrush ColorBrush { get; set; } = new(ParseColor(color));

    public int Count { get; set; } = count;

    public bool IsActive { get; set; } = isActive;

    public SolidColorBrush IconBackgroundBrush { get; set; } = new(isActive
        ? Windows.UI.Color.FromArgb(255, 16, 185, 129)
        : Windows.UI.Color.FromArgb(166, 255, 255, 255));

    public SolidColorBrush IconBorderBrush { get; set; } = new(isActive
        ? Windows.UI.Color.FromArgb(255, 16, 185, 129)
        : Windows.UI.Color.FromArgb(179, 255, 255, 255));

    public SolidColorBrush IconForegroundBrush { get; set; } = new(isActive
        ? Windows.UI.Color.FromArgb(255, 255, 255, 255)
        : ParseColor(color));

    public SolidColorBrush LabelBrush { get; set; } = new(isActive
        ? Windows.UI.Color.FromArgb(255, 16, 185, 129)
        : Windows.UI.Color.FromArgb(255, 120, 113, 108));

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

    public string SearchText { get; set; } = "";

    public string FolderName { get; set; } = "未分类";

    public string RemarkSummary { get; set; } = "";

    public string CreatedLabel { get; set; } = "";

    public string OpenTarget { get; set; } = "";

    public string RevealTarget { get; set; } = "";

    public string IconGlyph { get; set; } = "\uE8A5";

    public BitmapImage? Image { get; set; }

    public double MediaHeight => HasImage || Type == "video" ? 180 : 0;

    public bool IsSelected { get; set; }

    public bool IsQuickAccess { get; set; }

    public bool CanEditText => Type == "text";

    public bool CanPreview => (Type == "image" && Image is not null) || (Type == "video" && CanOpen);

    public bool HasImage => Image is not null;

    public bool HasNoImage => !HasImage;

    public bool CanOpen => !string.IsNullOrWhiteSpace(OpenTarget);

    public bool CanReveal => !string.IsNullOrWhiteSpace(RevealTarget);
}
