using System.Collections.ObjectModel;
using Microsoft.UI.Xaml;

namespace InspirationDrawer.Native;

public sealed partial class MainWindow : Window
{
    public ObservableCollection<FolderSummary> Folders { get; } =
    [
        new("主抽屉", 18),
        new("AI 生图", 6),
        new("产品参考", 12),
        new("桌面便签", 4),
    ];

    public ObservableCollection<PreviewCard> PreviewCards { get; } =
    [
        new("抽屉数据读取", "读取现有 drawer_items.json / drawer_folders.json。"),
        new("原生无限画布", "用 WinUI Pointer 和 ScrollViewer 重建缩放拖拽。"),
        new("AI 生图节点", "迁移 Xais / OpenAI Compatible / 中转2 流程。"),
        new("桌面便签", "将便签窗口改为原生多窗口。"),
    ];

    public MainWindow()
    {
        InitializeComponent();
        Title = "Inspiration Drawer Native";
        FolderList.ItemsSource = Folders;
        PreviewItems.ItemsSource = PreviewCards;
    }
}

public sealed record FolderSummary(string Name, int Count);

public sealed record PreviewCard(string Name, string Description);
