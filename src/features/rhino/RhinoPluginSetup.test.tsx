import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(), states: [] as unknown[], cursor: 0, refs: [] as Array<{ current: unknown }>, refCursor: 0,
  effects: [] as Array<() => void>,
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = mocks.cursor++;
    if (index >= mocks.states.length) mocks.states[index] = initial;
    return [mocks.states[index], (value: unknown) => { mocks.states[index] = value; }];
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
beforeEach(() => {
  mocks.states.length = 0; mocks.refs.length = 0; mocks.effects.length = 0; mocks.invoke.mockReset();
  mocks.invoke.mockResolvedValue(versions);
});
afterEach(() => vi.restoreAllMocks());
describe('Rhino plugin setup', () => {
  it('detects Rhino 8 and 9 without mutating installations', async () => {
    render(); mocks.effects[0](); await settle();
    expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('rhino_plugin_status');
    expect(installButton(render()).props.disabled).toBe(false);
    expect(mocks.states[0]).toEqual(versions);
  });
  it('installs both detected versions once and reports the required restart', async () => {
    render(); mocks.effects[0](); await settle();
    const installed = versions.map(v => ({ ...v, installed: true }));
    mocks.invoke.mockResolvedValueOnce({ installed, restartRequired: true });
    const button = installButton(render());
    button.props.onClick(); button.props.onClick(); await settle();
    expect(mocks.invoke.mock.calls.filter(call => call[0] === 'install_rhino_plugin')).toHaveLength(1);
    expect(mocks.states[0]).toEqual(installed);
    expect(String(mocks.states[3])).toContain('\u91cd\u542f');
    expect(installButton(render()).props.disabled).toBe(false);
  });
  it('keeps installation disabled when Rhino is not detected', async () => {
    mocks.invoke.mockResolvedValue([]);
    render(); mocks.effects[0](); await settle();
    expect(installButton(render()).props.disabled).toBe(true);
  });
  it('reports native installer errors and allows retry', async () => {
    render(); mocks.effects[0](); await settle();
    mocks.invoke.mockRejectedValueOnce('Registration failed');
    installButton(render()).props.onClick(); await settle();
    expect(mocks.states[2]).toBe('Registration failed');
    expect(installButton(render()).props.disabled).toBe(false);
  });
});

it('shows a duplicate-ID conflict even when the current canonical plugin is installed',async()=>{
 mocks.invoke.mockResolvedValueOnce([{...versions[1],installed:true,conflictingPackagePaths:['C:/fixture/packages/9.0/inspiration-drawer-rhino/0.1.0-beta.1']}]);
 render();mocks.effects[0]();await settle();const tree=render();
 const labels=nodes(tree).flatMap(node=>Array.isArray(node.props.children)?node.props.children.filter((value:unknown)=>typeof value==='string'):typeof node.props.children==='string'?[node.props.children]:[]).join(' ');
 expect(labels).toContain('旧包 ID 冲突');expect(labels).toContain('不会删除');expect(labels).toContain('先退出');
});
it('reports the number of repaired duplicate packages and the backup location',async()=>{
 render();mocks.effects[0]();await settle();mocks.invoke.mockResolvedValueOnce({installed:versions,restartRequired:false,repairedConflicts:1,conflictBackups:['C:/fixture/backups/migration-1/0.1.0-beta.1']});
 installButton(render()).props.onClick();await settle();expect(String(mocks.states[3])).toContain('已修复 1 个同 ID 旧包冲突');expect(String(mocks.states[3])).toContain('C:/fixture/backups');
});
