using System.Collections.ObjectModel;
using System.Diagnostics;
using InspirationDrawer.Native.Models;
using InspirationDrawer.Native.Services;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
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
    private string currentFolderId = AllFolderId;
    private string currentTypeFilter = "all";
    private string currentSearch = "";

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
            currentFolderId = AllFolderId;
            ApplyFilters();

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

    private void ApplyFilters()
    {
        var filtered = items.Where(MatchesFolder).Where(MatchesType).Where(MatchesSearch).ToList();

        visibleCards.Clear();
        foreach (var item in filtered.Select(ToCard))
        {
            visibleCards.Add(item);
        }

        var selectedFolder = folders.FirstOrDefault(folder => folder.Id == currentFolderId);
        var typeLabel = currentTypeFilter == "all" ? "全部类型" : GetTypeLabel(currentTypeFilter);
        ContentTitle.Text = selectedFolder?.Name ?? "全部素材";
        ContentSubtitle.Text = visibleCards.Count > 0
            ? $"当前显示 {visibleCards.Count} 个素材，筛选：{typeLabel}"
            : "没有符合当前筛选的素材。";
    }

    private bool MatchesFolder(DrawerItem item) => currentFolderId switch
    {
        AllFolderId => true,
        UnfiledFolderId => string.IsNullOrWhiteSpace(item.FolderId),
        _ => item.FolderId == currentFolderId,
    };

    private bool MatchesType(DrawerItem item) =>
        currentTypeFilter is "all" || item.Type == currentTypeFilter;

    private bool MatchesSearch(DrawerItem item)
    {
        if (string.IsNullOrWhiteSpace(currentSearch))
        {
            return true;
        }

        var haystack = string.Join(
            " ",
            item.Name,
            item.Content,
            item.Path,
            item.Url,
            item.FolderId,
            folderNames.TryGetValue(item.FolderId, out var folderName) ? folderName : "");

        return haystack.Contains(currentSearch, StringComparison.OrdinalIgnoreCase);
    }

    private DrawerCard ToCard(DrawerItem item)
    {
        var normalizedPath = NormalizeWindowsPath(item.Path);
        var name = FirstNonEmpty(item.Name, item.Content, normalizedPath, "未命名素材");
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
            SearchText = string.Join(" ", item.Name, item.Content, normalizedPath, folderName),
            FolderName = folderName,
            CreatedLabel = FormatCreatedAt(item.CreatedAt),
            Path = File.Exists(normalizedPath) ? normalizedPath : "",
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
        var normalizedPath = NormalizeWindowsPath(item.Path);
        if (!string.IsNullOrWhiteSpace(normalizedPath))
        {
            return normalizedPath;
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
        "text" => "文本",
        _ => "全部类型",
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

    private static void OpenPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = path,
            UseShellExecute = true,
        });
    }

    private static void RevealPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = "explorer.exe",
            Arguments = $"/select,\"{path}\"",
            UseShellExecute = true,
        });
    }

    private static DrawerCard? GetCardFromSender(object sender) =>
        sender is FrameworkElement element ? element.DataContext as DrawerCard : null;

    private void FolderList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (FolderList.SelectedItem is FolderSummary selected)
        {
            currentFolderId = selected.Id;
            ApplyFilters();
        }
    }

    private void SearchBox_TextChanged(AutoSuggestBox sender, AutoSuggestBoxTextChangedEventArgs args)
    {
        currentSearch = sender.Text.Trim();
        ApplyFilters();
    }

    private void RootNavigation_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (args.SelectedItem is not NavigationViewItem item || item.Tag is not string tag)
        {
            return;
        }

        if (tag is "canvas" or "ai" or "notes")
        {
            StatusText.Text = $"{item.Content} 正在迁移中，当前先保留入口。";
            return;
        }

        currentTypeFilter = tag;
        ApplyFilters();
    }

    private void OpenCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        if (card is null)
        {
            return;
        }

        OpenPath(card.Path);
        StatusText.Text = $"已打开：{card.Name}";
    }

    private void RevealCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        if (card is null)
        {
            return;
        }

        RevealPath(card.Path);
        StatusText.Text = $"已定位：{card.Name}";
    }

    private void Card_DoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        if (card?.CanOpen is true)
        {
            OpenPath(card.Path);
            StatusText.Text = $"已打开：{card.Name}";
        }
    }

    private void CanvasButton_Click(object sender, RoutedEventArgs e)
    {
        StatusText.Text = "无限画布正在迁移中，下一阶段会接入原生拖拽、缩放和节点布局。";
    }

    private void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        _ = LoadDataAsync();
    }
}
