import { isGithubSkillTool } from '../skills/githubSkillTools';
import { makePrototypeFixture } from '../prototypes/prototypeFixture';
import { registerRhinoNativeTools } from '../../rhino/rhinoProtocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../model/chatTypes';

// Drive the real sendMessage -> model loop -> executor -> persisted message
// path. Effects/UI and the IPC backend are mocked; no network, billing or user
// data is touched, and provider replies are explicitly synthetic fixtures.
const harness = vi.hoisted(() => ({
  invoke: vi.fn(), execute: vi.fn(), replies: [] as Array<Record<string, unknown>>,
  requests: [] as Array<Record<string, any>>, messages: new Map<string, ChatMessage>(),
}));
vi.mock('react', () => ({
  useEffect: () => {},
  useRef: (current: unknown) => ({ current }),
  useState: (initial: unknown) => {
    let value = typeof initial === 'function' ? initial() : initial;
    return [value, (next: unknown) => { value = typeof next === 'function' ? next(value) : next; }];
  },
  useCallback: (callback: unknown) => callback,
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock('@tauri-apps/api/core', () => ({ invoke: harness.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('../../designMemory/context', async importOriginal => ({
  ...await importOriginal<typeof import('../../designMemory/context')>(),
  recallDesignMemoryForTurn: vi.fn(async () => null),
  validateDesignMemoryMessages: vi.fn(async () => {}),
  designMemoryKindsInMessages: () => [],
  getDesignMemoryTurnReport: () => null,
}));
vi.mock('../../designMemory/sources', () => ({
  rememberExplicitChatDesign: vi.fn(async () => {}),
  designMemoryProjectId: (id: string) => id,
  beginChatDesignSummaryMemory: vi.fn(async () => null),
  completeChatDesignSummaryMemory: vi.fn(async () => {}),
}));
import { useChatRuntime } from './useChatRuntime';

const fixtureFile = { files: [{ id: 'synthetic-file', format: 'pptx', name: 'fixture.pptx', path: 'C:/synthetic/fixture.pptx', slideCount: 1 }] };
const fileReply = () => ({ content: '', toolCalls: [{ id: 'synthetic-create', name: 'create_file', arguments: JSON.stringify({ fileName: 'fixture.pptx', format: 'pptx', presentation: { title: 'Synthetic fixture', slides: [{ title: 'Fixture only', body: 'Synthetic evidence' }] } }) }] });
const textReply = (content: string) => ({ content, toolCalls: [] });
const lastAssistant = () => [...harness.messages.values()].filter(message => message.role === 'assistant').slice(-1)[0]!;
const setupRuntime = () => useChatRuntime({ model: 'default', approvalMode: 'auto', executeTool: harness.execute });

beforeEach(() => {
  let now = 1000;
  vi.spyOn(Date, 'now').mockImplementation(() => now++);
  harness.invoke.mockReset(); harness.execute.mockReset(); harness.replies.length = 0;
  harness.requests.length = 0; harness.messages.clear();
  const storage = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) || null, setItem: (key: string, value: string) => storage.set(key, value) });
  vi.stubGlobal('window', { setTimeout: () => 1, clearTimeout: () => {} });
  harness.execute.mockResolvedValue(fixtureFile);
  harness.invoke.mockImplementation(async (command: string, args: Record<string, any>) => {
    if (command === 'agent_openai_chat') {
      harness.requests.push(args.request);
      const reply = harness.replies.shift();
      if (!reply) throw new Error('Unexpected extra model call');
      return { requestId: args.request.requestId, ...reply };
    }
    if (command === 'chat_list_messages') return { messages: [...harness.messages.values()], hasMore: false };
    if (command === 'chat_upsert_message') { harness.messages.set(args.message.id, args.message); return args.message; }
    if (command === 'chat_upsert_conversation') return args.conversation;
    if (command === 'chat_upsert_tool_call') return args.call;
    if (command === 'chat_get_summary') return null;
    return null;
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('model-selected image intent through the real runtime', () => {
  it.each([
    'It needs to feel more refined and balanced.',
    'Only analyze this; do not create images yet.',
  ])('exposes image capabilities but does not invent tool calls: %s', async text => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('Here is a text response from the model.'));
    await runtime.sendMessage(text);
    const request = harness.requests[0];
    const names = request.tools.map((tool: any) => tool.function.name);
    expect(names).toEqual(expect.arrayContaining(['generate_image', 'generate_image_variants', 'edit_image']));
    expect(request.toolChoice).toBeUndefined();
    expect(JSON.stringify(request.messages)).toContain('Do not require words such as generate');
    expect(harness.execute).not.toHaveBeenCalled();
    expect(lastAssistant().status).toBe('completed');
  });
  it.each([
    '\u751f\u6210\u4e00\u6bb5\u7528\u4e8e Midjourney \u7684\u4ea7\u54c1\u751f\u56fe\u63d0\u793a\u8bcd',
    'Write an image-generation prompt for a product render',
  ])('does not offer image tools for prompt-only requests: %s', async text => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('Here is the requested prompt as text.'));
    await runtime.sendMessage(text);
    const request = harness.requests[0];
    const names = request.tools.map((tool: any) => tool.function.name);
    expect(names).not.toContain('generate_image');
    expect(names).not.toContain('generate_image_variants');
    expect(names).not.toContain('edit_image');
    expect(harness.execute).not.toHaveBeenCalled();
  });
});

describe('PPT delivery through the real runtime (synthetic IPC)', () => {
  it('passes create_file for the exact screenshot wording 出ppt and produces a successful file receipt', async () => {
    const runtime = setupRuntime();
    harness.replies.push(fileReply());
    expect(await runtime.sendMessage('出ppt')).toBe(true);
    expect(harness.requests).toHaveLength(1);
    expect(harness.requests[0].tools.some((tool: any) => tool.function.name === 'create_file')).toBe(true);
    expect(harness.requests[0].toolChoice).toEqual({ type: 'function', function: { name: 'create_file' } });
    expect(harness.execute).toHaveBeenCalledWith('create_file', expect.objectContaining({ format: 'pptx' }), expect.anything());
    expect(lastAssistant().status).toBe('completed');
    expect(lastAssistant().toolCalls[0].status).toBe('completed');
    expect(lastAssistant().toolCalls[0].resultJson).toContain('fixture.pptx');
  });

  it.each(['模拟器', '实车', '医疗设备'])('retains %s only in this conversation across clarification and 开始做吧', async answer => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('请确认具体研究对象？'), textReply('范围明确，可以开始制作。'), fileReply());
    await runtime.sendMessage('做一份产品工业设计调研PPT，不用AI生图');
    expect(harness.execute).not.toHaveBeenCalled();
    expect(harness.requests[0].toolChoice).toBeUndefined();
    await runtime.sendMessage(answer);
    expect(harness.requests[1].tools.filter((tool: any) => !isGithubSkillTool(tool.function.name) && tool.function.name !== 'create_svg').map((tool: any) => tool.function.name)).toEqual(['create_ui_prototype', 'generate_image', 'generate_image_variants', 'edit_image']);
    await runtime.sendMessage('开始做吧');
    const request = harness.requests[2];
    expect(request.tools.some((tool: any) => tool.function.name === 'create_file')).toBe(true);
    expect(request.tools.some((tool: any) => tool.function.name === 'generate_image')).toBe(false);
    expect(request.messages).toContainEqual({ role: 'user', content: answer });
    expect(lastAssistant().status).toBe('completed');
    expect(lastAssistant().toolCalls[0].toolName).toBe('create_file');
  });

  it('recovers a false missing-file-tool refusal once, without repeating search or image generation', async () => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('当前会话没有提供文件创建工具，我无法生成真实的PPTX。'), fileReply());
    await runtime.sendMessage('出ppt');
    expect(harness.requests).toHaveLength(2);
    const retry = harness.requests[1];
    expect(retry.tools.map((tool: any) => tool.function.name)).toEqual(['create_file']);
    expect(retry.toolChoice).toEqual({ type: 'function', function: { name: 'create_file' } });
    expect(retry.stream).toBe(false);
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(lastAssistant().content).not.toContain('没有提供文件创建工具');
    expect(lastAssistant().status).toBe('completed');
  });

  it('keeps retrieved evidence through a text-only refusal and retries only file creation', async () => {
    const runtime = setupRuntime();
    harness.execute.mockImplementation(async (name: string) => name === 'web_search'
      ? { query: 'synthetic product specifications', results: [{ title: 'Synthetic official specifications', url: 'https://manufacturer.example/spec', content: 'Fixture only: official source evidence.', snippet: 'Synthetic excerpt.' }] }
      : fixtureFile);
    harness.replies.push({ content: '', toolCalls: [{ id: 'synthetic-search', name: 'web_search', arguments: '{"query":"synthetic product specifications"}' }] },
      textReply('当前会话没有提供文件创建工具，以下仅为文字稿。'), fileReply());
    await runtime.sendMessage('联网做一份方向盘工业设计调研PPT，不要AI生图');
    expect(harness.requests).toHaveLength(3);
    const retry = harness.requests[2];
    expect(retry.tools.map((tool: any) => tool.function.name)).toEqual(['create_file']);
    expect(JSON.stringify(retry.messages)).toContain('https://manufacturer.example/spec');
    expect(harness.execute.mock.calls.map(([name]) => name)).toEqual(['web_search', 'create_file']);
    expect(lastAssistant().toolCalls.map(call => call.toolName)).toEqual(['web_search', 'create_file']);
    expect(lastAssistant().status).toBe('completed');
  });

  it('does not transfer a confirmed subject to a new conversation', async () => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('请确认具体研究对象？'), textReply('范围已明确。'));
    await runtime.sendMessage('做一份产品设计调研PPT');
    await runtime.sendMessage('实车');
    await runtime.newConversation();
    harness.replies.push(textReply('请说明本次研究对象？'));
    await runtime.sendMessage('做一份产品设计调研PPT');
    expect(JSON.stringify(harness.requests[2].messages)).not.toContain('实车');
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it('keeps a short style revision attached to the real deck, without topic-to-style routing', async () => {
    const runtime = setupRuntime(); harness.replies.push(fileReply(), fileReply());
    await runtime.sendMessage('做一份产品设计调研PPT');
    await runtime.sendMessage('换一种风格');
    expect(harness.requests).toHaveLength(2);
    expect(harness.requests[1].tools.some((tool: any) => tool.function.name === 'create_file')).toBe(true);
    expect(harness.requests[1].tools.some((tool: any) => tool.function.name === 'edit_image')).toBe(false);
    expect(lastAssistant().toolCalls.some(call => call.toolName === 'create_file' && call.status === 'completed')).toBe(true);
  });

  it('reports failure rather than success when the provider twice ignores the file request', async () => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('以下是10页文字稿'), textReply('仍然无法创建文件'));
    await runtime.sendMessage('出ppt');
    expect(harness.requests).toHaveLength(2);
    expect(harness.execute).not.toHaveBeenCalled();
    expect(lastAssistant().status).toBe('error');
    expect(lastAssistant().content).toContain('PPT 尚未生成可下载文件');
    expect(lastAssistant().content).not.toContain('仍然无法创建文件');
  });
});

