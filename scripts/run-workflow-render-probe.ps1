param([switch]$Promote, [switch]$Diagnostics, [switch]$DiagnosticsOnly, [switch]$Reopen, [switch]$NoZoom, [switch]$Performance, [switch]$Quick)
if ($Performance -and ($Promote -or $Diagnostics -or $DiagnosticsOnly -or $Reopen -or $NoZoom -or $Quick)) { throw 'Run performance separately from workflow fault injection' }
if ($DiagnosticsOnly) { $Diagnostics = $true }
$ErrorActionPreference = 'Stop'
$probeRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$probeNative = Join-Path $probeRepo 'src-tauri'
Push-Location -LiteralPath $probeNative
try {
    & cargo build --locked --example workflow_render_probe
    if ($LASTEXITCODE -ne 0) { throw 'Probe build failed' }
} finally { Pop-Location }
$probeExe = (Resolve-Path -LiteralPath (Join-Path $probeNative 'target/debug/examples/workflow_render_probe.exe')).Path
if (-not $probeExe.StartsWith((Join-Path $probeNative 'target') + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Probe executable must be under the workspace target directory'
}
if (Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $probeExe }) {
    throw 'An isolated probe is already running; wait for it to finish'
}
# Tauri embeds its manifest into the production binary only. Add the standard
# CommonControls manifest to this disposable example executable, never the app.
if (-not ('WorkflowProbeResources' -as [type])) {
    Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WorkflowProbeResources {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern IntPtr BeginUpdateResource(string path, bool deleteExisting);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern bool UpdateResource(IntPtr handle, IntPtr type, IntPtr name, ushort language, byte[] data, uint size);
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
 public static extern bool EndUpdateResource(IntPtr handle, bool discard);
}
'@
}
$probeManifest = [Text.Encoding]::UTF8.GetBytes('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><dependency><dependentAssembly><assemblyIdentity type="win32" name="Microsoft.Windows.Common-Controls" version="6.0.0.0" processorArchitecture="*" publicKeyToken="6595b64144ccf1df" language="*"/></dependentAssembly></dependency></assembly>')
$probeResource = [WorkflowProbeResources]::BeginUpdateResource($probeExe, $false)
if ($probeResource -eq [IntPtr]::Zero) { throw 'Could not open the disposable probe resource' }
if (-not [WorkflowProbeResources]::UpdateResource($probeResource, [IntPtr]24, [IntPtr]1, 1033, $probeManifest, $probeManifest.Length)) {
    [void][WorkflowProbeResources]::EndUpdateResource($probeResource, $true)
    throw 'Could not write probe manifest'
}
if (-not [WorkflowProbeResources]::EndUpdateResource($probeResource, $false)) { throw 'Could not save probe manifest' }

