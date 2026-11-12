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
  $installed = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("SOFTWARE\McNeel\Rhinoceros\$version.0\Plug-Ins\$guid\PlugIn")
  $plugin = $null
  if ($installed) { try { $plugin = $installed.GetValue('FileName',$null) } finally { $installed.Dispose() } }
  $running = @($processes | Where-Object { $_.Path -and [string]::Equals($_.Path,$path,[StringComparison]::OrdinalIgnoreCase) }).Count -gt 0
  $items += [ordered]@{majorVersion=$version;exePath=$path;running=$running;pluginPath=$plugin;installed=$false}
}
ConvertTo-Json -InputObject @($items) -Depth 4 -Compress
