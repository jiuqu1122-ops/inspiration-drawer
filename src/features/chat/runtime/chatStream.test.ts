import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { acknowledgeChatCompletion, isChatRequestIdCurrent, isChatStreamEventForRequest, isRecoverableChatRequestError, isUpstreamUnavailableChatError, normalizeChatStreamEvent, requestChatCompletion } from './chatStream';
import { MAX_INLINE_VISION_BYTES } from '../context/chatRequestSize';

describe('normalized Chat stream events', () => {
  it('keeps new content and reasoning events while accepting the legacy delta kind', () => {
    expect(normalizeChatStreamEvent({ requestId: 'r1', kind: 'delta', delta: '正文' })).toMatchObject({
      requestId: 'r1', kind: 'content_delta', delta: '正文',
    });
    expect(normalizeChatStreamEvent({ requestId: 'r1', kind: 'reasoning_delta', delta: '摘要' })).toMatchObject({
      kind: 'reasoning_delta', delta: '摘要',
    });
  });

  it('normalizes tool, usage, completion and error events without exposing raw parameters', () => {
    expect(normalizeChatStreamEvent({
      requestId: 'r1',
      kind: 'tool_call_delta',
      toolCall: { index: 2, id: 'call-2', name: 'search_assets', argumentsDelta: '{' },
    })).toMatchObject({ toolIndex: 2, toolCallId: 'call-2', toolName: 'search_assets' });
    expect(normalizeChatStreamEvent({ requestId: 'r1', kind: 'usage', usage: { output_tokens: 9 } })?.usage)
      .toEqual({ output_tokens: 9 });
    expect(normalizeChatStreamEvent({ requestId: 'r1', kind: 'completed' })?.kind).toBe('completed');
    expect(normalizeChatStreamEvent({ requestId: 'r1', kind: 'error', error: '断开' })?.error).toBe('断开');
  });

  it('ignores malformed or unknown events', () => {
    expect(normalizeChatStreamEvent(null)).toBeNull();
    expect(normalizeChatStreamEvent({ kind: 'content_delta', delta: 'missing id' })).toBeNull();
    expect(normalizeChatStreamEvent({ requestId: 'r1', kind: 'future_event' })).toBeNull();
  });

  it('rejects late events from an old request after stop or retry', () => {
    const event = normalizeChatStreamEvent({ requestId: 'old', kind: 'content_delta', delta: 'late' });
    expect(event && isChatStreamEventForRequest(event, 'new')).toBe(false);
    expect(event && isChatStreamEventForRequest(event, 'old')).toBe(true);
    expect(isChatRequestIdCurrent('new', 'old')).toBe(false);
    expect(isChatRequestIdCurrent('new', 'new')).toBe(true);
  });
});

describe('Chat request recovery', () => {
  beforeEach(() => invoke.mockReset());

  it('retries a transient failure once with the exact same request id', async () => {
    invoke
      .mockRejectedValueOnce(new Error('后台任务查询超时，任务可能仍在服务器运行'))
      .mockResolvedValueOnce({ requestId: 'request-1', content: '已恢复', toolCalls: [] });

    const result = await requestChatCompletion({
      requestId: 'request-1',
      messages: [{ role: 'user', content: '继续' }],
      tools: [],
    });

    expect(result.content).toBe('已恢复');
    const requestCalls = invoke.mock.calls.filter(call => call[0] === 'agent_openai_chat');
    expect(requestCalls).toHaveLength(2);
    expect(requestCalls.map(call => call[1].request.requestId)).toEqual(['request-1', 'request-1']);
    expect(invoke).toHaveBeenCalledWith('agent_ack_wallet_task', { requestId: 'request-1' });
  });

  it('does not retry permanent request errors', async () => {
    invoke.mockRejectedValueOnce(new Error('HTTP 401 unauthorized'));
    await expect(requestChatCompletion({
      requestId: 'request-2',
      messages: [{ role: 'user', content: '你好' }],
      tools: [],
    })).rejects.toThrow('401');
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('retains ordinary Chat inline image protection by default', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const source = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_INLINE_VISION_BYTES + 1) * 4 / 3) + 8)}`;
      invoke.mockResolvedValueOnce({ requestId: 'ordinary-chat', content: '回复', toolCalls: [] });
      await requestChatCompletion({ requestId: 'ordinary-chat', tools: [],
        messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: source } }] }] });
      const request = invoke.mock.calls.find(([command]) => command === 'agent_openai_chat')![1].request;
      expect(request.messages).toEqual([{ role: 'user', content: [{ type: 'text', text: '一张图片附件因内联数据过大而未加入本次视觉请求。' }] }]);
      expect(request.stream).toBe(true);
      expect(invoke).toHaveBeenLastCalledWith('agent_ack_wallet_task', { requestId: 'ordinary-chat' });
    } finally {
      warn.mockRestore();
    }
  });

  it('leaves a canvas result resumable until its consumer explicitly acknowledges it', async () => {
    invoke.mockResolvedValueOnce({ requestId: 'canvas-request', content: '已恢复', toolCalls: [] });
    const result = await requestChatCompletion({
      requestId: 'canvas-request', messages: [{ role: 'user', content: '继续' }], tools: [],
      usageContext: 'canvas_text_agent', stream: false, acknowledgeResult: false,
    });
    expect(result.content).toBe('已恢复');
    expect(invoke).toHaveBeenCalledExactlyOnceWith('agent_openai_chat', {
      request: { requestId: 'canvas-request', messages: [{ role: 'user', content: '继续' }], tools: [],
        model: undefined, toolChoice: undefined, stream: false, usageContext: 'canvas_text_agent' },
    });
    await acknowledgeChatCompletion('canvas-request');
    expect(invoke).toHaveBeenLastCalledWith('agent_ack_wallet_task', { requestId: 'canvas-request' });
  });

  it('does not silently replace a model rejected by ordinary Chat', async () => {
    invoke.mockRejectedValueOnce(new Error('TASK FAILED: Unknown chat model'));
    await expect(requestChatCompletion({
      requestId: 'request-model-error',
      messages: [{ role: 'user', content: 'hello' }],
      tools: [],
      model: 'gpt-5.6-sol',
      usageContext: 'chat',
    })).rejects.toThrow('Unknown chat model');
    expect(invoke).toHaveBeenCalledOnce();
  });

  it('classifies network and server errors without treating validation failures as recoverable', () => {
    expect(isRecoverableChatRequestError('HTTP 500')).toBe(true);
    expect(isRecoverableChatRequestError('connection reset')).toBe(true);
    expect(isRecoverableChatRequestError('HTTP 400 bad request')).toBe(false);
    expect(isRecoverableChatRequestError('MODEL_FALLBACK_EXHAUSTED: HTTP 500')).toBe(false);
  });

  it('separates a terminal upstream model timeout from a resumable transport interruption', () => {
    const error = 'UPSTREAM_UNAVAILABLE：Agent 渠道请求失败：上游 Agent 请求超时';
    expect(isUpstreamUnavailableChatError(error)).toBe(true);
    expect(isRecoverableChatRequestError(error)).toBe(false);
  });
});
