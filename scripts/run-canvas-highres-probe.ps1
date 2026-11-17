<#
Isolated synthetic canvas probe. No production app/setup/database/profile.
Examples (from repository root):
  powershell -ExecutionPolicy Bypass -File scripts/run-canvas-highres-probe.ps1
  powershell -ExecutionPolicy Bypass -File scripts/run-canvas-highres-probe.ps1 -Counts 100 -Transform legacy
  powershell -ExecutionPolicy Bypass -File scripts/run-canvas-highres-probe.ps1 -BrowserOnly
Native JSON/logs are saved under a fresh TEMP directory (not user app data).
BrowserOnly prints the local URL; open it manually, run, and Export JSON.
#>
param(
    [string]$Counts = '100,250,500',
    [string]$Size = '2560x1920',
    [ValidateSet('stable','legacy')][string]$Transform = 'stable',
    [ValidateSet('viewport','all')][string]$Cull = 'viewport',
    [ValidateSet('live','frozen','scheduled')][string]$Viewport = 'live',
    [ValidateRange(0.08,0.8)][double]$ZoomOut = 0.08,
    [ValidateSet('default','on','off')][string]$Promote = 'default',
    [ValidateRange(1024,65535)][int]$Port = 1463,
    [ValidateRange(800,15000)][int]$BurstMs = 2600,
    [ValidateRange(400,15000)][int]$IdleMs = 1200,
    [ValidateRange(500,15000)][int]$RevealGraceMs = 1000,
    [ValidateRange(1,10)][int]$SampleEvery = 1,
    [switch]$BrowserOnly,
    [switch]$SkipBuild,
    [switch]$KeepOpen
)
$ErrorActionPreference = 'Stop'
if ($Port -in @(1420,1461)) { throw 'Use a dedicated probe port, not production :1420 or the existing probe :1461.' }
if (($Counts -split ',' | Where-Object { $_ -notin @('100','250','500') }).Count) { throw 'Counts must be comma-separated 100,250,500.' }
if ($Size -notmatch '^\d+x\d+$') { throw 'Size must be WIDTHxHEIGHT, e.g. 2560x1920.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node = (Get-Command node -ErrorAction Stop).Source
$vite = Join-Path $root 'node_modules/vite/bin/vite.js'
if (-not (Test-Path -LiteralPath $vite)) { throw 'Missing Vite. Install project dependencies before running this isolated fixture.' }
$client = New-Object Net.Sockets.TcpClient
try { $client.Connect('127.0.0.1', $Port); $occupied = $true } catch { $occupied = $false } finally { $client.Dispose() }
if ($occupied) { throw "Port $Port is already in use; no existing server will be reused or stopped. Choose -Port." }
if (-not $BrowserOnly -and -not $SkipBuild -and (Get-Process cargo,rustc -ErrorAction SilentlyContinue)) {
    throw 'Another Cargo/Rust compilation is active. Wait or use -SkipBuild with an already-built probe; do not contend on the Cargo lock.'
}
$logs = Join-Path ([IO.Path]::GetTempPath()) ('canvas-highres-probe-logs-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $logs | Out-Null
$url = "http://127.0.0.1:$Port/scripts/canvas-highres-probe.html?counts=$Counts&size=$Size&transform=$Transform&cull=$Cull&viewport=$Viewport&zoomOut=$ZoomOut&promote=$Promote&burstMs=$BurstMs&idleMs=$IdleMs&revealGraceMs=$RevealGraceMs&sampleEvery=$SampleEvery"
$server = $null
$exitCode = 0
Push-Location -LiteralPath $root
try {
    $server = Start-Process -FilePath $node -ArgumentList @("`"$vite`"", '--host', '127.0.0.1', '--port', "$Port", '--strictPort') `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'vite.stdout.log') -RedirectStandardError (Join-Path $logs 'vite.stderr.log')
    $ready = $false
    for ($attempt = 0; $attempt -lt 100; $attempt++) {
        if ($server.HasExited) { throw "Isolated Vite exited. Inspect $logs" }
        try { $response = Invoke-WebRequest -Uri ($url -split '\?')[0] -UseBasicParsing -TimeoutSec 2; if ($response.StatusCode -eq 200 -and $response.Content.Contains('canvas-highres-isolated-probe')) { $ready = $true; break } } catch {}
        Start-Sleep -Milliseconds 200
    }
    if (-not $ready) { throw "Isolated Vite did not become ready. Inspect $logs" }
    Write-Host "ISOLATED FIXTURE: $url"
    Write-Host "Logs/results: $logs"
    New-Item -ItemType File -Path (Join-Path $logs 'native.stdout.log') -Force | Out-Null
    if ($BrowserOnly) {
        Write-Host 'Open the URL in a browser, keep it visible, click Run isolated suite, then Export JSON.'
        Read-Host 'Press Enter when finished to stop only this script-owned Vite process' | Out-Null
    } else {
        $probeArgs = @('--frontend', "http://127.0.0.1:$Port", '--counts', $Counts, '--size', $Size, '--transform', $Transform, '--cull', $Cull, '--viewport', $Viewport, '--zoom-out', $ZoomOut.ToString([Globalization.CultureInfo]::InvariantCulture),
            '--burst-ms', "$BurstMs", '--idle-ms', "$IdleMs", '--reveal-grace-ms', "$RevealGraceMs", '--sample-every', "$SampleEvery")
        if ($KeepOpen) { $probeArgs += '--keep-open' }
        if (-not $SkipBuild) {
            & rustup run 1.98.0 cargo build --locked --manifest-path src-tauri/Cargo.toml --example canvas_highres_probe
            if ($LASTEXITCODE -ne 0) { throw 'Isolated probe build failed.' }
        }
        $target = [IO.Path]::GetFullPath((Join-Path $root 'src-tauri/target'))
        $binary = [IO.Path]::GetFullPath((Join-Path $target 'debug/examples/canvas_highres_probe.exe'))
        if (-not $binary.StartsWith($target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Probe executable must remain under the workspace target directory.'
        }
        if (-not (Test-Path -LiteralPath $binary)) { throw 'Probe binary is not built. Run once without -SkipBuild (Rust 1.98.0).' }
        if (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $binary }) {
            throw 'An isolated high-resolution probe is already running; wait for it to finish.'
        }
        # Tauri examples do not embed the production app manifest. Without the
        # CommonControls dependency WebView2 can fail in the Windows loader with
        # STATUS_ENTRYPOINT_NOT_FOUND (0xC0000139), before Rust main() runs.
        # Touch only this disposable example executable, never production assets.
        if (-not ('CanvasHighresProbeResources' -as [type])) {
            Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CanvasHighresProbeResources {
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
        $resource = [CanvasHighresProbeResources]::BeginUpdateResource($binary, $false)
        if ($resource -eq [IntPtr]::Zero) { throw 'Could not open the isolated probe executable resource.' }
        if (-not [CanvasHighresProbeResources]::UpdateResource($resource, [IntPtr]24, [IntPtr]1, 1033, $manifest, $manifest.Length)) {
            [void][CanvasHighresProbeResources]::EndUpdateResource($resource, $true)
            throw 'Could not write the isolated probe manifest.'
        }
        if (-not [CanvasHighresProbeResources]::EndUpdateResource($resource, $false)) { throw 'Could not save the isolated probe manifest.' }
        # Read the actual process exit status. Piping a GUI/native executable
        # through Tee-Object can obscure it in Windows PowerShell.
        $probeProcess = Start-Process -FilePath $binary -ArgumentList $probeArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru `
            -RedirectStandardOutput (Join-Path $logs 'native.stdout.log') -RedirectStandardError (Join-Path $logs 'native.stderr.log')
        Write-Host "ISOLATED PID: $($probeProcess.Id)"
        $null = $probeProcess.Handle # retain process handle for Windows PowerShell ExitCode
        $probeProcess.WaitForExit()
        $exitCode = $probeProcess.ExitCode
        Get-Content -LiteralPath (Join-Path $logs 'native.stdout.log')
        if (Test-Path -LiteralPath (Join-Path $logs 'native.stderr.log')) {
            Get-Content -LiteralPath (Join-Path $logs 'native.stderr.log') | ForEach-Object { Write-Host "NATIVE STDERR: $_" }
        }
        # WebView2 may hold profile files until the native process has exited.
        # Delete only the fresh path emitted by THIS PID, checked against the
        # exact probe base; never enumerate/kill other browsers or user profiles.
        $isolationLine = Get-Content -LiteralPath (Join-Path $logs 'native.stdout.log') | Where-Object { $_.StartsWith('PROBE_ISOLATION ') } | Select-Object -Last 1
        if ($isolationLine) {
            $isolation = $isolationLine.Substring('PROBE_ISOLATION '.Length) | ConvertFrom-Json
            $profile = [IO.Path]::GetFullPath($isolation.profile)
            $runRoot = [IO.Directory]::GetParent($profile).FullName
            $expectedBase = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) 'inspiration-drawer-canvas-highres-probe'))
            $expectedPrefix = "run-$($probeProcess.Id)-"
            if ([IO.Path]::GetFileName($profile) -ne 'webview2-only' -or
                [IO.Directory]::GetParent($runRoot).FullName -ne $expectedBase -or
                -not [IO.Path]::GetFileName($runRoot).StartsWith($expectedPrefix, [StringComparison]::Ordinal)) {
                throw 'Refusing profile cleanup outside this PID-specific probe directory.'
            }
            Write-Host "VERIFIED DISPOSABLE PROFILE ROOT: $runRoot"
            for ($cleanupAttempt = 0; $cleanupAttempt -lt 24 -and (Test-Path -LiteralPath $runRoot); $cleanupAttempt++) {
                $entry = Get-Item -LiteralPath $runRoot -Force
                if (($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'Refusing profile cleanup through a reparse point.' }
                try { Remove-Item -LiteralPath $runRoot -Recurse -Force -ErrorAction Stop }
                catch { Start-Sleep -Milliseconds 250 }
            }
            if (Test-Path -LiteralPath $runRoot) { Write-Warning "Disposable WebView2 profile remains locked: $runRoot" }
            else { Write-Host 'DISPOSABLE PROFILE REMOVED after native process exit.' }
        }
        $line = Get-Content -LiteralPath (Join-Path $logs 'native.stdout.log') | Where-Object { $_.StartsWith('CANVAS_HIGHRES_PROBE_RESULT ') } | Select-Object -Last 1
        if ($line) {
            $json = $line.Substring('CANVAS_HIGHRES_PROBE_RESULT '.Length)
            $json | Set-Content -LiteralPath (Join-Path $logs 'result.json') -Encoding utf8
            if (-not ($json | ConvertFrom-Json).checksPassed -and ($null -eq $exitCode -or $exitCode -eq 0)) { $exitCode = 1 }
            Write-Host "NATIVE EXIT: $exitCode"
            Write-Host "RESULT JSON: $(Join-Path $logs 'result.json')"
        } else {
            Write-Warning "No JSON received (native exit code $exitCode). This is NOT a passing measurement; 0xC0000139 means Windows loader entry-point failure before the fixture starts."
            if ($null -eq $exitCode -or $exitCode -eq 0) { $exitCode = 2 }
        }
    }
} finally {
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    Pop-Location
}
exit $exitCode
