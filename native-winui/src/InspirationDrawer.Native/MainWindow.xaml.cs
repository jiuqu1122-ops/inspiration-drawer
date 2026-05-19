using System.Collections.ObjectModel;
using InspirationDrawer.Native.Models;
using InspirationDrawer.Native.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media.Imaging;

namespace InspirationDrawer.Native;

public sealed partial class MainWindow : Window
{
    private const string AllFolderId = "__all";
    private const string UnfiledFolderId = "__unfiled";

    private readonly DrawerDataStore dataStore = new();
    private readonly ObservableCollection<FolderSummary> folders = [];
    private readonly ObservableCollection<DrawerCard> visibleCards = [];
    private readonly Dictionary<string, string> folderNames = [];
    private IReadOnlyList<DrawerItem> items = [];

    public MainWindow()
    {
        InitializeComponent();
        Title = "灵感抽屉 Native";
        FolderList.ItemsSource = folders;
        ItemRepeater.ItemsSource = visibleCards;
        _ = LoadDataAsync();
    }

    private async Task LoadDataAsync()
    {
        try
        {
            StatusText.Text = "正在读取旧版抽屉数据...";

            var snapshot = await dataStore.LoadAsync();
            items = snapshot.Items
                .OrderByDescending(item => item.CreatedAt)
                .ToList();

            folderNames.Clear();
            foreach (var folder in snapshot.Folders)
            {
                folderNames[folder.Id] = folder.Name;
            }

            RebuildFolders(snapshot.Folders, items);
            FolderList.SelectedIndex = folders.Count > 0 ? 0 : -1;
            ApplyFolder(AllFolderId);

            StatusText.Text = $"已读取 {items.Count} 个素材，来自 {snapshot.DataDirectory}";
        }
        catch (Exception ex)
        {
            StatusText.Text = $"读取失败：{ex.Message}";
            folders.Clear();
            visibleCards.Clear();
        }
    }

    private void RebuildFolders(IReadOnlyList<DrawerFolder> sourceFolders, IReadOnlyList<DrawerItem> sourceItems)
    {
        folders.Clear();
        folders.Add(new FolderSummary(AllFolderId, "全部素材", "#2563eb", sourceItems.Count));

        foreach (var folder in sourceFolders)
        {
            var count = sourceItems.Count(item => item.FolderId == folder.Id);
            folders.Add(new FolderSummary(folder.Id, folder.Name, folder.Color, count));
        }

        var unfiledCount = sourceItems.Count(item => string.IsNullOrWhiteSpace(item.FolderId));
        if (unfiledCount > 0)
        {
            folders.Add(new FolderSummary(UnfiledFolderId, "未分类", "#64748b", unfiledCount));
        }
    }

    private void ApplyFolder(string folderId)
    {
        var filtered = folderId switch
        {
            AllFolderId => items,
            UnfiledFolderId => items.Where(item => string.IsNullOrWhiteSpace(item.FolderId)).ToList(),
            _ => items.Where(item => item.FolderId == folderId).ToList(),
        };

        visibleCards.Clear();
        foreach (var item in filtered.Select(ToCard))
        {
            visibleCards.Add(item);
        }

        var selectedFolder = folders.FirstOrDefault(folder => folder.Id == folderId);
        ContentTitle.Text = selectedFolder?.Name ?? "全部素材";
        ContentSubtitle.Text = visibleCards.Count > 0
            ? $"当前显示 {visibleCards.Count} 个素材，图片会优先加载本地文件。"
            : "这个分类暂时没有素材。";
    }

    private DrawerCard ToCard(DrawerItem item)
    {
        var name = FirstNonEmpty(item.Name, item.Content, item.Path, "未命名素材");
        var folderName = !string.IsNullOrWhiteSpace(item.FolderId) && folderNames.TryGetValue(item.FolderId, out var knownFolder)
            ? knownFolder
            : "未分类";

        return new DrawerCard
        {
            Id = item.Id,
            Type = item.Type,
            TypeLabel = GetTypeLabel(item.Type),
            Name = Truncate(name, 80),
            Description = BuildDescription(item),
            FolderName = folderName,
            CreatedLabel = FormatCreatedAt(item.CreatedAt),
            IconGlyph = GetIconGlyph(item.Type),
            Image = BuildImage(item),
        };
    }

    private static BitmapImage? BuildImage(DrawerItem item)
    {
        if (item.Type is not "image")
        {
            return null;
        }

        var path = NormalizeWindowsPath(item.Path);
        if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
        {
            return null;
        }

        try
        {
            return new BitmapImage(new Uri(path));
        }
        catch
        {
            return null;
        }
    }

    private static string BuildDescription(DrawerItem item)
    {
        if (!string.IsNullOrWhiteSpace(item.Path))
        {
            return NormalizeWindowsPath(item.Path);
        }

        if (!string.IsNullOrWhiteSpace(item.Content))
        {
            return Truncate(item.Content.ReplaceLineEndings(" "), 120);
        }

        if (!string.IsNullOrWhiteSpace(item.Url))
        {
            return item.Url;
        }

        return "暂无描述";
    }

    private static string NormalizeWindowsPath(string value)
    {
        var path = value.Trim();
        return path.StartsWith(@"\\?\", StringComparison.Ordinal) ? path[4..] : path;
    }

    private static string FirstNonEmpty(params string[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))?.Trim() ?? "";

    private static string Truncate(string value, int maxLength)
    {
        if (value.Length <= maxLength)
        {
            return value;
        }

        return value[..Math.Max(0, maxLength - 1)] + "…";
    }

    private static string GetTypeLabel(string type) => type switch
    {
        "image" => "图片",
        "video" => "视频",
        "file" => "文件",
        _ => "文本",
    };

    private static string GetIconGlyph(string type) => type switch
    {
        "image" => "\uEB9F",
        "video" => "\uE714",
        "file" => "\uE8A5",
        _ => "\uE8D2",
    };

    private static string FormatCreatedAt(long createdAt)
    {
        if (createdAt <= 0)
        {
            return "";
        }

        try
        {
            return DateTimeOffset
                .FromUnixTimeMilliseconds(createdAt)
                .LocalDateTime
                .ToString("MM-dd HH:mm");
        }
        catch
        {
            return "";
        }
    }

    private void FolderList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (FolderList.SelectedItem is FolderSummary selected)
        {
            ApplyFolder(selected.Id);
        }
    }

    private void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        _ = LoadDataAsync();
    }
}