describe('Rhino geometry success followed by failed view cleanup (synthetic IPC)',()=>{
 it.each([true,false])('preserves evidence instead of claiming a geometry failure; verified=%s',async verified=>{
  const tools=['rhino_native_run_python','rhino_native_zoom_to_layer','rhino_native_save_doc'].map(name=>({name,description:'synthetic fixture',inputSchema:{type:'object',properties:{}},readOnly:false,destructive:true,workflowPhase:'write'}));
  const runtime=useChatRuntime({model:'default',approvalMode:'auto',executeTool:harness.execute,additionalTools:(conversationId)=>{registerRhinoNativeTools(conversationId,tools);return tools.map(tool=>({type:'function' as const,function:{name:tool.name,description:tool.description,parameters:tool.inputSchema}}));}});
  harness.execute.mockImplementation(async(name:string)=>{
   if(name==='rhino_native_run_python')return {source:'rhino',documentId:7,content:'synthetic modeling receipt',...(verified?{geometryVerification:{status:'passed',structuralOnly:true,documentChanged:true,addedCount:12,changedCount:0}}:{})};
   if(name==='rhino_native_zoom_to_layer')throw new Error('No matching native MCP document');
   throw new Error('Must not dispatch tools after failed view call');
  });
  harness.replies.push({content:'',toolCalls:[{id:'fixture-build',name:'rhino_native_run_python',arguments:JSON.stringify({script:'print(1)'})},{id:'fixture-zoom',name:'rhino_native_zoom_to_layer',arguments:JSON.stringify({layer:'Synthetic'})},{id:'fixture-save',name:'rhino_native_save_doc',arguments:'{}'}]});
  await runtime.sendMessage('帮我建一个桌面摄像头',[],undefined,undefined,undefined,'rhino');
  const assistant=lastAssistant();expect(harness.requests).toHaveLength(1);expect(harness.execute.mock.calls.map(([name])=>name)).toEqual(['rhino_native_run_python','rhino_native_zoom_to_layer']);
  expect(assistant.toolCalls.find(call=>call.id==='fixture-build')?.status).toBe('completed');expect(assistant.toolCalls.find(call=>call.id==='fixture-zoom')?.status).toBe('error');expect(assistant.toolCalls.find(call=>call.id==='fixture-save')?.status).toBe('cancelled');
  if(verified){expect(assistant.status).toBe('completed');expect(assistant.content).toContain('后续“缩放到目标图层”未完成');expect(assistant.content).not.toContain('Rhino MCP 执行失败');}
  else{expect(assistant.status).toBe('error');expect(assistant.content).not.toContain('模型几何已写入，并通过结构检查');}
 });
});


