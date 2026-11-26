import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage, ChatToolExecutor } from '../model/chatTypes';
const h = vi.hoisted(() => ({ invoke: vi.fn(), replies: [] as Array<Record<string, unknown> | Promise<Record<string, unknown>> | Error>, requests: [] as Array<Record<string, any>>, messages: new Map<string, ChatMessage>(), deferStateUpdaters: false }));
vi.mock('react', () => ({ useEffect: () => {}, useRef: (current: unknown) => ({ current }), useState: (initial: unknown) => { let value = typeof initial === 'function' ? initial() : initial; return [value, (next: unknown) => { if (typeof next === 'function' && h.deferStateUpdaters) return; value = typeof next === 'function' ? next(value) : next; }]; }, useCallback: (callback: unknown) => callback, useMemo: (factory: () => unknown) => factory() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('../../designMemory/context', async original => ({ ...await original<typeof import('../../designMemory/context')>(), recallDesignMemoryForTurn: vi.fn(async () => null), validateDesignMemoryMessages: vi.fn(async () => {}), designMemoryKindsInMessages: () => [], getDesignMemoryTurnReport: () => null }));
vi.mock('../../designMemory/sources', () => ({ rememberExplicitChatDesign: vi.fn(async () => {}), designMemoryProjectId: (id: string) => id, beginChatDesignSummaryMemory: vi.fn(async () => null), completeChatDesignSummaryMemory: vi.fn(async () => {}) }));
import { RHINO_REFERENCE_FIDELITY_ASSESSMENT_TOOL as quality } from '../../rhino/rhinoVisualFidelity';
import { useChatRuntime } from './useChatRuntime';
import * as stepPreviewCache from '../storage/rhinoStepPreviews';
import { registerRhinoNativeTools, rhinoToolDefinitions, RHINO_REFERENCE_REVIEW_TOOL, type RhinoNativeTool } from '../../rhino/rhinoProtocol';
import { readRhinoModelingSkillResource, RHINO_MODELING_SKILL_RESOURCE_TOOL } from '../../rhino/rhinoProductModelingKnowledge';
import { gh2ModelTools, GH2_VERIFY_MODEL_TOOL, GH2_REPAIR_OUTPUTS_TOOL } from '../../rhino/rhinoGh2Model';
import { RhinoDocumentGeometryWriteError } from '../../rhino/rhinoDocumentGeometry';
import { RHINO_HEADLESS_BUILD_TOOL, RhinoHeadlessGeometryError } from '../../rhino/rhinoHeadless';
const executed=vi.fn<ChatToolExecutor>(async()=>({source:'rhino',content:'{"hits":[]}'}));
const search='rhino_native_g1_search_components';
const tools:RhinoNativeTool[]=[
 ...gh2ModelTools(),
 {name:'rhino_native_g2_get_canvas_graph',description:'Read GH2 graph',readOnly:true,destructive:false,inputSchema:{type:'object',properties:{}}},
 {name:'rhino_native_g2_apply_graph',description:'Edit GH2 graph',readOnly:false,destructive:false,inputSchema:{type:'object',properties:{}}},
 {name:'rhino_native_g2_solve_canvas',description:'Solve GH2 graph',readOnly:false,destructive:false,inputSchema:{type:'object',properties:{}}},
 {name:search,description:'Search components',readOnly:true,destructive:false,inputSchema:{type:'object',required:['query'],properties:{query:{type:'string'},limit:{type:'integer'}}}},
 {name:'rhino_native_g1_get_canvas_graph',description:'Read graph',readOnly:true,destructive:false,inputSchema:{type:'object',properties:{}}},
 {name:'rhino_native_g1_apply_graph',description:'Edit graph',readOnly:false,destructive:false,inputSchema:{type:'object',properties:{}}},
 {name:'rhino_native_g1_solve_graph',description:'Solve graph',readOnly:false,destructive:false,inputSchema:{type:'object',properties:{}}},
 {name:'rhino_native_get_viewport_image',description:'Host camera-configurable viewport capture',readOnly:false,destructive:false,inputSchema:{type:'object',properties:{}}},
 {name:'rhino_native_run_python',description:'Run Python script',readOnly:false,destructive:true,inputSchema:{type:'object',properties:{script:{type:'string'}}}},
];
const setup=(resolveAttachmentUrl: NonNullable<Parameters<typeof useChatRuntime>[0]['resolveAttachmentUrl']> = async()=> 'data:image/png;base64,reference-fixture', options: Partial<Parameters<typeof useChatRuntime>[0]> = {})=>useChatRuntime({model:'fixture',approvalMode:'auto',resolveAttachmentUrl,executeTool:executed,additionalTools:(id,source)=>{
 if(source!=='rhino')return [];registerRhinoNativeTools(id,tools);return [...tools.map(t=>({type:'function' as const,function:{name:t.name,description:t.description,parameters:t.inputSchema}})), ...rhinoToolDefinitions];
},...options});
const call=(id:string,args:Record<string,unknown>,name=search)=>({content:'',toolCalls:[{id,name,arguments:JSON.stringify(args)}]});
beforeEach(()=>{
 h.deferStateUpdaters=false;
 const storage=new Map();vi.stubGlobal('localStorage',{getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>storage.set(k,v)});vi.stubGlobal('window',{dispatchEvent:vi.fn(),setTimeout:()=>1,clearTimeout:()=>{}});
 h.messages.clear();h.replies.length=0;h.requests.length=0;h.invoke.mockReset();executed.mockReset();executed.mockImplementation(async()=>({source:'rhino',content:'{"hits":[]}'}));
 h.invoke.mockImplementation(async(command:string,args:Record<string,any>)=>{
  if(command==='agent_openai_chat'){h.requests.push(args.request);const next=await h.replies.shift();if(!next)throw Error('Unexpected extra model request');if(next instanceof Error)throw next;return {requestId:args.request.requestId,...next};}
  if(command==='chat_list_messages')return {messages:[...h.messages.values()],hasMore:false};
  if(command==='chat_upsert_message'){h.messages.set(args.message.id,args.message);return args.message;}
  if(command==='chat_upsert_conversation')return args.conversation;
  if(command==='chat_upsert_tool_call')return args.call;
  if(command==='github_skills_request')return [];
  return null;
 });
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
const last=()=>[...h.messages.values()].filter(message=>message.role==='assistant').slice(-1)[0]!;

it('takes a new requirement during a model request before dispatching the old plan', async () => {
  let answerOldPlan!: (value: Record<string, unknown>) => void;
  h.replies.push(new Promise(resolve => { answerOldPlan = resolve; }), { content: '按追加要求继续。', toolCalls: [] });
  const runtime = setup();
  const task = runtime.sendMessage('帮我建模', [], undefined, undefined, undefined, 'rhino');
  await vi.waitFor(() => expect(h.requests).toHaveLength(1));
  expect(await runtime.appendToActiveTurn('按钮再内缩 1 毫米')).toBe(true);
  answerOldPlan(call('old', {}, 'rhino_get_context'));
  expect(await task).toBe(true);
  expect(executed).not.toHaveBeenCalled();
  expect(h.requests[1].messages).toContainEqual({ role: 'user', content: '按钮再内缩 1 毫米' });
  expect([...h.messages.values()].some(message => message.role === 'user' && message.content === '按钮再内缩 1 毫米')).toBe(true);
});

it('keeps a finished tool receipt and replans before the unexecuted sibling tool', async () => {
  let finishCurrentCall!: () => void;
  executed.mockImplementationOnce(async () => {
    await new Promise<void>(resolve => { finishCurrentCall = resolve; });
    return { source: 'rhino', content: 'verified current state' };
  });
  h.replies.push({ content: '', toolCalls: [
    { id: 'current', name: 'rhino_get_context', arguments: '{}' },
    { id: 'stale', name: 'rhino_list_objects', arguments: '{}' },
  ] }, { content: '按新要求继续。', toolCalls: [] });
  const runtime = setup();
  const task = runtime.sendMessage('帮我建模', [], undefined, undefined, undefined, 'rhino');
  await vi.waitFor(() => expect(executed).toHaveBeenCalledTimes(1));
  expect(await runtime.appendToActiveTurn('保留已有外壳')).toBe(true);
  finishCurrentCall();
  expect(await task).toBe(true);
  expect(executed).toHaveBeenCalledTimes(1);
  expect(h.requests[1].messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ role: 'tool', content: expect.stringContaining('verified current state') }),
    expect.objectContaining({ role: 'tool', content: expect.stringContaining('cancelled') }),
    { role: 'user', content: '保留已有外壳' },
  ]));
});

it('publishes a downloadable 3DM after a committed background modeling step', async () => {
  const name = 'rhino_native_headless_build';
  const exportModel = vi.fn(async () => ({ files: [{ id: 'model', name: '模型.3dm', format: '3dm', path: 'C:/generated/model.3dm', previewPath: 'C:/generated/model.png' }] }));
  const release = vi.fn();
  const tool: RhinoNativeTool = {
    name, description: 'Build a solid', readOnly: false, destructive: false, workflowPhase: 'build',
    inputSchema: { type: 'object', properties: { operation: { type: 'string' } }, required: ['operation'] },
  };
  const runtime = setup(undefined, {
    prepareCanvasRhinoTurn: async () => ({ context: '{"objects":[]}', documentName: '后台 Rhino', exportModel, release }),
    additionalTools: (id, source) => {
      if (source !== 'rhino') return [];
      registerRhinoNativeTools(id, [tool]);
      return [{ type: 'function', function: { name, description: tool.description, parameters: tool.inputSchema } }];
    },
  });
  executed.mockResolvedValueOnce({ source: 'rhino', content: '{"committed":true}' });
  h.replies.push(call('box', { operation: 'box' }, name), { content: '建模完成。', toolCalls: [] });
  expect(await runtime.sendMessage('帮我建模')).toBe(true);
  expect(exportModel).toHaveBeenCalledTimes(1);
  expect(last().toolCalls).toContainEqual(expect.objectContaining({ toolName: 'rhino_headless_export', status: 'completed', resultJson: expect.stringContaining('model.3dm') }));
  expect(release).toHaveBeenCalledTimes(1);
});

it('repairs only the failed background part and does not resend the same rejected cage', async () => {
  const name = RHINO_HEADLESS_BUILD_TOOL;
  const exportModel = vi.fn(async () => ({ files: [{ id: 'model', name: '模型.3dm', format: '3dm', path: 'C:/generated/model.3dm' }] }));
  const build = vi.fn<ChatToolExecutor>();
  const tool: RhinoNativeTool = {
    name, description: 'Build SubD', readOnly: false, destructive: false, workflowPhase: 'build',
    inputSchema: { type: 'object', properties: { operation: { type: 'string' }, name: { type: 'string' }, cageVertices: { type: 'array' } } },
  };
  const runtime = setup(undefined, {
    executeTool: build,
    prepareCanvasRhinoTurn: async () => ({ context: '{"objects":[]}', documentName: '后台 Rhino', exportModel, release: vi.fn() }),
    additionalTools: (id, source) => {
      if (source !== 'rhino') return [];
      registerRhinoNativeTools(id, [tool]);
      return [{ type: 'function', function: { name, description: tool.description, parameters: tool.inputSchema } }];
    },
  });
  const body = { operation: 'subd', name: 'body' };
  const bad = { operation: 'subd', name: 'wing', cageVertices: [[0, 0, 0]] };
  const corrected = { ...bad, cageVertices: [[0, 0, 0], [1, 0, 0], [0, 1, 0]] };
  build.mockResolvedValueOnce({ committed: true })
    .mockRejectedValueOnce(new RhinoHeadlessGeometryError('Unused cageVertices indices: 0.'))
    .mockResolvedValueOnce({ committed: true });
  h.replies.push(call('body', body, name), call('bad', bad, name), call('duplicate', bad, name), call('fixed', corrected, name),
    { content: '已补完小翼。', toolCalls: [] });
  expect(await runtime.sendMessage('用 SubD 建模')).toBe(true);
  expect(build.mock.calls.map(entry => entry[1])).toEqual([body, bad, corrected]);
  expect(last().toolCalls).toContainEqual(expect.objectContaining({ id: 'duplicate', status: 'error', resultJson: expect.stringContaining('"dispatched":false') }));
  expect(JSON.stringify(h.requests[2].messages)).toContain('Unused cageVertices indices: 0.');
  expect(exportModel).toHaveBeenCalled();
  expect(last().status).toBe('completed');
});

it('routes a canvas Chat request through Rhino, passing actual image pixels and the verified scene context', async () => {
  const release = vi.fn();
  const prepareCanvasRhinoTurn = vi.fn(async () => ({
    context: '{"documentId":28,"units":"Millimeters"}', documentName: 'Fixture Rhino', release,
  }));
  const runtime = setup(undefined, { prepareCanvasRhinoTurn });
  h.replies.push(call('ctx', {}, 'rhino_get_context'), { content: '已读取当前文档。', toolCalls: [] });
  const content = '按参考图建模';
  expect(await runtime.sendMessage(content, [{ id: 'source', type: 'image', path: 'fixture.png' }])).toBe(true);
  expect(prepareCanvasRhinoTurn).toHaveBeenCalledTimes(1);
  expect(executed).toHaveBeenCalledWith('rhino_get_context', {}, expect.objectContaining({ executionSource: 'rhino' }));
  expect(h.requests[0].tools.map((tool: any) => tool.function.name)).toContain(RHINO_MODELING_SKILL_RESOURCE_TOOL);
  const messages = h.requests[0].messages;
  expect(messages).toContainEqual({ role: 'user', content: '{"documentId":28,"units":"Millimeters"}' });
  expect(messages.at(-1).content).toContainEqual(expect.objectContaining({ type: 'image_url' }));
  expect([...h.messages.values()].find(message => message.role === 'user')?.content).toBe(content);
  expect(release).toHaveBeenCalledTimes(1);
});

it('reports a missing Rhino connection in the Chat transcript without falling back to a model request', async () => {
  const prepareCanvasRhinoTurn = vi.fn(async () => { throw new Error('请打开 Rhino 文档'); });
  const runtime = setup(undefined, { prepareCanvasRhinoTurn });
  expect(await runtime.sendMessage('帮我建模')).toBe(true);
  expect(last()).toMatchObject({ status: 'error', content: expect.stringContaining('请打开 Rhino 文档') });
  expect(h.requests).toHaveLength(0);
  h.replies.push({ content: '这里是建模步骤。', toolCalls: [] });
  expect(await runtime.sendMessage('怎么用 Rhino 建模？')).toBe(true);
  expect(prepareCanvasRhinoTurn).toHaveBeenCalledTimes(1);
});

it('retains the Rhino route across consecutive short retries after a failed SubD attempt', async () => {
  const prepareCanvasRhinoTurn = vi.fn(async () => { throw new Error('Rhino test connection unavailable'); });
  const runtime = setup(undefined, { prepareCanvasRhinoTurn });
  const original = '帮我在 Rhino 9 用细分建模这个';
  for (const message of [original, '再试试', '重试一下。']) {
    expect(await runtime.sendMessage(message)).toBe(true);
    expect(last()).toMatchObject({ status: 'error', content: expect.stringContaining('Rhino test connection unavailable') });
  }
  expect(prepareCanvasRhinoTurn).toHaveBeenCalledTimes(3);
  expect(prepareCanvasRhinoTurn.mock.calls).toEqual(Array.from({ length: 3 }, () => [expect.any(String), original]));
  expect(h.requests).toHaveLength(0);
  h.replies.push({ content: '换个话题。', toolCalls: [] }, { content: '普通对话。', toolCalls: [] });
  expect(await runtime.sendMessage('讲一个故事')).toBe(true);
  expect(await runtime.sendMessage('再试试')).toBe(true);
  expect(prepareCanvasRhinoTurn).toHaveBeenCalledTimes(3);
});

it('reports missing canvas references before starting reference-based Rhino modeling', async () => {
  expect(await setup().sendMessage('按画布里的三视图重新建模', [], undefined, undefined, undefined, 'rhino')).toBe(true);
  expect(h.requests).toHaveLength(0);
  expect(executed).not.toHaveBeenCalled();
  expect(last().status).toBe('error');
  expect(last().content).toContain('本轮没有收到建模参考图');
});

it('does not start Rhino modeling with a partially failed reference set', async () => {
  const references = ['front', 'side'].map(id => ({ id, type: 'image' as const, path: `C:/fixture/${id}.jpg` }));
  await setup(async image => image.id === 'front' ? 'data:image/jpeg;base64,QUJD' : '')
    .sendMessage('根据三视图建模', references, undefined, undefined, undefined, 'rhino');
  expect(h.requests).toHaveLength(0);
  expect(executed).not.toHaveBeenCalled();
  expect(last().status).toBe('error');
  expect(last().content).toContain('有建模参考图未能读取或上传');
});

it('finishes a Rhino turn with more than 24 consecutive tool rounds', async () => {
  for (let round = 0; round < 32; round++) h.replies.push(call(`graph-${round}`, {}, 'rhino_native_g1_get_canvas_graph'));
  h.replies.push({ content: 'All requested inspections completed.', toolCalls: [] });
  await setup().sendMessage('Inspect the GH graph repeatedly to verify the requested workflow.', [], undefined, undefined, undefined, 'rhino');
  expect(executed).toHaveBeenCalledTimes(32);
  expect(h.requests).toHaveLength(33);
  expect(last().status).toBe('completed');
  expect(last().toolCalls).toHaveLength(32);
});

it('still honors manual stop after the former 24-round boundary', async () => {
  const runtime = setup();
  for (let round = 0; round < 32; round++) h.replies.push(call(`graph-${round}`, {}, 'rhino_native_g1_get_canvas_graph'));
  executed.mockImplementation(async () => {
    if (executed.mock.calls.length === 27) await runtime.stop();
    return { source: 'rhino', content: '{"objects":[]}' };
  });
  await runtime.sendMessage('Inspect the current GH graph.', [], undefined, undefined, undefined, 'rhino');
  expect(executed).toHaveBeenCalledTimes(27);
  expect(last().status).toBe('cancelled');
});

it('publishes a newly saved conversation to the bridge before React runs state updater functions', async () => {
  const runtime = setup();
  h.deferStateUpdaters = true;
  const created = await runtime.newConversation('新对话');
  expect(created).toBeTruthy();
  expect(runtime.conversations).toEqual([]);
  expect(runtime.getConversationState().activeConversationId).toBe(created.id);
  expect(runtime.getConversationState().conversations.map(item => item.id)).toContain(created.id);
});
describe('read-only GH discovery repairs in the actual Chat runtime, no native writes or paid calls',()=>{
 it('repairs two independent searches separated by successful results without exhausting a stale budget',async()=>{
  h.replies.push(call('bad-one',{}),call('fixed-one',{query:'Populate Geometry',limit:8}),call('graph',{},'rhino_native_g1_get_canvas_graph'),call('bad-two',{query:['Sphere']}),call('fixed-two',{query:'Sphere'}),{content:'已完成组件资料查询，未执行建模。',toolCalls:[]});
  await setup().sendMessage('查询两个组件的端口资料，不要建模。',[],undefined,undefined,undefined,'rhino');
  expect(last().status).toBe('completed');
  expect(last().toolCalls.map(t=>t.status)).toEqual(['error','completed','completed','error','completed']);
  expect(executed).toHaveBeenCalledTimes(3);
  expect(JSON.stringify(h.requests[0].messages)).toContain('GH_ParamAccess');
  expect(JSON.stringify(h.requests[0].messages)).toContain('opaque script');
 });
 it('stops an unresolved repeated invalid query and exposes the actual missing field',async()=>{
  h.replies.push(call('bad-one',{}),call('bad-again',{}));
  await setup().sendMessage('查询组件的端口资料。',[],undefined,undefined,undefined,'rhino');
  expect(last().status).toBe('error');expect(executed).not.toHaveBeenCalled();expect(h.requests).toHaveLength(2);
  expect(last().content).toContain('具体原因');expect(last().content).toContain('query');
 });
});

describe('generic GH2 modeling acceptance in the actual Chat runtime',()=>{
 const component='a1111111-1111-4111-8111-111111111111';
 const output='b1111111-1111-4111-8111-111111111111';
 const plan={componentIds:[component],geometryOutputIds:[output]};
 const good={version:1,status:'passed',graphChanged:false,previewAvailable:true,issues:[],outputs:[{id:output,items:1,validGeometryItems:1,invalidGeometryItems:0,rawItemTypes:{'Rhino.Geometry.Brep':1}}]};
 it('continues from premature completion through diagnosis, targeted conversion repair, solve and fresh verification',async()=>{
  h.replies.push(call('build',{},'rhino_native_g2_apply_graph'),{content:'Done',toolCalls:[]},
   call('diagnose',plan,GH2_VERIFY_MODEL_TOOL),
   call('repair',{...plan,expectedDocumentId:component},GH2_REPAIR_OUTPUTS_TOOL),
   call('solve',{},'rhino_native_g2_solve_canvas'),call('verify',plan,GH2_VERIFY_MODEL_TOOL),
   {content:'The actual native geometry and preview data passed verification.',toolCalls:[]});
  let verified=0;
  executed.mockImplementation(async(name:string)=>name===GH2_VERIFY_MODEL_TOOL
   ? {source:'rhino',content:'native receipt',gh2Verification:++verified===1?{...good,status:'needs_attention',previewAvailable:false,issues:[{code:'python_output_not_marshaled'}],outputs:[{...good.outputs[0],validGeometryItems:0,rawItemTypes:{'Python.Runtime.PyObject':1}}]}:good}
   : {source:'rhino',content:name===GH2_REPAIR_OUTPUTS_TOOL?'settings_changed; modelVerified=false':'ok'});
  await setup().sendMessage('Build an editable GH2 model with visible geometry.',[],undefined,undefined,undefined,'rhino');
  expect(last().status).toBe('completed');
  expect(executed.mock.calls.map(([name])=>name)).toEqual(['rhino_native_g2_apply_graph',GH2_VERIFY_MODEL_TOOL,GH2_REPAIR_OUTPUTS_TOOL,'rhino_native_g2_solve_canvas',GH2_VERIFY_MODEL_TOOL]);
  expect(JSON.stringify(h.requests[2].messages)).toContain('GH2_MODEL_ACCEPTANCE_REQUIRED_V1');
  expect(last().content).not.toContain('Done');
 });
 it('does not accept a console success or a setting change without an acceptance receipt',async()=>{
  h.replies.push(call('build',{},'rhino_native_g2_apply_graph'),{content:'Done',toolCalls:[]},{content:'I changed the setting; done.',toolCalls:[]});
  await setup().sendMessage('Build a GH2 model.',[],undefined,undefined,undefined,'rhino');
  expect(last().status).toBe('error');expect(last().content).toContain('尚未通过最终输出验收');
  expect(last().content).not.toContain('done.');
 });
 it('invalidates a passed audit when another write occurs afterwards',async()=>{
  h.replies.push(call('build',{},'rhino_native_g2_apply_graph'),call('first-audit',plan,GH2_VERIFY_MODEL_TOOL),
   call('later-write',{},'rhino_native_g2_apply_graph'),{content:'Done',toolCalls:[]},{content:'Done anyway',toolCalls:[]});
  executed.mockImplementation(async(name:string)=>name===GH2_VERIFY_MODEL_TOOL?{source:'rhino',content:'receipt',gh2Verification:good}:{source:'rhino',content:'ok'});
  await setup().sendMessage('Build and revise a GH2 model.',[],undefined,undefined,undefined,'rhino');
  expect(last().status).toBe('error');expect(last().content).toContain('尚未通过最终输出验收');
 });
 it('does not gate read-only GH2 inspection on producing new geometry',async()=>{
  h.replies.push(call('read',{},'rhino_native_g2_get_canvas_graph'),{content:'The existing graph has no output.',toolCalls:[]});
  await setup().sendMessage('Inspect the existing GH2 graph only.',[],undefined,undefined,undefined,'rhino');
  expect(last().status).toBe('completed');expect(executed).toHaveBeenCalledOnce();
 });
});


describe('explicit GH component modeling preference in the actual Chat runtime',()=>{
 it('offers the editable GH graph tools and withholds script execution tools when the user asks for components',async()=>{
  h.replies.push({content:'I will build this from native Grasshopper components.',toolCalls:[]});
  await setup().sendMessage('Please build this model with native GH components, no code.',[],undefined,undefined,undefined,'rhino');
  const request=h.requests[0];
  const names=request.tools.map((tool:any)=>tool.function.name);
  expect(names).toContain('rhino_native_g1_search_components');
  expect(names).toContain('rhino_native_g1_apply_graph');
  expect(names).toContain('rhino_native_g1_solve_graph');
  expect(names.filter((name:string)=>name.startsWith('rhino_native_run_'))).toEqual([]);
  expect(JSON.stringify(request.messages)).toContain('USER REQUESTS NATIVE GRASSHOPPER COMPONENTS');
  expect(executed).not.toHaveBeenCalled();
 });
 it('does not hide Python for an explicitly code-based GH-adjacent task',async()=>{
  h.replies.push({content:'I will use the requested Python calculation.',toolCalls:[]});
  await setup().sendMessage('Use Python to calculate and display a mesh.',[],undefined,undefined,undefined,'rhino');
  expect(h.requests[0].tools.some((tool:any)=>tool.function.name==='rhino_native_run_python')).toBe(true);
  expect(JSON.stringify(h.requests[0].messages)).not.toContain('USER REQUESTS NATIVE GRASSHOPPER COMPONENTS');
 });
});


describe('bounded recovery after a structured GH solve failure',()=>{
 const failedSolve=()=>new Error(JSON.stringify({error:'The solution reported component errors',message:'component errors',statuses:[{name:'IronPython 2 Script',messages:[{level:'Error',text:"'Guid' object has no attribute 'X' [64:1]"}]}]}));
 it('inspects, makes one targeted graph edit, solves once and verifies within the same run',async()=>{
  h.replies.push(
   call('solve-first',{},'rhino_native_g1_solve_graph'),
   call('graph-diagnose',{},'rhino_native_g1_get_canvas_graph'),
   call('graph-correct',{operations:[{op:'update',id:'known-guid'}]},'rhino_native_g1_apply_graph'),
   call('solve-once-more',{},'rhino_native_g1_solve_graph'),
   call('graph-verify',{},'rhino_native_g1_get_canvas_graph'),
   {content:'The GH definition now solves and the graph was verified.',toolCalls:[]},
  );
  executed.mockImplementation(async(name:string)=>{
   if(name==='rhino_native_g1_solve_graph'&&executed.mock.calls.filter(([n])=>n===name).length===1)throw failedSolve();
   return {source:'rhino',content:JSON.stringify({solved:true,statuses:[]})};
  });
  await setup().sendMessage('Please build this model with native GH components, no code.',[],undefined,undefined,undefined,'rhino');
  expect(executed.mock.calls.map(([name])=>name)).toEqual([
   'rhino_native_g1_solve_graph',
   'rhino_native_g1_get_canvas_graph',
   'rhino_native_g1_apply_graph',
   'rhino_native_g1_solve_graph',
   'rhino_native_g1_get_canvas_graph',
  ]);
  expect(h.requests).toHaveLength(6);
  expect(JSON.stringify(h.requests[1].messages)).toContain('GH_SOLVE_RECOVERY_V1');
  expect(JSON.stringify(h.requests[1].messages)).toContain('Guid');
  expect(last().status).toBe('completed');
 });
 it('stops after the single corrective solve if that solve still fails',async()=>{
  h.replies.push(
   call('solve-first',{},'rhino_native_g1_solve_graph'),
   call('graph-diagnose',{},'rhino_native_g1_get_canvas_graph'),
   call('graph-correct',{operations:[{op:'update',id:'known-guid'}]},'rhino_native_g1_apply_graph'),
   call('solve-once-more',{},'rhino_native_g1_solve_graph'),
  );
  executed.mockImplementation(async(name:string)=>{
   if(name==='rhino_native_g1_solve_graph')throw failedSolve();
   return {source:'rhino',content:'{}'};
  });
  await setup().sendMessage('Please build this model with native GH components, no code.',[],undefined,undefined,undefined,'rhino');
  expect(executed.mock.calls.map(([name])=>name)).toEqual([
   'rhino_native_g1_solve_graph','rhino_native_g1_get_canvas_graph','rhino_native_g1_apply_graph','rhino_native_g1_solve_graph',
  ]);
  expect(h.requests).toHaveLength(4);
  expect(last().status).toBe('error');
  expect(last().content).toContain('IronPython 2 Script');
  expect(last().content).toContain("'Guid' object has no attribute 'X' [64:1]");
 });
 it('does not start GH graph recovery for ordinary script/runtime errors',async()=>{
  h.replies.push(call('script', {script:'raise NameError()'},'rhino_native_run_python'));
  executed.mockRejectedValue(new Error("NameError: name 'missing_value' is not defined"));
  await setup().sendMessage('Use Python to calculate and display a mesh.',[],undefined,undefined,undefined,'rhino');
  expect(executed).toHaveBeenCalledTimes(1);
  expect(h.requests).toHaveLength(2);
  expect(JSON.stringify(h.requests[1].messages)).toContain('RHINO_NATIVE_FAILURE_DIAGNOSIS_V1');
  expect(last().status).toBe('error');
 });
});


describe('Rhino Chat semantically triages modeling goals and image complexity',()=>{
 it('applies the same form-analysis gate to handles and supercars without surface keywords',async()=>{
  h.replies.push(
   {content:'I will infer the handle geometry from the design brief and choose the simplest fitting route.',toolCalls:[]},
   {content:'I will inspect the supercar form and identify which panels need freeform surfacing.',toolCalls:[]},
  );
  const runtime=setup();
  await runtime.sendMessage('Design a handle.',[],undefined,undefined,undefined,'rhino');
  await runtime.sendMessage('Design a supercar.',[],undefined,undefined,undefined,'rhino');
  for(const request of h.requests) {
   expect(JSON.stringify(request.messages)).toContain('RHINO_MODELING_INTENT_GATE_V4');
   expect(JSON.stringify(request.messages)).toContain('依据几何结构和后续编辑需求选方法');
  }
 });
 it('adds image-first product and curvature assessment to a vague reference request',async()=>{
  h.replies.push({content:'I will first identify the product and visible surface families before choosing a modeling route.',toolCalls:[]});
  const runtime=setup();
  await runtime.sendMessage('Please recreate this.',[{id:'reference-image',type:'image',path:'C:/fixture/reference.png',mimeType:'image/png'}],undefined,undefined,undefined,'rhino');
  const messages=JSON.stringify(h.requests[0].messages);
  expect(messages).toContain('planar/prismatic, constant-section, axisymmetric or freeform/organic');
  expect(messages).toContain('freeform/organic');
  expect(messages).toContain('data:image/png;base64,reference-fixture');
  expect(messages).toContain('\"detail\":\"high\"');
 });
 it('keeps image-specific analysis out of unrelated requests without image pixels',async()=>{
  h.replies.push({content:'The document contains the requested layers.',toolCalls:[]});
  const runtime=setup();
  await runtime.sendMessage('List the document layers.',[],undefined,undefined,undefined,'rhino');
  const messages=JSON.stringify(h.requests[0].messages);
  expect(messages).toContain('RHINO_MODELING_INTENT_GATE_V4');
  expect(messages).not.toContain('RHINO_REFERENCE_IMAGE_ANALYSIS');
 });
});


describe('Rhino web search is model-selected and continues into native work',()=>{
 it('exposes web_search without fixed user keywords and continues the same turn after a model-selected search',async()=>{
  h.replies.push(
   call('online-research',{query:'ergonomic handle design precedents materials form references'},'web_search'),
   {content:'I reviewed the references and will apply the relevant geometry in Rhino.',toolCalls:[]},
  );
  const runtime=setup();
  await runtime.sendMessage('Design a handle.',[],undefined,undefined,undefined,'rhino');
  const names=h.requests[0].tools.map((tool:any)=>tool.function.name);
  expect(names).toContain('web_search');
  expect(JSON.stringify(h.requests[0].messages)).toContain('RHINO_WEB_SEARCH_DECISION_V1');
  expect(executed).toHaveBeenCalledWith('web_search',expect.objectContaining({query:'ergonomic handle design precedents materials form references'}),expect.anything());
  expect(h.requests).toHaveLength(2);
  expect(JSON.stringify(h.requests[1].messages)).toContain('ergonomic handle design precedents');
  expect(last().status).toBe('completed');
 });
});


describe('local Rhino API preflight corrects the reported ObjectTable failure before host dispatch',()=>{
 it('rejects FindByObjectName before sending it to Rhino, then lets the model repair with FindByFilter once',async()=>{
  const invalid='import Rhino\nobj = __rhino_doc__.Objects.FindByObjectName("body")';
  const corrected='import Rhino\nsettings = Rhino.DocObjects.ObjectEnumeratorSettings()\nobjects = __rhino_doc__.Objects.FindByFilter(settings)\nmatches = [obj for obj in objects if obj.Attributes.Name == "body"]';
  h.replies.push(
   {content:'',toolCalls:[{id:'bad-object-name-api',name:'rhino_native_run_python',arguments:JSON.stringify({script:invalid})}]},
   {content:'',toolCalls:[{id:'corrected-object-name-api',name:'rhino_native_run_python',arguments:JSON.stringify({script:corrected})}]},
   {content:'The supported object lookup ran.',toolCalls:[]},
  );
  const runtime=setup();
  await runtime.sendMessage('Inspect and model the requested handle.',[],undefined,undefined,undefined,'rhino');
  expect(executed).toHaveBeenCalledOnce();
  expect(executed).toHaveBeenCalledWith('rhino_native_run_python',expect.objectContaining({script:corrected}),expect.anything());
  expect(executed).not.toHaveBeenCalledWith('rhino_native_run_python',expect.objectContaining({script:invalid}),expect.anything());
  expect(JSON.stringify(h.requests[1].messages)).toContain('ObjectTable.FindByObjectName');
  expect(JSON.stringify(h.requests[1].messages)).toContain('dispatched');
  expect(last().toolCalls.map(tool=>tool.status)).toEqual(['error','completed']);
  expect(last().status).toBe('completed');
 });
});

describe('Python 3 enum preflight preserves the one-correction workflow', () => {
 it.each(['rg.PipeCapMode.None', 'getattr(rg.PipeCapMode, "None")'])('corrects %s locally, then dispatches only the supported script', async expression => {
  const invalid = 'import Rhino.Geometry as rg\ncap = ' + expression;
  const corrected = 'import Rhino.Geometry as rg\ncap = rg.PipeCapMode.NONE';
  h.replies.push(
   { content: '', toolCalls: [{ id: 'bad-enum', name: 'rhino_native_run_python', arguments: JSON.stringify({ script: invalid }) }] },
   { content: '', toolCalls: [{ id: 'fixed-enum', name: 'rhino_native_run_python', arguments: JSON.stringify({ script: corrected }) }] },
   { content: 'The corrected enum lookup ran.', toolCalls: [] },
  );
  await setup().sendMessage('Inspect the pipe cap mode.', [], undefined, undefined, undefined, 'rhino');
  expect(executed).toHaveBeenCalledOnce();
  expect(executed).toHaveBeenCalledWith('rhino_native_run_python', expect.objectContaining({ script: corrected }), expect.anything());
  expect(JSON.stringify(h.requests[1].messages)).toContain('rhino_python_enum_none');
  expect(JSON.stringify(h.requests[1].messages)).toContain('rg.PipeCapMode.NONE');
  expect(last().toolCalls.map(tool => tool.status)).toEqual(['error', 'completed']);
  expect(last().status).toBe('completed');
 });
});


describe('app-enforced Rhino native failure diagnosis',()=>{
 const run=(args:Record<string,unknown>,id='script')=>call(id,args,'rhino_native_run_python');
 const inspect=()=>call('inspect',{},'rhino_native_g1_get_canvas_graph');
 const request=()=>setup().sendMessage('Create the geometry with Python.',[],undefined,undefined,undefined,'rhino');
 it('can inspect and correct a new confirmed mesh failure after verifying an earlier correction', async () => {
  const python = (id: string) => run({ script: id + '()' }, id);
  const graph = (id: string) => call(id, {}, 'rhino_native_g1_get_canvas_graph');
  h.replies.push(python('first'), graph('inspect-first'), python('fix-first'), graph('verify-first'),
    python('frame'), graph('inspect-frame'), python('fix-frame'), graph('verify-frame'), { content: 'Verified both parts.', toolCalls: [] });
  let writes = 0;
  executed.mockImplementation(async name => {
   if (name === 'rhino_native_run_python') {
    writes++;
    if (writes === 1) throw Error('first stage failed');
    if (writes === 3) throw new RhinoDocumentGeometryWriteError(
      Error('ValueError: B05_背面调节窗边框 mesh is not an outward solid'),
      { writeFailed: true, documentWriteWasDispatched: true, status: 'no_geometry_change' },
    );
   }
   return { source: 'rhino', content: '{"objects":[]}' };
  });
  await request();
  expect(executed.mock.calls.map(([name]) => name)).toEqual(
    Array.from({ length: 4 }, () => ['rhino_native_run_python', 'rhino_native_g1_get_canvas_graph']).flat(),
  );
  expect(JSON.stringify(h.requests[5].messages)).toContain('SolidOrientation()');
  expect(h.requests[5].tools.every((tool: any) => !tool.function.name.includes('run_python'))).toBe(true);
  expect(last().status).toBe('completed');
 });
 it('inspects first, corrects once and verifies before completion',async()=>{
  h.replies.push(run({script:'bad()'}),inspect(),{...run({script:'fixed()'},'fix'),content:'The error was caused by using the event as a point; inspection shows existing geometry is preserved.'},call('verify',{},'rhino_native_g1_get_canvas_graph'),{content:'The targeted correction passed read-only verification.',toolCalls:[]});
  executed.mockImplementation(async(name:string)=>{
   if(name==='rhino_native_run_python'&&executed.mock.calls.filter(([n])=>n===name).length===1)throw Error("AttributeError: 'RayShootEvent' object has no attribute 'Z'");
   return {source:'rhino',content:'{"objects":[],"verified":true}'};
  });
  await request();
  expect(executed.mock.calls.map(([name])=>name)).toEqual(['rhino_native_run_python','rhino_native_g1_get_canvas_graph','rhino_native_run_python','rhino_native_g1_get_canvas_graph']);
  expect(h.requests).toHaveLength(5);
  expect(h.requests[1].tools.every((tool:any)=>!tool.function.name.includes('run_python')&&!tool.function.name.includes('apply_graph'))).toBe(true);
  expect(JSON.stringify(h.requests[2].messages)).toContain('RHINO_NATIVE_FAILURE_INSPECTED_V1');
  expect(h.requests[3].tools.every((tool:any)=>!tool.function.name.includes('run_python'))).toBe(true);
  expect(last().status).toBe('completed');
 });
 it('blocks a hidden write from a model during the read-only stage',async()=>{
  h.replies.push(run({script:'bad()'}),run({script:'hidden_write()'},'hidden'));
  executed.mockRejectedValue(Error('remote script error'));
  await request();
  expect(executed).toHaveBeenCalledTimes(1);
  expect(last().status).toBe('error');
  expect(last().content).toContain('read-only inspection');
 });
 it('stops if live inspection fails, without allowing a correction',async()=>{
  h.replies.push(run({script:'bad()'}),inspect());
  executed.mockRejectedValue(Error('cannot read the bound document'));
  await request();
  expect(executed).toHaveBeenCalledTimes(2);
  expect(h.requests).toHaveLength(2);
  expect(last().status).toBe('error');
 });
 it('rejects unchanged replay even after inspection succeeds',async()=>{
  h.replies.push(run({script:'bad()'}),inspect(),run({script:'bad()'},'replay'));
  executed.mockImplementation(async(name:string)=>{if(name==='rhino_native_run_python')throw Error('remote failure');return {source:'rhino',content:'{}'};});
  await request();
  expect(executed).toHaveBeenCalledTimes(2);
  expect(last().content).toContain('write/replay was not dispatched');
  expect(last().status).toBe('error');
 });
 it('stops after one corrective write failure without another recovery cycle',async()=>{
  h.replies.push(run({script:'bad()'}),inspect(),run({script:'fixed()'},'fix'));
  executed.mockImplementation(async(name:string)=>{if(name==='rhino_native_run_python')throw Error('still invalid');return {source:'rhino',content:'{}'};});
  await request();expect(executed).toHaveBeenCalledTimes(3);expect(h.requests).toHaveLength(3);expect(last().status).toBe('error');
 });
 it('does not mark a diagnosis without live inspection as complete',async()=>{
  h.replies.push(run({script:'bad()'}),{content:'I think I fixed it.',toolCalls:[]});executed.mockRejectedValue(Error('remote failure'));
  await request();expect(last().status).toBe('error');expect(last().content).toContain('尚未成功检查');
 });
});


it('uses read-only discovery after inspection without spending the one correction',async()=>{
 h.replies.push(call('failed',{script:'bad()'},'rhino_native_run_python'),call('inspect',{},'rhino_native_g1_get_canvas_graph'),call('discover',{query:'exact required component'}),call('fix',{script:'fixed()'},'rhino_native_run_python'),call('verify',{},'rhino_native_g1_get_canvas_graph'),{content:'Verified',toolCalls:[]});
 executed.mockImplementation(async(name:string)=>{if(name==='rhino_native_run_python'&&executed.mock.calls.filter(([n])=>n===name).length===1)throw Error('bad member');return {source:'rhino',content:'{}'};});
 await setup().sendMessage('Create this with Python',[],undefined,undefined,undefined,'rhino');
 expect(executed).toHaveBeenCalledTimes(5);expect(last().status).toBe('completed');
});
it('blocks a second write in the same correction batch before dispatch',async()=>{
 h.replies.push(call('failed',{script:'bad()'},'rhino_native_run_python'),call('inspect',{},'rhino_native_g1_get_canvas_graph'),{content:'One correction only',toolCalls:[{id:'fix-1',name:'rhino_native_run_python',arguments:JSON.stringify({script:'fixed()'})},{id:'fix-2',name:'rhino_native_run_python',arguments:JSON.stringify({script:'again()'})}]});
 executed.mockImplementation(async(name:string)=>{if(name==='rhino_native_run_python'&&executed.mock.calls.filter(([n])=>n===name).length===1)throw Error('bad member');return {source:'rhino',content:'{}'};});
 await setup().sendMessage('Create this with Python',[],undefined,undefined,undefined,'rhino');
 expect(executed.mock.calls.map(([name])=>name)).toEqual(['rhino_native_run_python','rhino_native_g1_get_canvas_graph','rhino_native_run_python']);expect(last().status).toBe('error');
});


describe('reference-modeling visual review in the actual Chat runtime',()=>{
 const python='rhino_native_run_python';const view=RHINO_REFERENCE_REVIEW_TOOL;
 const reference={id:'ref-shape-review',type:'image' as const,path:'C:/fixture/review.png'};
 const writeReceipt={source:'rhino',content:'Committed',geometryVerification:{status:'passed',addedCount:1,changedCount:0}};
 const shot={source:'rhino',content:'Current model',transientRhinoImages:[{mimeType:'image/png',data:'UElYRUxT'}]};
 const send=()=>setup().sendMessage('根据参考图帮我建模',[reference],undefined,undefined,undefined,'rhino');
 const pass=()=>call('pass',{status:'complete',issues:[],correctionPlan:'',blockedReason:''},quality);
 const improve=(id='more')=>call(id,{status:'needs_improvement',issues:['握把与外壳过渡太直'],correctionPlan:'重做侧面控制截面及导轨，替换该过渡面',blockedReason:''},quality);
 const text=(content:string)=>({content,toolCalls:[]});
 it('checks both integral housing joints and openings for separate inset parts', async () => {
  h.replies.push(
   call('initial-shell', { script: 'build_housing_button_and_rib()' }, python), call('first-view', {}, view),
   text('按键可见，壳体开孔和加强筋连接尚未验证'),
   call('review-mounting', {
    status: 'needs_improvement', issues: ['按钮下方壳体缺少贯穿孔', '一体加强筋仍是与壳体重叠的独立实体'],
    correctionPlan: '合并壳体和加强筋，保留独立按钮，对壳体做局部布尔差并检查截面', blockedReason: '',
   }, quality),
   call('correct-shell', { script: 'unite_rib_and_cut_button_opening()' }, python), call('new-view', {}, view),
   text('已复查外壳一体加强筋和按键开口'), pass(), text('已复查装配关系。'),
  );
  executed.mockImplementation(async name => name === python ? writeReceipt : shot);
  await setup().sendMessage('根据参考图建模，加强筋和外壳一体，机械按键是嵌入件并需要贯穿孔。', [reference], undefined, undefined, undefined, 'rhino');
  expect(JSON.stringify(h.requests[0].messages)).toContain('plan how the relevant parts meet before choosing a construction method');
  expect(JSON.stringify(h.requests[0].messages)).toContain('Boolean difference if suitable');
  expect(JSON.stringify(h.requests[3].messages)).toContain('two overlapping objects fail that check');
  expect(JSON.stringify(h.requests[3].messages)).toContain('section or mating-part evidence');
  expect(JSON.stringify(h.requests[4].messages)).toContain('leave that part separate');
  expect(executed.mock.calls.map(([name]) => name)).toEqual([python, view, python, view]);
  expect(last().status).toBe('completed');
 });
 it('intercepts the coarse draft, edits the identified defect and reviews the new revision before completing',async()=>{
  h.replies.push(call('initial',{script:'build()'},python),call('first-view',{},view),text('目前只是阶段模型，握把没有自然过渡。'),improve(),call('refine',{script:'correct_transition()'},python),text('Finishing'),call('second-view',{},view),text('Compared actual viewport; blend updated.'),pass(),text('已完善过渡。'));
  let views=0;
  executed.mockImplementation(async(name:string)=>name===python?writeReceipt:++views===1?shot:{...shot,transientRhinoImages:[{mimeType:'image/png',data:'TkVXUElYRUxT'}]});
  await send();
  expect(executed.mock.calls.map(([name])=>name)).toEqual([python,view,python,view]);
  expect(JSON.stringify(h.requests[8].messages)).toContain('data:image/png;base64,TkVXUElYRUxT');
  expect(JSON.stringify(h.requests[8].messages)).not.toContain('data:image/png;base64,UElYRUxT');
  expect(JSON.stringify(h.requests[8].messages)).toContain('reference-fixture');
  expect(h.requests[3].toolChoice).toEqual({type:'function',function:{name:quality}});
  expect(h.requests[3].tools.map((tool:any)=>tool.function.name)).toEqual([quality]);  expect(h.requests[3].tools[0].function.parameters.properties.status.enum).toEqual(['complete','needs_improvement','blocked']);
  expect(h.requests[3].tools[0].function.parameters.properties.status.description).toContain('current assessment-only tool restriction is temporary');
  expect(JSON.stringify(h.requests[3].messages)).toContain('RHINO_QUALITY_REVIEW_TOOL_HANDOFF_V1');
  expect(JSON.stringify(h.requests[3].messages)).toContain('rhino_native_run_python');
  expect(JSON.stringify(h.requests[3].messages)).toContain('the next request will attach the exact live tool schemas');
  expect(JSON.stringify(h.requests[3].messages)).toContain('目前只是阶段模型');
  expect(JSON.stringify(h.requests[3].messages)).toContain('data:image/png;base64,UElYRUxT');
  expect(JSON.stringify(h.requests[3].messages)).toContain('reference-fixture');
  expect(h.requests[4].toolChoice).toBe('required');
  expect(h.requests[4].tools.map((tool:any)=>tool.function.name)).toContain(python);
  expect(h.requests[4].tools.map((tool:any)=>tool.function.name)).not.toContain('generate_image');
  expect(h.requests[6].toolChoice).toEqual({type:'function',function:{name:view}});
  expect(last().toolCalls.filter(t=>t.toolName===quality).map(t=>JSON.parse(t.resultJson!).reviewedWriteId)).toEqual(['initial','refine']);
  expect(last().content).toBe('已完善过渡。');
  expect(last().status).toBe('completed');
 });
 it('keeps user-visible stage conclusions if a later Rhino review request fails', async () => {
  h.replies.push(
   { ...call('initial', { script: 'build()' }, python), content: 'Initial analysis: the main body follows the reference silhouette; checking the surface transition now.' },
   call('first-view', {}, view),
   text('Stage conclusion: the grip transition still needs a targeted correction.'),
   new Error('HTTP 500 during Rhino quality review'),
   new Error('HTTP 500 during Rhino quality review'),
  );
  executed.mockImplementation(async (name: string) => name === python ? writeReceipt : shot);
  await send();
  expect(last().status).toBe('error');
  expect(last().content).toContain('Initial analysis: the main body follows the reference silhouette');
  expect(last().content).toContain('Stage conclusion: the grip transition still needs a targeted correction.');
  expect(last().content).toContain('HTTP 500 during Rhino quality review');
  expect(last().content).toContain('\u5df2\u6267\u884c\u7684\u5de5\u5177\u6b65\u9aa4\u5df2\u4fdd\u7559');
 });
 it('rechecks a false tool-unavailable blocker because write tools are restored on the next turn',async()=>{
  h.replies.push(
   call('initial',{script:'build()'},python),call('first-view',{},view),text('仍有明显曲面缺陷'),
   call('false-blocked',{status:'blocked',issues:['侧面转折仍接近平面'],correctionPlan:'',blockedReason:'No Rhino document read, Python geometry write, or viewport tools are available in this review.'},quality),
   improve('reassessed'),call('targeted-refinement',{script:'replace_side_profile_and_transition()'},python),
   call('refined-view',{},view),text('已对照新视口复核'),pass(),text('已完成定向完善。'),
  );
  let views=0;
  executed.mockImplementation(async(name:string)=>name===python?writeReceipt:++views===1?shot:{...shot,transientRhinoImages:[{mimeType:'image/png',data:'TkVXUElYRUxT'}]});
  await send();
  expect(JSON.stringify(h.requests[3].tools[0].function.parameters.properties.status.description)).toContain('current assessment-only tool restriction is temporary');
  expect(JSON.stringify(h.requests[4].messages)).toContain('the runtime has eligible document-bound write tools');
  expect(JSON.stringify(h.requests[4].messages)).toContain('rhino_native_run_python');
  expect(h.requests[5].toolChoice).toBe('required');
  expect(h.requests[5].tools.map((tool:any)=>tool.function.name)).toContain(python);
  expect(executed.mock.calls.map(([name])=>name)).toEqual([python,view,python,view]);
  expect(last().status).toBe('completed');
  expect(last().content).toBe('已完成定向完善。');
 });
 it('rechecks a Chinese read-only blocker on a later geometry revision even after an earlier recheck', async () => {
  const blocked = (id: string, blockedReason: string) => call(id, {
   status: 'blocked', issues: ['刀座过渡和尾部截面还需要重建'], correctionPlan: '', blockedReason,
  }, quality);
  h.replies.push(
   call('initial', { script: 'build()' }, python), call('initial-view', {}, view), text('初版'),
   blocked('first-blocker', 'No Rhino geometry write tools are available.'), improve('first-review'),
   call('refine-transition', { script: 'refit_transition()' }, python), call('transition-view', {}, view), text('刀座过渡已改'),
   blocked('later-blocker', '本轮实际可调用的接口只有读取与检查，缺少几何写入工具，无法继续完成局部截面重建。'),
   improve('later-review'), call('refine-tail', { script: 'refit_tail_section()' }, python),
   call('tail-view', {}, view), text('尾部已复查'), pass(), text('已完成刀座过渡和尾部截面。'),
  );
  executed.mockImplementation(async name => name === python ? writeReceipt : shot);
  await send();
  expect(executed.mock.calls.map(([name]) => name)).toEqual([python, view, python, view, python, view]);
  const rechecks = last().toolCalls.filter(tool => tool.toolName === quality && tool.status === 'error');
  expect(rechecks.map(tool => JSON.parse(tool.resultJson!).reviewedWriteId)).toEqual(['initial', 'refine-transition']);
  const resumed = h.requests[10];
  expect(resumed.tools.map((tool: any) => tool.function.name)).toContain(python);
  expect(JSON.stringify(resumed.messages)).toContain('The read-only assessment has ended.');
  expect(last().status).toBe('completed');
  expect(last().content).toBe('已完成刀座过渡和尾部截面。');
 });
 it('rejects a pass with unfinished issues and does not dispatch writes smuggled into the read-only review',async()=>{
  h.replies.push(call('initial',{script:'build()'},python),call('first-view',{},view),text('仍然粗糙'),
   call('not-a-pass',{status:'complete',issues:['轮廓不够准确'],correctionPlan:'',blockedReason:''},quality),
   {content:'绕过检查',toolCalls:[...improve().toolCalls,...call('extra',{script:'unauthorized()'},python).toolCalls]});
  executed.mockImplementation(async(name:string)=>name===python?writeReceipt:shot);
  await send();
  expect(executed.mock.calls.map(([name])=>name)).toEqual([python,view]);
  expect(last().status).toBe('error');
  expect(last().content).toContain('未能返回有效的结构化验收');
 });
 it('stops with a concrete blocker and preserves the written geometry',async()=>{
  h.replies.push(call('initial',{script:'build()'},python),call('first-view',{},view),text('需要确认背部的关键开口位置'),
   call('blocked',{status:'blocked',issues:['关键开口的方向无法判断'],correctionPlan:'',blockedReason:'缺少用户明确要求还原的背面开口参考'},quality));
  executed.mockImplementation(async(name:string)=>name===python?writeReceipt:shot);
  await send();
  expect(executed.mock.calls.map(([name])=>name)).toEqual([python,view]);
  expect(last().status).toBe('error');
  expect(last().content).toContain('缺少用户明确要求还原的背面开口参考');
 });
 it('never approves an unchanged model after a repeated script receipt',async()=>{
  h.replies.push(call('initial',{script:'build()'},python),call('first-view',{},view),text('还很粗糙'),improve(),
   call('refine',{script:'build()'},python),text('已经改好了'),text('无法改善该接缝。'));
  executed.mockImplementation(async(name:string)=>name===python?writeReceipt:shot);
  await send();
  expect(executed.mock.calls.map(([name])=>name)).toEqual([python,view]);
  expect(last().status).toBe('error');
  expect(last().content).toContain('没有取得新的有效几何修改');
 });
 it('nudges a text-only early stop into a different concrete edit',async()=>{
  h.replies.push(call('initial',{script:'build()'},python),call('first-view',{},view),text('粗模'),improve(),
   text('还有问题，但我先结束。'),call('actual-edit',{script:'refit_with_guide_rails()'},python),
   call('new-view',{},view),text('已复查'),pass(),text('过渡已修改。'));
  executed.mockImplementation(async(name:string)=>name===python?writeReceipt:shot);
  await send();
  expect(JSON.stringify(h.requests[5].messages)).toContain('RHINO_REFERENCE_REFINEMENT_NUDGE_V1:');
  expect(executed.mock.calls.map(([name])=>name)).toEqual([python,view,python,view]);
  expect(last().status).toBe('completed');
 });
 it('does not write after cancellation while an internal review is being persisted',async()=>{
  const runtime=setup();
  const invoke=h.invoke.getMockImplementation()!;
  h.invoke.mockImplementation(async(command:string,args:Record<string,any>)=>{
   if(command==='chat_upsert_tool_call' && args.call.toolName===quality) await runtime.stop(args.call.conversationId || last().conversationId);
   return invoke(command,args);
  });
  h.replies.push(call('initial',{script:'build()'},python),call('first-view',{},view),text('粗模'),improve());
  executed.mockImplementation(async(name:string)=>name===python?writeReceipt:shot);
  await runtime.sendMessage('根据参考图帮我建模',[reference],undefined,undefined,undefined,'rhino');
  expect(last().status).toBe('cancelled');
  expect(executed.mock.calls.map(([name])=>name)).toEqual([python,view]);
 });
 it('stops after three edits if the final revision still has material differences',async()=>{
  h.replies.push(call('initial',{script:'build()'},python),call('first-view',{},view),text('粗模'),improve('review-0'));
  for(let i=1;i<=3;i++)h.replies.push(call(`edit-${i}`,{script:`fix_${i}()`},python),call(`view-${i}`,{},view),text('还有偏差'),improve(`review-${i}`));
  executed.mockImplementation(async(name:string)=>name===python?writeReceipt:shot);
  await send();
  expect(executed.mock.calls.map(([name])=>name)).toEqual([python,view,python,view,python,view,python,view]);
  expect(last().status).toBe('error');
  expect(last().content).toContain('已用完 3 轮自动完善');
 });
 it('does not route a model-manufactured quality verdict outside a review, or gate read-only requests',async()=>{
  h.replies.push(call('premature',{},quality),text('这里只分析，没有修改模型。'));
  await setup().sendMessage('只分析图片，不要建模',[reference],undefined,undefined,undefined,'rhino');
  expect(executed).not.toHaveBeenCalled();
  expect(h.requests.every(r=>!r.tools.some((tool:any)=>tool.function.name===quality))).toBe(true);
  expect(last().status).toBe('completed');
 });
 it('stops without accepting a viewport receipt that contains no actual image',async()=>{
  h.replies.push(call('initial',{script:'build()'},python),{content:'Looks complete',toolCalls:[]},call('invalid-view',{},view),{content:'Done',toolCalls:[]});
  executed.mockImplementation(async(name:string)=>name===python?writeReceipt:{source:'rhino',content:'no pixels',viewportImageCount:1});
  await send();
  expect(executed.mock.calls.map(([name])=>name)).toEqual([python,view]);
  expect(last().status).toBe('error');expect(last().content).toContain('外观还未验收');
 });
 it('continues a corrected build after read-only verification without another recovery pass',async()=>{
  h.replies.push(call('failure',{script:'bad()'},python),call('read',{},'rhino_native_g1_get_canvas_graph'),call('corrected',{script:'fixed()'},python),call('verify',{},'rhino_native_g1_get_canvas_graph'),call('finish-stage',{script:'finish_stage()'},python),call('fresh-view',{},view),{content:'Reviewed',toolCalls:[]},pass(),text('已复核。'));
  executed.mockImplementation(async(name:string)=>{
   if(name===python&&executed.mock.calls.filter(([n])=>n===name).length===1)throw Error('type mismatch');
   return name===python?writeReceipt:name===view?shot:{source:'rhino',content:'{}'};
  });
  await send();
  expect(executed.mock.calls.map(([name])=>name)).toEqual([python,'rhino_native_g1_get_canvas_graph',python,'rhino_native_g1_get_canvas_graph',python,view]);
  expect(h.requests[3].tools.map((tool:any)=>tool.function.name)).not.toContain(python);
  expect(h.requests[4].tools.map((tool:any)=>tool.function.name)).toContain(python);
  expect(last().status).toBe('completed');
 });
});
describe('bundled Rhino product-modeling Skill resources in the real Chat tool loop',()=>{
 it('loads the complete Skill in Rhino mode and reads a fixed reference on demand for the next model request',async()=>{
  h.replies.push(
   call('load-modeling-methods',{resourcePath:'references/modeling-methods.md'},RHINO_MODELING_SKILL_RESOURCE_TOOL),
   {content:'I reviewed the bundled construction-method guide and can now compare candidate geometry routes.',toolCalls:[]},
  );
  executed.mockImplementation(async(name:string,args?:Record<string,unknown>)=>name===RHINO_MODELING_SKILL_RESOURCE_TOOL
   ? readRhinoModelingSkillResource(args?.resourcePath)
   : {source:'rhino',content:'unexpected'});
  await setup().sendMessage('Which editable method suits this geometry?',[],undefined,undefined,undefined,'rhino');
  expect(h.requests[0].tools.map((tool:any)=>tool.function.name)).toContain(RHINO_MODELING_SKILL_RESOURCE_TOOL);
  expect(JSON.stringify(h.requests[0].messages)).toContain('交付目标与执行边界');
  expect(executed).toHaveBeenCalledOnce();
  expect(executed).toHaveBeenCalledWith(RHINO_MODELING_SKILL_RESOURCE_TOOL,{resourcePath:'references/modeling-methods.md'},expect.anything());
  expect(JSON.stringify(h.requests[1].messages)).toContain('NetworkSrf');
  expect(JSON.stringify(h.requests[1].messages)).toContain('MatchSrf');
  expect(last().status).toBe('completed');
 });
});

it('does not mark a mesh deliverable complete on a NURBS turn or replay a dispatched script',async()=>{
 const runtime=setup();executed.mockResolvedValueOnce({source:'rhino',documentId:12,geometryVerification:{status:'passed',documentChanged:true,addedCount:1,changedCount:0,deletedCount:0,added:[{id:'shell',geometryType:'Mesh',valid:true}],changed:[],deleted:[],truncated:false}});
 h.replies.push(call('typed-shell',{script:'stage=DrawerGeometryStage();print(stage.commit())'},'rhino_native_run_python'),{content:'外壳完成。',toolCalls:[]},{content:'完成。',toolCalls:[]});
 await runtime.sendMessage('请建模，要求 NURBS 曲面，不要网格',[],undefined,undefined,undefined,'rhino');
 expect(last().status).toBe('error');expect(last().content).toContain('产品特征未验收');expect(executed).toHaveBeenCalledTimes(1);
});
it.each([true,false])('a panel draft requires a verified readback before offering its 3DM file (verified=%s)',async verified=>{
 const name='rhino_native_headless_build';const release=vi.fn();
 const prepare=vi.fn(async()=>({context:'{}',documentName:'测试草稿',release,exportModel:async()=>({files:[{format:'3dm',path:'C:/fixture/draft.3dm'}],readback:{verified}})}));
 const runtime=setup(undefined,{additionalTools:(id,source)=>{
  if(source!=='rhino')return [];const tool:RhinoNativeTool={name,description:'Build one draft part',readOnly:false,destructive:false,workflowPhase:'build',inputSchema:{type:'object',properties:{operation:{type:'string'}}}};registerRhinoNativeTools(id,[tool]);return [{type:'function',function:{name,description:tool.description,parameters:tool.inputSchema}}];}});
 executed.mockResolvedValueOnce({committed:true,objects:[{id:'body',geometryType:'Brep',valid:true}]});h.replies.push(call('draft-box',{operation:'box'},name),{content:'草稿完成。',toolCalls:[]});
 await runtime.sendMessage('帮我建模',[],undefined,undefined,undefined,'rhino',undefined,prepare);
 expect(release).toHaveBeenCalledTimes(1);expect(last().status).toBe(verified?'completed':'error');
 expect(last().toolCalls.some(c=>c.toolName==='rhino_headless_export')).toBe(verified);
});
// Capture the same observation as the model, without retaining original pixels in SQLite or adding model/tool calls.
describe('canvas Chat Rhino step previews', () => {
  const view = RHINO_REFERENCE_REVIEW_TOOL, nativeView = 'rhino_native_get_viewport_image';
  const canvasRuntime = () => setup(undefined, { prepareCanvasRhinoTurn: async () => ({context:'{}', documentName:'测试文档', release:vi.fn()}) });
  const shot = (data: string) => ({ source:'rhino', transientRhinoImages: [{mimeType:'image/png',data}], content:'当前视口' });
  it('binds two observations to their own history records and passes only the original observations to the model', async () => {
    const save = vi.spyOn(stepPreviewCache,'saveRhinoStepPreviews').mockResolvedValue(1);
    executed.mockResolvedValueOnce(shot('QUJD')).mockResolvedValueOnce(shot('REVG'));
    h.replies.push(call('before',{},view),call('after',{},nativeView),{content:'已对照两次视口。',toolCalls:[]});
    await canvasRuntime().sendMessage('帮我建模');
    const reply = last(), visits = reply.toolCalls;
    expect(visits.map(c=>c.toolName)).toEqual([view,nativeView]);
    expect(executed).toHaveBeenCalledTimes(2);
    expect(save.mock.calls).toEqual(visits.map((c,i)=>[reply.id,c.id,[{mimeType:'image/png',data:i?'REVG':'QUJD'}],reply.conversationId]));
    for (const c of visits) {
      expect(c.status).toBe('completed'); expect(JSON.parse(c.resultJson!)).toMatchObject({ viewportImageCount:1,rhinoStepPreview:{version:1,count:1} });
      expect(c.resultJson).not.toMatch(/transientRhinoImages|QUJD|REVG|data:image/);
    }
    expect(JSON.stringify(h.requests.map(r=>r.messages))).not.toContain('rhinoStepPreview');
    expect(JSON.stringify(h.requests[1].messages)).toContain('data:image/png;base64,QUJD');
  });
  it('ignores empty or spoofed previews, and cache failures do not fail or retry the tool', async () => {
    const save=vi.spyOn(stepPreviewCache,'saveRhinoStepPreviews').mockRejectedValue(new Error('quota exceeded'));
    executed.mockResolvedValueOnce({ source:'rhino', viewportImageCount:1,rhinoStepPreview:{version:1,count:1} }).mockResolvedValueOnce(shot('QUJD'));
    h.replies.push(call('empty',{},view),call('full',{},nativeView),{content:'已查看。',toolCalls:[]});
    await canvasRuntime().sendMessage('帮我建模');
    expect(save).toHaveBeenCalledTimes(1);expect(executed).toHaveBeenCalledTimes(2);
    for (const c of last().toolCalls) { expect(c.status).toBe('completed');expect(c.resultJson).not.toContain('rhinoStepPreview'); }
  });
  it('does not record extra thumbnails for the native Rhino panel',async()=>{
    const save=vi.spyOn(stepPreviewCache,'saveRhinoStepPreviews').mockResolvedValue(1);
    executed.mockResolvedValueOnce(shot('QUJD'));h.replies.push(call('panel',{},view),{content:'已查看。',toolCalls:[]});
    await setup().sendMessage('查看当前视口',[],undefined,undefined,undefined,'rhino');
    expect(executed).toHaveBeenCalledTimes(1); expect(save).not.toHaveBeenCalled();
  });
});