using System.Drawing.Imaging;
using System.Drawing;
using System.Text.Json.Nodes;
using Rhino;
using Rhino.DocObjects;
using Rhino.Display;
using Rhino.Geometry;

namespace InspirationDrawer.Rhino;

internal static class RhinoTools
{
    private static Bitmap CaptureViewport(RhinoView view, int width, int height, bool selectedOnly)
    {
        using var settings = new ViewCaptureSettings(view, new Size(width, height), 96d);
        settings.SetViewport(view.ActiveViewport);
        // ViewCaptureSettings defaults to vector/print output. With model wires
        // suppressed, vector output can contain only the background. Render actual
        // materials and shading through the raster display pipeline instead.
        settings.RasterMode = true;
        settings.DrawSelectedObjectsOnly = selectedOnly;
        settings.DrawBackground = !selectedOnly;
        settings.DrawGrid = false;
        settings.DrawAxis = false;
        settings.DrawLockedObjects = true;
        settings.DrawMargins = false;
        settings.DrawClippingPlanes = false;
        settings.DrawLights = false;
        settings.DrawBackgroundBitmap = false;
        settings.DrawWallpaper = false;
        settings.ViewArea = ViewCaptureSettings.ViewAreaMapping.View;
        return ViewCapture.CaptureToBitmap(settings) ?? throw new InvalidOperationException("Rhino viewport capture failed");
    }

    private static Bitmap CreateSelectedObjectMask(Bitmap selectedOnlyCapture)
    {
        var cornerColors = new[]
        {
            selectedOnlyCapture.GetPixel(0, 0),
            selectedOnlyCapture.GetPixel(selectedOnlyCapture.Width - 1, 0),
            selectedOnlyCapture.GetPixel(0, selectedOnlyCapture.Height - 1),
            selectedOnlyCapture.GetPixel(selectedOnlyCapture.Width - 1, selectedOnlyCapture.Height - 1),
        };
        var background = Color.FromArgb(
            cornerColors.Sum(color => (int)color.A) / cornerColors.Length,
            cornerColors.Sum(color => (int)color.R) / cornerColors.Length,
            cornerColors.Sum(color => (int)color.G) / cornerColors.Length,
            cornerColors.Sum(color => (int)color.B) / cornerColors.Length);
        var transparentBackground = background.A <= 16;
        var mask = new Bitmap(selectedOnlyCapture.Width, selectedOnlyCapture.Height, PixelFormat.Format32bppArgb);
        for (var y = 0; y < selectedOnlyCapture.Height; y++)
        for (var x = 0; x < selectedOnlyCapture.Width; x++)
        {
            var pixel = selectedOnlyCapture.GetPixel(x, y);
            var delta = Math.Abs(pixel.R - background.R) + Math.Abs(pixel.G - background.G) + Math.Abs(pixel.B - background.B);
            var selectedGeometry = transparentBackground ? pixel.A > 16 : pixel.A > 16 && delta > 28;
            // Transparent selected-model pixels are editable for OpenAI-compatible masks;
            // opaque white pixels preserve the rest of the image.
            mask.SetPixel(x, y, selectedGeometry ? Color.FromArgb(0, 255, 255, 255) : Color.White);
        }
        return mask;
    }

