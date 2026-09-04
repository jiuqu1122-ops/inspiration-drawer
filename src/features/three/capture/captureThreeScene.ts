import { invoke } from '@tauri-apps/api/core';

type InvokeCommand = (command: string, args?: Record<string, unknown>) => Promise<unknown>;

export const saveThreeSceneCapture = async (
  dataUrl: string,
  fileName: string,
  invokeCommand: InvokeCommand = (command, args) => invoke(command, args),
) => {
  if (!/^data:image\/png;base64,/i.test(dataUrl)) throw new Error('3D 视角截图数据无效');
  const path = String(await invokeCommand('save_dropped_file', { fileName, dataUrl }) || '').trim();
  if (!path) throw new Error('3D 视角截图保存失败');
  return path;
};
