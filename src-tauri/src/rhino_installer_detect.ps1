$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$guid = 'b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5'
$items = @()
$processes = @(Get-Process -Name Rhino -ErrorAction SilentlyContinue)
foreach ($version in @(8,9)) {
  $path = $null
  foreach ($hive in @([Microsoft.Win32.Registry]::LocalMachine,[Microsoft.Win32.Registry]::CurrentUser)) {
    $key = $hive.OpenSubKey("SOFTWARE\McNeel\Rhinoceros\$version.0\Install")
    if ($key) {
      try {
        $candidate = [string]$key.GetValue('ExePath','')
        if (-not $candidate) { $candidate = Join-Path ([string]$key.GetValue('Path','')) 'Rhino.exe' }
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { $path = $candidate; break }
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
  $matchingProcesses = @($processes | Where-Object { $_.Path -and [string]::Equals($_.Path,$path,[StringComparison]::OrdinalIgnoreCase) })
  $running = $matchingProcesses.Count -gt 0
  $runningAsCurrentUser = $null
  if ($running) {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    $ownersChecked = 0
    $sameUser = $false
    foreach ($process in $matchingProcesses) {
      try {
        $instance = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($process.Id)" -ErrorAction Stop
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
  $items += [ordered]@{majorVersion=$version;exePath=$path;running=$running;runningAsCurrentUser=$runningAsCurrentUser;pluginPath=$plugin;loadMode=$loadMode;loadProtection=$loadProtection;installed=$false}
}
ConvertTo-Json -InputObject @($items) -Depth 4 -Compress