    private static Bitmap CaptureMask(RhinoDoc doc, RhinoView view, int width, int height, string? maskLayer)
    {
        var originalSelection = doc.Objects.GetSelectedObjects(false, false).Cast<RhinoObject>()
            .Select(item => (Object: item, Persistent: item.IsSelected(false) == 2)).ToArray();
        if (maskLayer == null)
        {
            if (originalSelection.Length == 0) throw new InvalidOperationException("Select the objects to edit in Rhino before capturing a Mask");
            if (originalSelection.Length > 2_000) throw new InvalidOperationException("A Mask capture supports at most 2000 selected objects");
            using var selectedCapture = CaptureViewport(view, width, height, selectedOnly: true);
            return CreateSelectedObjectMask(selectedCapture);
        }

        if (doc.Objects.GetSelectedObjects(false, true).Cast<RhinoObject>().Any(item => item.IsSelected(true) == 3))
            throw new InvalidOperationException("\u8bf7\u5148\u53d6\u6d88 Rhino \u5b50\u5bf9\u8c61\u9009\u62e9\uff0c\u518d\u5bfc\u51fa\u56fe\u5c42\u906e\u7f69\u3002");
        var layer = doc.Layers.FirstOrDefault(item => !item.IsDeleted && item.FullPath == maskLayer)
            ?? throw new InvalidOperationException("Mask layer does not exist or has been deleted");
        if (!layer.IsVisible) throw new InvalidOperationException("The selected Mask layer is not visible");
        var targets = doc.Objects.GetObjectList(ObjectType.AnyObject).Where(item =>
            !item.IsDeleted && !item.IsHidden && item.Attributes.Visible
            && doc.Layers.FindIndex(item.Attributes.LayerIndex)?.FullPath == layer.FullPath).Take(2_001).ToArray();
        if (targets.Length == 0) throw new InvalidOperationException("The selected Mask layer has no visible objects");
        if (targets.Length > 2_000) throw new InvalidOperationException("A Mask capture supports at most 2000 layer objects");
        try
        {
            doc.Objects.UnselectAll(false);
            var selectedCount = 0;
            foreach (var item in targets)
                if (item.Select(true, false, false, true, true, true) > 0) selectedCount++;
            if (selectedCount != targets.Length)
                throw new InvalidOperationException($"Could not temporarily select {targets.Length - selectedCount} objects on the Mask layer; capture was cancelled");
            doc.Views.Redraw();
            using var selectedCapture = CaptureViewport(view, width, height, selectedOnly: true);
            return CreateSelectedObjectMask(selectedCapture);
        }
        finally
        {
            doc.Objects.UnselectAll(false);
            foreach (var prior in originalSelection)
                if (!prior.Object.IsDeleted) prior.Object.Select(true, true, prior.Persistent, true, true, true);
            doc.Views.Redraw();
        }
    }

    // Rhino 8.0 does not expose every edge flag added by Rhino 9. Preserve the
    // shared display configuration, and apply newer flags only where supported.
    private static void SetOptionalDisplayFlag(DisplayPipelineAttributes attributes, string property, bool value)
    {
        var flag = attributes.GetType().GetProperty(property);
        if (flag?.CanWrite == true && flag.PropertyType == typeof(bool)) flag.SetValue(attributes, value);
    }

    private static DisplayModeDescription? CreateCleanCaptureMode(bool rendered)
    {
        var sourceMode = DisplayModeDescription.GetDisplayMode(rendered ? DisplayModeDescription.RenderedId : DisplayModeDescription.ShadedId);
        if (sourceMode is null) return null;

        var modeId = DisplayModeDescription.CopyDisplayMode(
            sourceMode.Id,
            $"Inspiration Drawer Capture {(rendered ? "Rendered" : "Shaded")} {Guid.NewGuid():N}");
        if (modeId == Guid.Empty) return null;

        var captureMode = DisplayModeDescription.GetDisplayMode(modeId);
        if (captureMode is null)
        {
            DisplayModeDescription.DeleteDisplayMode(modeId);
            return null;
        }

        if (!rendered)
        {
            captureMode.SupportsShading = true;
            captureMode.ShadedPipelineRequired = true;
            captureMode.WireframePipelineRequired = false;
        }
        var attributes = captureMode.DisplayAttributes;
        // Clean both Rendered and Shaded captures by disabling model edge and vertex
        // overlays on a temporary display-mode copy; never change the user's saved mode.
        attributes.ShadingEnabled = true;
        attributes.ShowCurves = false;
        attributes.ShowGrips = false;
        attributes.ShowSurfaceEdges = false;
        SetOptionalDisplayFlag(attributes, "ShowSurfaceEdge", false);
        SetOptionalDisplayFlag(attributes, "ShowSurfaceNakedEdge", false);
        attributes.ShowTangentEdges = false;
        attributes.ShowTangentSeams = false;
        attributes.ShowIsoCurves = false;
        SetOptionalDisplayFlag(attributes, "ShowMeshEdges", false);
        SetOptionalDisplayFlag(attributes, "ShowMeshNakedEdges", false);
        SetOptionalDisplayFlag(attributes, "ShowMeshNonmanifoldEdges", false);
        SetOptionalDisplayFlag(attributes, "ShowSubDEdges", false);
        SetOptionalDisplayFlag(attributes, "ShowSubDNonmanifoldEdges", false);
        SetOptionalDisplayFlag(attributes, "ShowClippingEdges", false);
        attributes.ShowClipIntersectionEdges = false;
        SetOptionalDisplayFlag(attributes, "ShowEdges", false);
        attributes.MeshSpecificAttributes.ShowMeshWires = false;
        attributes.MeshSpecificAttributes.ShowMeshVertices = false;

        if (!DisplayModeDescription.UpdateDisplayMode(captureMode))
        {
            DisplayModeDescription.DeleteDisplayMode(modeId);
            return null;
        }

        return captureMode;
    }