describe('editable Figma alternative through the real runtime', () => {
  it('recovers once from a provider capability refusal and executes the real prototype tool', async () => {
    const runtime = setupRuntime();
    harness.replies.push(textReply("I cannot create Figma files and do not have create_ui_prototype."),
      { content: '', toolCalls: [{ id: 'prototype-fixture', name: 'create_ui_prototype', arguments: JSON.stringify({ prototype: makePrototypeFixture() }) }] },
      textReply('已生成可导入 Figma 的 Sketch 文件。'));
    harness.execute.mockResolvedValue({ files: [{ id: 'prototype-file', format: 'sketch', name: 'fixture.sketch', path: 'C:/synthetic/fixture.sketch' }] });
    await runtime.sendMessage('帮我制作一套 Figma 交互原型，导出可编辑设计文件');
    expect(harness.requests[0].messages.some((message: any) => String(message.content).includes('actual callable tool'))).toBe(true);
    expect(harness.requests[1].toolChoice).toEqual({ type: 'function', function: { name: 'create_ui_prototype' } });
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(lastAssistant().toolCalls.some(call => call.toolName === 'create_ui_prototype' && call.status === 'completed')).toBe(true);
    expect(lastAssistant().content).not.toContain('I cannot create Figma files');
  });
  it('stops after one missing-delivery continuation without fabricated files or loops', async () => {
    const runtime = setupRuntime();
    harness.replies.push(textReply('不能做 fig'), textReply('没有工具'));
    await runtime.sendMessage('帮我生成一个 .fig 文件');
    expect(harness.requests).toHaveLength(2);
    expect(harness.execute).not.toHaveBeenCalled();
    expect(lastAssistant().status).toBe('error');
    expect(lastAssistant().content).toContain('尚未生成');
  });
  it('does not force delivery when the user is only asking about the format', async () => {
    const runtime = setupRuntime(); harness.replies.push(textReply('支持 Sketch 导出。'));
    await runtime.sendMessage('如何导出 Figma 文件？');
    expect(harness.requests).toHaveLength(1); expect(harness.execute).not.toHaveBeenCalled();
  });
});

