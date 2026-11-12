import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '../model/chatTypes';
import type { ChatMessage } from '../model/chatTypes';
import {
  completedMediaToolIsMissingVisibleResult,
  finalizeOrphanedStreamingChatMessage,
  normalizeCompletedRhinoNativeMessage,
  summarizeCompletedRhinoNativeCalls,
  summarizeCompletedVisibleToolCalls,
} from './chatVisibleToolCompletion';

const call = (
  toolName: string,
  status: ChatToolCall['status'],
  result: Record<string, unknown>,
): ChatToolCall => ({
  id: `call-${toolName}`,
  messageId: 'message-1',
  toolName,
  argumentsJson: '{}',
  resultJson: JSON.stringify(result),
  status,
  createdAt: 1,
});

describe('Rhino native completion display', () => {
  const progress = '\u6b63\u5728\u5efa\u7acb\u7f51\u683c... \u6309 Esc \u53d6\u6d88';

  it('replaces the screenshot progress line with a clear success receipt', () => {
    const command = call('rhino_native_run_command', 'completed', { source: 'rhino', documentId: 7, content: progress + '\r\n' });
    const result = summarizeCompletedRhinoNativeCalls([command]);
    expect(result).toContain('Rhino MCP \u6267\u884c\u5b8c\u6210');
    expect(result).toContain('run_command\uff1a\u5df2\u6267\u884c\u5b8c\u6210');
    expect(result).not.toContain('Esc');
    expect(command.resultJson).toContain(progress);
  });

  it('preserves meaningful output alongside the progress line and script output verbatim', () => {
    const command = call('rhino_native_run_command', 'completed', { content: progress + '\nCreated object 123.' });
    expect(summarizeCompletedRhinoNativeCalls([command])).toContain('Created object 123.');
    expect(summarizeCompletedRhinoNativeCalls([command])).not.toContain('Esc');
    const script = call('rhino_native_run_python', 'completed', { content: progress });
    expect(summarizeCompletedRhinoNativeCalls([script])).toContain(progress);
    const warning = call('rhino_native_run_command', 'completed', { content: 'Warning: mesh generation failed. Press Esc to cancel' });
    expect(summarizeCompletedRhinoNativeCalls([warning])).toContain('Warning:');
  });

  it('repairs saved summaries without changing receipts or statuses and is idempotent', () => {
    const command = call('rhino_native_run_command', 'completed', { content: progress });
    const message: ChatMessage = {
      id: 'assistant-rhino-completed', conversationId: 'rhino-chat', role: 'assistant',
      content: 'Rhino MCP \u6267\u884c\u5b8c\u6210\uff1a\n- rhino_native_run_command: ' + progress,
      status: 'completed', createdAt: 1, attachments: [], toolCalls: [command],
    };
    const repaired = normalizeCompletedRhinoNativeMessage(message);
    expect(repaired.content).not.toContain('Esc');
    expect(repaired.content).toContain('\u5df2\u6267\u884c\u5b8c\u6210');
    expect(repaired.toolCalls).toBe(message.toolCalls);
    expect(normalizeCompletedRhinoNativeMessage(repaired)).toBe(repaired);
    expect(normalizeCompletedRhinoNativeMessage({ ...message, status: 'error' }).content).toBe(message.content);
  });
});

