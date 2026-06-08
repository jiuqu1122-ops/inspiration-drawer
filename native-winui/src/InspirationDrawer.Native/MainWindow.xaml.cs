using System.Collections.ObjectModel;
using System.Diagnostics;
using InspirationDrawer.Native.Models;
using InspirationDrawer.Native.Services;
using Microsoft.UI;
using Microsoft.UI.Input;
using Microsoft.UI.Windowing;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Media.Imaging;
using Windows.ApplicationModel.DataTransfer;
using Windows.Foundation;
using Windows.Media.Core;
using Windows.Storage;
using Windows.Storage.Pickers;
using Windows.Storage.Streams;
using Windows.System;
using Windows.Graphics;
using Windows.UI.Core;
using WinRT.Interop;

namespace InspirationDrawer.Native;

public sealed partial class MainWindow : Window
{
    private const string AllFolderId = "__all";
    private const string UnfiledFolderId = "__unfiled";

    private readonly DrawerDataStore dataStore = new();
    private readonly ObservableCollection<FolderSummary> folders = [];
    private readonly ObservableCollection<FolderSummary> railFolders = [];
    private readonly ObservableCollection<DrawerCard> visibleCards = [];
    private readonly ObservableCollection<DrawerCard> quickAccessCards = [];
    private readonly ObservableCollection<DrawerCard> noteCards = [];
    private readonly Dictionary<string, string> folderNames = [];
    private List<DrawerFolder> sourceFolders = [];
    private List<DrawerItem> items = [];
    private readonly HashSet<string> selectedIds = [];
    private string currentFolderId = AllFolderId;
    private string currentTypeFilter = "all";
    private string currentSearch = "";
    private bool isSelectMode;
    private string quickRailMode = "quick";
    private FrameworkElement? draggingCanvasElement;
    private DrawerCard? activePreviewCard;
    private uint draggingCanvasPointerId;
    private Point draggingCanvasStartPoint;
    private double draggingCanvasStartLeft;
    private double draggingCanvasStartTop;
    private bool didDragCanvasElement;

    public MainWindow()
    {
        InitializeComponent();
        Title = "灵感抽屉 Native";
        ExtendsContentIntoTitleBar = true;
        SetInitialWindowSize();
        FolderList.ItemsSource = railFolders;
        ItemRepeater.ItemsSource = visibleCards;
        QuickAccessRepeater.ItemsSource = quickAccessCards;
        NoteRepeater.ItemsSource = noteCards;
        RailNoteRepeater.ItemsSource = noteCards;
        _ = LoadDataAsync();
    }

    private void SetInitialWindowSize()
    {
        try
        {
            var windowId = Win32Interop.GetWindowIdFromWindow(WindowNative.GetWindowHandle(this));
            var appWindow = AppWindow.GetFromWindowId(windowId);
            var displayArea = DisplayArea.GetFromWindowId(windowId, DisplayAreaFallback.Primary);
            var workArea = displayArea.WorkArea;
            var width = Math.Min(780, Math.Max(640, workArea.Width - 80));
            var height = Math.Min(1120, Math.Max(680, workArea.Height - 80));
            appWindow.Resize(new SizeInt32(width, height));
            appWindow.Move(new PointInt32(
                workArea.X + workArea.Width - width - 24,
                workArea.Y + Math.Max(24, (workArea.Height - height) / 2)));
            if (appWindow.Presenter is OverlappedPresenter presenter)
            {
                presenter.SetBorderAndTitleBar(false, false);
            }
            if (AppWindowTitleBar.IsCustomizationSupported())
            {
                var titleBar = appWindow.TitleBar;
                titleBar.BackgroundColor = Windows.UI.Color.FromArgb(255, 246, 245, 242);
                titleBar.InactiveBackgroundColor = Windows.UI.Color.FromArgb(255, 246, 245, 242);
                titleBar.ButtonBackgroundColor = Windows.UI.Color.FromArgb(0, 246, 245, 242);
                titleBar.ButtonInactiveBackgroundColor = Windows.UI.Color.FromArgb(0, 246, 245, 242);
                titleBar.ForegroundColor = Windows.UI.Color.FromArgb(255, 87, 83, 78);
                titleBar.InactiveForegroundColor = Windows.UI.Color.FromArgb(255, 120, 113, 108);
            }
        }
        catch
        {
            // Window sizing is best-effort; preview should still run if the app host rejects it.
        }
    }

    private async Task LoadDataAsync()
    {
        try
        {
            StatusText.Text = "正在读取旧版抽屉数据...";

            var snapshot = await dataStore.LoadAsync();
            sourceFolders = snapshot.Folders.ToList();
            items = snapshot.Items
                .OrderByDescending(item => item.CreatedAt)
                .ToList();

            RebuildFolderNameCache();

            RebuildFolders();
            currentFolderId = AllFolderId;
            selectedIds.Clear();
            isSelectMode = false;
            SelectCurrentFolder();
            ApplyFilters();
            RebuildCanvas();
            SettingsDataPathText.Text = $"旧版数据目录：{snapshot.DataDirectory}";

            StatusText.Text = $"已读取 {items.Count} 个素材，来自 {snapshot.DataDirectory}";
        }
        catch (Exception ex)
        {
            StatusText.Text = $"读取失败：{ex.Message}";
            folders.Clear();
            visibleCards.Clear();
        }
    }

    private void RebuildFolders()
    {
        RebuildFolderNameCache();
        folders.Clear();
        railFolders.Clear();
        folders.Add(new FolderSummary(AllFolderId, "主抽屉", "#e7e5e4", items.Count, currentFolderId == AllFolderId));

        foreach (var folder in sourceFolders)
        {
            var count = items.Count(item => (item.FolderId ?? "") == folder.Id);
            var summary = new FolderSummary(folder.Id, folder.Name, folder.Color, count, currentFolderId == folder.Id);
            folders.Add(summary);
            railFolders.Add(summary);
        }

        var unfiledCount = items.Count(item => string.IsNullOrWhiteSpace(item.FolderId));
        if (unfiledCount > 0)
        {
            var unfiled = new FolderSummary(UnfiledFolderId, "未分类", "#64748b", unfiledCount, currentFolderId == UnfiledFolderId);
            folders.Add(unfiled);
            railFolders.Add(unfiled);
        }
    }

    private void RebuildFolderNameCache()
    {
        folderNames.Clear();
        foreach (var folder in sourceFolders)
        {
            folderNames[folder.Id] = folder.Name;
        }
    }

    private void SelectCurrentFolder()
    {
        if (currentFolderId == AllFolderId)
        {
            UpdateMainDrawerVisual();
            return;
        }
        UpdateMainDrawerVisual();
    }