    private static List<(RhinoObject Object, Guid Override)> ForceCaptureObjectOverrides(RhinoDoc doc, RhinoViewport viewport, DisplayModeDescription captureMode)
    {
        var changed = new List<(RhinoObject Object, Guid Override)>();
        var settings = new ObjectEnumeratorSettings
        {
            ActiveObjects = true, HiddenObjects = true, LockedObjects = true,
            DeletedObjects = false, IncludeLights = true, IncludeGrips = false,
        };
        foreach (var obj in doc.Objects.GetObjectList(settings))
        {
            var attributes = obj.Attributes;
            var original = attributes.HasDisplayModeOverride(viewport.Id)
                ? attributes.GetDisplayModeOverride(viewport.Id)
                : Guid.Empty;
            attributes.SetDisplayModeOverride(captureMode, viewport.Id);
            if (doc.Objects.ModifyAttributes(obj, attributes, true))
                changed.Add((obj, original));
        }
        return changed;
    }

    private static void RestoreDisplayModeOverrides(RhinoDoc doc, RhinoViewport viewport, IEnumerable<(RhinoObject Object, Guid Override)> changed)
    {
        foreach (var (obj, original) in changed)
        {
            if (obj.IsDeleted) continue;
            var attributes = obj.Attributes;
            attributes.RemoveDisplayModeOverride(viewport.Id);
            if (original != Guid.Empty && DisplayModeDescription.GetDisplayMode(original) is { } originalMode)
                attributes.SetDisplayModeOverride(originalMode, viewport.Id);
            doc.Objects.ModifyAttributes(obj, attributes, true);
        }
    }

