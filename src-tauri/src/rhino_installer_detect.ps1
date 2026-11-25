$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$guid = 'b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5'
$items = @()
function Get-RhinoExecutableMajor([string]$path) {
  try { return [Diagnostics.FileVersionInfo]::GetVersionInfo($path).FileMajorPart }
  catch { return 0 }
}
function Find-RhinoExecutable($installKey, [int]$expectedMajor, [string[]]$fallbackPaths = @()) {
  $candidates = @()
  if ($installKey) {
    $exe = [string]$installKey.GetValue('ExePath','')
    if (-not [string]::IsNullOrWhiteSpace($exe)) { $candidates += $exe }
    $directory = [string]$installKey.GetValue('Path','')
    if (-not [string]::IsNullOrWhiteSpace($directory)) {
      $candidates += Join-Path $directory 'Rhino.exe'
      $candidates += Join-Path $directory 'System\Rhino.exe'
    }
  }
  $candidates += $fallbackPaths
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf -ErrorAction SilentlyContinue) -and
        (Get-RhinoExecutableMajor $candidate) -eq $expectedMajor) {
      return [IO.Path]::GetFullPath($candidate)
    }
  }
  return $null
}
function Get-RhinoRuntimeMode([string[]]$moduleNames) {
  $core = $moduleNames -contains 'coreclr.dll'
  $framework = $moduleNames -contains 'clr.dll'
  if ($core -and $framework) { return 'mixed' }
  if ($core) { return 'netcore' }
  if ($framework) { return 'netfx' }
  return 'unknown'
}
function Get-RhinoPluginLoadState($process, [string]$pluginPath) {
  if (-not $process.Started -or -not $pluginPath -or -not $env:LOCALAPPDATA) { return 'awaiting' }
  $log = Join-Path $env:LOCALAPPDATA "InspirationDrawer\RhinoBeta\startup-$($process.Id).log"
  $state = 'awaiting'
  foreach ($line in @(Get-Content -LiteralPath $log -Tail 64 -Encoding UTF8 -ErrorAction SilentlyContinue)) {
    try {
      $record = ConvertFrom-Json -InputObject $line -ErrorAction Stop
      if ($record.phase -notin @('plugin.load.completed','plugin.load.failed','plugin.shutdown')) { continue }
      if ([DateTimeOffset]::Parse([string]$record.at) -lt $process.Started) { continue }
      if (-not [string]::Equals([string]$record.assembly,$pluginPath,[StringComparison]::OrdinalIgnoreCase)) { continue }
      $state = switch ($record.phase) {
        'plugin.load.completed' { 'loaded' }
        'plugin.load.failed' { 'failed' }
        default { 'awaiting' }
      }
    } catch { }
  }
  return $state
}
$processes = @()
foreach ($process in @(Get-Process -Name Rhino -ErrorAction SilentlyContinue)) {
  $processPath = $null
  $started = $null
  try { $processPath = $process.Path } catch { }
  try { $started = [DateTimeOffset]$process.StartTime } catch { }
  $processes += [pscustomobject]@{ Id=$process.Id; Path=$processPath; Started=$started }
}
foreach ($version in @(8,9)) {
  $path = $null
  foreach ($hive in @([Microsoft.Win32.Registry]::LocalMachine,[Microsoft.Win32.Registry]::CurrentUser)) {
    $key = $hive.OpenSubKey("SOFTWARE\McNeel\Rhinoceros\$version.0\Install")
    if ($key) {
      try {
        $candidate = Find-RhinoExecutable $key $version
        if ($candidate) { $path = $candidate; break }
      } finally { $key.Dispose() }
    }
  }
  if (-not $path) {
    $fallbacks = @($processes | Where-Object Path | ForEach-Object { $_.Path })
    foreach ($programFiles in @($env:ProgramW6432, $env:ProgramFiles) | Where-Object { $_ } | Select-Object -Unique) {
      $fallbacks += Join-Path $programFiles "Rhino $version\System\Rhino.exe"
    }
    $path = Find-RhinoExecutable $null $version $fallbacks
  }
  if (-not $path) { continue }
  $pluginRoot = "SOFTWARE\McNeel\Rhinoceros\$version.0\Plug-Ins\$guid"
  $installed = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("$pluginRoot\PlugIn")
  $plugin = $null
  if ($installed) { try { $plugin = $installed.GetValue('FileName',$null) } finally { $installed.Dispose() } }
  $pluginSettings = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($pluginRoot)
  $loadMode = $null
  if ($pluginSettings) { try { $loadMode = $pluginSettings.GetValue('LoadMode',$null) } finally { $pluginSettings.Dispose() } }
  $commandRegistered = $false
  $commandKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("$pluginRoot\CommandList")
  if ($commandKey) {
    try { $commandRegistered = $commandKey.GetValue('InspirationDrawer','') -eq '2;InspirationDrawer' }
    finally { $commandKey.Dispose() }
  }
  $loadProtection = $null
  foreach ($protectionBranch in @('Global Options','Global Settings')) {
    $protectionKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("SOFTWARE\McNeel\Rhinoceros\$version.0\$protectionBranch\Plug-ins\$guid")
    if (-not $protectionKey) { continue }
    try { $rawProtection = $protectionKey.GetValue('LoadProtection',$null) } finally { $protectionKey.Dispose() }
    $protectionValue = [uint32]0
    if ([uint32]::TryParse([string]$rawProtection,[ref]$protectionValue)) {
      $loadProtection = $protectionValue
      break
    }
  }
  $uncertainProcesses = @($processes | Where-Object { -not $_.Path })
  $matchingProcesses = @($processes | Where-Object { -not $_.Path -or [string]::Equals($_.Path,$path,[StringComparison]::OrdinalIgnoreCase) })
  # Inaccessible/elevated Rhino processes must defer file cleanup rather than look closed.
  $running = $matchingProcesses.Count -gt 0
  $runningStateUncertain = $uncertainProcesses.Count -gt 0
  $runningAsCurrentUser = $null
  $runtimeModes = @()
  foreach ($process in $matchingProcesses) {
    try {
      $modules = @((Get-Process -Id $process.Id -ErrorAction Stop).Modules | ForEach-Object { $_.ModuleName })
      $runtimeModes += Get-RhinoRuntimeMode $modules
    } catch { $runtimeModes += 'unknown' }
  }
  $runtimeModes = @($runtimeModes | Select-Object -Unique)
  if ($running) {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $ownersChecked = 0
    $sameUser = $false
    foreach ($process in $matchingProcesses) {
      try {
        $instance = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($process.Id)" -OperationTimeoutSec 3 -ErrorAction Stop
        $owner = Invoke-CimMethod -InputObject $instance -MethodName GetOwnerSid -ErrorAction Stop
        if ($owner.ReturnValue -eq 0 -and $owner.Sid) {
          $ownersChecked++
          if ([string]::Equals([string]$owner.Sid,$currentIdentity,[StringComparison]::OrdinalIgnoreCase)) { $sameUser = $true }
        }
      } catch { }
    }
    if ($sameUser) { $runningAsCurrentUser = $true }
    elseif ($ownersChecked -eq $matchingProcesses.Count) { $runningAsCurrentUser = $false }
  }
  $loadStates = @($matchingProcesses | Where-Object Path | ForEach-Object { Get-RhinoPluginLoadState $_ $plugin })
  $pluginLoadState = if ($loadStates -contains 'failed') { 'failed' } elseif ($loadStates -contains 'loaded') { 'loaded' } else { 'awaiting' }
  $items += [ordered]@{majorVersion=$version;exePath=$path;running=$running;runningStateUncertain=$runningStateUncertain;runtimeModes=$runtimeModes;runningAsCurrentUser=$runningAsCurrentUser;pluginPath=$plugin;loadMode=$loadMode;loadProtection=$loadProtection;commandRegistered=$commandRegistered;pluginLoadState=$pluginLoadState;installed=$false}
}
ConvertTo-Json -InputObject @($items) -Depth 4 -Compress
