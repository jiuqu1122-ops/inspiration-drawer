import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), detect: vi.fn(), prepare: vi.fn(), install: vi.fn(), rollback: vi.fn(),
  states: [] as unknown[], cursor: 0, refs: [] as Array<{ current: unknown }>, refCursor: 0,
  effects: [] as Array<() => void>,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = mocks.cursor++;
    if (index >= mocks.states.length) mocks.states[index] = initial;
    return [mocks.states[index], (value: unknown) => { mocks.states[index] = typeof value === 'function' ? value(mocks.states[index]) : value; }];
  },
  useRef: (initial: unknown) => {
    const index = mocks.refCursor++;
    if (!mocks.refs[index]) mocks.refs[index] = { current: initial };
    return mocks.refs[index];
  },
  useCallback: (fn: unknown) => fn,
  useEffect: (fn: () => void) => mocks.effects.push(fn),
}));
import { RhinoPluginSetup } from './RhinoPluginSetup';
const versions = [
  { majorVersion: 8, exePath: 'C:/Rhino8/Rhino.exe', running: false, pluginPath: null, installed: false },
  { majorVersion: 9, exePath: 'C:/Rhino9/Rhino.exe', running: true, pluginPath: 'C:/old/plugin.rhp', installed: false },
];
function render() {
  mocks.cursor = 0; mocks.refCursor = 0;
  return RhinoPluginSetup({ expanded: true, onToggle: vi.fn() });
}
type Element = ReactElement<Record<string, any>>;
function nodes(value: unknown): Element[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object' || !('props' in value)) return [];
  const element = value as Element;
  return [element, ...nodes(element.props.children)];
}
const installButton = (tree: unknown) => nodes(tree).find(node => node.type === 'button' && String(node.props.children).includes('\u4e00\u952e\u5b89\u88c5'))!;
const settle = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const status = { channel: 'rhino-v1', components: [], canRollback: true };
const update = { status, updated: [], published: true, pluginRestartRequired: false, desktopRestartRequired: false, installationError: null };
beforeEach(() => {
  mocks.states.length = 0; mocks.refs.length = 0; mocks.effects.length = 0; mocks.invoke.mockReset();
  mocks.detect.mockReset().mockResolvedValue(versions);
  mocks.prepare.mockReset().mockResolvedValue(update);
  mocks.install.mockReset().mockResolvedValue({ installed: versions, restartRequired: false });
  mocks.rollback.mockReset().mockResolvedValue({ ...update, status: { ...status, canRollback: false } });
  mocks.invoke.mockImplementation((command: string, ...args: unknown[]) => {
    switch (command) {
      case 'rhino_plugin_status': return mocks.detect();
      case 'rhino_update_status': return Promise.resolve(status);
      case 'check_rhino_updates': return mocks.prepare(...args);
      case 'install_rhino_plugin': return mocks.install();
      case 'rollback_rhino_update': return mocks.rollback();
      default: throw new Error('Unexpected command ' + command);
    }
  });
});
afterEach(() => vi.restoreAllMocks());
describe('Rhino plugin setup', () => {
  it('detects Rhino 8 and 9 without mutating installations', async () => {
    render(); mocks.effects[0](); await settle();
    expect(mocks.invoke.mock.calls).toEqual([['rhino_plugin_status'], ['rhino_update_status']]);
    expect(installButton(render()).props.disabled).toBe(false);
    expect(mocks.states[0]).toEqual(versions);
  });
  it('distinguishes installed and registered files from a Rhino plug-in confirmed loaded at runtime', async () => {
    mocks.detect.mockResolvedValueOnce([{ ...versions[1], installed: true }]);
    render(); mocks.effects[0](); await settle();
    const tree = JSON.stringify(render());
    expect(tree).toContain('\u5df2\u6ce8\u518c\uff08\u672a\u786e\u8ba4 Rhino \u5df2\u52a0\u8f7d\uff09');
    expect(tree).toContain('插件状态只反映注册和文件校验');
  });
  it('explains per-user install mismatches and Rhino load protection', async () => {
    mocks.detect.mockResolvedValueOnce([{
      ...versions[1], installed: true, loadMode: 1, loadProtection: 2, runningAsCurrentUser: false,
    }]);
    render(); mocks.effects[0](); await settle();
    const tree = JSON.stringify(render());
    expect(tree).toContain('\u53e6\u4e00 Windows \u8d26\u6237');
    expect(tree).toContain('\u52a0\u8f7d\u4fdd\u62a4\u786e\u8ba4');
    expect(tree).toContain('C:/old/plugin.rhp');
  });
  it('does not claim a mismatched registered file is the installed current payload', async () => {
    mocks.detect.mockResolvedValueOnce([{ ...versions[1], installed: false }]);
    render(); mocks.effects[0](); await settle();
    expect(JSON.stringify(render())).toContain('\u6ce8\u518c\u8def\u5f84\u4e0e\u5b89\u88c5\u6587\u4ef6\u4e0d\u5339\u914d');
  });
  it('installs both detected versions once and reports the required restart', async () => {
    render(); mocks.effects[0](); await settle();
    const installed = versions.map(v => ({ ...v, installed: true }));
    mocks.install.mockResolvedValueOnce({ installed, restartRequired: true });
    const button = installButton(render());
    button.props.onClick(); button.props.onClick(); await settle();
    expect(mocks.invoke.mock.calls.slice(2)).toEqual([['check_rhino_updates', { prepareOnly: true }], ['install_rhino_plugin']]);
    expect(mocks.states[0]).toEqual(installed);
    expect(String(mocks.states[3])).toContain('\u91cd\u542f');
    expect(installButton(render()).props.disabled).toBe(false);
  });
  it('can update the modeling module without registering a plugin when no Rhino host is detected', async () => {
    mocks.detect.mockResolvedValue([]);
    mocks.prepare.mockResolvedValueOnce({ ...update, updated: ['runtime'], desktopRestartRequired: true });
    render(); mocks.effects[0](); await settle();
    installButton(render()).props.onClick(); await settle();
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith({ prepareOnly: true });
    expect(mocks.install).not.toHaveBeenCalled();
    expect(mocks.states[3]).toContain('重启灵感抽屉');
  });
  it('installs the local plugin when the update channel is offline and shows both outcomes', async () => {
    render(); mocks.effects[0](); await settle();
    mocks.prepare.mockRejectedValueOnce(new Error('offline'));
    installButton(render()).props.onClick(); await settle();
    expect(mocks.install).toHaveBeenCalledOnce();
    expect(mocks.states[2]).toContain('offline');
    expect(mocks.states[3]).toContain('安装完成');
  });
  it('preserves a prepared runtime and its restart notice when native registration fails', async () => {
    render(); mocks.effects[0](); await settle();
    mocks.prepare.mockResolvedValueOnce({ ...update, updated: ['runtime'], desktopRestartRequired: true });
    mocks.install.mockRejectedValueOnce('registry denied');
    installButton(render()).props.onClick(); await settle();
    expect(mocks.states[3]).toContain('重启灵感抽屉');
    expect(mocks.states[2]).toContain('registry denied');
  });
  it('places rollback under version details, blocks it during installation, and refreshes registration after rollback', async () => {
    render(); mocks.effects[0](); await settle();
    const tree = render();
    const details = nodes(tree).find(e => e.type === 'details' && nodes(e).some(n => n.type === 'summary' && n.props.children === '版本与回退'))!;
    const rollback = nodes(details).find(e => e.type === 'button')!;
    installButton(tree).props.onClick();
    rollback.props.onClick(); await settle();
    expect(mocks.rollback).not.toHaveBeenCalled();
    rollback.props.onClick(); await settle();
    expect(mocks.invoke.mock.calls.slice(-2)).toEqual([['rollback_rhino_update'], ['rhino_plugin_status']]);
    expect(nodes(render()).find(e => e.type === 'button' && e.props.children === '回退上次更新')?.props.disabled).toBe(true);
  });
  it('reports native installer errors and allows retry', async () => {
    render(); mocks.effects[0](); await settle();
    mocks.install.mockRejectedValueOnce('Registration failed');
    installButton(render()).props.onClick(); await settle();
    expect(mocks.states[2]).toBe('Registration failed');
    expect(installButton(render()).props.disabled).toBe(false);
  });
});