    private static (Bitmap Viewport, Bitmap? Mask) CaptureViewAndOptionalMask(RhinoDoc doc, RhinoView view, int width, int height, bool includeMask, string? maskLayer, bool forceShaded, bool forceRendered)
    {
        var viewport = view.ActiveViewport;
        var previousMode = viewport.DisplayMode;
        var selectedObjects = doc.Objects.GetSelectedObjects(false, false).Cast<RhinoObject>().ToArray();
        var changedOverrides = new List<(RhinoObject Object, Guid Override)>();
        DisplayModeDescription? temporaryCaptureMode = null;
        var wasModified = doc.Modified;
        var undoRecordingWasEnabled = doc.UndoRecordingEnabled;
        try
        {
            var rendered = forceRendered;
            var sourceMode = DisplayModeDescription.GetDisplayMode(rendered ? DisplayModeDescription.RenderedId : DisplayModeDescription.ShadedId);
            if (forceRendered && sourceMode is null)
                throw new InvalidOperationException("Rhino Rendered display mode is unavailable");
            if ((includeMask || forceShaded || forceRendered) && sourceMode is { })
            {
                temporaryCaptureMode = CreateCleanCaptureMode(rendered);
                var captureMode = temporaryCaptureMode ?? sourceMode;
                viewport.DisplayMode = captureMode;
                doc.UndoRecordingEnabled = false;
                changedOverrides = ForceCaptureObjectOverrides(doc, viewport, captureMode);
                doc.Objects.UnselectAll(false);
                doc.Views.Redraw();
                view.Redraw();
                RhinoApp.Wait();
                view.Redraw();
            }

            // The reference image must not contain selection highlighting/wire overlays.
            var cleanViewport = CaptureViewport(view, width, height, selectedOnly: false);
            if (!ViewportCaptureValidation.HasVisibleContent(cleanViewport.Width, cleanViewport.Height,
                    (x, y) => cleanViewport.GetPixel(x, y).ToArgb()))
            {
                cleanViewport.Dispose();
                throw new InvalidOperationException("Rhino Rendered viewport capture is blank. No reference image was uploaded and image generation was not started.");
            }
            foreach (var obj in selectedObjects) if (!obj.IsDeleted) obj.Select(true, true, false, true, true, true);
            doc.Views.Redraw();
            if (!includeMask) return (cleanViewport, null);

            try { return (cleanViewport, CaptureMask(doc, view, width, height, maskLayer)); }
            catch
            {
                cleanViewport.Dispose();
                throw;
            }
        }
        finally
        {
            RestoreDisplayModeOverrides(doc, viewport, changedOverrides);
            if (previousMode != null) viewport.DisplayMode = previousMode;
            if (temporaryCaptureMode is { })
                DisplayModeDescription.DeleteDisplayMode(temporaryCaptureMode.Id);
            doc.Objects.UnselectAll(false);
            foreach (var obj in selectedObjects) if (!obj.IsDeleted) obj.Select(true, true, false, true, true, true);
            doc.Views.Redraw();
            view.Redraw();
            doc.UndoRecordingEnabled = undoRecordingWasEnabled;
            doc.Modified = wasModified;
        }
    }

    private static async Task<JsonNode> OnUi(uint documentId, Func<RhinoDoc, JsonNode> action)
    {
        var result = new TaskCompletionSource<JsonNode>(TaskCreationOptions.RunContinuationsAsynchronously);
        RhinoApp.InvokeOnUiThread((Action)(() =>
        {
            if (result.Task.IsCompleted) return;
            try
            {
                var doc = RhinoDoc.FromRuntimeSerialNumber(documentId) ?? throw new InvalidOperationException("Bound Rhino document is closed");
                result.TrySetResult(action(doc));
            }
            catch (Exception error) { result.TrySetException(error); }
        }));
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
        using var registration = timeout.Token.Register(() => result.TrySetException(new TimeoutException("Rhino is busy or showing a dialog; finish the current operation and retry")));
        return await result.Task;
    }

    internal static Task<JsonNode> Context(uint id) => OnUi(id, ContextFor);

    internal static async Task RebindNativeMcp(uint id)
    {
        await OnUi(id, doc =>
        {
            var started = RhinoApp.RunScript(doc.RuntimeSerialNumber, "_MCPStart _Enter", false);
            if (!started) throw new InvalidOperationException("RhinoAI MCP could not bind to the requested document. Confirm RhinoAI is loaded.");
            return JsonValue.Create(true)!;
        });
        // Give RhinoAI time to refresh the process listener's document-scoped context.
        await Task.Delay(250);
    }
    internal static async Task<JsonObject> Fingerprint(uint id) => (await OnUi(id, doc =>
    {
        var fingerprint = FingerprintFor(doc);
        var key = FingerprintKey(fingerprint);
        var openFingerprints = RhinoDoc.OpenDocuments(true).Select(FingerprintFor).ToArray();
        fingerprint["fingerprintMultiplicity"] = openFingerprints.Count(candidate => FingerprintKey(candidate) == key);
        var objectKey = ObjectIdentityKey(fingerprint);
        fingerprint["objectIdentityMultiplicity"] = openFingerprints.Count(candidate => ObjectIdentityKey(candidate) == objectKey);
        return fingerprint;
    })).AsObject();