    private void ApplyFilters()
    {
        var filtered = items.Where(MatchesFolder).Where(MatchesType).Where(MatchesSearch).ToList();

        visibleCards.Clear();
        foreach (var item in filtered.Select(ToCard))
        {
            visibleCards.Add(item);
        }

        RebuildQuickAccessCards();
        RebuildNoteCards();

        var selectedFolder = folders.FirstOrDefault(folder => folder.Id == currentFolderId);
        var typeLabel = currentTypeFilter == "all" ? "全部类型" : GetTypeLabel(currentTypeFilter);
        MainDrawerCountText.Text = items.Count.ToString();
        ContentTitle.Text = currentTypeFilter == "notes"
            ? "桌面便签"
            : currentTypeFilter == "ai"
                ? "AI 炼金"
                : currentFolderId == AllFolderId ? "灵感抽屉" : selectedFolder?.Name ?? "灵感抽屉";
        var selectionLabel = selectedIds.Count > 0 ? $"，已选 {selectedIds.Count} 个" : "";
        ContentSubtitle.Text = visibleCards.Count > 0
            ? isSelectMode
                ? $"当前显示 {visibleCards.Count} 个素材，筛选：{typeLabel}{selectionLabel}"
                : $"当前显示 {visibleCards.Count} 个素材，筛选：{typeLabel}"
            : "没有符合当前筛选的素材。你可以把文件拖到窗口里添加。";

        ToolTipService.SetToolTip(SelectModeButton, isSelectMode ? "退出多选" : "多选");
        SelectModeButton.Background = isSelectMode
            ? new SolidColorBrush(Windows.UI.Color.FromArgb(255, 16, 185, 129))
            : new SolidColorBrush(Windows.UI.Color.FromArgb(166, 255, 255, 255));
        SelectAllButton.IsEnabled = visibleCards.Count > 0;
        MoveSelectedButton.IsEnabled = selectedIds.Count > 0;
        DeleteSelectedButton.IsEnabled = selectedIds.Count > 0;
        ClearSelectionButton.IsEnabled = selectedIds.Count > 0;
        CardsScrollViewer.Visibility = currentTypeFilter == "notes" ? Visibility.Collapsed : Visibility.Visible;
        NotesView.Visibility = currentTypeFilter == "notes" ? Visibility.Visible : Visibility.Collapsed;
        UpdateQuickRailMode();
        UpdateMainDrawerVisual();
        UpdateTabButtons();
    }

    private void UpdateMainDrawerVisual()
    {
        var active = currentFolderId == AllFolderId;
        MainDrawerButton.Background = active
            ? new SolidColorBrush(Windows.UI.Color.FromArgb(255, 41, 37, 36))
            : new SolidColorBrush(Windows.UI.Color.FromArgb(166, 255, 255, 255));
        MainDrawerButton.Foreground = active
            ? new SolidColorBrush(Windows.UI.Color.FromArgb(255, 255, 255, 255))
            : new SolidColorBrush(Windows.UI.Color.FromArgb(255, 87, 83, 78));
    }

    private void RebuildQuickAccessCards()
    {
        quickAccessCards.Clear();
        foreach (var card in items
            .Where(item => item.IsQuickAccess is true)
            .OrderByDescending(item => item.CreatedAt)
            .Take(12)
            .Select(ToCard))
        {
            quickAccessCards.Add(card);
        }
    }

    private void RebuildNoteCards()
    {
        noteCards.Clear();
        foreach (var card in items
            .Where(IsNoteItem)
            .OrderByDescending(item => item.CreatedAt)
            .Select(ToCard))
        {
            noteCards.Add(card);
        }
    }

    private void UpdateQuickRailMode()
    {
        var notesActive = quickRailMode == "notes";
        QuickAccessRailScrollViewer.Visibility = notesActive ? Visibility.Collapsed : Visibility.Visible;
        NoteRailScrollViewer.Visibility = notesActive ? Visibility.Visible : Visibility.Collapsed;

        QuickRailButton.Background = notesActive
            ? new SolidColorBrush(Windows.UI.Color.FromArgb(0, 255, 255, 255))
            : new SolidColorBrush(Windows.UI.Color.FromArgb(255, 236, 253, 245));
        QuickRailButton.Foreground = notesActive
            ? new SolidColorBrush(Windows.UI.Color.FromArgb(255, 120, 113, 108))
            : new SolidColorBrush(Windows.UI.Color.FromArgb(255, 16, 185, 129));

        NoteRailButton.Background = notesActive
            ? new SolidColorBrush(Windows.UI.Color.FromArgb(255, 255, 247, 237))
            : new SolidColorBrush(Windows.UI.Color.FromArgb(0, 255, 255, 255));
        NoteRailButton.Foreground = notesActive
            ? new SolidColorBrush(Windows.UI.Color.FromArgb(255, 245, 158, 11))
            : new SolidColorBrush(Windows.UI.Color.FromArgb(255, 120, 113, 108));
    }

    private void UpdateTabButtons()
    {
        var entries = new (Button Button, string Tag)[]
        {
            (TabAllButton, "all"),
            (TabImageButton, "image"),
            (TabTextButton, "text"),
            (TabVideoButton, "video"),
            (TabFileButton, "file"),
            (TabAlchemyButton, "ai"),
            (TabNotesButton, "notes"),
        };

        foreach (var (button, tag) in entries)
        {
            var active = currentTypeFilter == tag ||
                (currentTypeFilter == "all" && tag == "all");
            button.Background = active
                ? new SolidColorBrush(Windows.UI.Color.FromArgb(255, 41, 37, 36))
                : new SolidColorBrush(Windows.UI.Color.FromArgb(0, 255, 255, 255));
            button.Foreground = active
                ? new SolidColorBrush(Windows.UI.Color.FromArgb(255, 255, 255, 255))
                : new SolidColorBrush(Windows.UI.Color.FromArgb(255, 120, 113, 108));
        }
    }

    private bool MatchesFolder(DrawerItem item) => currentFolderId switch
    {
        AllFolderId => true,
        UnfiledFolderId => string.IsNullOrWhiteSpace(item.FolderId),
        _ => (item.FolderId ?? "") == currentFolderId,
    };

    private bool MatchesType(DrawerItem item) =>
        currentTypeFilter switch
        {
            "all" => true,
            "notes" => IsNoteItem(item),
            "ai" => item.Alchemy is not null,
            _ => item.Type == currentTypeFilter,
        };

