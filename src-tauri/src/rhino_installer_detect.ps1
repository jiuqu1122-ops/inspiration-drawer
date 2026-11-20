$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$guid = 'b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5'
$items = @()
function Get-RhinoExecutableMajor([string]$path) {
  try { return [Diagnostics.FileVersionInfo]::GetVersionInfo($path).FileMajorPart }
  catch { return 0 }
}
function Find-RhinoExecutable($installKey, [int]$expectedMajor) {
  $candidates = @()
  $exe = [string]$installKey.GetValue('ExePath','')
  if (-not [string]::IsNullOrWhiteSpace($exe)) { $candidates += $exe }
  $directory = [string]$installKey.GetValue('Path','')
  if (-not [string]::IsNullOrWhiteSpace($directory)) { $candidates += Join-Path $directory 'Rhino.exe' }
  foreach ($candidate in $candidates) {
    if ((Test-Path -LiteralPath $candidate -PathType Leaf -ErrorAction SilentlyContinue) -and
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
$processes = @()
foreach ($process in @(Get-Process -Name Rhino -ErrorAction SilentlyContinue)) {
  $processPath = $null
  try { $processPath = $process.Path } catch { }
  $processes += [pscustomobject]@{ Id=$process.Id; Path=$processPath }
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
  if (-not $path) { continue }
  $pluginRoot = "SOFTWARE\McNeel\Rhinoceros\$version.0\Plug-Ins\$guid"
  $installed = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("$pluginRoot\PlugIn")
  $plugin = $null
  if ($installed) { try { $plugin = $installed.GetValue('FileName',$null) } finally { $installed.Dispose() } }
  $pluginSettings = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey($pluginRoot)
  $loadMode = $null
  if ($pluginSettings) { try { $loadMode = $pluginSettings.GetValue('LoadMode',$null) } finally { $pluginSettings.Dispose() } }
  $protectionKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("SOFTWARE\McNeel\Rhinoceros\$version.0\Global Settings\Plug-ins\$guid")
  $loadProtection = $null
  if ($protectionKey) { try { $loadProtection = $protectionKey.GetValue('LoadProtection',$null) } finally { $protectionKey.Dispose() } }
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
  $items += [ordered]@{majorVersion=$version;exePath=$path;running=$running;runningStateUncertain=$runningStateUncertain;runtimeModes=$runtimeModes;runningAsCurrentUser=$runningAsCurrentUser;pluginPath=$plugin;loadMode=$loadMode;loadProtection=$loadProtection;installed=$false}
}
ConvertTo-Json -InputObject @($items) -Depth 4 -Compress
