import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
const root = new URL('../../', import.meta.url);
const registration = readFileSync(new URL('src-tauri/src/rhino_installer_register.ps1', root), 'utf8');
const detection = readFileSync(new URL('src-tauri/src/rhino_installer_detect.ps1', root), 'utf8');
const powershellTimeoutMs = 60_000;
function run(script, env = {}) {
  const result = spawnSync(join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
    { encoding: 'utf8', timeout: powershellTimeoutMs, env: { ...process.env, ...env } });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return JSON.parse(result.stdout.trim());
}
// All Registry calls in the real registrar are redirected into an in-memory fixture.
const fakeTypes = [
  'using System; using System.Collections.Generic; using Microsoft.Win32;',
  'public static class FixtureRegistry { public static FixtureHive CurrentUser = new FixtureHive(); }',
  'public class FixtureHive { public Dictionary<string,FixtureKey> Keys = new Dictionary<string,FixtureKey>(); public string FailPath;',
  'public FixtureKey OpenSubKey(string p) { FixtureKey k; return Keys.TryGetValue(p,out k) ? k : null; }',
  'public FixtureKey CreateSubKey(string p) { if (FailPath == p) { FailPath=null; throw new Exception("Injected second-version failure"); } if (!Keys.ContainsKey(p)) Keys[p]=new FixtureKey(); return Keys[p]; } }',
  'public class FixtureKey { public Dictionary<string,object> Values = new Dictionary<string,object>(); public Dictionary<string,RegistryValueKind> Kinds = new Dictionary<string,RegistryValueKind>();',
  'public object GetValue(string n) { return GetValue(n,null); } public object GetValue(string n, object d) { object v; return Values.TryGetValue(n,out v) ? v : d; }',
  'public string[] GetValueNames() { var a=new string[Values.Count]; Values.Keys.CopyTo(a,0); return a; }',
  'public RegistryValueKind GetValueKind(string n) { return Kinds[n]; }',
  'public void SetValue(string n, object v, RegistryValueKind k) { Values[n]=v; Kinds[n]=k; }',
  'public void DeleteValue(string n, bool unused) { Values.Remove(n); Kinds.Remove(n); } public void Dispose() {} }',
].join('\n');
const fakeRegistry = [
  "Add-Type -TypeDefinition '" + fakeTypes + "'",
  '$hive = [FixtureRegistry]::CurrentUser',
  '$roots = @("SOFTWARE\\McNeel\\Rhinoceros\\8.0\\Plug-Ins\\b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5","SOFTWARE\\McNeel\\Rhinoceros\\9.0\\Plug-Ins\\b55c8d32-2c2f-4da2-84ca-b7c88c1a8de5")',
  'foreach ($r in $roots) {',
  '$k=$hive.CreateSubKey($r)',
  '$k.SetValue("Name","previous-name",[Microsoft.Win32.RegistryValueKind]::String)',
  '$k.SetValue("LoadMode",0,[Microsoft.Win32.RegistryValueKind]::DWord)',
  '$k.SetValue("UserCustomValue","untouched",[Microsoft.Win32.RegistryValueKind]::String)',
  '$p=$hive.CreateSubKey("$r\\PlugIn")',
  '$p.SetValue("FileName","previous.rhp",[Microsoft.Win32.RegistryValueKind]::String)',
  '}',
  '$protection = @($roots | ForEach-Object { $_.Replace("\\Plug-Ins\\", "\\Global Options\\Plug-ins\\") })',
  '$legacyProtection = $protection[0].Replace("Global Options", "Global Settings")',
  '$hive.CreateSubKey($protection[1]).SetValue("LoadProtection","2",[Microsoft.Win32.RegistryValueKind]::String)',
  '$hive.CreateSubKey($legacyProtection).SetValue("LoadProtection",2,[Microsoft.Win32.RegistryValueKind]::DWord)',
].join('\n');
function fixtureRegistrations(enableOnInstall = true) {
  const dir = mkdtempSync(join(tmpdir(), 'rhino-registry-fixture-'));
  return [8,9].map(version => {
    const folder=join(dir,String(version)); mkdirSync(folder);
    const pluginPath=join(folder,'InspirationDrawer.Rhino.rhp'); writeFileSync(pluginPath,'never loaded');
    return {version,pluginPath,enableOnInstall};
  });
}
const mockScript = registration.replaceAll('[Microsoft.Win32.Registry]::CurrentUser', '[FixtureRegistry]::CurrentUser');
const capture = [
  '$values=@($roots | ForEach-Object {',
  '$k=$hive.OpenSubKey($_); $p=$hive.OpenSubKey("$_\\PlugIn")',
  '[ordered]@{name=$k.GetValue("Name","missing");mode=$k.GetValue("LoadMode",-1);extra=$k.GetValue("EnglishName","missing");custom=$k.GetValue("UserCustomValue","missing");path=$p.GetValue("FileName","missing")}',
  '})',
  '$preferences=@($protection | ForEach-Object { $key=$hive.OpenSubKey($_); if ($key) { $key.GetValue("LoadProtection", -1) } else { -1 } })',
  '@{error=$failure;values=$values;preferences=$preferences;legacy=$hive.OpenSubKey($legacyProtection).GetValue("LoadProtection")} | ConvertTo-Json -Compress -Depth 6',
].join('\n');
describe.runIf(process.platform === 'win32')('Rhino PowerShell registrar and runtime detection fixtures', { timeout: powershellTimeoutMs + 5_000 }, () => {
  it('enables both versions during manual installation without touching unrelated user values', () => {
    const plans=fixtureRegistrations();
    const result=run(fakeRegistry+'\n$failure=$null\n& {\n'+mockScript+'\n} | Out-Null\n'+capture,{DRAWER_RHINO_REGISTRATIONS:JSON.stringify(plans)});
    expect(result.error).toBeNull();
    result.values.forEach((v,i) => expect(v).toMatchObject({name:'InspirationDrawer.Rhino',mode:1,custom:'untouched',path:plans[i].pluginPath}));
    expect(result.preferences).toEqual(['1', '1']);
    expect(result.legacy).toBe('1');
  });
  it('preserves load preferences during automatic synchronization', () => {
    const plans=fixtureRegistrations(false);
    const result=run(fakeRegistry+'\n$failure=$null\n& {\n'+mockScript+'\n} | Out-Null\n'+capture,{DRAWER_RHINO_REGISTRATIONS:JSON.stringify(plans)});
    expect(result.error).toBeNull();
    result.values.forEach((v,i) => expect(v).toMatchObject({mode:0,path:plans[i].pluginPath}));
    expect(result.preferences).toEqual([-1, '2']);
    expect(result.legacy).toBe(2);
  });
  it('restores both versions if the second registration fails', () => {
    const result=run(fakeRegistry+'\n$hive.FailPath=$roots[1]+"\\PlugIn"\n$failure=$null\ntry { & {\n'+mockScript+'\n} | Out-Null } catch { $failure=$_.Exception.Message }\n'+capture,{DRAWER_RHINO_REGISTRATIONS:JSON.stringify(fixtureRegistrations())});
    expect(result.error).toContain('all touched current-user registry values were restored');
    expect(result.values).toEqual([8,9].map(() => ({name:'previous-name',mode:0,extra:'missing',custom:'untouched',path:'previous.rhp'})));
    expect(result.preferences).toEqual([-1, '2']);
    expect(result.legacy).toBe(2);
  });
  it('does not misidentify a Rhino 9 executable as Rhino 8 through a stale install registry key', () => {
    const helper = detection.slice(detection.indexOf('function Find-RhinoExecutable('), detection.indexOf('function Get-RhinoRuntimeMode('));
    const plans = fixtureRegistrations();
    const setup = fakeRegistry + '\n' + helper + '\nfunction Get-RhinoExecutableMajor([string]$path) { return 9 }\n' +
      '$install=$hive.CreateSubKey("FixtureInstall")\n' +
      '$install.SetValue("ExePath",$env:FIXTURE_EXE,[Microsoft.Win32.RegistryValueKind]::String)\n' +
      '@{as8=(Find-RhinoExecutable $install 8);as9=(Find-RhinoExecutable $install 9)} | ConvertTo-Json -Compress';
    const result = run(setup, { FIXTURE_EXE: plans[1].pluginPath });
    expect(result.as8).toBeNull();
    expect(realpathSync.native(result.as9)).toBe(realpathSync.native(plans[1].pluginPath));
  });
  it('distinguishes Framework, modern .NET, mixed and unknown module sets', () => {
    const helper=detection.slice(detection.indexOf('function Get-RhinoRuntimeMode('), detection.indexOf('$processes = @()'));
    const result=run(helper+'\n@((Get-RhinoRuntimeMode @("clr.dll")),(Get-RhinoRuntimeMode @("coreclr.dll")),(Get-RhinoRuntimeMode @("clr.dll","coreclr.dll")),(Get-RhinoRuntimeMode @())) | ConvertTo-Json -Compress');
    expect(result).toEqual(['netfx','netcore','mixed','unknown']);
  });
  it('finds a default-location Rhino candidate only when its executable major version matches', () => {
    const helper = detection.slice(detection.indexOf('function Find-RhinoExecutable('), detection.indexOf('function Get-RhinoRuntimeMode('));
    const [{ pluginPath }] = fixtureRegistrations();
    const script = helper + '\nfunction Get-RhinoExecutableMajor([string]$path) { return 9 }\n'
      + '@{as8=(Find-RhinoExecutable $null 8 @($env:FIXTURE_EXE));as9=(Find-RhinoExecutable $null 9 @($env:FIXTURE_EXE))} | ConvertTo-Json -Compress';
    const result = run(script, { FIXTURE_EXE: pluginPath });
    expect(result.as8).toBeNull();
    expect(realpathSync.native(result.as9)).toBe(realpathSync.native(pluginPath));
  });
  it('ignores earlier process logs and old payloads when reporting actual plugin startup', () => {
    const helper = detection.slice(detection.indexOf('function Get-RhinoPluginLoadState('), detection.indexOf('$processes = @()'));
    const localAppData = mkdtempSync(join(tmpdir(), 'rhino-startup-fixture-'));
    const logs = join(localAppData, 'InspirationDrawer', 'RhinoBeta');
    mkdirSync(logs, { recursive: true });
    const assembly = 'C:\\App\\InspirationDrawer.Rhino.rhp';
    const entry = (phase, at, path = assembly) => JSON.stringify({ at, phase, assembly: path });
    writeFileSync(join(logs, 'startup-100.log'), entry('plugin.load.completed', '2026-11-24T00:00:00Z'));
    writeFileSync(join(logs, 'startup-101.log'), entry('plugin.load.completed', '2026-11-24T02:00:00Z', 'C:\\Old\\InspirationDrawer.Rhino.rhp'));
    writeFileSync(join(logs, 'startup-102.log'), entry('plugin.load.completed', '2026-11-24T02:00:00Z'));
    writeFileSync(join(logs, 'startup-103.log'), entry('plugin.load.failed', '2026-11-24T02:00:00Z'));
    const script = helper + '\n@(100,101,102,103 | ForEach-Object {'
      + 'Get-RhinoPluginLoadState @{ Id=$_; Started=[DateTimeOffset]::Parse("2026-11-24T01:00:00Z") } $env:FIXTURE_PLUGIN'
      + '}) | ConvertTo-Json -Compress';
    expect(run(script, { FIXTURE_PLUGIN: assembly, LOCALAPPDATA: localAppData })).toEqual(['awaiting', 'awaiting', 'loaded', 'failed']);
  });
});
