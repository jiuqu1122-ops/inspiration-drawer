param(
  [string]$Rhino8SystemDir,
  [string]$Rhino9SystemDir,
  [string]$Dotnet = 'dotnet'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
& node (Join-Path $PSScriptRoot 'build-rhino-panel.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Rhino panel bundle failed' }
foreach ($version in @(8,9)) {
  $system = if ($version -eq 8) { $Rhino8SystemDir } else { $Rhino9SystemDir }
  if (-not $system) { $system = (Get-ItemProperty "HKLM:/SOFTWARE/McNeel/Rhinoceros/$version.0/Install" -ErrorAction SilentlyContinue).Path }
  if (-not $system -or -not (Test-Path -LiteralPath (Join-Path $system 'RhinoCommon.dll'))) { throw "Rhino $version SDK is required. Pass -Rhino${version}SystemDir." }
  $system = $system.TrimEnd('\','/')
  $output = Join-Path $root "integrations/rhino/artifacts/embedded-$version"
  & $Dotnet build -c Release (Join-Path $root 'integrations/rhino/InspirationDrawer.Rhino/InspirationDrawer.Rhino.csproj') "-p:RhinoMajorVersion=$version" "-p:RhinoSystemDir=$system" -o $output
  if ($LASTEXITCODE -ne 0) { throw "Rhino $version plugin build failed" }
  $payload = Join-Path $root "src-tauri/resources/rhino/$version"
  New-Item -ItemType Directory -Path $payload -Force | Out-Null
  foreach ($name in @('InspirationDrawer.Rhino.rhp','InspirationDrawer.Rhino.deps.json','InspirationDrawer.Rhino.runtimeconfig.json','InspirationDrawer.Rhino.rui','InspirationDrawer.Rhino.svg')) {
    Copy-Item -LiteralPath (Join-Path $output $name) -Destination (Join-Path $payload $name) -Force
  }
  Get-FileHash -LiteralPath (Join-Path $payload 'InspirationDrawer.Rhino.rhp') -Algorithm SHA256
}
