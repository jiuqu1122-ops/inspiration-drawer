import { describe, expect, it } from 'vitest';
import packageSource from '../../package.json?raw';
import npmLock from '../../package-lock.json?raw';
import tauriSource from '../../src-tauri/tauri.conf.json?raw';
import cargoSource from '../../src-tauri/Cargo.toml?raw';
import cargoLock from '../../src-tauri/Cargo.lock?raw';
import workflow from '../../.github/workflows/desktop-release.yml?raw';
import releaseNotes from '../../docs/releases/8.0.29.md?raw';

describe('8.0.29 formal desktop release', () => {
  it('uses one version across the app, native crate and lockfiles without changing identity', () => {
    const pkg = JSON.parse(packageSource); const lock = JSON.parse(npmLock); const tauri = JSON.parse(tauriSource);
    expect(pkg.version).toBe('8.0.29'); expect(lock.version).toBe(pkg.version); expect(lock.packages[''].version).toBe(pkg.version);
    expect(tauri.version).toBe(pkg.version); expect(cargoSource).toMatch(/^version = "8\.0\.29"$/m);
    expect(cargoLock.replace(/\r\n/g, '\n')).toContain('name = "inspiration-drawer"\nversion = "8.0.29"');
    expect(tauri.identifier).toBe('com.inspirationdrawer.app'); expect(tauri.productName).toBe('Inspiration Drawer');
    expect(tauri.bundle.createUpdaterArtifacts).toBe(true);
  });
  it('enables online updates and pins the native toolchain tested for release', () => {
    expect(workflow).toContain("VITE_DISABLE_APP_UPDATES: 'false'");
    expect(workflow).toContain('dtolnay/rust-toolchain@1.98.0');
    expect(workflow).toContain('--latest'); expect(workflow).toContain('TAURI_SIGNING_PRIVATE_KEY');
    expect(releaseNotes).toContain('.sketch'); expect(releaseNotes).toContain('原生 .fig');
    expect(releaseNotes).toContain('退出 Rhino');
  });
});