$probeServer = $null
$probePortBusy = Get-NetTCPConnection -LocalPort 1461 -State Listen -ErrorAction SilentlyContinue
try {
    if (-not $probePortBusy) {
        $probeViteJs = Join-Path $probeRepo 'node_modules/vite/bin/vite.js'
        $probeServer = Start-Process -FilePath (Get-Command node.exe).Source -ArgumentList ('"' + $probeViteJs + '"'), '--host', '127.0.0.1', '--port', '1461', '--strictPort' -WorkingDirectory $probeRepo -WindowStyle Hidden -PassThru
    }
    $probeReady = $false
    for ($probeAttempt = 0; $probeAttempt -lt 20; $probeAttempt++) {
        try {
            $probePage = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:1461/scripts/workflow-render-probe.html' -TimeoutSec 5
            if ($probePage.Content.Contains('Workflow render probe')) { $probeReady = $true; break }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    if (-not $probeReady) { throw 'Port 1461 does not serve the workspace probe fixture' }
    $probeVariant = if ($Performance) { 'performance' } elseif ($Promote) { 'promoted' } else { 'default' }
    $probeOutput = Join-Path $env:TEMP "inspiration-workflow-probe-$probeVariant.out.log"
    $probeErrors = Join-Path $env:TEMP "inspiration-workflow-probe-$probeVariant.err.log"
    $probeArguments = @()
    if ($Performance) { $probeArguments += '--performance' }
    if ($Quick) { $probeArguments += '--quick' }
    if ($Promote) { $probeArguments += '--promote' }
    if ($Diagnostics) { $probeArguments += '--diagnostics' }
    if ($DiagnosticsOnly) { $probeArguments += '--diagnostics-only' }
    if ($Reopen) { $probeArguments += '--reopen' }
    if ($NoZoom) { $probeArguments += '--no-zoom' }
    $probeStartOptions = @{ FilePath=$probeExe; WindowStyle='Hidden'; PassThru=$true;
        RedirectStandardOutput=$probeOutput; RedirectStandardError=$probeErrors }
    if ($probeArguments.Count -gt 0) { $probeStartOptions.ArgumentList = $probeArguments }
    $probeProcess = Start-Process @probeStartOptions
    Write-Output "Isolated probe PID=$($probeProcess.Id), variant=$probeVariant. A test window becomes visible before zoom."
    $probeProcess.WaitForExit()
    Get-Content -Encoding UTF8 -LiteralPath $probeOutput
    $probeLogIdentifier = if ($Performance) { 'com.inspirationdrawer.canvas-performance-probe' } else { "com.inspirationdrawer.workflow-probe-$probeVariant" }
    $probeLocalLog = Join-Path $env:LOCALAPPDATA "$probeLogIdentifier/logs/renderer-diagnostics.jsonl"
    $probeRecords = @(Get-Content -Encoding UTF8 -LiteralPath $probeLocalLog | ForEach-Object { $_ | ConvertFrom-Json } | Where-Object { $_.hostPid -eq $probeProcess.Id })
    if (-not ((Get-Content -Raw -LiteralPath $probeOutput).Contains('PROBE_PASS'))) { throw 'Workflow rendering probe failed' }
    if ($Reopen) {
        $probeExitedReopen = $probeRecords | Where-Object { $_.event -eq 'main_reopen_after' -and $_.details.reason -eq 'probe_exited_renderer_reopen' }
        if (-not $probeExitedReopen -or $probeExitedReopen.context.rendererStatus -ne 'renderer_or_browser_exited') {
            throw 'Reopening an exited renderer was incorrectly reported as healthy'
        }
        if (-not ($probeRecords | Where-Object { $_.event -eq 'main_reopen_after' -and $_.details.reason -eq 'probe_offscreen_reopen' -and $_.details.onScreen })) {
            throw 'Explicit native reopen did not bring the offscreen window back'
        }
        if (@($probeRecords | Where-Object { $_.event -eq 'workflow_start' }).Count -ne 1) { throw 'Reopen changed workflow execution' }
        Write-Output 'REOPEN_PASS'
    }
    if ($Diagnostics) {
        foreach ($probeRequiredEvent in @('frontend_error', 'unhandled_rejection', 'heartbeat_gap', 'heartbeat_recovered', 'probe_host_alive_after_renderer_failure')) {
            if (-not ($probeRecords | Where-Object { $_.event -eq $probeRequiredEvent })) { throw "Missing diagnostic event: $probeRequiredEvent" }
        }
        if (-not ($probeRecords | Where-Object { $_.event -eq 'webview_process_failed' -and $_.details.kind -eq 1 })) {
            throw 'ProcessFailed did not record the intentionally exited renderer'
        }
        if (-not ($probeRecords | Where-Object { $_.event -eq 'heartbeat' -and $_.details.longTaskCount -gt 0 }) -and
            -not ($probeRecords | Where-Object { $_.event -eq 'longtask_unsupported' })) {
            throw 'Long task observation was supported but no task was recorded'
        }
        $probeHide = $probeRecords | Where-Object { $_.event -eq 'window_action_requested' -and $_.details.reason -eq 'probe_hidden_timer_throttling' } | Select-Object -First 1
        $probeShow = $probeRecords | Where-Object { $_.event -eq 'window_action_requested' -and $_.details.reason -eq 'probe_restore' } | Select-Object -First 1
        if (-not $probeHide -or -not $probeShow) { throw 'Native hide/show reasons were not recorded' }
        $probeHiddenGaps = @($probeRecords | Where-Object { $_.event -eq 'heartbeat_gap' -and
            [DateTimeOffset]$_.time -ge [DateTimeOffset]$probeHide.time -and [DateTimeOffset]$_.time -lt [DateTimeOffset]$probeShow.time })
        if ($probeHiddenGaps.Count -gt 0) { throw 'Hidden timer throttling was incorrectly classified as a hang' }
        Write-Output 'DIAGNOSTICS_PASS'
    }
    Write-Output "Bounded native log: $probeLocalLog"
} finally {
    # Only stop the helper process created by this invocation, leaving any
    # existing development server and every user application untouched.
    if ($probeServer -and -not $probeServer.HasExited) { Stop-Process -Id $probeServer.Id }
}
