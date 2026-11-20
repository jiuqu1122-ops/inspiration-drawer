import { invoke } from '@tauri-apps/api/core';

export type RhinoComponentStatus = {
  channel: string;
  components: Array<{ id: string; version: string; revision: number; error?: string | null }>;
  canRollback: boolean;
};
export type RhinoComponentUpdateResult = {
  updated: string[];
  status: RhinoComponentStatus;
  published: boolean;
  pluginRestartRequired: boolean;
  desktopRestartRequired: boolean;
  installationError: string | null;
};
let pending: Promise<RhinoComponentUpdateResult> | undefined;

/** Independent of the desktop version/localStorage marker. Check each launch,
 * and coalesce overlapping manual/automatic checks. Native code serializes writes. */
export async function checkRhinoComponentUpdates(): Promise<RhinoComponentUpdateResult> {
  if (!pending) pending = invoke<RhinoComponentUpdateResult>('check_rhino_updates');
  try { return await pending; } finally { pending = undefined; }
}
export function rhinoComponentUpdateMessage(result: RhinoComponentUpdateResult): string {
  const notices: string[] = [];
  if (!result.published) notices.push('尚未发布独立 Rhino 更新，继续使用当前版本。');
  else if (!result.updated.length) notices.push('Rhino 独立组件已是当前可用版本。');
  if (result.updated.some(id => id.startsWith('plugin'))) notices.push('Rhino 插件更新已缓存，并已同步现有启用的受管插件。');
  if (result.desktopRestartRequired) notices.push('建模模块更新已准备好，重启灵感抽屉后启用，无需重装软件。');
  if (result.pluginRestartRequired) notices.push('请保存工程并重启 Rhino，启用新的原生插件。');
  if (result.installationError) notices.push('插件注册未完成，可在“一键安装 / 更新插件”重试：' + result.installationError);
  return notices.join('');
}
