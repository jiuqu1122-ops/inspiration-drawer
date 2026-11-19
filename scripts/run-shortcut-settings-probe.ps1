param([switch]$SkipBuild,[switch]$Manual,[string]$RunDirectory)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$out=Join-Path $root 'outputs/shortcut-verification'
New-Item -ItemType Directory -Force -Path $out | Out-Null
if(-not $RunDirectory){$RunDirectory=Join-Path $out ('run-'+[Guid]::NewGuid().ToString('N'))}
$run=[IO.Path]::GetFullPath($RunDirectory)
if(-not $run.StartsWith($out+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Probe data path must remain in outputs/shortcut-verification'}
New-Item -ItemType Directory -Force -Path $run | Out-Null
if(-not $SkipBuild){
 & cargo +1.98.0 build --manifest-path (Join-Path $root 'src-tauri/Cargo.toml') --locked --offline --example shortcut_settings_probe
 if($LASTEXITCODE -ne 0){throw 'Shortcut UI probe build failed'}
}
$binary=Join-Path $root 'src-tauri/target/debug/examples/shortcut_settings_probe.exe'
    if (-not ('ShortcutProbeResources' -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class ShortcutProbeResources {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern IntPtr BeginUpdateResource(string path, bool deleteExisting);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern bool UpdateResource(IntPtr handle, IntPtr type, IntPtr name, ushort language, byte[] data, uint size);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern bool EndUpdateResource(IntPtr handle, bool discard);
}
"@
    }
    $manifest = [Text.Encoding]::UTF8.GetBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><dependency><dependentAssembly><assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/></dependentAssembly></dependency></assembly>')
    $resource = [ShortcutProbeResources]::BeginUpdateResource($binary, $false)
    if ($resource -eq [IntPtr]::Zero) { throw 'Could not open disposable probe manifest resources.' }
    if (-not [ShortcutProbeResources]::UpdateResource($resource, [IntPtr]24, [IntPtr]1, 1033, $manifest, $manifest.Length)) {
        [void][ShortcutProbeResources]::EndUpdateResource($resource, $true)
        throw 'Could not update disposable probe CommonControls manifest.'
    }
    if (-not [ShortcutProbeResources]::EndUpdateResource($resource, $false)) { throw 'Could not save disposable probe manifest.' }

$phases=if($Manual){@('manual')}else{@('write','restart','drawer')}
foreach($phase in $phases){
 $data=if($phase -eq 'drawer'){Join-Path $run 'drawer'}else{$run}
 New-Item -ItemType Directory -Force -Path $data | Out-Null
 $result=Join-Path $run "$phase.json"
 $process=Start-Process -FilePath $binary -ArgumentList @("`"$result`"","`"$data`"",$phase) -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $run "$phase.stdout.log") -RedirectStandardError (Join-Path $run "$phase.stderr.log")
 if($Manual){Write-Output "Manual isolated window started. ProcessId=$($process.Id) Data=$run";exit 0}
 if(-not $process.WaitForExit(115000)){throw "Shortcut $phase probe timed out"}
 if(-not(Test-Path -LiteralPath $result)){Get-Content (Join-Path $run "$phase.stderr.log") -Tail 10;throw 'Missing shortcut probe result'}
 $report=Get-Content -LiteralPath $result -Raw -Encoding UTF8|ConvertFrom-Json
 if($report.pass -ne $true){Get-Content -LiteralPath $result -Encoding UTF8;throw "Shortcut $phase probe failed"}
 Write-Output "$phase PASS"
}
Write-Output "Shortcut UI/native/persistence verification: $run"
