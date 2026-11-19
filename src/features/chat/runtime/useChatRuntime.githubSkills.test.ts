import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '../model/chatTypes';
import { makeInstalledSkillFixture, makeSkillInspectionFixture, SKILL_FIXTURE_ID as id, SKILL_FIXTURE_COMMIT as commit, SKILL_FIXTURE_TEXT as text } from '../skills/githubSkillFixture';
const h = vi.hoisted(() => ({ invoke: vi.fn(), replies: [] as Array<Record<string, unknown>>, requests: [] as Array<Record<string, any>>, messages: new Map<string, ChatMessage>() }));
vi.mock('react', () => ({ useEffect: () => {}, useRef: (current: unknown) => ({ current }), useState: (initial: unknown) => { let value = typeof initial === 'function' ? initial() : initial; return [value, (next: unknown) => { value = typeof next === 'function' ? next(value) : next; }]; }, useCallback: (callback: unknown) => callback, useMemo: (factory: () => unknown) => factory() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: h.invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('../../designMemory/context', async original => ({ ...await original<typeof import('../../designMemory/context')>(), recallDesignMemoryForTurn: vi.fn(async () => null), validateDesignMemoryMessages: vi.fn(async () => {}), designMemoryKindsInMessages: () => [], getDesignMemoryTurnReport: () => null }));
vi.mock('../../designMemory/sources', () => ({ rememberExplicitChatDesign: vi.fn(async () => {}), designMemoryProjectId: (id: string) => id, beginChatDesignSummaryMemory: vi.fn(async () => null), completeChatDesignSummaryMemory: vi.fn(async () => {}) }));
import { useChatRuntime } from './useChatRuntime';
import { createInspirationChatToolExecutor } from '../tools/inspirationChatToolExecutor';
import { getSelectedChatSkill, setGithubChatSkills } from '../skills/chatSkills';
import { isGithubSkillTool } from '../skills/githubSkillTools';
let installed: ReturnType<typeof makeInstalledSkillFixture>[] = [];
let approved: boolean;
let confirmations: number;
const reply = (name: string, args: Record<string, unknown>, call: string) => ({ content: '', toolCalls: [{ id: call, name, arguments: JSON.stringify(args) }] });
const setup = (cloudWalletMode = false) => useChatRuntime({ cloudWalletMode, model: 'fixture', approvalMode: 'auto', executeTool: createInspirationChatToolExecutor({ executeExistingTool: vi.fn(), generateMedia: vi.fn(), listWorkflowDescriptors: () => [], searchWeb: async () => ({ results: [{ title: 'Offline fixture only', url: 'https://github.com/fixture/skills' }] }), createFile: vi.fn() }) });
beforeEach(() => {
  const storage = new Map();vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) || null, setItem: (k: string,v: string) => storage.set(k,v) });vi.stubGlobal('window', { dispatchEvent: vi.fn(), setTimeout: () => 1, clearTimeout: () => {} });
  setGithubChatSkills([]);installed=[];approved=true;confirmations=0;h.messages.clear();h.replies.length=0;h.requests.length=0;h.invoke.mockReset();
  h.invoke.mockImplementation(async (command: string, args: Record<string, any>) => {
    if(command === 'agent_openai_chat') { h.requests.push(args.request);const next=h.replies.shift();if(!next)throw Error('Unexpected extra model request');return { requestId: args.request.requestId,...next }; }
    if(command === 'chat_list_messages')return { messages:[...h.messages.values()],hasMore:false };
    if(command === 'chat_upsert_message'){h.messages.set(args.message.id,args.message);return args.message;}
    if(command === 'chat_upsert_conversation')return args.conversation;
    if(command === 'chat_upsert_tool_call')return args.call;
    if(command === 'github_skills_request'){
      const r=args.request;
      if(r.operation === 'list')return installed;
      if(r.operation === 'inspect')return makeSkillInspectionFixture('runtime-preview');
      if(r.operation === 'install'){confirmations++;if(!approved)throw Error('用户拒绝了技能操作');installed=[makeInstalledSkillFixture()];return installed[0];}
      if(r.operation === 'read')return { content:r.path === 'SKILL.md'?text:'Reference methodology',nextOffset:null,totalCharacters:text.length };
      throw Error('Unexpected native skill operation');
    }
    return null;
  });
});
afterEach(()=>{setGithubChatSkills([]);vi.unstubAllGlobals();vi.restoreAllMocks();});
const lastAssistant=()=>[...h.messages.values()].filter(m=>m.role === 'assistant').slice(-1)[0]!;
describe('real useChatRuntime Skills continuation (synthetic local IPC; no billable calls)',()=>{
  it('search→inspect→native user confirmation→install→use and resource read continue within the original task',async()=>{
    const runtime=setup();h.replies.push(
      reply('search_github_skills',{query:'research methodology'},'skill-search'),
      reply('inspect_github_skill',{url:'https://github.com/fixture/skills'},'skill-inspect'),
      reply('install_github_skill',{previewId:'runtime-preview',skillId:id,useInCurrentConversation:true},'skill-install'),
      reply('read_skill_resource',{skillId:id,version:commit,path:'references/check.md'},'skill-resource'),
      {content:'Applied the installed methodology; scripts were not run.',toolCalls:[]});
    await runtime.sendMessage('Find an open-source research skill, install it and use its methodology on this task.');
    const final=lastAssistant();expect(final.status).toBe('completed');expect(confirmations).toBe(1);
    expect(final.toolCalls.map(t=>t.status)).toEqual(['completed','completed','completed','completed']);
    expect(getSelectedChatSkill(final.conversationId)?.id).toBe(id);
    const continuation=h.requests[3].messages.find((m: any)=>m.role==='tool'&&m.tool_call_id==='skill-install');
    expect(JSON.parse(continuation.content)).toMatchObject({installed:true,activated:true,instructions:text,version:commit});
    expect(JSON.stringify(h.requests[4].messages)).toContain('Reference methodology');
    h.replies.push({content:'Applied again in the next message.',toolCalls:[]});await runtime.sendMessage('Use the same method again.');
    expect(h.requests[5].messages.some((m: any)=>m.role==='user'&&String(m.content).includes('END_OF_FULL_SKILL'))).toBe(true);
    expect(h.invoke.mock.calls.some(([command])=>['execute_command','run_python','run_shell'].includes(command))).toBe(false);
  });
  it('native denial prevents writes, activation and repeated prompts despite a model retry',async()=>{
    approved=false;const runtime=setup();h.replies.push(
      reply('inspect_github_skill',{url:'https://github.com/fixture/skills'},'inspect-denied'),
      reply('install_github_skill',{previewId:'runtime-preview',skillId:id,useInCurrentConversation:true},'install-denied'),
      reply('install_github_skill',{previewId:'runtime-preview',skillId:id},'retry-denied'),
      {content:'Cancelled; nothing was installed.',toolCalls:[]});
    await runtime.sendMessage('Find and install an open-source research skill.');
    expect(confirmations).toBe(1);expect(installed).toEqual([]);expect(getSelectedChatSkill(lastAssistant().conversationId)).toBeUndefined();
    expect(JSON.stringify(lastAssistant().toolCalls)).toContain('不会重复弹窗');
  });
  it.each([false,true])('preserves Skills tools/messages at the real provider IPC boundary in custom/wallet mode %s',async cloudWalletMode=>{
    const runtime=setup(cloudWalletMode);h.replies.push(reply('inspect_github_skill',{url:'https://github.com/fixture/skills'},'inspect-wire'),{content:'Checked this real fixture snapshot.',toolCalls:[]});
    await runtime.sendMessage('Find and inspect an open source skill.');
    const first=h.requests[0];expect(first.tools.some((t: any)=>t.function.name==='inspect_github_skill')).toBe(true);
    expect(first.messages.some((m: any)=>String(m.content).includes('GitHub Skills'))).toBe(true);
    expect(h.requests[1].messages.some((m: any)=>m.role==='tool'&&m.tool_call_id==='inspect-wire'&&JSON.parse(m.content).commit===commit)).toBe(true);
    expect(first.toolChoice).toBeUndefined();expect(confirmations).toBe(0);
  });
  it('does not offer Skills tools to Rhino and blocks a forged Rhino-origin tool call',async()=>{
    const runtime=setup();h.replies.push(reply('inspect_github_skill',{url:'https://github.com/fixture/skills'},'rhino-forged'),{content:'Desktop only.',toolCalls:[]});
    await runtime.sendMessage('Read this public skill.',[],undefined,undefined,undefined,'rhino');
    expect(h.requests[0].tools.some((t: any)=>isGithubSkillTool(t.function.name))).toBe(false);
    expect(h.invoke.mock.calls.filter(([command,args])=>command==='github_skills_request'&&args.request.operation!=='list')).toHaveLength(0);expect(confirmations).toBe(0);
  });
});