describe('agent semantics and image delivery through the real runtime', () => {
  const agentArgs = { name: '品牌助手', description: '分析品牌设计需求', triggers: ['品牌设计'], instructions: '先分析需求，再给出建议。' };
  const agentReply = () => ({ content: '', toolCalls: [{ id: 'semantic-agent', name: 'create_agent', arguments: JSON.stringify(agentArgs) }] });
  const imageReply = () => ({ content: '', toolCalls: [{ id: 'semantic-cover', name: 'generate_image', arguments: JSON.stringify({ prompt: 'An editorial brand cover, no unnecessary words', count: 1 }) }] });
  const imageReceipt = { media: [{ id: 'fixture-cover', type: 'image', url: 'https://fixture.invalid/cover.png' }] };
  it.each([
    '我做了个玄学事务所的智能体，帮我做一个封面',
    '我做了个旅行规划智能体，帮我做个头像',
    'Make a cover for my research agent',
  ])('lets the model choose a real image tool without creating an agent or requiring 出图: %s', async text => {
    const runtime = setupRuntime();harness.execute.mockResolvedValue(imageReceipt);harness.replies.push(imageReply());
    await runtime.sendMessage(text);
    const request = harness.requests[0];const names=request.tools.map((tool: any)=>tool.function.name);
    expect(request.toolChoice).toBeUndefined();expect(names).toContain('generate_image');expect(names).not.toContain('create_agent');
    expect(harness.execute).toHaveBeenCalledOnce();expect(harness.execute.mock.calls[0][0]).toBe('generate_image');
    expect(lastAssistant().status).toBe('completed');expect(lastAssistant().toolCalls.map(call=>call.toolName)).toEqual(['generate_image']);
  });
  it('blocks a hallucinated new-agent write and continues with the cover tool instead', async () => {
    const runtime=setupRuntime();harness.execute.mockResolvedValue(imageReceipt);harness.replies.push(agentReply(),imageReply());
    await runtime.sendMessage('我做了个玄学事务所的智能体，帮我做一个封面');
    expect(harness.execute.mock.calls.map(([name])=>name)).toEqual(['generate_image']);
    expect(lastAssistant().toolCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({toolName:'create_agent',status:'error',resultJson:expect.stringContaining('没有要求新建智能体')}),
      expect.objectContaining({toolName:'generate_image',status:'completed'}),
    ]));
    expect(harness.requests[1].tools.some((tool: any)=>tool.function.name==='generate_image')).toBe(true);
    expect(harness.requests[1].toolChoice).toBeUndefined();expect(lastAssistant().status).toBe('completed');
  });
  it('does not withdraw image capabilities after a genuine agent-creation step in a compound task', async () => {
    const runtime=setupRuntime();harness.execute.mockImplementation(async name=>name==='create_agent'?{created:true,id:'fixture-agent',name:'品牌助手',activated:false}:imageReceipt);
    harness.replies.push(agentReply(),imageReply());
    await runtime.sendMessage('帮我创建一个品牌设计智能体，然后帮它做一张封面');
    expect(harness.requests[0].toolChoice).toBeUndefined();
    const next=harness.requests[1];const names=next.tools.map((tool: any)=>tool.function.name);
    expect(names).toContain('generate_image');expect(names).not.toContain('create_agent');
    expect(JSON.stringify(next.messages)).toContain('创建智能体不代表整项任务完成');
    expect(harness.execute.mock.calls.map(([name])=>name)).toEqual(['create_agent','generate_image']);expect(lastAssistant().status).toBe('completed');
  });
  it('keeps normal create_agent saving without forcing it or inventing an unrequested image task', async () => {
    const runtime=setupRuntime();harness.execute.mockResolvedValue({created:true,id:'fixture-agent',name:'品牌助手',activated:false});
    harness.replies.push(agentReply(),textReply('智能体已保存，未启用。'));
    await runtime.sendMessage('帮我创建一个品牌设计智能体');
    expect(harness.requests[0].toolChoice).toBeUndefined();expect(harness.execute.mock.calls.map(([name])=>name)).toEqual(['create_agent']);expect(lastAssistant().status).toBe('completed');
  });
  it('a completed create_agent in old conversation history cannot hide image tools in a later turn', async () => {
    const runtime=setupRuntime();harness.execute.mockImplementation(async name=>name==='create_agent'?{created:true,id:'fixture-agent',name:'品牌助手',activated:false}:imageReceipt);
    harness.replies.push(agentReply(),textReply('已保存。'));await runtime.sendMessage('帮我创建一个品牌设计智能体');
    harness.replies.push(imageReply());await runtime.sendMessage('生成一张封面');
    const next=harness.requests[2];expect(next.toolChoice).toBeUndefined();expect(next.tools.some((tool: any)=>tool.function.name==='generate_image')).toBe(true);
    expect(harness.execute.mock.calls.map(([name])=>name)).toEqual(['create_agent','generate_image']);expect(lastAssistant().status).toBe('completed');
  });
});

