$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
if ([string]::IsNullOrWhiteSpace($env:DRAWER_RHINO_REGISTRATIONS)) { throw 'No detected Rhino registrations were provided' }
$registrations = ConvertFrom-Json -InputObject $env:DRAWER_RHINO_REGISTRATIONS
if ($registrations.Count -lt 1) { throw 'No detected Rhino registrations were provided' }
$seen = @{}
$plans = @()
$snapshots = @()
foreach ($registration in $registrations) {
  $version = [string]$registration.version
  if ($version -notin @('8','9') -or $seen.ContainsKey($version)) { throw "Unsupported or duplicate Rhino version: $version" }
  $seen[$version] = $true
  $target = [string]$registration.pluginPath
  if (-not (Test-Path -LiteralPath $target -PathType Leaf) -or [IO.Path]::GetFileName($target) -ne 'InspirationDrawer.Rhino.rhp') { throw "Invalid Rhino $version plugin payload: $target" }
  $guid = 'b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5'
  $root = "SOFTWARE\McNeel\Rhinoceros\$version.0\Plug-Ins\$guid"
  $plans += [pscustomobject]@{ version=$version; target=$target; root=$root; commandKeyPath="$root\CommandList"; pluginKeyPath="$root\PlugIn" }
}
function Read-RegistrySnapshot([string]$keyPath, [string]$name) {
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($keyPath)
  if (-not $key) { return [pscustomobject]@{ keyPath=$keyPath; name=$name; exists=$false; value=$null; kind=$null } }
  try {
    if ($key.GetValueNames() -notcontains $name) { return [pscustomobject]@{ keyPath=$keyPath; name=$name; exists=$false; value=$null; kind=$null } }
    return [pscustomobject]@{ keyPath=$keyPath; name=$name; exists=$true; value=$key.GetValue($name); kind=$key.GetValueKind($name) }
  } finally { $key.Dispose() }
}
function Restore-RegistrySnapshot($snapshot) {
  $key = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($snapshot.keyPath)
  if (-not $key) { throw "Could not reopen registry key $($snapshot.keyPath)" }
  try {
    if ($snapshot.exists) { $key.SetValue($snapshot.name, $snapshot.value, $snapshot.kind) }
    else { $key.DeleteValue($snapshot.name, $false) }
  } finally { $key.Dispose() }
}
foreach ($plan in $plans) {
  $backup = Join-Path ([IO.Path]::GetDirectoryName($plan.target)) ('previous-registration-' + [DateTime]::UtcNow.Ticks + '.json')
  $key = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($plan.pluginKeyPath)
  $previous = $null
  if ($key) { try { $previous = $key.GetValue('FileName',$null) } finally { $key.Dispose() } }
  @{version=$plan.version;previousPluginPath=$previous;installedPluginPath=$plan.target} | ConvertTo-Json | Set-Content -LiteralPath $backup -Encoding UTF8
  foreach ($value in @(
    @{keyPath=$plan.root;name='Name'},
    @{keyPath=$plan.root;name='EnglishName'},
    @{keyPath=$plan.root;name='Type'},
    @{keyPath=$plan.root;name='IsDotNETPlugIn'},
    @{keyPath=$plan.root;name='LoadMode'},
    @{keyPath=$plan.commandKeyPath;name='InspirationDrawer'},
    @{keyPath=$plan.pluginKeyPath;name='FileName'}
  )) { $snapshots += Read-RegistrySnapshot $value.keyPath $value.name }
}
try {
  foreach ($plan in $plans) {
    $parent = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($plan.root)
    if (-not $parent) { throw "Could not open Rhino $($plan.version) plugin registry key" }
    try {
      $parent.SetValue('Name','InspirationDrawer.Rhino',[Microsoft.Win32.RegistryValueKind]::String)
      $parent.SetValue('EnglishName','InspirationDrawer.Rhino',[Microsoft.Win32.RegistryValueKind]::String)
      $parent.SetValue('Type',16,[Microsoft.Win32.RegistryValueKind]::DWord)
      $parent.SetValue('IsDotNETPlugIn',1,[Microsoft.Win32.RegistryValueKind]::DWord)
      $parent.SetValue('LoadMode',1,[Microsoft.Win32.RegistryValueKind]::DWord)
    } finally { $parent.Dispose() }
    $commands = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($plan.commandKeyPath)
    if (-not $commands) { throw "Could not create Rhino $($plan.version) command registry key" }
    try {
      $commands.SetValue('InspirationDrawer','2;InspirationDrawer',[Microsoft.Win32.RegistryValueKind]::String)
      if ($commands.GetValue('InspirationDrawer','') -ne '2;InspirationDrawer') {
        throw "Rhino $($plan.version) command verification failed"
      }
    } finally { $commands.Dispose() }
    $plugin = [Microsoft.Win32.Registry]::CurrentUser.CreateSubKey($plan.pluginKeyPath)
    if (-not $plugin) { throw "Could not create Rhino $($plan.version) plugin registration key" }
    try {
      $plugin.SetValue('FileName',$plan.target,[Microsoft.Win32.RegistryValueKind]::String)
      if ($plugin.GetValue('FileName','') -ne $plan.target -or $plugin.GetValueKind('FileName') -ne [Microsoft.Win32.RegistryValueKind]::String) {
        throw "Rhino $($plan.version) plugin path verification failed"
      }
    } finally { $plugin.Dispose() }
    $verify = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($plan.root)
    try {
      if (-not $verify -or $verify.GetValue('LoadMode',0) -ne 1 -or $verify.GetValue('IsDotNETPlugIn',0) -ne 1) {
        throw "Rhino $($plan.version) load settings verification failed"
      }
    } finally { if ($verify) { $verify.Dispose() } }
  }
} catch {
  $failure = $_.Exception.Message
  $rollbackErrors = @()
  for ($index = $snapshots.Count - 1; $index -ge 0; $index--) {
    try { Restore-RegistrySnapshot $snapshots[$index] }
    catch { $rollbackErrors += $_.Exception.Message }
  }
  if ($rollbackErrors.Count -gt 0) {
    throw "Registration failed: $failure. Registration rollback incomplete: $($rollbackErrors -join '; '). Previous paths are recorded alongside the prepared payloads."
  }
  throw "Registration failed; all touched current-user registry values were restored: $failure"
}
'{"registered":true}'
