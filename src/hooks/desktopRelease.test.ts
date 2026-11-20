import { describe, expect, it } from 'vitest';
import packageSource from '../../package.json?raw';
import npmLock from '../../package-lock.json?raw';
import tauriSource from '../../src-tauri/tauri.conf.json?raw';
import cargoSource from '../../src-tauri/Cargo.toml?raw';
import cargoLock from '../../src-tauri/Cargo.lock?raw';
import workflow from '../../.github/workflows/desktop-release.yml?raw';
import readme from '../../README.md?raw';
import releaseNotes from '../../docs/releases/8.0.35.md?raw';

describe('8.0.35 formal desktop release', () => {
  it('uses one version across the app, native crate and lockfiles without changing identity', () => {
    const pkg = JSON.parse(packageSource); const lock = JSON.parse(npmLock); const tauri = JSON.parse(tauriSource);
    expect(pkg.version).toBe('8.0.35'); expect(lock.version).toBe(pkg.version); expect(lock.packages[''].version).toBe(pkg.version);
    expect(tauri.version).toBe(pkg.version); expect(cargoSource).toMatch(/^version = "8\.0\.35"$/m);
    expect(cargoLock.replace(/\r\n/g, '\n')).toContain('name = "inspiration-drawer"\nversion = "8.0.35"');
    expect(tauri.identifier).toBe('com.inspirationdrawer.app'); expect(tauri.productName).toBe('Inspiration Drawer');
    expect(tauri.bundle.createUpdaterArtifacts).toBe(true);
  });
  it('documents the matching download and post-8.0.27 features concisely', () => {
    const version = JSON.parse(packageSource).version;
    expect(readme).toContain(`当前已发布版本：**${version}**`);
    expect(readme).toContain(`releases/download/v${version}/Inspiration.Drawer_${version}_x64-setup.exe`);
    for (const feature of ['8.0.28 更新', '8.0.29 更新', '8.0.30 更新', '8.0.34 更新', 'Canvas 预览', '.sketch', 'Rhino 8/9', 'GitHub Skills']) expect(readme).toContain(feature);
  });
  it('enables online updates and pins the native toolchain tested for release', () => {
    expect(workflow).toContain("VITE_DISABLE_APP_UPDATES: 'false'");
    expect(workflow).toContain('dtolnay/rust-toolchain@1.98.0');
    expect(workflow).toContain('--latest'); expect(workflow).toContain('TAURI_SIGNING_PRIVATE_KEY');
    for (const feature of ['Rhino', 'GH2', 'Python.Runtime.PyObject', '24', '独立', '\u6062\u590d\u5907\u4efd', '\u91cd\u542f']) expect(releaseNotes).toContain(feature);
    expect(tauriSource).toContain('https://gitee.com/zibinyou/inspiration-drawer/releases/download/latest/latest.json');
    expect(tauriSource).toContain('https://github.com/jiuqu1122-ops/inspiration-drawer/releases/latest/download/latest.json');
  });
});
