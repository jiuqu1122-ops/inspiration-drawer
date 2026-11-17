import { invoke, isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { parsePrototype, type PrototypeDocument } from './prototypeSchema';
import { prototypeFileName } from './prototypeHtml';
import { buildPrototypeSketch } from './prototypeSketch';
import type { ChatGeneratedFile } from '../model/chatTypes';

export async function createPrototypePackage(value: unknown, conversationId: string): Promise<{ files: ChatGeneratedFile[]; prototype: { id: string; name: string; screens: number; nodes: number; interactions: number } }> {
  const prototype = parsePrototype(value);
  return invoke('chat_create_prototype', { request: { conversationId, prototypeJson: JSON.stringify(prototype), sketchJson: JSON.stringify(buildPrototypeSketch(prototype)) } });
}
export async function savePrototypePackage(prototype: PrototypeDocument, conversationId: string, existingFile?: ChatGeneratedFile): Promise<boolean> {
  if (!isTauri()) throw new Error('Figma 设计文件需在灵感抽屉桌面端导出。');
  const destination = await save({ defaultPath: `${prototypeFileName(prototype.name)}.sketch`, filters: [{ name: '可导入 Figma 的 Sketch 设计文件', extensions: ['sketch'] }] });
  if (!destination) return false;
  const file = existingFile?.format === 'sketch' ? existingFile : (await createPrototypePackage(prototype, conversationId)).files[0];
  if (!file?.path) throw new Error('尚未创建设计文件，不能导出');
  await invoke('chat_copy_generated_file', { sourcePath: file.path, destinationPath: destination });
  return true;
}