    private static bool IsNoteItem(DrawerItem item)
    {
        if (item.IsFloatingNote is true ||
            item.Id.StartsWith("blank_note_", StringComparison.OrdinalIgnoreCase) ||
            item.Id.StartsWith("note_", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        if (!string.IsNullOrWhiteSpace(item.Remark) &&
            item.Remark.Contains("便签", StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        return item.Remarks?.Any(remark => remark.Contains("便签", StringComparison.OrdinalIgnoreCase)) is true;
    }

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
            item.SourceUrl,
            item.PageUrl,
            item.OriginalUrl,
            item.Remark,
            item.Remarks is null ? "" : string.Join(" ", item.Remarks),
            item.FolderId,
            folderNames.TryGetValue(item.FolderId ?? "", out var folderName) ? folderName : "");

        return haystack.Contains(currentSearch, StringComparison.OrdinalIgnoreCase);
    }

    private DrawerCard ToCard(DrawerItem item)
    {
        var normalizedPath = NormalizeWindowsPath(item.Path);
        var name = FirstNonEmpty(item.Name, item.Content, normalizedPath, item.Url, "未命名素材");
        var folderName = !string.IsNullOrWhiteSpace(item.FolderId) && folderNames.TryGetValue(item.FolderId ?? "", out var knownFolder)
            ? knownFolder
            : "未分类";
        var pathExists = File.Exists(normalizedPath) || Directory.Exists(normalizedPath);
        var fallbackUrl = FirstNonEmpty(item.Url, item.SourceUrl ?? "", item.PageUrl ?? "", item.OriginalUrl ?? "");

        return new DrawerCard
        {
            Id = item.Id,
            Type = item.Type,
            TypeLabel = GetTypeLabel(item.Type),
            Name = Truncate(name, 80),
            Description = BuildDescription(item),
            SearchText = string.Join(" ", item.Name, item.Content, normalizedPath, folderName),
            FolderName = folderName,
            RemarkSummary = BuildRemarkSummary(item),
            CreatedLabel = FormatCreatedAt(item.CreatedAt),
            OpenTarget = pathExists ? normalizedPath : fallbackUrl,
            RevealTarget = pathExists ? normalizedPath : "",
            IconGlyph = GetIconGlyph(item.Type, item.IsDirectory is true),
            Image = BuildImage(item),
            IsSelected = selectedIds.Contains(item.Id),
            IsQuickAccess = item.IsQuickAccess is true,
        };
    }

    private static string BuildRemarkSummary(DrawerItem item)
    {
        var remarks = item.Remarks?.Where(remark => !string.IsNullOrWhiteSpace(remark)).ToList() ?? [];
        if (!string.IsNullOrWhiteSpace(item.Remark))
        {
            remarks.Insert(0, item.Remark);
        }

        return remarks.Count == 0 ? "" : "#" + string.Join("  #", remarks.Take(3));
    }

    private static BitmapImage? BuildImage(DrawerItem item)
    {
        var sources = item.Type is "image" or "video"
            ? new[] { item.Thumbnail, item.Cover, item.Url, item.Path }
            : new[] { item.Thumbnail };

        foreach (var source in sources)
        {
            var image = BuildImageFromSource(source);
            if (image is not null)
            {
                return image;
            }
        }

        return null;
    }

    private static BitmapImage? BuildImageFromSource(string? source)
    {
        if (string.IsNullOrWhiteSpace(source))
        {
            return null;
        }

        if (source.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase))
        {
            return BuildImageFromDataUri(source);
        }

        var path = NormalizeWindowsPath(source);
        if (File.Exists(path))
        {
            try
            {
                return new BitmapImage(new Uri(path));
            }
            catch
            {
                return null;
            }
        }

        if (Uri.TryCreate(source, UriKind.Absolute, out var uri) &&
            uri.Scheme is "http" or "https" or "file")
        {
            try
            {
                return new BitmapImage(uri);
            }
            catch
            {
                return null;
            }
        }

        return null;
    }

    private static BitmapImage? BuildImageFromDataUri(string source)
    {
        var commaIndex = source.IndexOf(',');
        if (commaIndex < 0 || !source[..commaIndex].Contains(";base64", StringComparison.OrdinalIgnoreCase))
        {
            return null;
        }

        try
        {
            var bytes = Convert.FromBase64String(source[(commaIndex + 1)..]);
            var stream = new InMemoryRandomAccessStream();
            using (var writer = new DataWriter(stream.GetOutputStreamAt(0)))
            {
                writer.WriteBytes(bytes);
                writer.StoreAsync().AsTask().GetAwaiter().GetResult();
                writer.DetachStream();
            }

            stream.Seek(0);
            var image = new BitmapImage();
            image.SetSource(stream);
            return image;
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

        var url = FirstNonEmpty(item.Url, item.SourceUrl ?? "", item.PageUrl ?? "", item.OriginalUrl ?? "");
        return !string.IsNullOrWhiteSpace(url) ? url : "暂无描述";
    }

    private static string NormalizeWindowsPath(string? value)
    {
        var path = value?.Trim() ?? "";
        return path.StartsWith(@"\\?\", StringComparison.Ordinal) ? path[4..] : path;
    }

    private static string FirstNonEmpty(params string?[] values) =>
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
        "notes" => "桌面便签",
        "ai" => "炼金",
        _ => "全部类型",
    };

    private static string GetIconGlyph(string type, bool isDirectory = false) => (type, isDirectory) switch
    {
        (_, true) => "\uE8B7",
        ("image", _) => "\uEB9F",
        ("video", _) => "\uE714",
        ("file", _) => "\uE8A5",
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

    private static void OpenTarget(string target)
    {
        if (string.IsNullOrWhiteSpace(target))
        {
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName = target,
            UseShellExecute = true,
        });
    }

    private static void RevealPath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return;
        }

        var target = Directory.Exists(path) ? $"\"{path}\"" : $"/select,\"{path}\"";
        Process.Start(new ProcessStartInfo
        {
            FileName = "explorer.exe",
            Arguments = target,
            UseShellExecute = true,
        });
    }

    private static DrawerCard? GetCardFromSender(object sender) =>
        sender is FrameworkElement element ? element.DataContext as DrawerCard : null;

