import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../model/chatTypes';
import lettering from '../tools/fixtures/reference-lettering.svg?raw';
const h = vi.hoisted(() => ({ invoke: vi.fn(), replies: [] as Array<Record<string, unknown>>, requests: [] as Array<Record<string, any>>, messages: new Map<string, ChatMessage>() }));
vi.mock('react', () => ({ useEffect: () => {}, useRef: (current: unknown) => ({ current }), useState: (initial: unknown) => { let value = typeof initial === 'function' ? initial() : initial; return [value, (next: unknown) => { value = typeof next === 'function' ? next(value) : next; }]; }, useCallback: (callback: unknown) => callback, useMemo: (factory: () => unknown) => factory() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('../../designMemory/context', async original => ({ ...await original<typeof import('../../designMemory/context')>(), recallDesignMemoryForTurn: vi.fn(async () => null), validateDesignMemoryMessages: vi.fn(async () => {}), designMemoryKindsInMessages: () => [], getDesignMemoryTurnReport: () => null }));
vi.mock('../../designMemory/sources', () => ({ rememberExplicitChatDesign: vi.fn(async () => {}), designMemoryProjectId: (id: string) => id, beginChatDesignSummaryMemory: vi.fn(async () => null), completeChatDesignSummaryMemory: vi.fn(async () => {}) }));
import { useChatRuntime } from './useChatRuntime';
import { createInspirationChatToolExecutor } from '../tools/inspirationChatToolExecutor';
const createFile=vi.fn(); const generateMedia=vi.fn();
const setup=(cloudWalletMode=false)=>useChatRuntime({cloudWalletMode,model:'fixture',approvalMode:'auto',resolveAttachmentUrl:async()=> 'data:image/png;base64,reference-fixture',executeTool:createInspirationChatToolExecutor({executeExistingTool:vi.fn(),generateMedia,createFile,listWorkflowDescriptors:()=>[],searchWeb:vi.fn()})});
const call=(content=lettering,id='svg-create')=>({content:'',toolCalls:[{id,name:'create_svg',arguments:JSON.stringify({fileName:'reference.svg',content})}]});
const finalReply={content:'已交付参考图的矢量重绘文件。细小细节和字体匹配仍需核对。',toolCalls:[]};
beforeEach(()=>{
 const storage=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v)});vi.stubGlobal('window',{dispatchEvent:vi.fn(),setTimeout:()=>1,clearTimeout:()=>{}});
 h.messages.clear();h.replies.length=0;h.requests.length=0;h.invoke.mockReset();createFile.mockReset();generateMedia.mockReset();
 createFile.mockResolvedValue({files:[{id:'svg-result',name:'reference.svg',path:'fixture/reference.svg',format:'svg',mimeType:'image/svg+xml',size:lettering.length}]});
 h.invoke.mockImplementation(async(command:string,args:Record<string,any>)=>{
  if(command==='agent_openai_chat'){h.requests.push(args.request);const next=h.replies.shift();if(!next)throw Error('Unexpected extra model request');return {requestId:args.request.requestId,...next};}
  if(command==='chat_list_messages')return {messages:[...h.messages.values()],hasMore:false};
  if(command==='chat_upsert_message'){h.messages.set(args.message.id,args.message);return args.message;}
  if(command==='chat_upsert_conversation')return args.conversation;
  if(command==='chat_upsert_tool_call')return args.call;
  if(command==='chat_upsert_attachment')return args.attachment;
  if(command==='github_skills_request')return [];
  return null;
 });
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const last=()=>[...h.messages.values()].filter(message=>message.role==='assistant').slice(-1)[0]!;
const attachment={id:'reference-image',type:'image' as const,path:'C:/private/logo.png',mimeType:'image/png'};
describe('multi-turn Chat vision requests', () => {
  it('carries original and generated pixels through text follow-ups and identifies a newly uploaded comparison', async () => {
    const executeTool = vi.fn(async () => ({ media: [{ id: 'revision', type: 'image', path: 'C:/results/revision.png' }] }));
    const runtime = useChatRuntime({
      model: 'fixture', approvalMode: 'auto', executeTool,
      resolveAttachmentUrl: async image => `https://vision.example.test/${image.id}.png`,
    });
    const answer = { content: '已看图。', toolCalls: [] };
    const send = async (text: string, images: typeof attachment[] = []) => {
      h.replies.length = 0;
      h.replies.push(answer);
      expect(await runtime.sendMessage(text, images)).toBe(true);
      const users = h.requests[h.requests.length - 1].messages.filter((m: { role: string }) => m.role === 'user');
      return users[users.length - 1].content;
    };
    const imageUrls = (parts: Array<{ type: string; image_url?: { url: string } }>) =>
      parts.filter(part => part.type === 'image_url').map(part => part.image_url?.url);
    const first = await send('看看这个标志', [attachment]);
    expect(imageUrls(first)).toEqual(['https://vision.example.test/reference-image.png']);
    h.replies.push({ content: '', toolCalls: [{ id: 'edit', name: 'edit_image', arguments: JSON.stringify({
      prompt: '改成蓝色', sourceImageId: attachment.id,
    }) }] }, answer);
    expect(await runtime.sendMessage('改成蓝色')).toBe(true);
    expect(executeTool).toHaveBeenCalledWith('edit_image', expect.objectContaining({ referenceImages: [attachment.path] }), expect.anything());
    await send('嗯，谢谢。');
    const question = await send('左边那个是什么？');
    expect(imageUrls(question)).toEqual(['https://vision.example.test/reference-image.png', 'https://vision.example.test/revision.png']);
    expect(question).toContainEqual({ type: 'text', text: '历史生成图 1\nattachmentId: revision' });
    const compare = await send('和这张比呢？', [{ ...attachment, id: 'comparison', path: 'C:/private/compare.png' }]);
    expect(imageUrls(compare)).toEqual([...imageUrls(question), 'https://vision.example.test/comparison.png']);
    expect(compare).toContainEqual({ type: 'text', text: '图片附件 1\nattachmentId: comparison' });
    expect(await send('换个话题')).toBe('换个话题');
    expect(await send('继续说')).toBe('继续说');
    expect(executeTool).toHaveBeenCalledTimes(1);
  });
});
describe('reference image to SVG in real Chat runtime with local mocked IPC, never paid media',()=>{
 it.each([false,true])('passes actual reference pixels, creates a real file receipt, and continues in custom/wallet mode %s',async wallet=>{
  h.replies.push(call(),finalReply);const runtime=setup(wallet);
  await runtime.sendMessage('帮我把图片转换成矢量图 svg文件',[attachment]);
  expect(h.requests[0].tools.some((t:any)=>t.function.name==='create_svg')).toBe(true);
  expect(JSON.stringify(h.requests[0].messages)).toContain('data:image/png;base64,reference-fixture');expect(JSON.stringify(h.requests[0].messages)).toContain('"detail":"high"');
  expect(JSON.stringify(h.requests[0].messages)).not.toContain('C:/private/logo.png');
  expect(createFile).toHaveBeenCalledWith(expect.objectContaining({format:'svg',content:lettering}));expect(generateMedia).not.toHaveBeenCalled();
  expect(last().status).toBe('completed');expect(last().toolCalls[0].status).toBe('completed');
  expect(JSON.parse(last().toolCalls[0].resultJson!).files[0].format).toBe('svg');
  expect(h.requests).toHaveLength(1); // The real file card is a complete delivery; no extra model round is needed.
 });
 it('keeps reference pixels and an actionable native error available for a corrected SVG call',async()=>{
  createFile.mockRejectedValueOnce(Error('SVG 不支持属性 unsupported-property'));
  h.replies.push(call(lettering.replace('paint-order="stroke fill"','unsupported-property="x"'),'svg-bad'),call(lettering,'svg-fixed'),finalReply);
  await setup().sendMessage('请按参考图重绘为SVG，不要改变文字和描边',[attachment]);
  expect(last().toolCalls.map(t=>t.status)).toEqual(['error','completed']);expect(createFile).toHaveBeenCalledTimes(2);expect(generateMedia).not.toHaveBeenCalled();
  const feedback=h.requests[1].messages.find((m:any)=>m.role==='tool'&&m.tool_call_id==='svg-bad');expect(feedback.content).toContain('unsupported-property');expect(feedback.content).toContain('保留参考图构图');
  expect(JSON.stringify(h.requests[1].messages)).toContain('data:image/png;base64,reference-fixture');
 });
});
