param(
 [string]$RhinoSystemDir,
 [string]$Rhino8SystemDir,
 [string]$OutputDirectory,
 [string]$Dotnet='dotnet',
 [string]$YakDotnetRoot,
 [string]$RustToolchain,
 [string]$CargoTargetDirectory,
 [switch]$SkipDesktop,
 [switch]$SkipYak,
 [switch]$SkipInstaller
)
$ErrorActionPreference='Stop'
# Windows PowerShell turns native stderr (including ordinary Vite/Cargo
# warnings) into ErrorRecords. Continue collecting it, but fail on the actual
# process exit code rather than aborting a successful build on a warning.
function Invoke-BetaNativeCommand {
 param([string]$Executable, [string[]]$Arguments)
 $savedPreference=$ErrorActionPreference
 try {
  $ErrorActionPreference='Continue'
  & $Executable @Arguments
  $nativeExitCode=$LASTEXITCODE
 } finally {$ErrorActionPreference=$savedPreference}
 if ($nativeExitCode -ne 0) {throw "Native build command failed ($nativeExitCode): $Executable $($Arguments -join ' ')"}
}
$projectRoot=Split-Path $PSScriptRoot -Parent
if (-not $RhinoSystemDir) {
 $RhinoSystemDir=(Get-ItemProperty 'HKLM:/SOFTWARE/McNeel/Rhinoceros/9.0/Install' -ErrorAction SilentlyContinue).Path
 if (-not $RhinoSystemDir) {$RhinoSystemDir=Join-Path $env:ProgramFiles 'Rhino 9/System'}
}
if (-not (Test-Path -LiteralPath (Join-Path $RhinoSystemDir 'RhinoCommon.dll'))) {throw 'RhinoCommon.dll not found. Set -RhinoSystemDir.'}
if (-not $OutputDirectory) {$OutputDirectory=Join-Path $projectRoot 'integrations/rhino/artifacts'}
$outputRoot=[IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $outputRoot | Out-Null
$oldLocation=Get-Location
$oldTauriConfig=$env:TAURI_CONFIG
$oldRustToolchain=$env:RUSTUP_TOOLCHAIN
$oldCargoTargetDirectory=$env:CARGO_TARGET_DIR
try {
 Set-Location $projectRoot
 if ($RustToolchain) {$env:RUSTUP_TOOLCHAIN=$RustToolchain}
 if ($CargoTargetDirectory) {$env:CARGO_TARGET_DIR=[IO.Path]::GetFullPath($CargoTargetDirectory)}
 $cargoTargetRoot=if ($env:CARGO_TARGET_DIR) {[IO.Path]::GetFullPath($env:CARGO_TARGET_DIR)} else {Join-Path $projectRoot 'src-tauri/target'}
 Invoke-BetaNativeCommand -Executable 'python' -Arguments @('scripts/verify-rhino-panel-layout.py')
 Invoke-BetaNativeCommand -Executable 'node' -Arguments @('scripts/build-rhino-panel.mjs')
 Invoke-BetaNativeCommand -Executable $Dotnet -Arguments @('run','-c','Release','--project','integrations/rhino/Bridge.Tests/Bridge.Tests.csproj')
 # Refresh both embedded payloads before compiling the desktop EXE; this prevents
 # shipping a new desktop runtime with an old or missing installer payload.
 & (Join-Path $PSScriptRoot 'build-rhino-plugin-payload.ps1') -Rhino8SystemDir $Rhino8SystemDir -Rhino9SystemDir $RhinoSystemDir -Dotnet $Dotnet
 if ($LASTEXITCODE -ne 0) {throw 'Rhino 8/9 embedded payload build failed.'}
 $pluginRoot=Join-Path $outputRoot 'plugin'
 $pluginFramework=Join-Path $pluginRoot 'net8.0'
 New-Item -ItemType Directory -Force -Path $pluginFramework | Out-Null
 Copy-Item 'src-tauri/resources/rhino/9/InspirationDrawer.Rhino.*' $pluginFramework
 $rhino8PluginRoot=Join-Path $outputRoot 'plugin-rhino8/net7.0'
 New-Item -ItemType Directory -Force -Path $rhino8PluginRoot | Out-Null
 Copy-Item 'src-tauri/resources/rhino/8/InspirationDrawer.Rhino.*' $rhino8PluginRoot
 $manifest=@('name: inspiration-drawer-rhino','version: 0.1.0-beta.32','authors:','  - Inspiration Drawer','description: Rhino 8/9 Chat panel and toolbar button connected to Inspiration Drawer desktop Beta.','url: https://github.com/jiuqu1122-ops/inspiration-drawer') -join [Environment]::NewLine
 Set-Content -Encoding utf8 -Path (Join-Path $pluginRoot 'manifest.yml') -Value $manifest
 Set-Content -Encoding utf8 -Path (Join-Path $outputRoot 'plugin-rhino8/manifest.yml') -Value $manifest
 Copy-Item 'integrations/rhino/README.md' (Join-Path $outputRoot 'README.md')
 $yakPath=Join-Path $RhinoSystemDir 'Yak.exe'
 if (-not $SkipYak -and (Test-Path -LiteralPath $yakPath)) {
  Set-Location $pluginRoot
  $savedDotnetRoot=$env:DOTNET_ROOT
  $savedPath=$env:PATH
  try {
   if ($YakDotnetRoot) {$env:DOTNET_ROOT=$YakDotnetRoot;$env:PATH="$YakDotnetRoot;$savedPath"}
   Invoke-BetaNativeCommand -Executable $yakPath -Arguments @('build','--platform','win')
  } finally {$env:DOTNET_ROOT=$savedDotnetRoot;$env:PATH=$savedPath}
  Get-ChildItem $pluginRoot -Filter '*.yak' | Copy-Item -Destination $outputRoot
  Set-Location $projectRoot
 } elseif (-not $SkipYak) {Write-Warning 'Yak.exe not found; the RHP plugin will still be delivered.'}
 if (-not $SkipDesktop) {
  Invoke-BetaNativeCommand -Executable 'npm.cmd' -Arguments @('run','test','--','src/features/rhino','src/features/chat/tools/chatToolRouter.test.ts')
  Invoke-BetaNativeCommand -Executable 'npm.cmd' -Arguments @('run','build')
  $env:TAURI_CONFIG=Get-Content -Raw 'src-tauri/tauri.rhino-beta.conf.json'
  Invoke-BetaNativeCommand -Executable 'cargo' -Arguments @('build','--manifest-path','src-tauri/Cargo.toml','--release','--bin','inspiration-drawer','--locked','--features','tauri/custom-protocol')
  $desktopRoot=Join-Path $outputRoot 'desktop'
  New-Item -ItemType Directory -Force -Path $desktopRoot | Out-Null
  Copy-Item -LiteralPath (Join-Path $cargoTargetRoot 'release/inspiration-drawer.exe') -Destination $desktopRoot
  Copy-Item 'cloudflared.exe' $desktopRoot
  if (-not $SkipInstaller) {
   # The verified cargo build above already produced this frontend/binary.
   # Bundle that exact binary instead of triggering a second release compile.
   $env:TAURI_CONFIG=$null
   Invoke-BetaNativeCommand -Executable 'npm.cmd' -Arguments @('exec','tauri','--','bundle','--config','src-tauri/tauri.rhino-beta.conf.json','--bundles','nsis','--ci','--no-sign')
   $bundleRoot=Join-Path $cargoTargetRoot 'release/bundle/nsis'
   $installer=Get-ChildItem $bundleRoot -Filter '*.exe' | Sort-Object LastWriteTime -Descending | Select-Object -First 1
   if (-not $installer) {throw 'NSIS build returned no installer.'}
   Copy-Item $installer.FullName $outputRoot
   # NSIS patches bundle metadata into the EXE. Deliver that exact final binary,
   # not the earlier cargo-only build or an intermediate portable payload.
   Copy-Item -LiteralPath (Join-Path $cargoTargetRoot 'release/inspiration-drawer.exe') -Destination $desktopRoot
  }
 }
 Write-Output "Beta build artifacts: $outputRoot"
} finally {$env:TAURI_CONFIG=$oldTauriConfig;$env:RUSTUP_TOOLCHAIN=$oldRustToolchain;$env:CARGO_TARGET_DIR=$oldCargoTargetDirectory;Set-Location $oldLocation}