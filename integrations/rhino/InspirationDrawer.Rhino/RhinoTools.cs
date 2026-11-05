using System.Drawing.Imaging;
using System.Text.Json.Nodes;
using Rhino;
using Rhino.DocObjects;
using Rhino.Display;

namespace InspirationDrawer.Rhino;

internal static class RhinoTools
{
    private static async Task<JsonNode> OnUi(uint documentId, Func<RhinoDoc, JsonNode> action)
    {
        var result = new TaskCompletionSource<JsonNode>(TaskCreationOptions.RunContinuationsAsynchronously);
        RhinoApp.InvokeOnUiThread((Action)(() =>
        {
            if (result.Task.IsCompleted) return;
            try
            {
                var doc = RhinoDoc.FromRuntimeSerialNumber(documentId) ?? throw new InvalidOperationException("绑定的 Rhino 文档已关闭，请新建会话并重新连接");
                result.TrySetResult(action(doc));
            }
            catch (Exception error) { result.TrySetException(error); }
        }));
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        using var registration = timeout.Token.Register(() => result.TrySetException(new TimeoutException("Rhino 忙或正显示对话框，请完成当前操作后重试")));
        return await result.Task;
    }

    internal static Task<JsonNode> Context(uint id) => OnUi(id, ContextFor);
    private static JsonObject Point(global::Rhino.Geometry.Point3d p) => new() { ["x"] = p.X, ["y"] = p.Y, ["z"] = p.Z };
    private static JsonObject ObjectInfo(RhinoDoc doc, RhinoObject item) => new()
    {
        ["id"] = item.Id.ToString(), ["name"] = item.Name,
        ["layer"] = doc.Layers.FindIndex(item.Attributes.LayerIndex)?.FullPath,
        ["type"] = item.ObjectType.ToString(), ["hidden"] = item.IsHidden,
    };
    private static JsonNode ContextFor(RhinoDoc doc)
    {
        var vp = doc.Views.ActiveView?.ActiveViewport;
        return new JsonObject
        {
            ["documentId"] = doc.RuntimeSerialNumber, ["name"] = doc.Name ?? "未保存文档",
            ["units"] = doc.ModelUnitSystem.ToString(), ["modified"] = doc.Modified,
            ["selection"] = new JsonArray(doc.Objects.GetSelectedObjects(false, false).Take(200).Select(item => (JsonNode)ObjectInfo(doc, item)).ToArray()),
            ["camera"] = vp == null ? null : new JsonObject
            {
                ["position"] = Point(vp.CameraLocation), ["target"] = Point(vp.CameraTarget),
                ["parallel"] = vp.IsParallelProjection, ["lensLength"] = vp.Camera35mmLensLength,
                ["viewportId"] = vp.Id.ToString(), ["width"] = vp.Size.Width, ["height"] = vp.Size.Height,
            },
        };
    }

    internal static Task<JsonNode> Call(string name, JsonObject args)
    {
        var id = args["documentId"]?.GetValue<uint>() ?? throw new ArgumentException("缺少绑定文档 ID");
        return OnUi(id, doc =>
        {
            if (name == "rhino_get_context") return ContextFor(doc);
            if (name == "rhino_list_objects")
            {
                var layer = args["layer"]?.GetValue<string>();
                var limit = Math.Clamp(args["limit"]?.GetValue<int>() ?? 100, 1, 200);
                var objects = doc.Objects.GetObjectList(ObjectType.AnyObject)
                    .Where(item => !item.IsDeleted && (string.IsNullOrWhiteSpace(layer) || doc.Layers.FindIndex(item.Attributes.LayerIndex)?.FullPath == layer))
                    .Take(limit + 1).ToArray();
                return new JsonObject
                {
                    ["documentId"] = id, ["truncated"] = objects.Length > limit,
                    ["objects"] = new JsonArray(objects.Take(limit).Select(item => (JsonNode)ObjectInfo(doc, item)).ToArray()),
                };
            }
            if (name == "rhino_list_layers")
            {
                return new JsonObject
                {
                    ["documentId"] = id,
                    ["layers"] = new JsonArray(doc.Layers.Where(layer => !layer.IsDeleted).Take(200).Select(layer => (JsonNode)new JsonObject
                    {
                        ["id"] = layer.Id.ToString(), ["path"] = layer.FullPath, ["visible"] = layer.IsVisible,
                        ["color"] = $"#{layer.Color.R:X2}{layer.Color.G:X2}{layer.Color.B:X2}",
                    }).ToArray()),
                };
            }
            if (name == "rhino_capture_viewport")
            {
                var view = doc.Views.ActiveView ?? throw new InvalidOperationException("当前文档没有可用视口");
                var size = view.ActiveViewport.Size;
                var scale = Math.Min(1d, 1600d / Math.Max(size.Width, size.Height));
                var capture = new ViewCapture
                {
                    Width = Math.Max(1, (int)Math.Round(size.Width * scale)),
                    Height = Math.Max(1, (int)Math.Round(size.Height * scale)),
                    ScaleScreenItems = false, DrawAxes = false, DrawGrid = false, DrawGridAxes = false,
                };
                using var bitmap = capture.CaptureToBitmap(view) ?? throw new InvalidOperationException("Rhino 视口导出失败");
                using var buffer = new MemoryStream();
                bitmap.Save(buffer, ImageFormat.Png);
                return new JsonObject
                {
                    ["imageData"] = Convert.ToBase64String(buffer.ToArray()), ["mimeType"] = "image/png",
                    ["width"] = bitmap.Width, ["height"] = bitmap.Height, ["context"] = ContextFor(doc),
                };
            }
            throw new ArgumentException("Beta 未开放该 Rhino 工具");
        });
    }
}
