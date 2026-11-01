import { afterEach, describe, expect, it, vi } from 'vitest';
const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
import { requestChatCompletion } from './chatStream';
import { buildChatSearchContinuation, buildSearchSynthesisRecoveryTools } from './chatSearchContinuation';
import { getChatFileCreationTurn } from './chatFileCreationPolicy';
import { getChatToolDefinitions } from '../tools/chatToolDefinitions';
import { getGeneratedFilesFromToolCall, type ChatToolCall } from '../model/chatTypes';
afterEach(() => vi.restoreAllMocks());
describe('search result to PPT request at the real provider IPC boundary (synthetic only)', () => {
  it('preserves successful search protocol first, then genuinely changes empty recovery to nonstream file creation', async () => {
    invoke.mockReset();
    const searchPair = { role: 'assistant', content: null, tool_calls: [{ id: 'search-synthetic', type: 'function', function: { name: 'web_search', arguments: '{"query":"synthetic product specifications"}' } }] };
    const providerMessages = [{ role: 'system', content: 'synthetic app guard' },
      { role: 'user', content: '做一份方向盘设计调研PPT' }, searchPair,
      { role: 'tool', tool_call_id: 'search-synthetic', content: JSON.stringify({ query: 'synthetic product specifications', provider: 'fixture', results: [{ title: 'Synthetic manufacturer specifications', url: 'https://manufacturer.example/spec', snippet: 'Fixture only: 400 mm diameter.' }] }) }];
    const tools = getChatToolDefinitions('做一份方向盘设计调研PPT', false, true);
    invoke.mockResolvedValueOnce({ requestId: 'first', content: '', reasoning: 'fixture reasoning only', toolCalls: [], finishReason: 'stop' });
    const first = await requestChatCompletion({ requestId: 'first', messages: buildChatSearchContinuation(providerMessages), tools, stream: true, acknowledgeResult: false });
    expect(first.content).toBe('');
    const firstWire = JSON.parse(JSON.stringify(invoke.mock.calls[0][1])).request;
    expect(firstWire.messages).toContainEqual(searchPair);
    expect(firstWire.messages.some((message: { role: string; tool_call_id?: string }) => message.role === 'tool' && message.tool_call_id === 'search-synthetic')).toBe(true);
    invoke.mockResolvedValueOnce({ requestId: 'recovery', content: '', toolCalls: [{ id: 'file-synthetic', name: 'create_file', arguments: JSON.stringify({ fileName: 'fixture.pptx', format: 'pptx', presentation: { title: 'Synthetic research', slides: [{ title: 'Specifications', bullets: ['Fixture diameter: 400 mm'] }] } }) }] });
    const recoveryTools = buildSearchSynthesisRecoveryTools(tools, true);
    const recovered = await requestChatCompletion({ requestId: 'recovery', messages: buildChatSearchContinuation(providerMessages, true), tools: recoveryTools, stream: false,
      toolChoice: { type: 'function', function: { name: 'create_file' } }, acknowledgeResult: false });
    const wire = JSON.parse(JSON.stringify(invoke.mock.calls[1][1])).request;
    expect(wire.stream).toBe(false); expect(wire.tools.map((tool: { function: { name: string } }) => tool.function.name)).toEqual(['create_file']);
    expect(wire.toolChoice.function.name).toBe('create_file');
    expect(wire.messages.some((message: { content: unknown }) => String(message.content).includes('https://manufacturer.example/spec'))).toBe(true);
    expect(wire.messages.filter((message: { role: string }) => message.role === 'tool')).toHaveLength(0);
    const fileResult = { files: [{ id: 'saved-file', format: 'pptx', name: 'fixture.pptx', path: 'C:/fixture/fixture.pptx', slideCount: 1 }] };
    const call = recovered.toolCalls[0];
    const history = [...providerMessages, { role: 'assistant', tool_calls: [{ id: call.id, function: { name: call.name, arguments: call.arguments } }] },
      { role: 'tool', tool_call_id: call.id, content: JSON.stringify(fileResult) }];
    expect(getChatFileCreationTurn(history).completed).toBe(true);
    const files = getGeneratedFilesFromToolCall({ id: call.id, toolName: call.name, status: 'completed', resultJson: JSON.stringify(fileResult) } as ChatToolCall);
    expect(files[0]).toMatchObject({ format: 'pptx', slideCount: 1 });
    expect(invoke).toHaveBeenCalledTimes(2); // no repeated search, paid image or native file action executed
    expect(invoke.mock.calls.every(([command]) => command === 'agent_openai_chat')).toBe(true);
  });
});
