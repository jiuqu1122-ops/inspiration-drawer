using System.Text.Json;
using InspirationDrawer.Native.Models;

namespace InspirationDrawer.Native.Services;

public sealed class DrawerDataStore
{
    private const string TauriAppDataFolder = "com.inspirationdrawer.app";

    public string DataDirectory { get; } =
        Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            TauriAppDataFolder);

    public async Task<DrawerDataSnapshot> LoadAsync()
    {
        var folders = await ReadArrayAsync(
            Path.Combine(DataDirectory, "drawer_folders.json"),
            ReadFolderAsync);
        var items = await ReadArrayAsync(
            Path.Combine(DataDirectory, "drawer_items.json"),
            ReadItemAsync);

        return new DrawerDataSnapshot(folders, items, DataDirectory);
    }

    private static async Task<IReadOnlyList<T>> ReadArrayAsync<T>(
        string path,
        Func<JsonElement, T> readItem)
    {
        if (!File.Exists(path))
        {
            return [];
        }

        await using var stream = File.OpenRead(path);
        using var document = await JsonDocument.ParseAsync(stream);
        if (document.RootElement.ValueKind is not JsonValueKind.Array)
        {
            return [];
        }

        return document.RootElement
            .EnumerateArray()
            .Select(readItem)
            .ToList();
    }

    private static DrawerFolder ReadFolderAsync(JsonElement element) => new()
    {
        Id = ReadString(element, "id"),
        Name = ReadString(element, "name", "未命名分类"),
        Color = ReadString(element, "color", "#64748b"),
    };

    private static DrawerItem ReadItemAsync(JsonElement element) => new()
    {
        Id = ReadString(element, "id"),
        Type = ReadString(element, "type", "text"),
        Content = ReadString(element, "content"),
        Name = ReadString(element, "name"),
        Path = ReadString(element, "path"),
        Url = ReadString(element, "url"),
        Thumbnail = ReadString(element, "thumbnail"),
        FolderId = ReadString(element, "folderId"),
        CreatedAt = ReadLong(element, "createdAt"),
    };

    private static string ReadString(JsonElement element, string propertyName, string fallback = "")
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return fallback;
        }

        return property.ValueKind switch
        {
            JsonValueKind.String => property.GetString() ?? fallback,
            JsonValueKind.Number => property.GetRawText(),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            _ => fallback,
        };
    }

    private static long ReadLong(JsonElement element, string propertyName)
    {
        if (!element.TryGetProperty(propertyName, out var property))
        {
            return 0;
        }

        if (property.ValueKind is JsonValueKind.Number && property.TryGetInt64(out var value))
        {
            return value;
        }

        return 0;
    }
}

public sealed record DrawerDataSnapshot(
    IReadOnlyList<DrawerFolder> Folders,
    IReadOnlyList<DrawerItem> Items,
    string DataDirectory);
