import { describe, expect, it, vi } from 'vitest';
import type { ChatAttachment } from '../model/chatTypes';
import {
  BATCH_IMAGE_CONCURRENCY,
  executeBatchImageOperation,
  selectBatchImageAttachments,
} from './batchImageOperation';

const attachments = (count: number): ChatAttachment[] => Array.from({ length: count }, (_, index) => ({
  id: `attachment-${index + 1}`,
  messageId: 'message-1',
  type: 'image',
  path: `C:\\images\\source-${index + 1}.png`,
  mimeType: 'image/png',
  createdAt: index + 1,
}));

const outputFor = (attachment: ChatAttachment, index = 0) => ({
  media: [{
    id: `${attachment.id}-output-${index}`,
    type: 'image',
    path: `C:\\images\\${attachment.id}-output-${index}.png`,
    assetId: `${attachment.id}-asset-${index}`,
  }],
});

describe('batch_image_operation', () => {
  it('creates one isolated generation job for every current image', async () => {
    const images = attachments(3);
    const generate = vi.fn(async (args: Record<string, unknown>, attachment: ChatAttachment) => {
      expect(args.referenceImages).toEqual([attachment.path]);
      return outputFor(attachment);
    });
    const result = await executeBatchImageOperation({
      args: { instruction: '将每张图片分别换成白色背景', mode: 'one_per_image' },
      attachments: images,
      generate,
    });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({ total: 3, succeeded: 3, failed: 0, cancelled: false });
    expect(result.results.map(item => item.attachmentId)).toEqual(images.map(item => item.id));
  });

  it('processes only explicitly selected attachment ids in the requested order', async () => {
    const images = attachments(4);
    expect(selectBatchImageAttachments(images, ['attachment-4', 'attachment-2']))
      .toEqual([images[3], images[1]]);
    const generate = vi.fn(async (_args: Record<string, unknown>, attachment: ChatAttachment) => outputFor(attachment));
    const result = await executeBatchImageOperation({
      args: {
        instruction: '分别重新排版',
        mode: 'one_per_image',
        attachmentIds: ['attachment-2', 'attachment-4'],
      },
      attachments: images,
      generate,
    });
    expect(result.results.map(item => item.attachmentId)).toEqual(['attachment-2', 'attachment-4']);
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it('combines the analyzed shared plan with the matching per-image instruction', async () => {
    const images = attachments(2);
    const prompts = new Map<string, string>();
    await executeBatchImageOperation({
      args: {
        instruction: '统一使用浅灰背景，并保留产品原始造型。',
        perImageInstructions: [
          { imageIndex: 1, instruction: '保留硬边轮廓，重建右下接触阴影。' },
          { imageIndex: 2, instruction: '保留透明件折射，避免边缘发白。' },
        ],
        mode: 'one_per_image',
      },
      attachments: images,
      generate: async (args, attachment) => {
        prompts.set(attachment.id, String(args.prompt || ''));
        return outputFor(attachment);
      },
    });

    expect(prompts.get('attachment-1')).toContain('统一使用浅灰背景');
    expect(prompts.get('attachment-1')).toContain('重建右下接触阴影');
    expect(prompts.get('attachment-1')).not.toContain('透明件折射');
    expect(prompts.get('attachment-2')).toContain('统一使用浅灰背景');
    expect(prompts.get('attachment-2')).toContain('透明件折射');
    expect(prompts.get('attachment-2')).not.toContain('右下接触阴影');
  });

  it('keeps successful jobs when one image fails', async () => {
    const images = attachments(4);
    const result = await executeBatchImageOperation({
      args: { instruction: '统一改成蓝色背景', mode: 'one_per_image' },
      attachments: images,
      generate: async (_args, attachment) => {
        if (attachment.id === 'attachment-3') throw new Error('provider failed');
        return outputFor(attachment);
      },
    });
    expect(result).toMatchObject({ ok: true, total: 4, succeeded: 3, failed: 1 });
    expect(result.results[2]).toMatchObject({ attachmentId: 'attachment-3', status: 'error' });
  });

  it('forwards outputCountPerImage through the existing billing generation call', async () => {
    const images = attachments(3);
    const generate = vi.fn(async (args: Record<string, unknown>, attachment: ChatAttachment) => ({
      media: Array.from({ length: Number(args.count) }, (_, index) => outputFor(attachment, index).media[0]),
    }));
    const result = await executeBatchImageOperation({
      args: { instruction: '每张生成两个版本', mode: 'one_per_image', outputCountPerImage: 2 },
      attachments: images,
      generate,
    });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(generate.mock.calls.every(call => call[0].count === 2)).toBe(true);
    expect(result.results.flatMap(item => item.media || [])).toHaveLength(6);
  });

  it('never exceeds the configured worker concurrency', async () => {
    let active = 0;
    let peak = 0;
    await executeBatchImageOperation({
      args: { instruction: '逐张增强细节', mode: 'one_per_image' },
      attachments: attachments(7),
      generate: async (_args, attachment) => {
        active += 1;
        peak = Math.max(peak, active);
        await new Promise(resolve => setTimeout(resolve, 5));
        active -= 1;
        return outputFor(attachment);
      },
    });
    expect(peak).toBe(BATCH_IMAGE_CONCURRENCY);
  });

  it('starts up to six image jobs together instead of waiting for each result', async () => {
    const started: string[] = [];
    let release: (() => void) | undefined;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const pending = executeBatchImageOperation({
      args: { instruction: '分别排版', mode: 'one_per_image' },
      attachments: attachments(6),
      generate: async (_args, attachment) => {
        started.push(attachment.id);
        await gate;
        return outputFor(attachment);
      },
    });
    await vi.waitFor(() => expect(started).toHaveLength(6));
    release?.();
    await pending;
  });

  it('reports analysis handoff, active generation, and each finished image before the batch ends', async () => {
    const progress: Array<{ phase: string; completed: number; active: number; resultIds: string[] }> = [];
    let releaseSecond: (() => void) | undefined;
    const secondGate = new Promise<void>(resolve => { releaseSecond = resolve; });
    const pending = executeBatchImageOperation({
      args: { instruction: '分别统一画面风格', mode: 'one_per_image' },
      attachments: attachments(2),
      concurrency: 2,
      generate: async (_args, attachment) => {
        if (attachment.id === 'attachment-2') await secondGate;
        return outputFor(attachment);
      },
      onProgress: value => {
        progress.push({
          phase: value.phase,
          completed: value.completed,
          active: value.active,
          resultIds: value.results.map(result => result.attachmentId),
        });
      },
    });

    await vi.waitFor(() => expect(progress.some(value => (
      value.phase === 'generating'
      && value.completed === 1
      && value.resultIds.includes('attachment-1')
    ))).toBe(true));
    expect(progress[0].phase).toBe('preparing');
    expect(progress.some(value => value.active === 2)).toBe(true);
    releaseSecond?.();
    await pending;
    expect(progress[progress.length - 1]?.phase).toBe('completed');
    expect(progress[progress.length - 1]?.completed).toBe(2);
  });

  it('stops starting new jobs after cancellation and keeps completed media', async () => {
    const controller = new AbortController();
    const generate = vi.fn(async (_args: Record<string, unknown>, attachment: ChatAttachment) => outputFor(attachment));
    const result = await executeBatchImageOperation({
      args: { instruction: '分别调整构图', mode: 'one_per_image' },
      attachments: attachments(5),
      concurrency: 1,
      signal: controller.signal,
      generate,
      onProgress: progress => {
        if (progress.completed === 1) controller.abort();
      },
    });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(result.cancelled).toBe(true);
    expect(result.succeeded).toBe(1);
    expect(result.results.filter(item => item.status === 'cancelled')).toHaveLength(4);
  });

  it('returns a compact result without Base64 image bodies', async () => {
    const result = await executeBatchImageOperation({
      args: { instruction: '分别处理', mode: 'one_per_image' },
      attachments: attachments(2),
      generate: async (_args, attachment) => outputFor(attachment),
    });
    expect(JSON.stringify(result)).not.toContain('data:image');
    expect(JSON.stringify(result).length).toBeLessThan(5_000);
  });
});