    private static JsonObject FingerprintFor(RhinoDoc doc)
    {
        var settings = new ObjectEnumeratorSettings
        {
            ActiveObjects = true, HiddenObjects = true, LockedObjects = true,
            DeletedObjects = false, IncludeLights = true, IncludeGrips = false,
        };
        var objects = doc.Objects.GetObjectList(settings).Take(10_001).ToArray();
        var complete = objects.Length <= 10_000;
        var vp = doc.Views.ActiveView?.ActiveViewport;
        var selection = doc.Objects.GetSelectedObjects(false, false).Cast<RhinoObject>();
        return new JsonObject
        {
            ["selection"] = new JsonArray(selection.Select(item => (JsonNode)new JsonObject { ["id"] = item.Id.ToString() }).ToArray()),
            ["objectCount"] = objects.Length,
            ["layerCount"] = doc.Layers.Count,
            ["identityComplete"] = complete,
            ["objectIds"] = new JsonArray((complete ? objects.Select(item => item.Id.ToString()) : Array.Empty<string>()).OrderBy(value => value, StringComparer.OrdinalIgnoreCase).Select(value => (JsonNode)JsonValue.Create(value)!).ToArray()),
            ["camera"] = vp == null ? null : new JsonObject { ["position"] = Point(vp.CameraLocation), ["target"] = Point(vp.CameraTarget) },
        };
    }

    private static string ObjectIdentityKey(JsonObject fingerprint)
    {
        var ids = fingerprint["objectIds"]?.AsArray().Select(item => item?.GetValue<string>() ?? string.Empty) ?? [];
        return string.Join("|", fingerprint["identityComplete"]?.GetValue<bool>(), fingerprint["objectCount"]?.GetValue<int>(),
            string.Join(",", ids.OrderBy(value => value, StringComparer.OrdinalIgnoreCase)));
    }

    private static string FingerprintKey(JsonObject fingerprint)
    {
        var selection = fingerprint["selection"]?.AsArray().Select(item => item?["id"]?.GetValue<string>() ?? string.Empty) ?? [];
        var ids = fingerprint["objectIds"]?.AsArray().Select(item => item?.GetValue<string>() ?? string.Empty) ?? [];
        return string.Join("|", fingerprint["identityComplete"]?.GetValue<bool>(), fingerprint["objectCount"]?.GetValue<int>(), fingerprint["layerCount"]?.GetValue<int>(),
            string.Join(",", selection.OrderBy(value => value, StringComparer.OrdinalIgnoreCase)), string.Join(",", ids), fingerprint["camera"]?.ToJsonString() ?? "no-camera");
    }
    private static JsonObject Point(global::Rhino.Geometry.Point3d p) => new() { ["x"] = p.X, ["y"] = p.Y, ["z"] = p.Z };
    private static JsonObject ObjectInfo(RhinoDoc doc, RhinoObject item) => new()
    {
        ["id"] = item.Id.ToString(), ["name"] = item.Name,
        ["layer"] = doc.Layers.FindIndex(item.Attributes.LayerIndex)?.FullPath,
        ["type"] = item.ObjectType.ToString(), ["hidden"] = item.IsHidden,
    };

    private static JsonObject MaterialInfo(RhinoObject item, Material? material, ObjectAttributes attributes, ComponentIndex? component = null, bool sourceResolved = true)
    {
        global::Rhino.Render.RenderMaterial? renderMaterial;
        try
        {
            renderMaterial = component is { } index
                ? item.GetRenderMaterial(index, Guid.Empty, attributes)
                : item.GetRenderMaterial(ComponentIndex.Unset, Guid.Empty, attributes);
        }
        catch { renderMaterial = null; }
        var source = attributes.MaterialSource switch
        {
            ObjectMaterialSource.MaterialFromObject => "object",
            ObjectMaterialSource.MaterialFromLayer => "layer",
            ObjectMaterialSource.MaterialFromParent => "parent",
            _ => "unknown",
        };
        return new JsonObject
        {
            ["name"] = material?.Name,
            ["available"] = material != null || renderMaterial != null,
            ["diffuseColor"] = material == null ? null : $"#{material.DiffuseColor.R:X2}{material.DiffuseColor.G:X2}{material.DiffuseColor.B:X2}",
            ["transparency"] = material?.Transparency,
            ["renderName"] = renderMaterial?.Name,
            ["source"] = component.HasValue ? "subobject" : source,
            ["objectSource"] = source,
            ["sourceResolved"] = sourceResolved || renderMaterial != null,
        };
    }

