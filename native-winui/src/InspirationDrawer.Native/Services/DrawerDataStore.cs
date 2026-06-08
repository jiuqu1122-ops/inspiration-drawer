using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using InspirationDrawer.Native.Models;

namespace InspirationDrawer.Native.Services;

public sealed class DrawerDataStore
{
    private const string TauriAppDataFolder = "com.inspirationdrawer.app";

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        WriteIndented = false,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };

    public string DataDirectory { get; } =
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            TauriAppDataFolder);

    private string ItemsPath => Path.Combine(DataDirectory, "drawer_items.json");

    private string FoldersPath => Path.Combine(DataDirectory, "drawer_folders.json");

    public async Task<DrawerDataSnapshot> LoadAsync()
    {
        var folders = await ReadArrayAsync<DrawerFolder>(FoldersPath);
        var items = await ReadArrayAsync<DrawerItem>(ItemsPath);

        return new DrawerDataSnapshot(folders, items, DataDirectory);
    }

    public async Task SaveItemsAsync(IReadOnlyList<DrawerItem> items)
    {
        Directory.CreateDirectory(DataDirectory);
        await using var stream = File.Create(ItemsPath);
        await JsonSerializer.SerializeAsync(stream, items, JsonOptions);
    }

    public async Task SaveFoldersAsync(IReadOnlyList<DrawerFolder> folders)
    {
        Directory.CreateDirectory(DataDirectory);
        await using var stream = File.Create(FoldersPath);
        await JsonSerializer.SerializeAsync(stream, folders, JsonOptions);
    }

    private static async Task<IReadOnlyList<T>> ReadArrayAsync<T>(string path)
    {
        if (!File.Exists(path))
        {
            return [];
        }

        await using var stream = File.OpenRead(path);
        return await JsonSerializer.DeserializeAsync<List<T>>(stream, JsonOptions) ?? [];
    }
}

public sealed record DrawerDataSnapshot(
    IReadOnlyList<DrawerFolder> Folders,
    IReadOnlyList<DrawerItem> Items,
    string DataDirectory);
