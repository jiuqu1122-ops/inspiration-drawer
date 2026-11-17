param([int]$Width = 1240, [switch]$SkipBuild, [switch]$Prototype)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$out=Join-Path $root $(if($Prototype){'outputs/figma-prototype-verification'}else{'outputs/html-preview-verification'})
New-Item -ItemType Directory -Force -Path $out | Out-Null
if (-not $SkipBuild) {
    & cargo +1.98.0 build --manifest-path (Join-Path $root 'src-tauri/Cargo.toml') --locked --offline --example chat_html_preview_probe
    if($LASTEXITCODE -ne 0){throw 'Native probe build failed'}
}
# Run a Vite dev server on 127.0.0.1:1468 before this isolated probe.
$binary=[IO.Path]::GetFullPath((Join-Path $root 'src-tauri/target/debug/examples/chat_html_preview_probe.exe'))
if(-not $binary.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Probe target escaped workspace'}
    if (-not ('HtmlPreviewProbeResources' -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class HtmlPreviewProbeResources {
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
    $resource = [HtmlPreviewProbeResources]::BeginUpdateResource($binary, $false)
    if ($resource -eq [IntPtr]::Zero) { throw 'Could not open disposable probe manifest resources.' }
    if (-not [HtmlPreviewProbeResources]::UpdateResource($resource, [IntPtr]24, [IntPtr]1, 1033, $manifest, $manifest.Length)) {
        [void][HtmlPreviewProbeResources]::EndUpdateResource($resource, $true)
        throw 'Could not update disposable probe CommonControls manifest.'
    }
    if (-not [HtmlPreviewProbeResources]::EndUpdateResource($resource, $false)) { throw 'Could not save disposable probe manifest.' }
$result=Join-Path $out "native-$Width.json"
$started=Get-Date
$arguments=@("`"$result`"", "$Width"); if($Prototype){$arguments+='prototype'}
$probe=Start-Process -FilePath $binary -ArgumentList $arguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $out "native-$Width.stdout.log") -RedirectStandardError (Join-Path $out "native-$Width.stderr.log")
$processHandle=$probe.Handle
if(-not $probe.WaitForExit(100000)){throw 'Native UI probe timed out'}
if(Test-Path -LiteralPath $result){ Get-Content -Raw -Encoding UTF8 $result }
$probe.Refresh()
if(-not (Test-Path -LiteralPath $result) -or (Get-Item -LiteralPath $result).LastWriteTime -lt $started){throw 'No fresh native probe result'}
$verified=Get-Content -Raw -Encoding UTF8 $result | ConvertFrom-Json
if($verified.pass -ne $true -or $verified.nativeInvocationsIncludingOneTrustedControl -ne 1){throw 'Native probe checks failed'}
if($null -ne $probe.ExitCode -and $probe.ExitCode -ne 0){throw "Native UI probe failed with exit $($probe.ExitCode)"}