    private static JsonObject PartsFor(RhinoDoc doc, IEnumerable<RhinoObject>? selected = null, int limit = 100)
    {
        var objects = (selected ?? doc.Objects.GetSelectedObjects(false, false).Cast<RhinoObject>()).Take(201).ToArray();
        var parts = new JsonArray();
        var maxParts = Math.Clamp(limit, 1, 200);
        var truncated = objects.Length > 200;
        foreach (var item in objects.Take(200))
        {
            if (parts.Count >= maxParts) { truncated = true; break; }
            AddSelectedPart(doc, item, parts, maxParts, ref truncated);
        }
        return new JsonObject
        {
            ["documentId"] = doc.RuntimeSerialNumber,
            ["selectedObjectCount"] = Math.Min(objects.Length, 200),
            ["selectionTruncated"] = objects.Length > 200,
            ["partCount"] = parts.Count,
            ["truncated"] = truncated,
            ["visibleAreaMaskAvailable"] = false,
            ["layers"] = new JsonArray(doc.Layers.Where(layer => !layer.IsDeleted).Take(200)
                .Select(layer => (JsonNode)new JsonObject { ["path"] = layer.FullPath, ["visible"] = layer.IsVisible }).ToArray()),
            ["parts"] = parts,
        };
    }

    internal static async Task<JsonNode> Parts(uint id, int limit = 100) => await OnUi(id, doc => PartsFor(doc, limit: limit));

    private static JsonArray Matrices(Transform[] transforms) => new(transforms.Select(transform => (JsonNode)new JsonArray(
        Enumerable.Range(0, 4).Select(row => (JsonNode)new JsonArray(
            Enumerable.Range(0, 4).Select(column => (JsonNode?)JsonValue.Create(transform[row, column])).ToArray())).ToArray())).ToArray());