describe('general Chat SVG creation through the real runtime',()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M10 80L20 10L50 35L80 10L90 80Z" fill="#e5bd96"/></svg>';
 const reply=()=>({content:'',toolCalls:[{id:'svg-vector',name:'create_svg',arguments:JSON.stringify({fileName:'vector-cat.svg',content:svg})}]});
 it('offers and executes true vector artwork without a prototype or a paid image request',async()=>{
   const runtime=setupRuntime();harness.execute.mockResolvedValue({files:[{id:'svg-file',name:'vector-cat.svg',format:'svg',path:'C:/fixture/vector-cat.svg',mimeType:'image/svg+xml'}],svgSource:svg});harness.replies.push(reply());
   await runtime.sendMessage('帮我画一只可编辑的矢量小猫');
   expect(harness.requests[0].toolChoice).toBeUndefined();expect(harness.requests[0].tools.some((t:any)=>t.function.name==='create_svg')).toBe(true);
   expect(harness.execute.mock.calls.map(([name])=>name)).toEqual(['create_svg']);expect(lastAssistant().status).toBe('completed');
   expect(lastAssistant().toolCalls[0]).toMatchObject({toolName:'create_svg',status:'completed'});
 });
 it('allows semantic discussion without automatically creating SVG or images',async()=>{
   const runtime=setupRuntime();harness.replies.push(textReply('SVG 是矢量图格式，这里先只解释。'));await runtime.sendMessage('矢量图是什么？先别制作。');expect(harness.execute).not.toHaveBeenCalled();expect(lastAssistant().status).toBe('completed');
 });
});
