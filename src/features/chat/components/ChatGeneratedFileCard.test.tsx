import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
import { ChatGeneratedFileCard } from './ChatGeneratedFileCard';
import { getGeneratedFilesFromToolCall, type ChatToolCall } from '../model/chatTypes';
describe('presentation generated-file delivery', () => {
  it('keeps real pptx metadata and page count through the normal file-result parser and UI', () => {
    const call = { toolName: 'create_file', status: 'completed', resultJson: JSON.stringify({ files: [{ id: 'file-ppt', name: '设计方案.pptx', format: 'pptx', path: 'C:/generated/deck.pptx', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size: 12000, slideCount: 8 }], warnings: ['长内容已自动分页'] }) } as ChatToolCall;
    const [file] = getGeneratedFilesFromToolCall(call);
    expect(file).toMatchObject({ format: 'pptx', slideCount: 8, warnings: ['长内容已自动分页'] });
    const html = renderToStaticMarkup(<ChatGeneratedFileCard file={file} />);
    for (const value of ['设计方案.pptx', 'PowerPoint 演示文稿', '8 页', '另存为', '打开文件', '长内容已自动分页']) expect(html).toContain(value);
  });
  it('does not create a download card from an unsuccessful or fake outline-only result', () => {
    expect(getGeneratedFilesFromToolCall({ toolName: 'create_file', status: 'error', resultJson: '{"files":[{"path":"fake.pptx"}]}' } as ChatToolCall)).toEqual([]);
    expect(getGeneratedFilesFromToolCall({ toolName: 'create_file', status: 'completed', resultJson: '{"content":"outline only"}' } as ChatToolCall)).toEqual([]);
  });
});


it('offers preview and real save actions for generated HTML', () => {
  const html = renderToStaticMarkup(<ChatGeneratedFileCard file={{ id: 'f', name: '页面.html', path: 'C:/generated/page.html', format: 'html' }} onPreview={() => {}} />);
  expect(html).toContain('HTML 网页');
  expect(html).toContain('预览 HTML');
  expect(html).toContain('另存为');
});


it('provides direct Figma import instructions for a Sketch file, not a plugin installation', () => {
  const html=renderToStaticMarkup(<ChatGeneratedFileCard file={{id:'design',name:'界面.sketch',path:'C:/generated/design.sketch',format:'sketch'}} onPreview={()=>{}} />);
  expect(html).toContain('Figma 可导入设计');expect(html).toContain('拖入 Figma 文件列表');expect(html).toContain('无需安装插件');expect(html).toContain('预览交互原型');expect(html).toContain('定位文件后拖入 Figma');
});
