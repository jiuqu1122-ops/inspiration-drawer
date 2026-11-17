import { invoke, isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import type { ChatGeneratedFile } from '../model/chatTypes';
import type { ChatHtmlArtifact } from './chatHtmlArtifacts';

export async function saveChatHtmlArtifact(artifact: ChatHtmlArtifact, conversationId: string): Promise<boolean> {
  if (!isTauri()) {
    const url = URL.createObjectURL(new Blob([artifact.source], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = artifact.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }
  const destination = await save({ defaultPath: artifact.name, filters: [{ name: 'HTML 网页', extensions: ['html'] }] });
  if (!destination) return false;
  let file = artifact.file && /^(?:html?|html5)$/i.test(artifact.file.format) ? artifact.file : undefined;
  if (!file) {
    const result = await invoke<{ files: ChatGeneratedFile[] }>('chat_create_file', { request: {
      conversationId, fileName: artifact.name, format: 'html', content: artifact.source,
    } });
    file = result.files[0];
    if (!file?.path) throw new Error('HTML 文件生成失败');
  }
  await invoke('chat_copy_generated_file', { sourcePath: file.path, destinationPath: destination });
  return true;
}
