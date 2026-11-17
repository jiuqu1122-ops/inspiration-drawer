param([int]$Port = 1461, [switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
if ($Port -eq 1420 -or $Port -lt 1024 -or $Port -gt 65535) { throw 'Use an isolated loopback development port, never production 1420.' }
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfff')
$output = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) "prompt-resize-probe-$stamp-$([Guid]::NewGuid().ToString('N'))"))
New-Item -ItemType Directory -Path $output | Out-Null
$server = $null
$native = $null
$exitCode = 2
Push-Location -LiteralPath $root
try {
    # Never wait for another agent's Cargo lock.
    if (-not $SkipBuild) {
        $busy = @(Get-Process cargo,rustc -ErrorAction SilentlyContinue)
        if ($busy.Count -gt 0) { throw "Cargo/Rust is active ($($busy.Id -join ', ')); no build started. Retry later or use -SkipBuild for a prebuilt fixture." }
        & rustup run 1.98.0 cargo build --locked --manifest-path src-tauri/Cargo.toml --example prompt_resize_probe
        if ($LASTEXITCODE -ne 0) { throw 'Rust 1.98.0 probe build failed.' }
    }
    $target = [IO.Path]::GetFullPath((Join-Path $root 'src-tauri/target'))
    $binary = [IO.Path]::GetFullPath((Join-Path $target 'debug/examples/prompt_resize_probe.exe'))
    if (-not $binary.StartsWith($target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Probe executable escaped workspace target.' }
    if (-not (Test-Path -LiteralPath $binary)) { throw 'No isolated executable; first run without -SkipBuild.' }
    if (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $binary }) { throw 'This executable is already running; do not patch it.' }
    # Standard CommonControls manifest; only this disposable example is changed.
    if (-not ('PromptResizeProbeResources' -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public class PromptResizeProbeResources {
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
    $resource = [PromptResizeProbeResources]::BeginUpdateResource($binary, $false)
    if ($resource -eq [IntPtr]::Zero) { throw 'Could not open disposable resource.' }
    if (-not [PromptResizeProbeResources]::UpdateResource($resource, [IntPtr]24, [IntPtr]1, 1033, $manifest, $manifest.Length)) {
        [void][PromptResizeProbeResources]::EndUpdateResource($resource, $true)
        throw 'Could not write disposable manifest.'
    }
    if (-not [PromptResizeProbeResources]::EndUpdateResource($resource, $false)) { throw 'Could not commit disposable manifest.' }
    if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
        $vite = Join-Path $root 'node_modules/vite/bin/vite.js'
        $server = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"' + $vite + '"'), '--host', '127.0.0.1', '--port', "$Port", '--strictPort' -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $output 'vite.stdout.log') -RedirectStandardError (Join-Path $output 'vite.stderr.log')
    }
    $base = "http://127.0.0.1:$Port"
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $page = Invoke-WebRequest -UseBasicParsing -Uri "$base/scripts/prompt-resize-probe.html" -TimeoutSec 3
            $module = Invoke-WebRequest -UseBasicParsing -Uri "$base/scripts/prompt-resize-probe.tsx" -TimeoutSec 5
            if ($page.Content.Contains('prompt-resize-isolated-v1') -and $module.Content.Contains('drawer_bounds::anchored_rect')) { $ready = $true; break }
        } catch {}
        Start-Sleep -Milliseconds 250
    }
    if (-not $ready) { throw 'Fixture preflight failed; not a passing runtime result.' }
    $stdout = Join-Path $output 'native.stdout.log'
    $stderr = Join-Path $output 'native.stderr.log'
    $native = Start-Process -FilePath $binary -ArgumentList '--frontend', $base, '--output-dir', ('"' + $output + '"') -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdout -RedirectStandardError $stderr
    Write-Host "Isolated fixture PID=$($native.Id); outputs=$output"
    Write-Host 'Fixture WebView visible; synthetic events, not physical mouse/IME.'
    $null = $native.Handle # Retain handle so ExitCode remains available after process exit.
    if (-not $native.WaitForExit(280000)) {
        Stop-Process -Id $native.Id -ErrorAction SilentlyContinue
        throw 'Bounded native timeout; only this spawned process stopped.'
    }
    $native.Refresh()
    $exitCode = $native.ExitCode
    if (Test-Path -LiteralPath $stderr) { Get-Content -Encoding UTF8 -LiteralPath $stderr }
    $resultFile = Join-Path $output 'result.json'
    if (Test-Path -LiteralPath $resultFile) {
        $result = Get-Content -Raw -Encoding UTF8 -LiteralPath $resultFile | ConvertFrom-Json
        $failedChecks = @($result.cases | ForEach-Object { $entry = $_; $entry.checks.PSObject.Properties | Where-Object { $_.Value -ne $true } | ForEach-Object { "canvas=$($entry.canvasScale), node=$($entry.nodeScale): $($_.Name)" } })
        [pscustomobject]@{ resultJson=$resultFile; checksPassed=$result.checksPassed; cases=@($result.cases).Count;
            failedChecks=$failedChecks; anchorPassed=$result.anchor.checksPassed; anchorSamples=@($result.anchor.samples).Count;
            fatal=$result.fatal; errors=$result.errors; processExit=$exitCode } | ConvertTo-Json -Depth 6
        if (-not $result.checksPassed -and $exitCode -eq 0) { $exitCode = 1 }
    } else {
        Get-Content -Encoding UTF8 -LiteralPath $stdout
        Write-Warning "No JSON. Native exit=$exitCode. 0xC0000139 is loader failure, not pass. Logs=$output"
        if ($exitCode -eq 0) { $exitCode = 2 }
    }
} finally {
    # Stop only our own Vite process; never enumerate/close user windows.
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -ErrorAction SilentlyContinue }
    Pop-Location
}
exit $exitCode
