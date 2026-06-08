# Inspiration Drawer Native WinUI

This folder is the native Windows rewrite track for Inspiration Drawer.

The existing Tauri app remains intact in the repository root. This WinUI project starts as a parallel shell so the native rewrite can move gradually without breaking the current release.

## Tooling

Install these before building:

- Visual Studio 2022 with `.NET desktop development`
- Windows App SDK / WinUI project support
- .NET 8 SDK

Current local verification:

- The user-level SDK at `C:\Users\Administrator\.dotnet\dotnet.exe` reports .NET SDK `8.0.421`.
- `C:\Program Files\dotnet\dotnet.exe` is still earlier on `PATH` and reports no SDKs, so use the user-level `dotnet.exe` explicitly if the shell has not refreshed.
- `C:\Users\Administrator\.dotnet\dotnet.exe build InspirationDrawer.Native.sln -p:Configuration=Debug -p:Platform=x64` succeeds with 0 warnings and 0 errors.
- `msbuild` is not available on `PATH` in this environment.

So the migration code can compile from the command line when launched through the user-level SDK.

## Build

Open `InspirationDrawer.Native.sln` in Visual Studio and build `x64`.

After .NET SDK is installed, command-line builds should also work from this folder:

```powershell
& "$env:USERPROFILE\.dotnet\dotnet.exe" build InspirationDrawer.Native.sln -p:Configuration=Debug -p:Platform=x64
```

## Migration Plan

1. Native window shell and Fluent layout.
2. Read existing drawer data files from the same app data location.
3. Rebuild the drawer rail and image grid.
4. Add native text/file import that writes back to the same `drawer_items.json`.
5. Add native folder create/rename/delete and item move/delete workflows.
6. Rebuild infinite canvas with native pointer, scroll, zoom, and item layout.
7. Move AI image generation and local cache workflows.
8. Move desktop notes, screenshots, global shortcuts, and tray/edge trigger.

## Existing Data to Reuse

The Tauri app currently stores user data under the app data folder for `com.inspirationdrawer.app`. The native app should first read the same JSON files so users can migrate without exporting:

- `drawer_items.json`
- `drawer_folders.json`
- `web_image_cache_dir.txt`
- floating note state files and labels

The current milestone is a native drawer view backed by those files, with text/file import, folder editing, item move/delete, JSON write-back, and a first interactive native canvas pass with image nodes, drag positioning, zoom, fit-to-content, and double-click open.