describe('visible Chat tool completion', () => {
  it('treats completed generated media as the terminal user-visible result', () => {
    const summary = summarizeCompletedVisibleToolCalls([
      call('edit_image', 'completed', {
        media: [{ id: 'image-1', type: 'image', path: 'C:\\outputs\\image.png' }],
      }),
    ]);

    expect(summary).toEqual({
      content: '**生成完成**\n\n1 张图片已生成，结果已保留。',
      mediaCount: 1,
      fileCount: 0,
    });
  });

  it('does not hide a real tool failure behind a success summary', () => {
    expect(summarizeCompletedVisibleToolCalls([
      call('generate_image', 'error', {
        media: [{ id: 'partial', type: 'image', path: 'C:\\outputs\\partial.png' }],
      }),
    ])).toBeNull();
  });

  it('rejects a completed media tool that has no real media result', () => {
    const completedWithoutMedia = call('generate_image', 'completed', {
      message: '图片生成已完成',
      media: [],
    });

    expect(completedMediaToolIsMissingVisibleResult(completedWithoutMedia)).toBe(true);
    expect(summarizeCompletedVisibleToolCalls([completedWithoutMedia])).toBeNull();
  });

  it('deduplicates visible artifacts returned by multiple progress snapshots', () => {
    const summary = summarizeCompletedVisibleToolCalls([
      call('generate_image_variants', 'completed', {
        media: [
          { id: 'image-1', type: 'image', path: 'C:\\outputs\\one.png' },
          { id: 'image-1', type: 'image', path: 'C:\\outputs\\one.png' },
          { id: 'image-2', type: 'image', path: 'C:\\outputs\\two.png' },
        ],
      }),
    ]);

    expect(summary?.mediaCount).toBe(2);
    expect(summary?.content).toContain('2 张图片');
  });

  it('repairs a persisted streaming message after its visible result already completed', () => {
    const completedCall = call('edit_image', 'completed', {
      media: [{ id: 'image-1', type: 'image', path: 'C:\\outputs\\image.png' }],
    });
    const message: ChatMessage = {
      id: 'assistant-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: '正在为你出图。',
      status: 'streaming',
      createdAt: 1,
      attachments: [],
      toolCalls: [completedCall],
      thinkingSteps: [{
        id: 'assistant-1:thinking:provider-status',
        type: 'context',
        title: '正在等待上游处理',
        status: 'running',
      }],
    };

    const repaired = finalizeOrphanedStreamingChatMessage(message, 5_000);
    expect(repaired.status).toBe('completed');
    expect(repaired.content).toContain('1 张图片已生成');
    expect(repaired.thinkingSteps).toEqual([]);
  });

  it('marks pending Rhino tool calls as interrupted when recovering a streaming message', () => {
    const running = { ...call('rhino_native_run_python', 'running', {}), resultJson: null };
    const awaiting = { ...call('rhino_native_run_command', 'awaiting-approval', {}), resultJson: null };
    const message: ChatMessage = {
      id: 'assistant-rhino', conversationId: 'rhino-chat', role: 'assistant', content: '',
      status: 'streaming', createdAt: 1, attachments: [], toolCalls: [running, awaiting],
    };

    const repaired = finalizeOrphanedStreamingChatMessage(message, 5_000);

    expect(repaired.status).toBe('error');
    expect(repaired.toolCalls.map(value => value.status)).toEqual(['error', 'error']);
    expect(repaired.toolCalls.map(value => value.completedAt)).toEqual([5_000, 5_000]);
    expect(JSON.parse(repaired.toolCalls[0].resultJson || '{}').error).toContain('interrupted');
  });

  it('marks an orphaned request without a visible result as interrupted', () => {
    const message: ChatMessage = {
      id: 'assistant-1',
      conversationId: 'conversation-1',
      role: 'assistant',
      content: '',
      status: 'streaming',
      createdAt: 1,
      attachments: [],
      toolCalls: [],
    };
    const repaired = finalizeOrphanedStreamingChatMessage(message, 5_000);
    expect(repaired.status).toBe('error');
    expect(repaired.content).toContain('上次生成意外中断');
  });
});


describe('interrupted PPT generation', () => {
  it('preserves illustration results but does not label image-only output as a completed deck after restart', () => {
    const message = { id: 'ppt-assistant', conversationId: 'c', role: 'assistant', status: 'streaming', content: '', createdAt: 1,
      attachments: [], toolCalls: [call('generate_image', 'completed', { media: [{ id: 'ai-illustration', type: 'image', path: 'C:/fixture/image.png' }] })] } as ChatMessage;
    const restored = finalizeOrphanedStreamingChatMessage(message, 100, '制作产品展示PPT');
    expect(restored.status).toBe('error'); expect(restored.content).toContain('PPT 尚未生成可下载文件');
    expect(restored.toolCalls).toBe(message.toolCalls);
    const file = call('create_file', 'completed', { files: [{ id: 'file', path: 'C:/fixture/deck.pptx', format: 'pptx' }] });
    expect(finalizeOrphanedStreamingChatMessage({ ...message, toolCalls: [...message.toolCalls, file] }, 100, '制作PPT').status).toBe('completed');
  });
});
