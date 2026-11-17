import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ invoke: vi.fn(), save: vi.fn(), isTauri: vi.fn(() => true) }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: mocks.invoke, isTauri: mocks.isTauri }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: mocks.save }));
import { saveChatHtmlArtifact } from './saveChatHtmlArtifact';
import type { ChatHtmlArtifact } from './chatHtmlArtifacts';
const artifact: ChatHtmlArtifact = { id: 'a', messageId: 'm', source: '<html><h1>中文</h1><script>let n=1;</script></html>', name: '交互原型.html', streaming: false };
beforeEach(() => { vi.clearAllMocks(); mocks.isTauri.mockReturnValue(true); mocks.save.mockResolvedValue('C:/user/prototype.html'); });
describe('save HTML artifact', () => {
  it('exports a fenced-code artifact through the real file writer and normal save flow', async () => {
    mocks.invoke.mockResolvedValueOnce({ files: [{ id: 'f', path: 'C:/generated/page.html' }] }).mockResolvedValueOnce('C:/user/prototype.html');
    await expect(saveChatHtmlArtifact(artifact, 'conversation-a')).resolves.toBe(true);
    expect(mocks.invoke).toHaveBeenNthCalledWith(1, 'chat_create_file', { request: { conversationId: 'conversation-a', fileName: '交互原型.html', format: 'html', content: artifact.source } });
    expect(mocks.invoke).toHaveBeenNthCalledWith(2, 'chat_copy_generated_file', { sourcePath: 'C:/generated/page.html', destinationPath: 'C:/user/prototype.html' });
  });
  it('reuses the real generated file instead of regenerating or executing its script', async () => {
    mocks.invoke.mockResolvedValueOnce('C:/user/prototype.html');
    await saveChatHtmlArtifact({ ...artifact, file: { id: 'f', path: 'C:/generated/page.html', name: 'page.html', format: 'html' } }, 'c');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.calls[0][0]).toBe('chat_copy_generated_file');
  });
  it('does not create a file when the user cancels the save dialog', async () => {
    mocks.save.mockResolvedValueOnce(null);
    await expect(saveChatHtmlArtifact(artifact, 'c')).resolves.toBe(false);
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it('does not claim to save a failed or missing file', async () => {
    mocks.invoke.mockResolvedValueOnce({ files: [] });
    await expect(saveChatHtmlArtifact(artifact, 'c')).rejects.toThrow('HTML 文件生成失败');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
