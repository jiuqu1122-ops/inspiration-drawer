param(
    [string]$RhinoSystemDir,
    [string]$OutputDirectory,
    [string]$Dotnet = 'dotnet',
    [switch]$SkipDesktop
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
if (-not $RhinoSystemDir) {
    $RhinoSystemDir = (Get-ItemProperty 'HKLM:/SOFTWARE/McNeel/Rhinoceros/9.0/Install' -ErrorAction SilentlyContinue).Path
    if (-not $RhinoSystemDir) { $RhinoSystemDir = Join-Path $env:ProgramFiles 'Rhino 9/System' }
}
if (-not (Test-Path -LiteralPath (Join-Path $RhinoSystemDir 'RhinoCommon.dll'))) { throw '请用 -RhinoSystemDir 指定 Rhino 9 的 System 目录' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'integrations/rhino/artifacts' }
$outputRoot = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$oldLocation = Get-Location
$betaConfigEnvironment = $env:TAURI_CONFIG
try {
    Set-Location $projectRoot
    & $Dotnet run -c Release --project integrations/rhino/Bridge.Tests/Bridge.Tests.csproj
    if ($LASTEXITCODE -ne 0) { throw 'Rhino 传输测试失败' }
    & $Dotnet build -c Release integrations/rhino/InspirationDrawer.Rhino/InspirationDrawer.Rhino.csproj "-p:RhinoSystemDir=$RhinoSystemDir"
    if ($LASTEXITCODE -ne 0) { throw 'Rhino 插件构建失败' }
    $pluginRoot = Join-Path $outputRoot 'plugin'
    $pluginFramework = Join-Path $pluginRoot 'net8.0'
    New-Item -ItemType Directory -Force -Path $pluginFramework | Out-Null
    Copy-Item -Path 'integrations/rhino/InspirationDrawer.Rhino/bin/Release/net8.0-windows/InspirationDrawer.Rhino.*' -Destination $pluginFramework
    @'
name: inspiration-drawer-rhino
version: 0.1.0-beta.1
authors:
  - Inspiration Drawer
description: Rhino 9 native Chat panel connected to Inspiration Drawer desktop Beta.
url: https://github.com/jiuqu1122-ops/inspiration-drawer
'@ | Set-Content -Encoding utf8 (Join-Path $pluginRoot 'manifest.yml')
    Copy-Item 'integrations/rhino/README.md' -Destination (Join-Path $outputRoot 'README.md')
    Set-Location $pluginRoot
    & (Join-Path $RhinoSystemDir 'Yak.exe') build --platform win
    if ($LASTEXITCODE -ne 0) { throw 'YAK 打包失败' }
    Get-ChildItem -LiteralPath $pluginRoot -Filter '*.yak' | Copy-Item -Destination $outputRoot
    Set-Location $projectRoot
    if (-not $SkipDesktop) {
        npm.cmd run test -- src/features/rhino src/features/chat/tools/chatToolRouter.test.ts
        if ($LASTEXITCODE -ne 0) { throw 'Chat 桥接测试失败' }
        npm.cmd run build
        if ($LASTEXITCODE -ne 0) { throw '前端构建失败' }
        $env:TAURI_CONFIG = Get-Content -Raw 'src-tauri/tauri.rhino-beta.conf.json'
        cargo build --manifest-path src-tauri/Cargo.toml --release --bin inspiration-drawer --locked --features tauri/custom-protocol
        if ($LASTEXITCODE -ne 0) { throw '桌面 Beta 构建失败' }
        $desktopRoot = Join-Path $outputRoot 'desktop'
        New-Item -ItemType Directory -Force -Path $desktopRoot | Out-Null
        Copy-Item 'src-tauri/target/release/inspiration-drawer.exe' -Destination $desktopRoot
        Copy-Item 'cloudflared.exe' -Destination $desktopRoot
    }
    Write-Output "Rhino Beta artifacts: $outputRoot"
}
finally {
    $env:TAURI_CONFIG = $betaConfigEnvironment
    Set-Location $oldLocation
}
