import { getVersion } from '@tauri-apps/api/app';
import { invoke } from '@tauri-apps/api/core';

export const RHINO_PLUGIN_SYNC_VERSION_KEY = 'drawer_rhino_plugin_sync_version';
const LAST_RESULT_KEY = 'drawer_rhino_plugin_sync_result';
export type RhinoPluginSyncResult = {
  version: string;
  status: 'updated' | 'current' | 'skipped' | 'error';
  message: string;
};
type NativeSyncResult = { updatedVersions: number[]; skippedDisabledVersions?: number[]; restartRequired: boolean };
let pending: Promise<RhinoPluginSyncResult | null> | null = null;

export function readRhinoPluginSyncResult(): RhinoPluginSyncResult | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LAST_RESULT_KEY) || 'null');
    if (!value || typeof value !== 'object') return null;
    const result = value as Record<string, unknown>;
    if (typeof result.version !== 'string' || typeof result.message !== 'string'
      || !['updated', 'current', 'skipped', 'error'].includes(String(result.status))) return null;
    return result as RhinoPluginSyncResult;
  } catch { return null; }
}

/** Main desktop startup only. No model/Rhino/HTML tool is granted this capability. */
export async function syncRhinoPluginsAfterClientUpdate(): Promise<RhinoPluginSyncResult | null> {
  if (pending) return pending;
  pending = (async () => {
    const version = await getVersion();
    if (localStorage.getItem(RHINO_PLUGIN_SYNC_VERSION_KEY) === version) return null;
    let result: RhinoPluginSyncResult;
    try {
      const native = await invoke<NativeSyncResult>('auto_update_managed_rhino_plugins');
      result = {
        version,
        status: native.updatedVersions.length ? 'updated' : native.skippedDisabledVersions?.length ? 'skipped' : 'current',
        message: native.updatedVersions.length
          ? `Rhino ${native.updatedVersions.join(' / ')} 插件已随软件自动更新。${native.restartRequired ? '请保存工程并重启 Rhino 后使用新版；当前已加载的文件未改动。' : '下次启动 Rhino 即可使用新版。'}`
          : native.skippedDisabledVersions?.length
            ? `Rhino ${native.skippedDisabledVersions.join(' / ')} 插件被设置为禁用，自动同步未重新启用它。需要启用插件时，请到设置 → Rhino 插件手动更新。`
            : '已检查现有 Rhino 插件：无需更新，未给未安装的 Rhino 安装插件。',
      };
      localStorage.setItem(RHINO_PLUGIN_SYNC_VERSION_KEY, version);
    } catch (error) {
      result = { version, status: 'error', message: `Rhino 插件自动更新未完成，请在设置 → Rhino 插件中重试。具体原因：${String(error)}` };
      // A failed attempt is not marked current; the next desktop launch can retry.
    }
    try { localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result)); } catch { /* A storage failure must not undo a completed native update. */ }
    return result;
  })();
  try { return await pending; } finally { pending = null; }
}
