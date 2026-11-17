<#
Creates only an isolated visible WebView2 fixture, a per-run synthetic SQLite and
per-run temporary logs/profile. Does not launch/stop the user's application.
Evidence is real panel DOM automation (untrusted events), NOT human visual QA.
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/run-design-memory-probe.ps1 -RunNativeTests
#>
param(
    [ValidateRange(1024,65535)][int]$Port = 1465,
    [ValidateRange(0,1800)][int]$WaitForBuildSeconds = 600,
    [switch]$RunNativeTests,
    [switch]$SkipBuild,
    [switch]$KeepOpen
)
$ErrorActionPreference = 'Stop'
if ($Port -in @(1420,1461,1463)) { throw 'Dedicated probe port required; production/other probe ports are forbidden.' }
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node = (Get-Command node -ErrorAction Stop).Source
$vite = Join-Path $root 'node_modules/vite/bin/vite.js'
if (-not (Test-Path -LiteralPath $vite)) { throw 'Install existing workspace dependencies first.' }
$logs = Join-Path ([IO.Path]::GetTempPath()) ('design-memory-probe-logs-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $logs | Out-Null
function Wait-ForCargoIdle {
    $deadline = [DateTime]::UtcNow.AddSeconds($WaitForBuildSeconds)
    $reported = $false
    do {
        $processes = @(Get-CimInstance Win32_Process)
        $compilers = @($processes | Where-Object { $_.Name -in @('rustc.exe','link.exe') })
        $cargo = @($processes | Where-Object {
            if ($_.Name -ne 'cargo.exe') { return $false }
            $candidate = $_
            # A long-lived `cargo run` with its already-running production app
            # child is not a build. Never stop, control, or read that application.
            $idleRun = $candidate.CommandLine -match '\brun\b' -and @($processes | Where-Object {
                $_.ParentProcessId -eq $candidate.ProcessId -and $_.Name -eq 'inspiration-drawer.exe'
            }).Count -gt 0
            return -not $idleRun
        })
        if (-not $compilers.Count -and -not $cargo.Count) { return }
        if (-not $reported) { Write-Host 'Another Cargo/Rust build is active; waiting rather than contending on the build lock.'; $reported = $true }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'Other Cargo/Rust compilation remains active. No build was started; retry later.' }
        Start-Sleep -Seconds 2
    } while ($true)
}
function Invoke-ProbeCargo([string[]]$CargoArguments, [string]$LogFile) {
    # Windows PowerShell wraps native stderr as ErrorRecord; Cargo progress is
    # stderr even on success. Do not treat that progress line as a failed build.
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & rustup run 1.98.0 cargo @CargoArguments 2>&1 | ForEach-Object { "$_" } | Tee-Object -FilePath $LogFile
        $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $previous }
    if ($code -ne 0) { throw "Isolated Cargo command failed with exit $code. See $LogFile" }
}
$server = $null
$probe = $null
$exitCode = 2
Push-Location -LiteralPath $root
try {
    if ($RunNativeTests) {
        Wait-ForCargoIdle
        Invoke-ProbeCargo @('test','--locked','--manifest-path','src-tauri/Cargo.toml','--example','design_memory_probe') (Join-Path $logs 'rust.tests.log')
    }
    if (-not $SkipBuild) {
        Wait-ForCargoIdle
        Invoke-ProbeCargo @('build','--locked','--manifest-path','src-tauri/Cargo.toml','--example','design_memory_probe') (Join-Path $logs 'rust.build.log')
    }
    $target = [IO.Path]::GetFullPath((Join-Path $root 'src-tauri/target'))
    $binary = [IO.Path]::GetFullPath((Join-Path $target 'debug/examples/design_memory_probe.exe'))
    if (-not $binary.StartsWith($target + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Probe binary escaped workspace target.' }
    if (-not (Test-Path -LiteralPath $binary)) { throw 'Probe executable missing; run without -SkipBuild.' }
    if (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $binary }) { throw 'This probe executable is already running.' }
    # Examples do not inherit the production Windows CommonControls manifest.
    # Modify only this disposable example executable, never app or source assets.
    if (-not ('DesignMemoryProbeResources' -as [type])) {
        Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class DesignMemoryProbeResources {
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
    $resource = [DesignMemoryProbeResources]::BeginUpdateResource($binary, $false)
    if ($resource -eq [IntPtr]::Zero) { throw 'Could not open disposable probe manifest resources.' }
    if (-not [DesignMemoryProbeResources]::UpdateResource($resource, [IntPtr]24, [IntPtr]1, 1033, $manifest, $manifest.Length)) {
        [void][DesignMemoryProbeResources]::EndUpdateResource($resource, $true)
        throw 'Could not update disposable probe CommonControls manifest.'
    }
    if (-not [DesignMemoryProbeResources]::EndUpdateResource($resource, $false)) { throw 'Could not save disposable probe manifest.' }
    $server = Start-Process -FilePath $node -ArgumentList @("`"$vite`"", '--host', '127.0.0.1', '--port', "$Port", '--strictPort') `
        -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logs 'vite.stdout.log') -RedirectStandardError (Join-Path $logs 'vite.stderr.log')
    $ready = $false
    $url = "http://127.0.0.1:$Port/scripts/design-memory-probe.html"
    for ($attempt = 0; $attempt -lt 100; $attempt++) {
        if ($server.HasExited) { throw "Probe-owned Vite exited; inspect $logs" }
        try {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2
            if ($response.StatusCode -eq 200 -and $response.Content.Contains('design-memory-isolated-probe')) { $ready = $true; break }
        } catch {}
        Start-Sleep -Milliseconds 200
    }
    if (-not $ready) { throw "Isolated Vite did not become ready; inspect $logs" }
    # Prime only this fixture's module transformation; never fetch production app.
    $null = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/scripts/design-memory-probe.tsx" -UseBasicParsing -TimeoutSec 20
    Write-Host "ISOLATED FIXTURE: $url"
    Write-Host "LOGS: $logs"
    $probeArgs = @('--frontend', "http://127.0.0.1:$Port/", '--timeout', '120')
    if ($KeepOpen) { $probeArgs += '--keep-open' }
    # Hidden console/helper; the probe itself explicitly creates a visible,
    # decorated native WebView2 window labeled SYNTHETIC SQLITE ONLY.
    $probe = Start-Process -FilePath $binary -ArgumentList $probeArgs -WorkingDirectory $root -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $logs 'native.stdout.log') -RedirectStandardError (Join-Path $logs 'native.stderr.log')
    Write-Host "ISOLATED PID: $($probe.Id)"
    $null = $probe.Handle
    if (-not $probe.WaitForExit(180000)) {
        if (-not $KeepOpen) { Stop-Process -Id $probe.Id -Force -ErrorAction SilentlyContinue; throw 'Probe-only timeout; no passing result.' }
        Write-Host 'KeepOpen: close the isolated probe window when finished.'
        $probe.WaitForExit()
    }
    $exitCode = $probe.ExitCode
    Get-Content -LiteralPath (Join-Path $logs 'native.stdout.log') -Encoding UTF8 | Where-Object { -not $_.StartsWith('DESIGN_MEMORY_PROBE_RESULT ') }
    Get-Content -LiteralPath (Join-Path $logs 'native.stderr.log') -Encoding UTF8 | ForEach-Object { Write-Host "NATIVE STDERR: $_" }
    # The native host writes the structured result into its own fresh run
    # directory. Read that file instead of parsing a very long stdout line;
    # this avoids Windows PowerShell stream/encoding truncation and keeps the
    # evidence tied to the native run identity.
    $artifactLine = Get-Content -LiteralPath (Join-Path $logs 'native.stdout.log') -Encoding UTF8 |
        Where-Object { $_.StartsWith('DESIGN_MEMORY_PROBE_ARTIFACTS ') } | Select-Object -Last 1
    if ($artifactLine) {
        $artifact = $artifactLine.Substring('DESIGN_MEMORY_PROBE_ARTIFACTS '.Length).Trim()
        $artifactFull = [IO.Path]::GetFullPath($artifact)
        $tempRoot = [IO.Path]::GetFullPath((Join-Path ([IO.Path]::GetTempPath()) 'inspiration-drawer-design-memory-probe'))
        if (-not $artifactFull.StartsWith($tempRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
            throw 'Native artifact path escaped the designated temporary probe root.'
        }
        $nativeResult = Join-Path $artifactFull 'result.json'
        if (-not (Test-Path -LiteralPath $nativeResult)) { throw 'Native host exited without its structured result.json.' }
        $json = Get-Content -LiteralPath $nativeResult -Raw -Encoding UTF8
        $json | Set-Content -LiteralPath (Join-Path $logs 'result.json') -Encoding utf8
        $parsed = $json | ConvertFrom-Json
        if (-not $parsed.checksPassed -and $exitCode -eq 0) { $exitCode = 1 }
        Write-Host ('PROBE_SUMMARY ' + ([ordered]@{
            checksPassed = $parsed.checksPassed
            checks = @($parsed.checks).Count
            failed = @($parsed.checks | Where-Object { -not $_.passed }).Count
            runtimeErrors = @($parsed.runtimeErrors).Count
            nativeDatabaseAudit = $parsed.nativeDatabaseAudit.passed
            humanVisualVerification = $false
            jsonCompatibilityMode = $parsed.isolation.jsonCompatibilityMode
        } | ConvertTo-Json -Compress))
        Write-Host "RESULT JSON: $(Join-Path $logs 'result.json')"
        Write-Host "NATIVE ARTIFACT: $nativeResult"
    } else {
        Write-Warning 'No native artifact marker/result.json. Loader failure/timeout is NOT a passing smoke.'
        if ($exitCode -eq 0) { $exitCode = 2 }
    }
    Write-Host "NATIVE EXIT: $exitCode"
} finally {
    # Stop only the Vite process this invocation created. Never touch other apps,
    # builders, profiles, DBs or another agent's fixture server.
    if ($server -and -not $server.HasExited) { Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue }
    Pop-Location
}
exit $exitCode
