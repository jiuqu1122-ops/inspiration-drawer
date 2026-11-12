$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$version = $env:DRAWER_RHINO_VERSION
if ($version -notin @('8','9')) { throw 'Unsupported Rhino version' }
$target = $env:DRAWER_RHINO_PLUGIN
if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or [IO.Path]::GetFileName($target) -ne 'InspirationDrawer.Rhino.rhp') { throw 'Invalid Rhino plugin payload' }
$guid = 'b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5'
$root = "SOFTWARE\McNeel\Rhinoceros\$version.0\Plug-Ins\$guid"
$previousRegistration = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("$root\PlugIn")
$previous = $null
if ($previousRegistration) { try { $previous = $previousRegistration.GetValue('FileName',$null) } finally { $previousRegistration.Dispose() } }
$backup = Join-Path ([IO.Path]::GetDirectoryName($target)) ('previous-registration-' + [DateTime]::UtcNow.Ticks + '.json')
@{version=$version;previousPluginPath=$previous;installedPluginPath=$target} | ConvertTo-Json | Set-Content -LiteralPath $backup -Encoding UTF8
$parent = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($root)
try {
  $parent.SetValue('Name','InspirationDrawer.Rhino',[Microsoft.Win32.RegistryValueKind]::String)
  $parent.SetValue('EnglishName','InspirationDrawer.Rhino',[Microsoft.Win32.RegistryValueKind]::String)
  $parent.SetValue('Type',16,[Microsoft.Win32.RegistryValueKind]::DWord)
  $parent.SetValue('IsDotNETPlugIn',1,[Microsoft.Win32.RegistryValueKind]::DWord)
  $parent.SetValue('LoadMode',1,[Microsoft.Win32.RegistryValueKind]::DWord)
} finally { $parent.Dispose() }
$commands = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("$root\CommandList")
try { $commands.SetValue('InspirationDrawer','2;InspirationDrawer',[Microsoft.Win32.RegistryValueKind]::String) } finally { $commands.Dispose() }
$plugin = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey("$root\PlugIn")
try {
  $plugin.SetValue('FileName',$target,[Microsoft.Win32.RegistryValueKind]::String)
  if ($plugin.GetValue('FileName','') -ne $target) { throw 'Rhino registration verification failed' }
} finally { $plugin.Dispose() }
'{"registered":true}'