    private void FolderList_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is FolderSummary selected)
        {
            currentFolderId = selected.Id;
            RebuildFolders();
            ApplyFilters();
            RebuildCanvas();
        }
    }

    private void MainDrawerButton_Click(object sender, RoutedEventArgs e)
    {
        currentFolderId = AllFolderId;
        RebuildFolders();
        SelectCurrentFolder();
        ApplyFilters();
        RebuildCanvas();
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

        if (tag is "canvas")
        {
            ShowCanvasView();
            return;
        }

        ShowDrawerView();

        currentTypeFilter = tag;
        ApplyFilters();
    }

    private void RailButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement element || element.Tag is not string tag)
        {
            return;
        }

        if (tag is "canvas")
        {
            ShowCanvasView();
            return;
        }

        ShowDrawerView();

        if (tag is "ai")
        {
            SettingsPanel.Visibility = Visibility.Visible;
            StatusText.Text = "AI 炼金入口已接到原生设置面板，接口迁移会继续补全。";
        }

        currentTypeFilter = tag;
        ApplyFilters();
    }

    private static string GetRailLabel(string tag) => tag switch
    {
        "ai" => "AI 生图",
        "notes" => "桌面便签",
        "canvas" => "无限画布",
        "image" => "图片",
        "text" => "文本",
        "file" => "文件",
        "video" => "视频",
        _ => "全部",
    };

    private void OpenCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        if (card is null)
        {
            return;
        }

        OpenTarget(card.OpenTarget);
        StatusText.Text = $"已打开：{card.Name}";
    }

    private void RevealCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        if (card is null)
        {
            return;
        }

        RevealPath(card.RevealTarget);
        StatusText.Text = $"已定位：{card.Name}";
    }

    private void Card_DoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        if (isSelectMode && card is not null)
        {
            ToggleSelection(card.Id);
            return;
        }

        if (card?.CanPreview is true)
        {
            ShowPreview(card);
            return;
        }

        if (card?.CanOpen is true)
        {
            OpenTarget(card.OpenTarget);
            StatusText.Text = $"已打开：{card.Name}";
        }
    }

    private void SelectModeButton_Click(object sender, RoutedEventArgs e)
    {
        isSelectMode = !isSelectMode;
        if (!isSelectMode)
        {
            selectedIds.Clear();
        }

        ApplyFilters();
    }

    private void SelectAllButton_Click(object sender, RoutedEventArgs e)
    {
        isSelectMode = true;
        foreach (var card in visibleCards)
        {
            selectedIds.Add(card.Id);
        }

        ApplyFilters();
    }

    private void ClearSelectionButton_Click(object sender, RoutedEventArgs e)
    {
        selectedIds.Clear();
        ApplyFilters();
    }

    private async void MoveSelectedButton_Click(object sender, RoutedEventArgs e)
    {
        if (selectedIds.Count == 0)
        {
            return;
        }

        var folderId = await PickFolderIdAsync("移动选中素材", "移动");
        if (folderId is null)
        {
            return;
        }

        var count = 0;
        foreach (var item in items.Where(item => selectedIds.Contains(item.Id)))
        {
            item.FolderId = folderId;
            count++;
        }

        selectedIds.Clear();
        isSelectMode = false;
        await PersistItemsAsync($"已移动 {count} 个素材");
    }

    private async void DeleteSelectedButton_Click(object sender, RoutedEventArgs e)
    {
        if (selectedIds.Count == 0)
        {
            return;
        }

        var count = items.Count(item => selectedIds.Contains(item.Id));
        var dialog = new ContentDialog
        {
            XamlRoot = RootDropSurface.XamlRoot,
            Title = "批量删除",
            Content = $"从抽屉移除选中的 {count} 个素材？不会删除磁盘上的原文件。",
            PrimaryButtonText = "删除",
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Close,
        };

        if (await dialog.ShowAsync() is not ContentDialogResult.Primary)
        {
            return;
        }

        items.RemoveAll(item => selectedIds.Contains(item.Id));
        selectedIds.Clear();
        isSelectMode = false;
        await PersistItemsAsync($"已删除 {count} 个素材");
    }

    private void ToggleCardSelection_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        if (card is null)
        {
            return;
        }

        isSelectMode = true;
        ToggleSelection(card.Id);
    }

    private async void TogglePinCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        var item = card is null ? null : items.FirstOrDefault(candidate => candidate.Id == card.Id);
        if (card is null || item is null)
        {
            return;
        }

        item.IsQuickAccess = item.IsQuickAccess is not true;
        await PersistItemsAsync(item.IsQuickAccess is true ? $"已星标：{card.Name}" : $"已取消星标：{card.Name}");
    }

    private void PreviewCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        if (card?.CanPreview is true)
        {
            ShowPreview(card);
        }
    }

    private async void CreateNoteCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        var item = FindItem(card);
        if (card is null || item is null)
        {
            return;
        }

        var note = CloneItemAsNote(item);
        items.Insert(0, note);
        currentTypeFilter = "notes";
        await PersistItemsAsync($"已固定为便签：{card.Name}");
    }

    private async void CopyCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        var item = FindItem(card);
        if (card is null || item is null)
        {
            return;
        }

        CopyItemToClipboard(item, card);
        StatusText.Text = $"已复制：{card.Name}";
        await Task.CompletedTask;
    }

    private async void EditRemarkCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        var item = FindItem(card);
        if (card is null || item is null)
        {
            return;
        }

        var remark = await PromptForTextAsync("编辑备注", "备注 / 标签", "保存", item.Remark ?? "");
        if (remark is null)
        {
            return;
        }

        item.Remark = string.IsNullOrWhiteSpace(remark) ? null : remark.Trim();
        await PersistItemsAsync(string.IsNullOrWhiteSpace(item.Remark) ? $"已清空备注：{card.Name}" : $"已更新备注：{card.Name}");
    }

    private DrawerItem? FindItem(DrawerCard? card) =>
        card is null ? null : items.FirstOrDefault(candidate => candidate.Id == card.Id);

    private static void CopyItemToClipboard(DrawerItem item, DrawerCard card)
    {
        var text = item.Type == "text"
            ? item.Content
            : FirstNonEmpty(item.Path, item.Url, item.SourceUrl, item.PageUrl, item.OriginalUrl, card.Name);
        var package = new DataPackage();
        package.SetText(text);
        Clipboard.SetContent(package);
        Clipboard.Flush();
    }

    private static MediaSource? BuildMediaSource(string target)
    {
        if (string.IsNullOrWhiteSpace(target))
        {
            return null;
        }

        try
        {
            var normalized = NormalizeWindowsPath(target);
            var uri = File.Exists(normalized)
                ? new Uri(normalized)
                : Uri.TryCreate(target, UriKind.Absolute, out var absoluteUri)
                    ? absoluteUri
                    : null;

            return uri is null ? null : MediaSource.CreateFromUri(uri);
        }
        catch
        {
            return null;
        }
    }

    private static DrawerItem CloneItemAsNote(DrawerItem item)
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var noteName = FirstNonEmpty(item.Name, item.Content, item.Path, item.Url, "新便签");
        return new DrawerItem
        {
            Id = $"note_{now}_{Guid.NewGuid().ToString("N")[..8]}",
            Type = item.Type,
            Content = item.Content,
            Name = noteName,
            Path = item.Path,
            Url = item.Url,
            Thumbnail = item.Thumbnail,
            Cover = item.Cover,
            CreatedAt = now,
            IsQuickAccess = false,
            IsFloatingNote = true,
            Remark = FirstNonEmpty(item.Remark, "桌面便签"),
            Remarks = MergeRemarks(item.Remarks, "桌面便签"),
            FolderId = item.FolderId,
            IsDirectory = item.IsDirectory,
            IsUrl = item.IsUrl,
            SourceUrl = item.SourceUrl,
            PageUrl = item.PageUrl,
            OriginalUrl = item.OriginalUrl,
            Alchemy = item.Alchemy,
        };
    }

    private static IReadOnlyList<string> MergeRemarks(IReadOnlyList<string>? remarks, string remark)
    {
        var next = remarks?
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList() ?? [];

        if (!next.Contains(remark, StringComparer.OrdinalIgnoreCase))
        {
            next.Insert(0, remark);
        }

        return next;
    }

    private void ShowPreview(DrawerCard card)
    {
        activePreviewCard = card;
        PreviewTitleText.Text = card.Name;
        PreviewMetaText.Text = $"{card.FolderName} · {card.Description}";

        PreviewVideoPlayer.Source = null;
        PreviewImageHost.Visibility = Visibility.Collapsed;
        PreviewVideoHost.Visibility = Visibility.Collapsed;

        if (card.Type == "video")
        {
            var source = BuildMediaSource(card.OpenTarget);
            if (source is not null)
            {
                PreviewVideoPlayer.Source = source;
                PreviewVideoHost.Visibility = Visibility.Visible;
            }
            else
            {
                PreviewImage.Source = card.Image;
                PreviewImageHost.Visibility = Visibility.Visible;
            }
        }
        else
        {
            PreviewImage.Source = card.Image;
            PreviewImageHost.Visibility = Visibility.Visible;
        }

        PreviewOverlay.Visibility = Visibility.Visible;
    }

    private void ClosePreviewButton_Click(object sender, RoutedEventArgs e)
    {
        PreviewOverlay.Visibility = Visibility.Collapsed;
        PreviewImage.Source = null;
        PreviewVideoPlayer.Source = null;
        activePreviewCard = null;
    }

    private void OpenPreviewButton_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(activePreviewCard?.OpenTarget))
        {
            OpenTarget(activePreviewCard.OpenTarget);
        }
    }

    private void RevealPreviewButton_Click(object sender, RoutedEventArgs e)
    {
        if (!string.IsNullOrWhiteSpace(activePreviewCard?.RevealTarget))
        {
            RevealPath(activePreviewCard.RevealTarget);
        }
    }

    private void CopyPreviewButton_Click(object sender, RoutedEventArgs e)
    {
        var item = FindItem(activePreviewCard);
        if (item is null || activePreviewCard is null)
        {
            return;
        }

        CopyItemToClipboard(item, activePreviewCard);
        StatusText.Text = $"已复制：{activePreviewCard.Name}";
    }

    private void OpenQuickCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        if (card is null)
        {
            return;
        }

        if (!string.IsNullOrWhiteSpace(card.OpenTarget))
        {
            OpenTarget(card.OpenTarget);
            StatusText.Text = $"已打开快速访问：{card.Name}";
            return;
        }

        currentSearch = card.Name;
        SearchBox.Text = card.Name;
        currentTypeFilter = "all";
        currentFolderId = AllFolderId;
        SelectCurrentFolder();
        ApplyFilters();
        StatusText.Text = $"已定位快速访问：{card.Name}";
    }

    private void QuickRailModeButton_Click(object sender, RoutedEventArgs e)
    {
        if (sender is FrameworkElement element && element.Tag is string mode)
        {
            quickRailMode = mode == "notes" ? "notes" : "quick";
            if (quickRailMode == "notes")
            {
                RebuildNoteCards();
            }

            UpdateQuickRailMode();
        }
    }

    private void OpenNoteCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        if (card is null)
        {
            return;
        }

        if (card.CanPreview)
        {
            ShowPreview(card);
            return;
        }

        if (card.CanOpen)
        {
            OpenTarget(card.OpenTarget);
            StatusText.Text = $"已打开便签来源：{card.Name}";
            return;
        }

        currentTypeFilter = "notes";
        currentSearch = card.Name;
        SearchBox.Text = card.Name;
        ShowDrawerView();
        ApplyFilters();
        StatusText.Text = $"已定位便签：{card.Name}";
    }

    private async void UnpinQuickCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        var item = card is null ? null : items.FirstOrDefault(candidate => candidate.Id == card.Id);
        if (card is null || item is null)
        {
            return;
        }

        item.IsQuickAccess = false;
        await PersistItemsAsync($"已取消星标：{card.Name}");
    }

    private async void EditCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        var item = card is null ? null : items.FirstOrDefault(candidate => candidate.Id == card.Id);
        if (card is null || item is null || item.Type != "text")
        {
            return;
        }

        var textBox = new TextBox
        {
            AcceptsReturn = true,
            Height = 220,
            TextWrapping = TextWrapping.Wrap,
            Text = item.Content,
        };

        var dialog = new ContentDialog
        {
            XamlRoot = RootDropSurface.XamlRoot,
            Title = "编辑文本素材",
            Content = textBox,
            PrimaryButtonText = "保存",
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Primary,
        };

        if (await dialog.ShowAsync() is not ContentDialogResult.Primary)
        {
            return;
        }

        var content = textBox.Text.Trim();
        if (string.IsNullOrWhiteSpace(content))
        {
            StatusText.Text = "文本不能为空。";
            return;
        }

        item.Content = content;
        item.Name = Truncate(content.ReplaceLineEndings(" "), 32);
        await PersistItemsAsync($"已更新：{card.Name}");
    }

    private void ToggleSelection(string itemId)
    {
        if (!selectedIds.Add(itemId))
        {
            selectedIds.Remove(itemId);
        }

        ApplyFilters();
    }

    private void CanvasButton_Click(object sender, RoutedEventArgs e)
    {
        ShowCanvasView();
    }

    private void BackToDrawerButton_Click(object sender, RoutedEventArgs e)
    {
        ShowDrawerView();
    }

    private void RefreshCanvasButton_Click(object sender, RoutedEventArgs e)
    {
        RebuildCanvas();
    }

    private void FitCanvasButton_Click(object sender, RoutedEventArgs e)
    {
        FitCanvasToContent();
    }

    private void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        _ = LoadDataAsync();
    }

    private void OpenComputerButton_Click(object sender, RoutedEventArgs e)
    {
        OpenTarget("shell:MyComputerFolder");
    }

    private void OpenDesktopButton_Click(object sender, RoutedEventArgs e)
    {
        OpenTarget(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));
    }

    private void ToggleSettingsButton_Click(object sender, RoutedEventArgs e)
    {
        SettingsPanel.Visibility = SettingsPanel.Visibility == Visibility.Visible
            ? Visibility.Collapsed
            : Visibility.Visible;
    }

    private void OpenDataFolderButton_Click(object sender, RoutedEventArgs e)
    {
        OpenTarget(dataStore.DataDirectory);
    }

    private void ToggleSearchButton_Click(object sender, RoutedEventArgs e)
    {
        SearchBox.Visibility = SearchBox.Visibility == Visibility.Visible
            ? Visibility.Collapsed
            : Visibility.Visible;
        if (SearchBox.Visibility == Visibility.Visible)
        {
            SearchBox.Focus(FocusState.Programmatic);
        }
    }

    private async void NewNoteButton_Click(object sender, RoutedEventArgs e)
    {
        var content = await PromptForTextAsync("新增便签", "写一点灵感...", "新增");
        if (content is null)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var text = string.IsNullOrWhiteSpace(content) ? "新便签" : content.Trim();
        items.Insert(0, new DrawerItem
        {
            Id = $"blank_note_{now}_{Guid.NewGuid().ToString("N")[..8]}",
            Type = "text",
            Content = text,
            Name = Truncate(text.ReplaceLineEndings(" "), 32),
            CreatedAt = now,
            FolderId = GetFolderIdForNewItems(),
            IsFloatingNote = true,
            IsQuickAccess = false,
            Remark = "桌面便签",
            Remarks = ["桌面便签"],
        });

        currentTypeFilter = "notes";
        await PersistItemsAsync("已新增便签");
    }

    private async void DeleteAllNotesButton_Click(object sender, RoutedEventArgs e)
    {
        var notes = items.Where(IsNoteItem).ToList();
        if (notes.Count == 0)
        {
            StatusText.Text = "当前没有保存的便签。";
            return;
        }

        var dialog = new ContentDialog
        {
            XamlRoot = RootDropSurface.XamlRoot,
            Title = "删除全部便签",
            Content = $"删除当前保存的 {notes.Count} 个便签？不会删除未固定为便签的素材。",
            PrimaryButtonText = "删除",
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Close,
        };

        if (await dialog.ShowAsync() is not ContentDialogResult.Primary)
        {
            return;
        }

        items.RemoveAll(IsNoteItem);
        currentTypeFilter = "notes";
        await PersistItemsAsync($"已删除 {notes.Count} 个便签");
    }

    private async void AddFilesButton_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FileOpenPicker();
        InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(this));
        picker.SuggestedStartLocation = PickerLocationId.PicturesLibrary;
        picker.FileTypeFilter.Add("*");

        var pickedFiles = await picker.PickMultipleFilesAsync();
        var newItems = pickedFiles
            .Select(CreateItemFromStorageItem)
            .OfType<DrawerItem>()
            .ToList();

        if (newItems.Count > 0)
        {
            await AddItemsAsync(newItems);
        }
    }

    private async void AddFolderButton_Click(object sender, RoutedEventArgs e)
    {
        var picker = new FolderPicker();
        InitializeWithWindow.Initialize(picker, WindowNative.GetWindowHandle(this));
        picker.SuggestedStartLocation = PickerLocationId.Desktop;
        picker.FileTypeFilter.Add("*");

        var pickedFolder = await picker.PickSingleFolderAsync();
        if (pickedFolder is null)
        {
            return;
        }

        var item = CreateItemFromStorageItem(pickedFolder);
        if (item is not null)
        {
            await AddItemsAsync([item]);
        }
    }

    private async void AddTextButton_Click(object sender, RoutedEventArgs e)
    {
        var textBox = new TextBox
        {
            AcceptsReturn = true,
            Height = 160,
            TextWrapping = TextWrapping.Wrap,
            PlaceholderText = "写一点灵感...",
        };

        var dialog = new ContentDialog
        {
            XamlRoot = RootDropSurface.XamlRoot,
            Title = "添加文本",
            Content = textBox,
            PrimaryButtonText = "添加",
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Primary,
        };

        var result = await dialog.ShowAsync();
        var content = textBox.Text.Trim();
        if (result is not ContentDialogResult.Primary || string.IsNullOrWhiteSpace(content))
        {
            return;
        }

        await AddItemsAsync([new DrawerItem
        {
            Id = CreateItemId(),
            Type = "text",
            Content = content,
            Name = Truncate(content.ReplaceLineEndings(" "), 32),
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            FolderId = GetFolderIdForNewItems(),
            IsQuickAccess = false,
        }]);
    }

    private async void NewFolderButton_Click(object sender, RoutedEventArgs e)
    {
        var name = await PromptForTextAsync("新建分类", "分类名称", "新建");
        if (string.IsNullOrWhiteSpace(name))
        {
            return;
        }

        var folder = new DrawerFolder
        {
            Id = $"folder_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{Guid.NewGuid().ToString("N")[..6]}",
            Name = name.Trim(),
            Color = PickFolderColor(sourceFolders.Count),
        };

        sourceFolders.Add(folder);
        currentFolderId = folder.Id;
        await PersistFoldersAsync($"已新建分类：{folder.Name}");
    }

    private async void RenameFolderButton_Click(object sender, RoutedEventArgs e)
    {
        var folder = GetSelectedSourceFolder();
        if (folder is null)
        {
            StatusText.Text = "请选择一个自定义分类再重命名。";
            return;
        }

        var name = await PromptForTextAsync("重命名分类", "分类名称", "保存", folder.Name);
        if (string.IsNullOrWhiteSpace(name))
        {
            return;
        }

        folder.Name = name.Trim();
        await PersistFoldersAsync($"已重命名分类：{folder.Name}");
    }

    private async void DeleteFolderButton_Click(object sender, RoutedEventArgs e)
    {
        var folder = GetSelectedSourceFolder();
        if (folder is null)
        {
            StatusText.Text = "请选择一个自定义分类再删除。";
            return;
        }

        var count = items.Count(item => (item.FolderId ?? "") == folder.Id);
        var dialog = new ContentDialog
        {
            XamlRoot = RootDropSurface.XamlRoot,
            Title = "删除分类",
            Content = count > 0
                ? $"删除“{folder.Name}”后，里面的 {count} 个素材会移回未分类。"
                : $"删除“{folder.Name}”？",
            PrimaryButtonText = "删除",
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Close,
        };

        if (await dialog.ShowAsync() is not ContentDialogResult.Primary)
        {
            return;
        }

        sourceFolders.Remove(folder);
        foreach (var item in items.Where(item => (item.FolderId ?? "") == folder.Id))
        {
            item.FolderId = "";
        }

        currentFolderId = AllFolderId;
        await dataStore.SaveFoldersAsync(sourceFolders);
        await PersistItemsAsync($"已删除分类：{folder.Name}");
    }

    private void RootDropSurface_DragOver(object sender, DragEventArgs e)
    {
        if (!e.DataView.Contains(StandardDataFormats.StorageItems))
        {
            return;
        }

        e.AcceptedOperation = DataPackageOperation.Copy;
        e.DragUIOverride.Caption = "添加到灵感抽屉";
        e.DragUIOverride.IsCaptionVisible = true;
    }

    private async void RootDropSurface_Drop(object sender, DragEventArgs e)
    {
        if (!e.DataView.Contains(StandardDataFormats.StorageItems))
        {
            return;
        }

        try
        {
            var storageItems = await e.DataView.GetStorageItemsAsync();
            var newItems = storageItems
                .Select(CreateItemFromStorageItem)
                .OfType<DrawerItem>()
                .ToList();

            if (newItems.Count == 0)
            {
                return;
            }

            await AddItemsAsync(newItems);
        }
        catch (Exception ex)
        {
            StatusText.Text = $"拖入失败：{ex.Message}";
        }
    }

    private async Task AddItemsAsync(IReadOnlyList<DrawerItem> newItems)
    {
        items.AddRange(newItems);
        items = items
            .OrderByDescending(item => item.CreatedAt)
            .ToList();

        await dataStore.SaveItemsAsync(items);
        RebuildFolders();
        SelectCurrentFolder();
        ApplyFilters();
        RebuildCanvas();

        StatusText.Text = $"已添加 {newItems.Count} 个素材，并写回旧版数据文件";
    }

    private async Task PersistItemsAsync(string status)
    {
        items = items
            .OrderByDescending(item => item.CreatedAt)
            .ToList();

        await dataStore.SaveItemsAsync(items);
        RebuildFolders();
        SelectCurrentFolder();
        ApplyFilters();
        RebuildCanvas();
        StatusText.Text = status;
    }

    private async Task PersistFoldersAsync(string status)
    {
        await dataStore.SaveFoldersAsync(sourceFolders);
        RebuildFolders();
        SelectCurrentFolder();
        ApplyFilters();
        RebuildCanvas();
        StatusText.Text = status;
    }

    private DrawerItem? CreateItemFromStorageItem(IStorageItem storageItem)
    {
        var path = NormalizeWindowsPath(storageItem.Path);
        if (string.IsNullOrWhiteSpace(path))
        {
            return null;
        }

        var isDirectory = storageItem is StorageFolder || Directory.Exists(path);
        var name = FirstNonEmpty(storageItem.Name, Path.GetFileName(path), path);

        return new DrawerItem
        {
            Id = CreateItemId(),
            Type = GuessItemType(path, isDirectory),
            Content = name,
            Name = name,
            Path = path,
            CreatedAt = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            FolderId = GetFolderIdForNewItems(),
            IsQuickAccess = false,
            IsDirectory = isDirectory ? true : null,
        };
    }

    private static string GuessItemType(string path, bool isDirectory)
    {
        if (isDirectory)
        {
            return "file";
        }

        return Path.GetExtension(path).ToLowerInvariant() switch
        {
            ".png" or ".jpg" or ".jpeg" or ".gif" or ".webp" or ".bmp" or ".tif" or ".tiff" => "image",
            ".mp4" or ".mov" or ".mkv" or ".avi" or ".webm" or ".wmv" => "video",
            ".txt" or ".md" or ".json" or ".csv" => "text",
            _ => "file",
        };
    }

    private string GetFolderIdForNewItems() =>
        currentFolderId is not AllFolderId and not UnfiledFolderId ? currentFolderId : "";

    private DrawerFolder? GetSelectedSourceFolder() =>
        currentFolderId is AllFolderId or UnfiledFolderId
            ? null
            : sourceFolders.FirstOrDefault(folder => folder.Id == currentFolderId);

    private async Task<string?> PromptForTextAsync(
        string title,
        string placeholder,
        string primaryButtonText,
        string initialValue = "")
    {
        var textBox = new TextBox
        {
            Text = initialValue,
            PlaceholderText = placeholder,
            MinWidth = 280,
            SelectionStart = initialValue.Length,
        };

        var dialog = new ContentDialog
        {
            XamlRoot = RootDropSurface.XamlRoot,
            Title = title,
            Content = textBox,
            PrimaryButtonText = primaryButtonText,
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Primary,
        };

        return await dialog.ShowAsync() is ContentDialogResult.Primary ? textBox.Text.Trim() : null;
    }

    private async Task<string?> PickFolderIdAsync(
        string title,
        string primaryButtonText,
        string currentFolder = "")
    {
        var comboBox = new ComboBox
        {
            MinWidth = 280,
        };
        comboBox.Items.Add(new ComboBoxItem { Content = "未分类", Tag = "" });
        foreach (var folder in sourceFolders)
        {
            comboBox.Items.Add(new ComboBoxItem { Content = folder.Name, Tag = folder.Id });
        }

        for (var index = 0; index < comboBox.Items.Count; index++)
        {
            if (comboBox.Items[index] is ComboBoxItem comboItem &&
                (string)(comboItem.Tag ?? "") == currentFolder)
            {
                comboBox.SelectedIndex = index;
                break;
            }
        }

        if (comboBox.SelectedIndex < 0)
        {
            comboBox.SelectedIndex = 0;
        }

        var dialog = new ContentDialog
        {
            XamlRoot = RootDropSurface.XamlRoot,
            Title = title,
            Content = comboBox,
            PrimaryButtonText = primaryButtonText,
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Primary,
        };

        if (await dialog.ShowAsync() is not ContentDialogResult.Primary ||
            comboBox.SelectedItem is not ComboBoxItem selected)
        {
            return null;
        }

        return (string)(selected.Tag ?? "");
    }

    private async void MoveCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        var item = card is null ? null : items.FirstOrDefault(candidate => candidate.Id == card.Id);
        if (card is null || item is null)
        {
            return;
        }

        var folderId = await PickFolderIdAsync("移动素材", "移动", item.FolderId ?? "");
        if (folderId is null)
        {
            return;
        }

        item.FolderId = folderId;
        await PersistItemsAsync($"已移动：{card.Name}");
    }

    private async void DeleteCard_Click(object sender, RoutedEventArgs e)
    {
        var card = GetCardFromSender(sender);
        var item = card is null ? null : items.FirstOrDefault(candidate => candidate.Id == card.Id);
        if (card is null || item is null)
        {
            return;
        }

        var dialog = new ContentDialog
        {
            XamlRoot = RootDropSurface.XamlRoot,
            Title = "删除素材",
            Content = $"从抽屉移除“{card.Name}”？不会删除磁盘上的原文件。",
            PrimaryButtonText = "删除",
            CloseButtonText = "取消",
            DefaultButton = ContentDialogButton.Close,
        };

        if (await dialog.ShowAsync() is not ContentDialogResult.Primary)
        {
            return;
        }

        items.Remove(item);
        await PersistItemsAsync($"已删除：{card.Name}");
    }

    private static string PickFolderColor(int index)
    {
        var colors = new[]
        {
            "#2563eb",
            "#16a34a",
            "#dc2626",
            "#9333ea",
            "#0891b2",
            "#ca8a04",
            "#475569",
        };
        return colors[index % colors.Length];
    }

    private static string CreateItemId() =>
        $"native_{DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()}_{Guid.NewGuid().ToString("N")[..8]}";

    private void ShowDrawerView()
    {
        DrawerView.Visibility = Visibility.Visible;
        CanvasView.Visibility = Visibility.Collapsed;
    }

    private void ShowCanvasView()
    {
        DrawerView.Visibility = Visibility.Collapsed;
        CanvasView.Visibility = Visibility.Visible;
        RebuildCanvas();
    }

    private void CanvasZoomSlider_ValueChanged(object sender, Microsoft.UI.Xaml.Controls.Primitives.RangeBaseValueChangedEventArgs e)
    {
        if (CanvasScale is null)
        {
            return;
        }

        CanvasScale.ScaleX = e.NewValue;
        CanvasScale.ScaleY = e.NewValue;
    }

    private void CanvasBoard_PointerWheelChanged(object sender, PointerRoutedEventArgs e)
    {
        var ctrlState = InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Control);
        if (!ctrlState.HasFlag(CoreVirtualKeyStates.Down))
        {
            return;
        }

        var delta = e.GetCurrentPoint(CanvasBoard).Properties.MouseWheelDelta;
        var nextZoom = Math.Clamp(CanvasZoomSlider.Value + (delta > 0 ? 0.1 : -0.1), CanvasZoomSlider.Minimum, CanvasZoomSlider.Maximum);
        CanvasZoomSlider.Value = Math.Round(nextZoom, 2);
        e.Handled = true;
    }

    private void RebuildCanvas()
    {
        if (CanvasBoard is null)
        {
            return;
        }

        CanvasBoard.Children.Clear();
        var imageItems = items
            .Where(MatchesFolder)
            .Where(item => item.Type is "image")
            .Take(80)
            .ToList();

        CanvasStatusText.Text = imageItems.Count > 0
            ? $"当前画布预览 {imageItems.Count} 张图片，来自 {ContentTitle.Text}"
            : "当前分类没有图片素材。";

        if (imageItems.Count == 0)
        {
            CanvasBoard.Children.Add(new TextBlock
            {
                Text = "把图片拖进抽屉，或切换到有图片的分类。",
                FontSize = 18,
                Foreground = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 100, 116, 139)),
                Margin = new Thickness(80),
            });
            return;
        }

        const double itemWidth = 260;
        const double itemHeight = 216;
        const double gap = 28;
        const int columns = 7;

        for (var index = 0; index < imageItems.Count; index++)
        {
            var item = imageItems[index];
            var card = CreateCanvasImageCard(item, itemWidth, itemHeight);
            var column = index % columns;
            var row = index / columns;
            var stagger = column % 2 == 0 ? 0 : 34;

            Microsoft.UI.Xaml.Controls.Canvas.SetLeft(card, 80 + column * (itemWidth + gap));
            Microsoft.UI.Xaml.Controls.Canvas.SetTop(card, 80 + row * (itemHeight + gap) + stagger);
            CanvasBoard.Children.Add(card);
        }

        FitCanvasToContent();
    }

    private FrameworkElement CreateCanvasImageCard(DrawerItem item, double width, double height)
    {
        var title = Truncate(FirstNonEmpty(item.Name, item.Content, item.Path, "图片"), 36);
        var image = BuildImage(item);
        var preview = image is null
            ? new FontIcon
            {
                Glyph = GetIconGlyph(item.Type),
                FontSize = 36,
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center,
            }
            : new Image
            {
                Source = image,
                Stretch = Stretch.UniformToFill,
            } as UIElement;

        var layout = new Grid
        {
            RowSpacing = 8,
        };
        layout.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        layout.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });

        var previewHost = new Border
        {
            Background = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 241, 245, 249)),
            CornerRadius = new CornerRadius(6),
            Child = preview,
        };
        layout.Children.Add(previewHost);

        var titleBlock = new TextBlock
        {
            Text = title,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            TextTrimming = TextTrimming.CharacterEllipsis,
        };
        Grid.SetRow(titleBlock, 1);
        layout.Children.Add(titleBlock);

        var border = new Border
        {
            Width = width,
            Height = height,
            Padding = new Thickness(10),
            CornerRadius = new CornerRadius(8),
            Background = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 255, 255, 255)),
            BorderBrush = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 203, 213, 225)),
            BorderThickness = new Thickness(1),
            Child = layout,
        };

        border.PointerPressed += CanvasCard_PointerPressed;
        border.PointerMoved += CanvasCard_PointerMoved;
        border.PointerReleased += CanvasCard_PointerReleased;
        border.PointerCanceled += CanvasCard_PointerCanceled;
        border.DoubleTapped += (_, _) =>
        {
            if (didDragCanvasElement)
            {
                return;
            }

            var target = ToCard(item).OpenTarget;
            if (!string.IsNullOrWhiteSpace(target))
            {
                OpenTarget(target);
            }
        };

        return border;
    }

    private void CanvasCard_PointerPressed(object sender, PointerRoutedEventArgs e)
    {
        if (sender is not FrameworkElement element)
        {
            return;
        }

        var point = e.GetCurrentPoint(CanvasBoard);
        if (!point.Properties.IsLeftButtonPressed)
        {
            return;
        }

        draggingCanvasElement = element;
        draggingCanvasPointerId = e.Pointer.PointerId;
        draggingCanvasStartPoint = point.Position;
        draggingCanvasStartLeft = Microsoft.UI.Xaml.Controls.Canvas.GetLeft(element);
        draggingCanvasStartTop = Microsoft.UI.Xaml.Controls.Canvas.GetTop(element);
        didDragCanvasElement = false;
        element.CapturePointer(e.Pointer);
        e.Handled = true;
    }

    private void CanvasCard_PointerMoved(object sender, PointerRoutedEventArgs e)
    {
        if (draggingCanvasElement is null ||
            sender is not FrameworkElement element ||
            element != draggingCanvasElement ||
            e.Pointer.PointerId != draggingCanvasPointerId)
        {
            return;
        }

        var point = e.GetCurrentPoint(CanvasBoard);
        if (!point.Properties.IsLeftButtonPressed)
        {
            EndCanvasCardDrag(element, e);
            return;
        }

        var dx = point.Position.X - draggingCanvasStartPoint.X;
        var dy = point.Position.Y - draggingCanvasStartPoint.Y;
        if (Math.Abs(dx) > 3 || Math.Abs(dy) > 3)
        {
            didDragCanvasElement = true;
        }

        Microsoft.UI.Xaml.Controls.Canvas.SetLeft(element, Math.Max(0, draggingCanvasStartLeft + dx));
        Microsoft.UI.Xaml.Controls.Canvas.SetTop(element, Math.Max(0, draggingCanvasStartTop + dy));
        e.Handled = true;
    }

    private void CanvasCard_PointerReleased(object sender, PointerRoutedEventArgs e)
    {
        if (sender is FrameworkElement element)
        {
            EndCanvasCardDrag(element, e);
        }
    }

    private void CanvasCard_PointerCanceled(object sender, PointerRoutedEventArgs e)
    {
        if (sender is FrameworkElement element)
        {
            EndCanvasCardDrag(element, e);
        }
    }

    private void EndCanvasCardDrag(FrameworkElement element, PointerRoutedEventArgs e)
    {
        element.ReleasePointerCapture(e.Pointer);
        draggingCanvasElement = null;
        draggingCanvasPointerId = 0;
        e.Handled = true;
    }

    private void FitCanvasToContent()
    {
        if (CanvasBoard is null || CanvasScrollViewer is null || CanvasBoard.Children.Count == 0)
        {
            return;
        }

        var contentRight = 0d;
        var contentBottom = 0d;
        foreach (var child in CanvasBoard.Children.OfType<FrameworkElement>())
        {
            var left = Microsoft.UI.Xaml.Controls.Canvas.GetLeft(child);
            var top = Microsoft.UI.Xaml.Controls.Canvas.GetTop(child);
            contentRight = Math.Max(contentRight, left + child.Width + 120);
            contentBottom = Math.Max(contentBottom, top + child.Height + 120);
        }

        CanvasBoard.Width = Math.Max(2600, contentRight);
        CanvasBoard.Height = Math.Max(1800, contentBottom);
        CanvasScrollViewer.ChangeView(0, 0, null, true);
    }
}
