#requires -Version 5.1
[CmdletBinding()]
param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
$script:Guid = 'b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5'
$script:Local = [Environment]::GetFolderPath('LocalApplicationData')
$script:Roaming = [Environment]::GetFolderPath('ApplicationData')
$script:Findings = New-Object 'System.Collections.Generic.List[object]'
$script:Payloads = New-Object 'System.Collections.Generic.List[object]'
$script:SeenPaths = @{}
function Note([string]$code, [string]$level, [string]$detail) {
  $script:Findings.Add([ordered]@{code=$code;level=$level;detail=$detail})
}
function Redact([object]$value) {
  $text = [string]$value
  foreach ($mapping in @(@($script:Local,'%LOCALAPPDATA%'),@($script:Roaming,'%APPDATA%'),@($env:USERPROFILE,'%USERPROFILE%'))) {
    if ($mapping[0]) { $text = [regex]::Replace($text,[regex]::Escape($mapping[0]),[string]$mapping[1],[Text.RegularExpressions.RegexOptions]::IgnoreCase) }
  }
  $text = [regex]::Replace($text,'(?i)https?://[^\s"<>]+','[URL removed]')
  $text = [regex]::Replace($text,'(?i)\bBearer\s+[^\s,;]+','Bearer [redacted]')
  $text = [regex]::Replace($text,'(?i)[A-Z]:\\Users\\[^\\\s]+','%USERPROFILE%')
  $text = [regex]::Replace($text,'(?i)(token|api[_-]?key|authorization|password|secret)\s*[:=]\s*[^\s,;]+','$1=[redacted]')
  return $text
}
function Ordinary([string]$path, [bool]$directory) {
  try {
    $item = Get-Item -LiteralPath $path -Force
    return (($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -eq 0 -and [bool]$item.PSIsContainer -eq $directory)
  } catch { return $false }
}
function Read-SmallJson([string]$path) {
  if (-not (Ordinary $path $false)) { return $null }
  if ((Get-Item -LiteralPath $path).Length -gt 262144) { return $null }
  try { return (Get-Content -LiteralPath $path -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return $null }
}
function Inspect-Payload([string]$pluginPath, [string]$source) {
  if (-not $pluginPath) { return }
  try { $pluginPath = [IO.Path]::GetFullPath($pluginPath) } catch { Note 'INVALID_PATH' 'warning' (Redact $pluginPath); return }
  if ([IO.Path]::GetFileName($pluginPath) -ine 'InspirationDrawer.Rhino.rhp') {
    Note 'UNEXPECTED_PLUGIN_NAME' 'warning' ($source + ': ' + (Redact $pluginPath)); return
  }
  if ($script:SeenPaths.ContainsKey($pluginPath)) { return }
  $script:SeenPaths[$pluginPath] = $true
  $folder = [IO.Path]::GetDirectoryName($pluginPath)
  if (-not (Ordinary $folder $true)) { Note 'PAYLOAD_DIRECTORY_MISSING_OR_LINKED' 'warning' ($source + ': ' + (Redact $folder)); return }
  $files = @()
  foreach ($name in @('InspirationDrawer.Rhino.rhp','InspirationDrawer.Rhino.deps.json','InspirationDrawer.Rhino.runtimeconfig.json','InspirationDrawer.Rhino.rui','InspirationDrawer.Rhino.svg')) {
    $path = Join-Path $folder $name
    $entry = [ordered]@{name=$name;exists=(Test-Path -LiteralPath $path -PathType Leaf);readable=$false;length=$null;sha256=$null}
    if (-not $entry.exists) { Note 'PAYLOAD_FILE_MISSING' 'warning' ($source + ': ' + (Redact $path)) }
    elseif (Ordinary $path $false) {
      try {
        $entry.length = (Get-Item -LiteralPath $path).Length
        if ($entry.length -le 33554432) { $entry.sha256 = (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash; $entry.readable=$true }
        else { Note 'PAYLOAD_FILE_TOO_LARGE' 'warning' ($source + ': ' + $name) }
      } catch { Note 'PAYLOAD_NOT_READABLE' 'warning' ($source + ': ' + (Redact $_.Exception.Message)) }
    } else { Note 'PAYLOAD_LINK_SKIPPED' 'warning' ($source + ': ' + $name) }
    $files += $entry
  }
  $config = Read-SmallJson (Join-Path $folder 'InspirationDrawer.Rhino.runtimeconfig.json')
  $deps = Read-SmallJson (Join-Path $folder 'InspirationDrawer.Rhino.deps.json')
  $assemblyVersion = $null
  if ($files[0].readable) {
    # GetAssemblyName reads metadata. No Assembly.Load, plugin loading or code execution.
    try { $assemblyVersion = [Reflection.AssemblyName]::GetAssemblyName($pluginPath).Version.ToString() }
    catch { Note 'ASSEMBLY_METADATA_UNREADABLE' 'warning' (Redact $_.Exception.Message) }
  }
  $zone = $null
  try {
    $stream = Get-Item -LiteralPath $pluginPath -Stream Zone.Identifier -ErrorAction Stop
    if ($stream.Length -le 4096) {
      $zoneText = Get-Content -LiteralPath $pluginPath -Stream Zone.Identifier -Raw
      if ($zoneText -match '(?m)^ZoneId=(\d+)') { $zone = [int]$Matches[1] }
    }
  } catch { } # No Zone.Identifier is normal; never unblock or modify it.
  if ($zone -ge 3) { Note 'INTERNET_ZONE_MARK' 'info' 'RHP has an Internet zone marker; report only, not proof that this caused the load failure.' }
  $script:Payloads.Add([ordered]@{source=$source;path=(Redact $pluginPath);assemblyVersion=$assemblyVersion;tfm=$config.runtimeOptions.tfm;frameworks=@($config.runtimeOptions.frameworks | ForEach-Object { @{name=$_.name;version=$_.version} });depsTarget=$deps.runtimeTarget.name;zoneId=$zone;files=$files})
}

$registrations = @()
$rhinoInstalls = @()
foreach ($viewName in @('Registry64','Registry32')) {
  if ($viewName -eq 'Registry64' -and -not [Environment]::Is64BitOperatingSystem) { continue }
  foreach ($hiveName in @('CurrentUser','LocalMachine')) {
    $base = $null
    try {
      $base = [Microsoft.Win32.RegistryKey]::OpenBaseKey([Microsoft.Win32.RegistryHive]::$hiveName,[Microsoft.Win32.RegistryView]::$viewName)
      foreach ($major in @(8,9)) {
        $install = $base.OpenSubKey("SOFTWARE\McNeel\Rhinoceros\$major.0\Install")
        if ($install) {
          try {
            foreach ($candidate in @([string]$install.GetValue('ExePath',''),$(if ($install.GetValue('Path','')) { Join-Path ([string]$install.GetValue('Path','')) 'Rhino.exe' }))) {
              if (-not $candidate) { continue }
              $exists = Test-Path -LiteralPath $candidate -PathType Leaf
              $version = $null
              if ($exists) { try { $version = [Diagnostics.FileVersionInfo]::GetVersionInfo($candidate).ProductVersion } catch { } }
              $rhinoInstalls += [ordered]@{major=$major;hive=$hiveName;view=$viewName;exe=(Redact $candidate);exists=$exists;productVersion=$version}
            }
          } finally { $install.Dispose() }
        }
        $root = "SOFTWARE\McNeel\Rhinoceros\$major.0\Plug-Ins\$script:Guid"
        $settings = $base.OpenSubKey($root)
        $plugin = $base.OpenSubKey("$root\PlugIn")
        $protection = $base.OpenSubKey("SOFTWARE\McNeel\Rhinoceros\$major.0\Global Settings\Plug-ins\$script:Guid")
        try {
          $pluginPath = if ($plugin) { [string]$plugin.GetValue('FileName','') } else { '' }
          $source = "$hiveName/$viewName/Rhino$major"
          $registrations += [ordered]@{major=$major;hive=$hiveName;view=$viewName;keyExists=[bool]$settings;pluginKeyExists=[bool]$plugin;pluginPath=(Redact $pluginPath);fileExists=($pluginPath -and (Test-Path -LiteralPath $pluginPath -PathType Leaf));loadMode=$(if($settings){$settings.GetValue('LoadMode',$null)});loadProtection=$(if($protection){$protection.GetValue('LoadProtection',$null)})}
          if ($settings -and -not $pluginPath) { Note 'REGISTRATION_WITHOUT_FILENAME' 'warning' $source }
          Inspect-Payload $pluginPath $source
        } finally { if($settings){$settings.Dispose()};if($plugin){$plugin.Dispose()};if($protection){$protection.Dispose()} }
      }
    } catch { Note 'REGISTRY_READ_FAILED' 'warning' ($hiveName + '/' + $viewName + ': ' + (Redact $_.Exception.Message)) }
    finally { if($base){$base.Dispose()} }
  }
}

$processes = @()
$currentSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
foreach ($process in @(Get-Process -Name Rhino -ErrorAction SilentlyContinue | Select-Object -First 12)) {
  $item = [ordered]@{pid=$process.Id;path=$null;productVersion=$null;runtime='unknown';runtimeModuleVersion=$null;runtimeSwitches=@();sameWindowsUser=$null;moduleReadError=$null}
  try { $item.path=Redact $process.Path; $item.productVersion=$process.MainModule.FileVersionInfo.ProductVersion } catch { }
  try {
    $modules = @($process.Modules)
    $core = @($modules | Where-Object { $_.ModuleName -ieq 'coreclr.dll' })
    $fx = @($modules | Where-Object { $_.ModuleName -ieq 'clr.dll' })
    if($core.Count -and $fx.Count){$item.runtime='mixed'}elseif($core.Count){$item.runtime='netcore'}elseif($fx.Count){$item.runtime='netfx'}
    $runtimeModule = if($core.Count){$core[0]}elseif($fx.Count){$fx[0]}else{$null}
    if($runtimeModule){$item.runtimeModuleVersion=$runtimeModule.FileVersionInfo.ProductVersion}
  } catch { $item.moduleReadError=Redact $_.Exception.Message }
  try {
    $instance = Get-CimInstance -ClassName Win32_Process -Filter "ProcessId = $($process.Id)" -OperationTimeoutSec 3
    # Keep only the runtime switches. Never store the command line or model filenames.
    $item.runtimeSwitches = @([regex]::Matches([string]$instance.CommandLine,'(?i)(?:^|\s)/(?:netfx|netcore(?:-\d+)?)(?=\s|$)') | ForEach-Object { $_.Value.Trim() })
    $owner = Invoke-CimMethod -InputObject $instance -MethodName GetOwnerSid -OperationTimeoutSec 3
    if($owner.ReturnValue -eq 0){$item.sameWindowsUser=($owner.Sid -eq $currentSid)}
  } catch { }
  if($item.runtime -eq 'netfx'){Note 'RHINO_RUNNING_NETFX' 'warning' 'A Rhino process is using .NET Framework. Modern .NET-only plugins cannot load there. Confirm the specific instance with Rhino SystemInfo before changing any setting.'}
  if($item.runtime -eq 'mixed'){Note 'RHINO_MIXED_RUNTIME_MODULES' 'warning' 'Both clr.dll and coreclr.dll are loaded. This alone does not identify which runtime hosts this plugin; obtain Rhino SystemInfo.'}
  if($item.sameWindowsUser -eq $false){Note 'DIFFERENT_WINDOWS_USER' 'warning' 'Rhino and this diagnostic script run under different Windows users; current-user registrations may differ.'}
  $processes += $item
}
if(-not $processes.Count){Note 'NO_RUNNING_RHINO' 'info' 'Rhino is not running. Start it normally and run this script again to observe its actual runtime; do not close unsaved work.'}

# Bounded scan: only this product's managed directories and own YAK package.
foreach ($major in @(8,9)) {
  $managedRoot = Join-Path $script:Local "InspirationDrawer\RhinoPlugin\$major"
  if(Ordinary $managedRoot $true){
    foreach($directory in @(Get-ChildItem -LiteralPath $managedRoot -Directory -Force | Sort-Object LastWriteTime -Descending | Select-Object -First 12)){
      if(Ordinary $directory.FullName $true){Inspect-Payload (Join-Path $directory.FullName 'InspirationDrawer.Rhino.rhp') "managed/Rhino$major"}
    }
  }
  $yakRoot = Join-Path $script:Roaming "McNeel\Rhinoceros\packages\$major.0\inspiration-drawer-rhino"
  if(Ordinary $yakRoot $true){
    foreach($directory in @(Get-ChildItem -LiteralPath $yakRoot -Directory -Force | Select-Object -First 12)){
      if(-not(Ordinary $directory.FullName $true)){continue}
      foreach($framework in @('','net48','net7.0','net8.0','net10.0')){
        $folder=if($framework){Join-Path $directory.FullName $framework}else{$directory.FullName}
        $file=Join-Path $folder 'InspirationDrawer.Rhino.rhp'
        if(Test-Path -LiteralPath $file -PathType Leaf){Inspect-Payload $file "YAK/Rhino$major"}
      }
    }
  }
}
$startup = @()
$logRoot = Join-Path $script:Local 'InspirationDrawer\RhinoBeta'
if(Ordinary $logRoot $true){
  foreach($file in @(Get-ChildItem -LiteralPath $logRoot -Filter 'startup-*.log' -File | Sort-Object LastWriteTime -Descending | Select-Object -First 3)){
    if(-not(Ordinary $file.FullName $false) -or $file.Length -gt 1048576){continue}
    foreach($line in @(Get-Content -LiteralPath $file.FullName -Tail 60 -Encoding UTF8)){
      try{$record=$line | ConvertFrom-Json}catch{continue}
      # Only known diagnostic fields. Connection files, tokens and chat data are never read.
      $errorText = Redact $record.exception
      if($errorText.Length -gt 2400){$errorText=$errorText.Substring(0,2400)+' [truncated diagnostic exception]'}
      $startup += [ordered]@{log=$file.Name;at=$record.at;phase=$record.phase;version=$record.version;assembly=(Redact $record.assembly);exception=$errorText}
    }
  }
}
if(-not $startup.Count){Note 'NO_STARTUP_DIAGNOSTICS' 'info' 'No startup log found. This can mean no plugin startup, pre-OnLoad assembly failure, or a different user; it is not proof of an installation-path fault.'}
if(-not @($registrations | Where-Object {$_.keyExists}).Count -and $script:Payloads.Count){Note 'FILES_WITHOUT_REGISTRATION' 'warning' 'Plugin files exist but no registration for this GUID was found in the inspected registry views.'}
$report=[ordered]@{schemaVersion=1;collectedAt=[DateTimeOffset]::Now.ToString('o');windows=[Environment]::OSVersion.VersionString;is64BitProcess=[Environment]::Is64BitProcess;is64BitOS=[Environment]::Is64BitOperatingSystem;powershell=$PSVersionTable.PSVersion.ToString();rhinoInstalls=$rhinoInstalls;registrations=$registrations;processes=$processes;payloads=@($script:Payloads.ToArray());startup=$startup;findings=@($script:Findings.ToArray());limits='Read-only, offline; does not determine active Rhino runtime when modules are inaccessible. Known user-profile paths and URLs are redacted; review the report before sharing. No raw process command line, chats, models, auth/config or connection JSON is collected.'}
if(-not $OutputDirectory){$OutputDirectory=[Environment]::GetFolderPath('DesktopDirectory')}
if(-not $OutputDirectory){throw 'Desktop folder unavailable. Pass -OutputDirectory with an existing local folder.'}
$parent=[IO.Path]::GetFullPath($OutputDirectory)
if(-not(Test-Path -LiteralPath $parent -PathType Container)){throw 'OutputDirectory must be an existing directory.'}
$output=Join-Path $parent ('RhinoPlugin-Diagnostics-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[Guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path $output | Out-Null
$report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $output 'diagnostics.json') -Encoding UTF8
$summary=@('Rhino / Inspiration Drawer read-only diagnostics','No plugin, registry, runtime setting or security setting was modified.','Review diagnostics.json before sharing.','',('Rhino processes: '+$processes.Count),('Inspected plugin paths: '+$script:Payloads.Count),'')
foreach($finding in $script:Findings){$summary+= '['+$finding.level+'] '+$finding.code+': '+$finding.detail}
$summary+=@('','Required manual evidence: In the affected Rhino window run SystemInfo and copy only the Rhino full version and .NET/runtime lines. Check PlugInManager for this plugin and the registered file path. Do not share license keys or the full installed-plugin list unless necessary.','netfx is a strong lead, not an automatic fix. Do not change runtimes, copy System.Runtime.dll, delete plugin folders or reinstall before reviewing the evidence.')
$summary | Set-Content -LiteralPath (Join-Path $output 'SUMMARY.txt') -Encoding UTF8
$zip=$output+'.zip'
try{Compress-Archive -LiteralPath @((Join-Path $output 'diagnostics.json'),(Join-Path $output 'SUMMARY.txt')) -DestinationPath $zip;Write-Host ('Report ZIP: '+$zip) -ForegroundColor Green}catch{Write-Warning ('ZIP creation failed; plain report retained at '+$output)}
Write-Host ('Report directory: '+$output)
Write-Host 'Finished. Nothing was uploaded. Keep Rhino open normally while diagnosing.'
