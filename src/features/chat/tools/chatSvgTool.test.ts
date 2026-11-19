import {beforeEach,describe,expect,it,vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {createElement} from 'react';
import {CREATE_SVG_TOOL,svgPreviewDataUrl} from './chatSvgTool';
import {routeChatToolCall} from './chatToolRouter';
import {createInspirationChatToolExecutor} from './inspirationChatToolExecutor';
import {getChatToolDefinitions} from './chatToolDefinitions';
import {getGeneratedFilesFromToolCall,type ChatToolCall} from '../model/chatTypes';
import {ChatGeneratedFileCard} from '../components/ChatGeneratedFileCard';
import {compactChatToolResultForProvider} from './chatToolResult';
const native=vi.hoisted(()=>({invoke:vi.fn(),save:vi.fn()}));vi.mock('@tauri-apps/api/core',()=>({invoke:native.invoke}));vi.mock('@tauri-apps/plugin-dialog',()=>({save:native.save,confirm:vi.fn()}));
const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><title>矢量小猫</title><path d="M32 160L40 40L90 80Q128 60 166 80L216 40L224 160Q128 250 32 160Z" fill="#e7bd91"/><circle cx="94" cy="140" r="8"/><circle cx="162" cy="140" r="8"/></svg>';
const context={conversationId:'svg-conversation',messageId:'svg-message',userText:'帮我画一只可编辑的矢量小猫',executionSource:'desktop' as const,recentMessages:[]};
const file={id:'cat',name:'小猫.svg',format:'svg',mimeType:'image/svg+xml',path:'C:/fixture/cat.svg',size:svg.length};
beforeEach(()=>{vi.clearAllMocks();});
describe('general Chat SVG vector artwork, independent of UI prototypes',()=>{
 it('offers the SVG capability in desktop Chat without forcing it or requiring a prototype',()=>{
  const tools=getChatToolDefinitions(context.userText,false,false,false,0,false,false,context.userText,false,false,false,true,true);
  expect(tools.some(t=>t.function.name==='create_svg')).toBe(true);expect(CREATE_SVG_TOOL.function.description).toContain('不是交互原型');
 });
 it('routes a vector request to real file creation, never paid image generation or prototype output',async()=>{
  const createFile=vi.fn(async()=>({files:[file]})),generateMedia=vi.fn(),createPrototype=vi.fn();
  const executor=createInspirationChatToolExecutor({createFile,generateMedia,createPrototype,executeExistingTool:vi.fn(),searchWeb:vi.fn(),listWorkflowDescriptors:()=>[]});
  const result=await routeChatToolCall({name:'create_svg',args:{fileName:'小猫.svg',content:svg},context,executor,approvalMode:'auto'});
  expect(createFile).toHaveBeenCalledWith({fileName:'小猫.svg',content:svg,format:'svg',conversationId:context.conversationId});expect(generateMedia).not.toHaveBeenCalled();expect(createPrototype).not.toHaveBeenCalled();
  const call={toolName:'create_svg',status:'completed',resultJson:JSON.stringify(result.result)} as ChatToolCall;const delivered=getGeneratedFilesFromToolCall(call)[0];expect(delivered).toMatchObject({...file,svgSource:svg});
  const html=renderToStaticMarkup(createElement(ChatGeneratedFileCard,{file:delivered}));for(const text of ['SVG 矢量图','预览 SVG','另存为','放大预览 SVG'])expect(html).toContain(text);expect(html).not.toContain('<svg xmlns="http://www.w3.org/2000/svg" viewBox');expect(html).toContain('data:image/svg+xml');
  expect(compactChatToolResultForProvider('create_svg',result.result)).not.toHaveProperty('svgSource');
 });
 it.each([{fileName:'cat.png',content:svg},{fileName:'cat.svg',content:''},{fileName:'cat.svg',content:svg,approved:true},{fileName:'cat.svg',content:'x'.repeat(500001)}])('rejects bad SVG arguments before persistence: %j',async args=>{
  const executor=vi.fn();await expect(routeChatToolCall({name:'create_svg',args,context,executor})).rejects.toThrow('SVG');expect(executor).not.toHaveBeenCalled();
 });
 it('uses image-only previews and rejects active SVG, HTML and external references',()=>{
  expect(svgPreviewDataUrl(svg)).toMatch(/^data:image\/svg\+xml/);
  for(const bad of ['<svg onload="alert(1)"></svg>','<svg><script>alert(1)</script></svg>','<svg><image href="https://evil.test/a"/></svg>','<!DOCTYPE svg><svg/>','<svg><style>@import url(https://evil)</style></svg>'])expect(svgPreviewDataUrl(bad)).toBeUndefined();
 });
 it('does not create a fake file card before a successful native result',()=>{expect(getGeneratedFilesFromToolCall({toolName:'create_svg',status:'error',resultJson:JSON.stringify({files:[file]})} as ChatToolCall)).toEqual([]);});
});