it('shows a duplicate-ID conflict even when the current canonical plugin is installed',async()=>{
 mocks.detect.mockResolvedValueOnce([{...versions[1],installed:true,conflictingPackagePaths:['C:/fixture/packages/9.0/inspiration-drawer-rhino/0.1.0-beta.1']}]);
 render();mocks.effects[0]();await settle();const tree=render();
 const labels=nodes(tree).flatMap(node=>Array.isArray(node.props.children)?node.props.children.filter((value:unknown)=>typeof value==='string'):typeof node.props.children==='string'?[node.props.children]:[]).join(' ');
 expect(labels).toContain('旧包 ID 冲突');expect(labels).toContain('不会删除');expect(labels).toContain('先退出');
});
it('reports the number of repaired duplicate packages and the backup location',async()=>{
 render();mocks.effects[0]();await settle();mocks.install.mockResolvedValueOnce({installed:versions,restartRequired:false,repairedConflicts:1,conflictBackups:['C:/fixture/backups/migration-1/0.1.0-beta.1']});
 installButton(render()).props.onClick();await settle();expect(String(mocks.states[3])).toContain('已修复 1 个同 ID 旧包冲突');expect(String(mocks.states[3])).toContain('C:/fixture/backups');
});

it('reports removed old managed versions and the restore backup path', async () => {
  render(); mocks.effects[0](); await settle();
  mocks.install.mockResolvedValueOnce({ installed: versions, restartRequired: false, cleanedVersions: 2, cleanupBackups: ['C:/fixture/backups/old-payload'] });
  installButton(render()).props.onClick(); await settle();
  expect(String(mocks.states[3])).toContain('\u6e05\u7406 2 \u4e2a\u65e7\u7248\u63d2\u4ef6');
  expect(String(mocks.states[3])).toContain('C:/fixture/backups/old-payload');
});
it('explains deferred cleanup without pretending a loaded plugin was removed', async () => {
  render(); mocks.effects[0](); await settle();
  mocks.install.mockResolvedValueOnce({ installed: versions, restartRequired: true, cleanupDeferred: true });
  installButton(render()).props.onClick(); await settle();
  expect(String(mocks.states[3])).toContain('\u65e7\u7248\u6587\u4ef6\u6682\u4e0d\u6e05\u7406');
});
it('keeps a successful new installation while reporting a refused unsafe cleanup', async () => {
  render(); mocks.effects[0](); await settle();
  mocks.install.mockResolvedValueOnce({ installed: versions, restartRequired: false, cleanupWarnings: ['Unsafe linked folder'] });
  installButton(render()).props.onClick(); await settle();
  expect(String(mocks.states[2])).toContain('Unsafe linked folder');
  expect(String(mocks.states[3])).toContain('\u5b89\u88c5\u5b8c\u6210');
});
