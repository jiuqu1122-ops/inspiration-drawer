import { describe, expect, it } from 'vitest';
import { CHAT_TOOL_DEFINITIONS, getChatToolDefinitions } from '../tools/chatToolDefinitions';
import {
  buildWebSearchTurnInstruction,
  canAcceptWebSearchQuery,
  canRunChatToolRound,
  classifyChatProviderOutcome,
  EMPTY_CHAT_RESULT_ERROR,
  MAX_TOOL_ROUNDS,
  MAX_WEB_SEARCH_QUERIES_PER_TURN,
  normalizeWebSearchQuery,
} from './chatTurnPolicy';

const searchArguments = (query: string) => JSON.stringify({ query });

describe('ordinary Chat turn policy', () => {
  it('completes nonempty content without tool calls', () => {
    expect(classifyChatProviderOutcome({
      content: '这是最终正文。',
      toolCallCount: 0,
      emptyRecoveryCount: 0,
    })).toBe('complete');
  });

  it('never turns an initial empty response into the old fake completion', () => {
    const outcome = classifyChatProviderOutcome({
      content: '   ',
      toolCallCount: 0,
      emptyRecoveryCount: 0,
    });
    expect(outcome).toBe('recover-empty');
    expect(EMPTY_CHAT_RESULT_ERROR).not.toBe('已完成。');
  });

  it('allows a visible recovery answer to complete', () => {
    expect(classifyChatProviderOutcome({
      content: '',
      toolCallCount: 0,
      emptyRecoveryCount: 0,
    })).toBe('recover-empty');
    expect(classifyChatProviderOutcome({
      content: '恢复请求返回了正文。',
      toolCallCount: 0,
      emptyRecoveryCount: 1,
    })).toBe('complete');
  });

  it('turns two consecutive empty responses into an error', () => {
    expect(classifyChatProviderOutcome({
      content: '',
      toolCallCount: 0,
      emptyRecoveryCount: 1,
    })).toBe('error-empty');
    expect(EMPTY_CHAT_RESULT_ERROR).toBe('模型未返回有效结果，请重试。');
  });

  it('does not treat reasoning-only output as a final answer', () => {
    expect(classifyChatProviderOutcome({
      content: '',
      reasoning: '内部推理不应成为用户可见答案',
      toolCallCount: 0,
      emptyRecoveryCount: 0,
    })).toBe('recover-empty');
  });

  it.each([1, 2, 3, 4])('allows distinct web search query %s', index => {
    const accepted = new Set<string>();
    for (let current = 1; current < index; current += 1) {
      accepted.add(`query ${current}`);
    }
    expect(canAcceptWebSearchQuery(accepted, searchArguments(`Query   ${index}`))).toBe(true);
  });

  it('blocks the fifth distinct web search query', () => {
    const accepted = new Set(['query 1', 'query 2', 'query 3', 'query 4']);
    expect(accepted.size).toBe(MAX_WEB_SEARCH_QUERIES_PER_TURN);
    expect(canAcceptWebSearchQuery(accepted, searchArguments('query 5'))).toBe(false);
  });

  it('blocks a duplicate normalized web search query', () => {
    const accepted = new Set(['same query']);
    expect(normalizeWebSearchQuery(searchArguments('  SAME   QUERY  '))).toBe('same query');
    expect(canAcceptWebSearchQuery(accepted, searchArguments('  SAME   QUERY  '))).toBe(false);
  });

  it('stops tool recursion after eight rounds', () => {
    expect(MAX_TOOL_ROUNDS).toBe(8);
    expect(canRunChatToolRound(7)).toBe(true);
    expect(canRunChatToolRound(8)).toBe(false);
  });

  it('removes web_search at the limit and requires synthesis from gathered sources', () => {
    const definitions = getChatToolDefinitions('请联网搜索最新资料', false, true, true);
    expect(definitions.some(tool => tool.function.name === 'web_search')).toBe(false);
    const instruction = buildWebSearchTurnInstruction(
      MAX_WEB_SEARCH_QUERIES_PER_TURN,
      '2026-09-08',
    );
    expect(instruction).toContain('请基于已取得资料直接完成回答');
    expect(instruction).toContain('不要声称无法回答');
  });

  it('uses the centralized search limit in the provider tool description', () => {
    const webSearch = CHAT_TOOL_DEFINITIONS.find(tool => tool.function.name === 'web_search');
    expect(webSearch?.function.description).toContain(`最多使用 ${MAX_WEB_SEARCH_QUERIES_PER_TURN} 个不同关键词`);
  });
});
