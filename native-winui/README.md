# Inspiration Drawer Native WinUI

This folder is the native Windows rewrite track for Inspiration Drawer.

The existing Tauri app remains intact in the repository root. This WinUI project starts as a parallel shell so the native rewrite can move gradually without breaking the current release.

## Tooling

Install these before building:

- Visual Studio 2022 with `.NET desktop development`
- Windows App SDK / WinUI project support
- .NET 8 SDK

Current local verification:

- Visual Studio Build Tools 2022 is installed.
- `dotnet --info` reports no .NET SDKs, only runtimes.
- `msbuild InspirationDrawer.Native.sln /restore /p:Configuration=Debug /p:Platform=x64` fails with `MSB4236: The SDK 'Microsoft.NET.Sdk' specified could not be found.`

So the skeleton is in place, but this machine needs the .NET SDK / WinUI build workload before it can compile.

## Build

Open `InspirationDrawer.Native.sln` in Visual Studio and build `x64`.

After .NET SDK is installed, command-line builds should also work from this folder:

```powershell
msbuild InspirationDrawer.Native.sln /p:Configuration=Debug /p:Platform=x64
```

## Migration Plan

1. Native window shell and Fluent layout.
2. Read existing drawer data files from the same app data location.
3. Rebuild the drawer rail and image grid.
4. Rebuild infinite canvas with native pointer, scroll, zoom, and item layout.
5. Move AI image generation and local cache workflows.
6. Move desktop notes, screenshots, global shortcuts, and tray/edge trigger.

## Existing Data to Reuse

The Tauri app currently stores user data under the app data folder for `com.inspirationdrawer.app`. The native app should first read the same JSON files so users can migrate without exporting:

- `drawer_items.json`
- `drawer_folders.json`
- `web_image_cache_dir.txt`
- floating note state files and labels

The first real migration milestone is a read-only native drawer view backed by those files.
