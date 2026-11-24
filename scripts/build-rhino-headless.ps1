param([string]$Dotnet = 'dotnet')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
foreach ($major in @(9,8)) {
  $system = (Get-ItemProperty "HKLM:/SOFTWARE/McNeel/Rhinoceros/$major.0/Install").Path.TrimEnd('\','/')
  if (!(Test-Path -LiteralPath (Join-Path $system 'RhinoCommon.dll'))) { throw "Rhino $major SDK is not installed." }
  $compiled = Join-Path $root "integrations/rhino/artifacts/headless-$major"
  & $Dotnet build -c Release (Join-Path $root 'integrations/rhino/Headless/Headless.csproj') "-p:RhinoMajorVersion=$major" "-p:RhinoSystemDir=$system" -o $compiled
  if ($LASTEXITCODE -ne 0) { throw "Rhino $major headless host did not build." }
  $dest = Join-Path $root "src-tauri/resources/rhino-headless/$major"
  New-Item -ItemType Directory -Path $dest -Force | Out-Null
  foreach ($name in @('InspirationDrawer.Rhino.Headless.exe','InspirationDrawer.Rhino.Headless.dll','InspirationDrawer.Rhino.Headless.deps.json','InspirationDrawer.Rhino.Headless.runtimeconfig.json','Rhino.Inside.dll')) {
    Copy-Item -LiteralPath (Join-Path $compiled $name) -Destination $dest -Force
  }
}
