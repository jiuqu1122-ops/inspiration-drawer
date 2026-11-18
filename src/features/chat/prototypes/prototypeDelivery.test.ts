import { beforeEach, describe, expect, it, vi } from 'vitest';
const native=vi.hoisted(()=>({invoke:vi.fn(),save:vi.fn(),isTauri:vi.fn(()=>true)}));
vi.mock('@tauri-apps/api/core',()=>({invoke:native.invoke,isTauri:native.isTauri}));
vi.mock('@tauri-apps/plugin-dialog',()=>({save:native.save}));
import { createPrototypePackage, savePrototypePackage } from './prototypePackage';
import { getMessageHtmlArtifacts } from '../html/chatHtmlArtifacts';
import { getGeneratedFilesFromToolCall, type ChatMessage, type ChatToolCall } from '../model/chatTypes';
import { makePrototypeFixture } from './prototypeFixture';
import { getChatToolDefinitions } from '../tools/chatToolDefinitions';
import { routeChatToolCall } from '../tools/chatToolRouter';
import { createInspirationChatToolExecutor } from '../tools/inspirationChatToolExecutor';
import { getChatFileCreationTurn } from '../runtime/chatFileCreationPolicy';
import { saveChatHtmlArtifact } from '../html/saveChatHtmlArtifact';
const file={id:'file',name:'原型.sketch',path:'C:/generated/prototype.sketch',format:'sketch'};
const call: ChatToolCall={id:'call',messageId:'m',toolName:'create_ui_prototype',status:'completed',argumentsJson:JSON.stringify({prototype:makePrototypeFixture()}),resultJson:JSON.stringify({files:[file]}),createdAt:1};
beforeEach(()=>{vi.clearAllMocks();native.isTauri.mockReturnValue(true);native.save.mockResolvedValue('C:/user/prototype.sketch');});
describe('real prototype delivery and conversation artifacts',()=>{
  it('preserves direct-import Sketch metadata and reconstructs the same source from persisted arguments',()=>{
    expect(getGeneratedFilesFromToolCall(call)[0]).toEqual(expect.objectContaining(file));
    const message:ChatMessage={id:'m',conversationId:'c',content:'已生成原型',role:'assistant',status:'completed',createdAt:1,attachments:[],toolCalls:[call]};
    const [artifact]=getMessageHtmlArtifacts(message);expect(artifact.prototype).toEqual(makePrototypeFixture());expect(artifact.file).toEqual(expect.objectContaining(file));expect(artifact.source).toContain('data-state="tab-info"');
    expect(getMessageHtmlArtifacts({...message,toolCalls:[{...call,status:'error'}]})).toEqual([]);
  });
  it('counts successful prototype delivery and bounded retries just like file creation',()=>{
    const messages=[{role:'user',content:'做个Figma原型'},{role:'assistant',tool_calls:[{id:'call',function:{name:'create_ui_prototype'}}]},{role:'tool',tool_call_id:'call',content:JSON.stringify({files:[file]})}];
    expect(getChatFileCreationTurn(messages)).toEqual({attempts:1,completed:true,canAttempt:false});
    expect(getChatFileCreationTurn([...messages,{role:'user',content:'改成蓝色'}])).toEqual({attempts:0,completed:false,canAttempt:true});
  });
  it('exposes prototype capability for semantic decisions and follow-ups without executing it',()=>{
    expect(getChatToolDefinitions('做个可以导入figma的交互原型').map(t=>t.function.name)).toContain('create_ui_prototype');
    expect(getChatToolDefinitions('右边改小一点',false,false,false,0,false,false,'右边改小一点',false,false,true).map(t=>t.function.name)).toContain('create_ui_prototype');
    expect(getChatToolDefinitions('你好').map(t=>t.function.name)).toContain('create_ui_prototype');
  });
  it('routes through the normal validation/execution boundary without Rhino access',async()=>{
    const createPrototype=vi.fn(async()=>({files:[file],prototype:{id:"p",name:"原型",screens:4,nodes:30,interactions:9}}));
    const executor=createInspirationChatToolExecutor({createPrototype,createFile:vi.fn(),executeExistingTool:vi.fn(),generateMedia:vi.fn(),listWorkflowDescriptors:()=>[],searchWeb:vi.fn()});
    const context={conversationId:'c',userText:'生成可导入Figma的原型',recentMessages:[],executionSource:'desktop'} as any;
    const result=await routeChatToolCall({name:'create_ui_prototype',args:{prototype:makePrototypeFixture()},context,executor,approvalMode:'auto'});
    expect(result.requiresApproval).toBe(false);expect(createPrototype).toHaveBeenCalledWith(makePrototypeFixture(),'c');
    await expect(routeChatToolCall({name:'create_ui_prototype',args:{prototype:{}},context,executor})).rejects.toThrow();expect(createPrototype).toHaveBeenCalledTimes(1);
  });
  it('creates a real package with one authoritative validated source and generated Sketch parts',async()=>{
    native.invoke.mockResolvedValueOnce({files:[file]});await createPrototypePackage(makePrototypeFixture(),'c');
    const [command,payload]=native.invoke.mock.calls[0];expect(command).toBe('chat_create_prototype');expect(JSON.parse(payload.request.prototypeJson)).toEqual(makePrototypeFixture());const sketch=JSON.parse(payload.request.sketchJson);expect(sketch.document._class).toBe('document');expect(sketch.pages).toHaveLength(3);expect(payload.request).not.toHaveProperty('previewHtml');
  });
  it('saves the existing Sketch file without recreating and creates no output when cancelled',async()=>{
    native.invoke.mockResolvedValueOnce('saved');await expect(savePrototypePackage(makePrototypeFixture(),'c',file)).resolves.toBe(true);
    expect(native.invoke).toHaveBeenCalledWith('chat_copy_generated_file',{sourcePath:file.path,destinationPath:'C:/user/prototype.sketch'});
    native.save.mockResolvedValueOnce(null);await expect(savePrototypePackage(makePrototypeFixture(),'c',file)).resolves.toBe(false);expect(native.invoke).toHaveBeenCalledTimes(1);
  });
  it('re-exports old ZIP artifacts as a new genuine Sketch file instead of renaming old bytes',async()=>{
    native.invoke.mockResolvedValueOnce({files:[file]}).mockResolvedValueOnce('saved');
    await savePrototypePackage(makePrototypeFixture(),'c',{...file,format:'zip',path:'C:/old/legacy.zip'});
    expect(native.invoke.mock.calls[0][0]).toBe('chat_create_prototype');
    expect(native.invoke.mock.calls[1]).toEqual(['chat_copy_generated_file',{sourcePath:file.path,destinationPath:'C:/user/prototype.sketch'}]);
    expect(JSON.stringify(native.invoke.mock.calls)).not.toContain('C:/old/legacy.zip');
  });
  it('never saves Sketch archive bytes under an HTML filename when exporting the preview',async()=>{
    native.save.mockResolvedValueOnce('C:/user/prototype.html');native.invoke.mockResolvedValueOnce({files:[{...file,path:'C:/generated/preview.html',format:'html'}]}).mockResolvedValueOnce('saved');
    const artifact=getMessageHtmlArtifacts({id:'m',conversationId:'c',content:'',role:'assistant',status:'completed',createdAt:1,attachments:[],toolCalls:[call]})[0];
    await saveChatHtmlArtifact(artifact,'c');expect(native.invoke.mock.calls[0][0]).toBe('chat_create_file');expect(native.invoke.mock.calls[1][1].sourcePath).toBe('C:/generated/preview.html');
  });
});
