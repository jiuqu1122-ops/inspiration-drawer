param([string]$ReleaseDirectory = 'outputs/rhino-independent-20261120', [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$release = [IO.Path]::GetFullPath((Join-Path $root $ReleaseDirectory))
if (-not $SkipBuild) {
    & cargo +1.98.0 build --manifest-path (Join-Path $root 'src-tauri/Cargo.toml') --locked --offline --example rhino_runtime_probe
    if ($LASTEXITCODE -ne 0) { throw 'Native runtime probe build failed' }
}
# The isolated Vite fixture must be running on 127.0.0.1:1469.
$binary = [IO.Path]::GetFullPath((Join-Path $root 'src-tauri/target/debug/examples/rhino_runtime_probe.exe'))
if (-not $binary.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Probe target escaped workspace' }
# Tauri examples need the same CommonControls dependency as the production app.
# Patch only the disposable example, as in the existing native UI probe runner.
if (-not ('RhinoRuntimeProbeResources' -as [type])) {
    Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class RhinoRuntimeProbeResources {
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
$resource = [RhinoRuntimeProbeResources]::BeginUpdateResource($binary, $false)
if ($resource -eq [IntPtr]::Zero) { throw 'Could not open disposable probe resources' }
if (-not [RhinoRuntimeProbeResources]::UpdateResource($resource, [IntPtr]24, [IntPtr]1, 1033, $manifest, $manifest.Length)) {
    [void][RhinoRuntimeProbeResources]::EndUpdateResource($resource, $true)
    throw 'Could not update disposable probe CommonControls manifest'
}
if (-not [RhinoRuntimeProbeResources]::EndUpdateResource($resource, $false)) { throw 'Could not save disposable probe manifest' }
$result = Join-Path $release 'WEBVIEW-VERIFY.json'
$started = Get-Date
$probe = Start-Process -FilePath $binary -ArgumentList @("`"$release`"", "`"$result`"") -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $release 'probe.stdout.log') -RedirectStandardError (Join-Path $release 'probe.stderr.log')
$handle = $probe.Handle
if (-not $probe.WaitForExit(55000)) { throw 'Isolated runtime verification timed out' }
$probe.Refresh()
if (-not (Test-Path -LiteralPath $result) -or (Get-Item -LiteralPath $result).LastWriteTime -lt $started) { throw "No fresh WebView result; inspect probe logs (exit $($probe.ExitCode))" }
$verified = Get-Content -Raw -Encoding utf8 -LiteralPath $result | ConvertFrom-Json
if ($verified.pass -ne $true -or ($null -ne $probe.ExitCode -and $probe.ExitCode -ne 0)) { throw "Rhino WebView checks failed: $(Get-Content -Raw -Encoding utf8 -LiteralPath $result)" }
Get-Content -Raw -Encoding utf8 -LiteralPath $result