    private static void AddPart(RhinoDoc doc, RhinoObject item, ObjectAttributes attributes, string id, string? parentId,
        string[] instancePath, Transform[] transforms, JsonArray parts, int limit, ref bool truncated)
    {
        if (parts.Count >= limit) { truncated = true; return; }
        var layer = doc.Layers.FindIndex(attributes.LayerIndex);
        Material? material;
        try { material = item.GetMaterial(ComponentIndex.Unset, Guid.Empty, attributes); }
        catch { material = null; }
        var materialResolved = attributes.MaterialSource != ObjectMaterialSource.MaterialFromParent || material != null;
        var bounds = item.Geometry?.GetBoundingBox(false) ?? BoundingBox.Unset;
        foreach (var transform in transforms.Reverse()) bounds.Transform(transform);
        var part = new JsonObject
        {
            ["id"] = id,
            ["parentId"] = parentId,
            ["name"] = attributes.Name ?? item.Name,
            ["type"] = item.ObjectType.ToString(),
            ["kind"] = "object",
            ["layer"] = layer?.FullPath,
            ["layerId"] = layer?.Id.ToString(),
            ["visible"] = attributes.Visible && layer?.IsVisible == true && !item.IsHidden,
            ["materialIndex"] = attributes.MaterialIndex,
            ["materialSource"] = attributes.MaterialSource.ToString(),
            ["hidden"] = attributes.Mode == ObjectMode.Hidden,
            ["globallyVisible"] = attributes.Visible && attributes.Mode != ObjectMode.Hidden && layer?.IsVisible == true,
            ["material"] = MaterialInfo(item, material, attributes, sourceResolved: materialResolved),
            ["hasSubobjectMaterials"] = item.HasSubobjectMaterials,
            ["instancePath"] = new JsonArray(instancePath.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
            ["instanceTransforms"] = Matrices(transforms),
            ["instanceTransformOrder"] = "rhino-explode-piece-order",
            ["worldBoundsAccuracy"] = "estimated",
        };
        if (bounds.IsValid)
            part["worldBounds"] = new JsonObject { ["min"] = Point(bounds.Min), ["max"] = Point(bounds.Max) };
        parts.Add(part);

        foreach (var component in item.SubobjectMaterialComponents.Take(100))
        {
            if (parts.Count >= limit) { truncated = true; break; }
            Material? faceMaterial;
            try { faceMaterial = item.GetMaterial(component, Guid.Empty, attributes); }
            catch { faceMaterial = null; }
            parts.Add(new JsonObject
            {
                ["id"] = $"{id}/component:{component.ComponentIndexType}:{component.Index}",
                ["parentId"] = id,
                ["name"] = $"{item.Name ?? item.Id.ToString()} \u00b7 {component.ComponentIndexType} {component.Index}",
                ["type"] = component.ComponentIndexType.ToString(),
                ["kind"] = "subobject",
                ["layer"] = layer?.FullPath,
                ["layerId"] = layer?.Id.ToString(),
                ["materialSource"] = attributes.MaterialSource.ToString(),
                ["hidden"] = attributes.Mode == ObjectMode.Hidden,
                ["globallyVisible"] = attributes.Visible && attributes.Mode != ObjectMode.Hidden && layer?.IsVisible == true,
                ["material"] = MaterialInfo(item, faceMaterial, attributes, component, faceMaterial != null || materialResolved),
                ["componentIndex"] = component.Index,
                ["componentType"] = component.ComponentIndexType.ToString(),
                ["instancePath"] = new JsonArray(instancePath.Select(value => (JsonNode?)JsonValue.Create(value)).ToArray()),
                ["instanceTransforms"] = Matrices(transforms),
                ["instanceTransformOrder"] = "rhino-explode-piece-order",
            });
        }
    }
    private static int EstimateExpandedParts(InstanceObject instance, int cap, HashSet<Guid> ancestors, int depth = 0)
    {
        if (depth >= 8 || instance.InstanceDefinition is not { } definition || !ancestors.Add(definition.Id)) return 0;
        var count = 0;
        foreach (var child in definition.GetObjects())
        {
            count += 1 + child.SubobjectMaterialComponents.Take(100).Count();
            if (child is InstanceObject nested) count += EstimateExpandedParts(nested, cap - count, new HashSet<Guid>(ancestors), depth + 1);
            if (count > cap) return count;
        }
        return count;
    }

    private static void AddSelectedPart(RhinoDoc doc, RhinoObject selected, JsonArray parts, int limit, ref bool truncated)
    {
        var rootId = $"object:{selected.Id}";
        if (selected is not InstanceObject instance)
        {
            AddPart(doc, selected, selected.Attributes, rootId, null, [], [], parts, limit, ref truncated);
            return;
        }

        AddPart(doc, selected, selected.Attributes, rootId, null, [], [instance.InstanceXform], parts, limit, ref truncated);
        var root = parts[parts.Count - 1]!.AsObject();
        root["kind"] = "instance";
        root["definitionPartsExpanded"] = false;
        if (parts.Count >= limit) { truncated = true; return; }
        var remaining = limit - parts.Count;
        if (EstimateExpandedParts(instance, remaining, new HashSet<Guid>()) > remaining)
        {
            root["definitionExpansionSkipped"] = "part-limit";
            truncated = true;
            return;
        }

        RhinoObject[] pieces;
        ObjectAttributes[] attributes;
        Transform[] transforms;
        try { instance.Explode(true, out pieces, out attributes, out transforms); }
        catch (Exception error)
        {
            root["definitionExpansionError"] = error.Message[..Math.Min(error.Message.Length, 300)];
            truncated = true;
            return;
        }
        root["definitionPartsExpanded"] = true;
        var definitionName = instance.InstanceDefinition?.Name ?? "block";
        var occurrences = new Dictionary<Guid, int>();
        for (var index = 0; index < pieces.Length; index++)
        {
            if (parts.Count >= limit) { truncated = true; break; }
            var sourceId = attributes[index].ObjectId != Guid.Empty ? attributes[index].ObjectId : pieces[index].Id;
            var occurrence = occurrences.GetValueOrDefault(sourceId);
            occurrences[sourceId] = occurrence + 1;
            var partPath = new[] { $"{definitionName}#{instance.Id}", $"object:{sourceId}" };
            if (occurrence > 0) partPath[1] += $"#{occurrence}";
            var partTransform = transforms[index].IsIdentity ? Array.Empty<Transform>() : new[] { transforms[index] };
            AddPart(doc, pieces[index], attributes[index], $"{rootId}/object:{sourceId}{(occurrence > 0 ? $"#{occurrence}" : "")}", rootId, partPath,
                partTransform, parts, limit, ref truncated);
        }
    }

    private static JsonNode ContextFor(RhinoDoc doc)
    {
        var vp = doc.Views.ActiveView?.ActiveViewport;
        var selection = doc.Objects.GetSelectedObjects(false, false).Cast<RhinoObject>().Take(200).ToArray();
        return new JsonObject
        {
            ["documentId"] = doc.RuntimeSerialNumber, ["name"] = doc.Name ?? "Untitled Rhino document",
            ["rhinoVersion"] = RhinoApp.Version.ToString(), ["rhinoMajorVersion"] = RhinoApp.Version.Major, ["rhinoMinorVersion"] = RhinoApp.Version.Minor,
            ["units"] = doc.ModelUnitSystem.ToString(), ["modified"] = doc.Modified,
            ["selection"] = new JsonArray(selection.Select(item => (JsonNode)ObjectInfo(doc, item)).ToArray()),
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
        var id = args["documentId"]?.GetValue<uint>() ?? throw new ArgumentException("Missing Rhino document ID");
        return OnUi(id, doc =>
        {
            if (name == "rhino_get_context") return ContextFor(doc);
            if (name == "rhino_list_parts") return PartsFor(doc, limit: args["limit"]?.GetValue<int>() ?? 100);
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
                var view = doc.Views.ActiveView ?? throw new InvalidOperationException("Rhino has no active view");
                var size = view.ActiveViewport.Size;
                var scale = Math.Min(1d, 1600d / Math.Max(size.Width, size.Height));
                var width = Math.Max(1, (int)Math.Round(size.Width * scale));
                var height = Math.Max(1, (int)Math.Round(size.Height * scale));
                var includeMask = args["includeMask"]?.GetValue<bool>() == true;
                var forceShaded = args["shaded"]?.GetValue<bool>() == true;
                var forceRendered = args["rendered"]?.GetValue<bool>() == true;
                var maskLayer = args["maskLayer"]?.GetValue<string>();
                if (string.Equals(maskLayer, "selection", StringComparison.OrdinalIgnoreCase)) maskLayer = null;
                var captures = CaptureViewAndOptionalMask(doc, view, width, height, includeMask, maskLayer, forceShaded, forceRendered);
                using var bitmap = captures.Viewport;
                using var buffer = new MemoryStream();
                bitmap.Save(buffer, ImageFormat.Png);
                var result = new JsonObject
                {
                    ["imageData"] = Convert.ToBase64String(buffer.ToArray()), ["mimeType"] = "image/png",
                    ["width"] = bitmap.Width, ["height"] = bitmap.Height, ["context"] = ContextFor(doc),
                    ["maskIncluded"] = includeMask,
                    ["captureMode"] = forceRendered ? "rendered" : (forceShaded || includeMask ? "shaded" : "current"),
                    ["capturePipeline"] = "raster", ["captureValidated"] = true,
                };
                if (captures.Mask is { } mask)
                {
                    using (mask)
                    using (var maskBuffer = new MemoryStream())
                    {
                        mask.Save(maskBuffer, ImageFormat.Png);
                        result["maskImageData"] = Convert.ToBase64String(maskBuffer.ToArray());
                        result["maskMimeType"] = "image/png";
                        result["maskWidth"] = mask.Width;
                        result["maskHeight"] = mask.Height;
                        result["maskSemantics"] = "transparent-captured-geometry";
                        result["maskSourceLayer"] = maskLayer;
                    }
                }
                return result;
            }
            throw new ArgumentException("Beta session requires a valid Rhino document");
        });
    }
}
