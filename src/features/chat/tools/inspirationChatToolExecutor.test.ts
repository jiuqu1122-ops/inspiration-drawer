import { describe, expect, it, vi } from 'vitest';
import { createInspirationChatToolExecutor, resolveChatMediaCanvasInputIds } from './inspirationChatToolExecutor';

const context = {
  userText: '执行测试',
  conversationId: 'conversation-1',
  messageId: 'message-1',
  recentMessages: [],
};

describe('inspiration Chat tool executor', () => {
  it('runs the real web-search bridge with a bounded result count', async () => {
    const searchWeb = vi.fn(async () => ({ results: [] }));
    const executor = createInspirationChatToolExecutor({
      executeExistingTool: vi.fn(),
      generateMedia: vi.fn(),
      listWorkflowDescriptors: () => [],
      searchWeb,
      createFile: vi.fn(),
    });
    await executor('web_search', { query: '今天的 AI 新闻', limit: 99 }, context);
    expect(searchWeb).toHaveBeenCalledWith('今天的 AI 新闻', 8);
  });

  it('reuses the existing canvas context executor', async () => {
    const executeExistingTool = vi.fn(async () => ({ selected: [] }));
    const executor = createInspirationChatToolExecutor({
      executeExistingTool,
      generateMedia: vi.fn(),
      listWorkflowDescriptors: () => [],
      searchWeb: vi.fn(),
      createFile: vi.fn(),
    });
    await executor('get_canvas_selection', {}, context);
    expect(executeExistingTool).toHaveBeenCalledWith(
      'app_get_context',
      { scopes: ['canvas'], detail: 'compact' },
      { userRequest: '执行测试' },
    );
  });

  it('caps asset searches before calling the existing asset search', async () => {
    const executeExistingTool = vi.fn(async () => ({ inspirationCandidates: [] }));
    const executor = createInspirationChatToolExecutor({
      executeExistingTool,
      generateMedia: vi.fn(),
      listWorkflowDescriptors: () => [],
      searchWeb: vi.fn(),
      createFile: vi.fn(),
    });
    await executor('search_assets', { query: '蓝色汽车', limit: 99 }, context);
    expect(executeExistingTool).toHaveBeenCalledWith(
      'drawer_search_inspirations',
      { query: '蓝色汽车', topK: 8 },
      { userRequest: '执行测试' },
    );
  });

  it('delegates media generation without creating a canvas node itself', async () => {
    const generateMedia = vi.fn(async () => ({ media: [{ id: 'image-1' }] }));
    const executor = createInspirationChatToolExecutor({
      executeExistingTool: vi.fn(),
      generateMedia,
      listWorkflowDescriptors: () => [],
      searchWeb: vi.fn(),
      createFile: vi.fn(),
    });
    await executor('generate_image', { prompt: '未来主义建筑' }, context);
    expect(generateMedia).toHaveBeenCalledWith('generate_image', { prompt: '未来主义建筑' });
  });

  it('keeps video generation on the existing media-generation bridge', async () => {
    const generateMedia = vi.fn(async () => ({ media: [{ id: 'video-1' }] }));
    const executor = createInspirationChatToolExecutor({
      executeExistingTool: vi.fn(),
      generateMedia,
      listWorkflowDescriptors: () => [],
      searchWeb: vi.fn(),
      createFile: vi.fn(),
    });
    await executor('generate_video', { prompt: '产品展示视频' }, context);
    expect(generateMedia).toHaveBeenCalledWith('generate_video', { prompt: '产品展示视频' });
  });

  it.each([
    ['interpolate_video', 'frame-interpolation'],
    ['enhance_image', 'image-enhancement'],
    ['enhance_video', 'video-enhancement'],
    ['fuse_images', 'image-fusion'],
  ])('maps %s to the shared canvas media executor', async (toolName, toolType) => {
    const executeExistingTool = vi.fn(async () => ({ ok: true }));
    const executor = createInspirationChatToolExecutor({
      executeExistingTool,
      generateMedia: vi.fn(),
      listWorkflowDescriptors: () => [],
      searchWeb: vi.fn(),
      createFile: vi.fn(),
      getCanvasItems: () => [],
      getSelectedCanvasIds: () => [],
    });
    await executor(toolName, {}, context);
    expect(executeExistingTool).toHaveBeenCalledWith(
      'canvas_create_media_tool',
      { toolType, inputIds: [], autoRun: true },
      { userRequest: '执行测试' },
    );
  });

  it('resolves a Chat media id by provenance before falling back to the selected valid media', () => {
    const makeVideo = (id: string): import('../../canvasModel').CanvasImageItem => ({
      id,
      item: { id: `${id}-item`, type: 'video', content: id, createdAt: 1 },
      x: 0, y: 0, width: 320, height: 240,
    });
    const generated = {
      ...makeVideo('chat-video-node'),
      chatGeneratedMedia: { mediaId: 'chat-video-1', assetId: 'asset-video-1', mediaType: 'video' as const, generatedAt: 2 },
    };
    const selected = makeVideo('selected-video-node');
    expect(resolveChatMediaCanvasInputIds({
      canvasItems: [selected, generated],
      selectedIds: [selected.id],
      toolType: 'frame-interpolation',
      mediaId: 'chat-video-1',
    })).toEqual([generated.id]);
  });

  it('runs batch image jobs through the existing media generator one image at a time', async () => {
    const generateMedia = vi.fn(async (_name, args: Record<string, unknown>) => ({
      media: [{ id: String((args.referenceImages as string[])[0]), path: 'C:\\generated.png' }],
    }));
    const executor = createInspirationChatToolExecutor({
      executeExistingTool: vi.fn(),
      generateMedia,
      listWorkflowDescriptors: () => [],
      searchWeb: vi.fn(),
      createFile: vi.fn(),
    });
    const result = await executor('batch_image_operation', {
      instruction: '逐张改善构图',
      mode: 'one_per_image',
    }, {
      ...context,
      currentUserAttachments: [1, 2, 3].map(index => ({
        id: `attachment-${index}`,
        messageId: 'user-message',
        type: 'image',
        path: `C:\\source-${index}.png`,
        createdAt: index,
      })),
    }) as { succeeded: number };
    expect(result.succeeded).toBe(3);
    expect(generateMedia).toHaveBeenCalledTimes(3);
    expect(generateMedia.mock.calls.map(call => call[1].referenceImages)).toEqual([
      ['C:\\source-1.png'],
      ['C:\\source-2.png'],
      ['C:\\source-3.png'],
    ]);
  });

  it('runs different visual directions as independent count-one image jobs', async () => {
    const generateMedia = vi.fn(async (_name, args: Record<string, unknown>) => ({
      media: [{ id: String(args.prompt), path: 'C:\\generated.png' }],
    }));
    const executor = createInspirationChatToolExecutor({
      executeExistingTool: vi.fn(),
      generateMedia,
      listWorkflowDescriptors: () => [],
      searchWeb: vi.fn(),
      createFile: vi.fn(),
    });
    const result = await executor('generate_image_variants', {
      sharedRequirements: '保持同一个参考主体',
      variants: [
        { name: '自然方向', prompt: '天然材料与暖色' },
        { name: '科技方向', prompt: '金属材料与冷色' },
      ],
      referenceImages: ['C:\\reference.png'],
    }, context) as { succeeded: number };

    expect(result.succeeded).toBe(2);
    expect(generateMedia).toHaveBeenCalledTimes(2);
    expect(generateMedia.mock.calls.every(call => call[0] === 'generate_image')).toBe(true);
    expect(generateMedia.mock.calls.every(call => call[1].count === 1)).toBe(true);
    expect(generateMedia.mock.calls.every(call => (
      JSON.stringify(call[1].referenceImages) === JSON.stringify(['C:\\reference.png'])
    ))).toBe(true);
  });

  it('applies and then runs an existing workflow', async () => {
    const executeExistingTool = vi.fn(async (name: string) => (
      name === 'canvas_apply_workflow' ? { nodeId: 'workflow-node-1' } : { completed: true }
    ));
    const executor = createInspirationChatToolExecutor({
      executeExistingTool,
      generateMedia: vi.fn(),
      listWorkflowDescriptors: () => [],
      searchWeb: vi.fn(),
      createFile: vi.fn(),
    });
    await executor('run_workflow', { workflowId: 'workflow-1', inputIds: ['asset-1'] }, context);
    expect(executeExistingTool.mock.calls.map(call => call[0])).toEqual([
      'canvas_apply_workflow',
      'canvas_run_workflow',
    ]);
  });

  it('adds the active conversation id when creating a file', async () => {
    const createFile = vi.fn(async () => ({ files: [] }));
    const executor = createInspirationChatToolExecutor({
      executeExistingTool: vi.fn(),
      generateMedia: vi.fn(),
      listWorkflowDescriptors: () => [],
      searchWeb: vi.fn(),
      createFile,
    });
    await executor('create_file', { fileName: '报告.docx', format: 'docx', content: '# 报告' }, context);
    expect(createFile).toHaveBeenCalledWith({
      fileName: '报告.docx',
      format: 'docx',
      content: '# 报告',
      conversationId: 'conversation-1',
    });
  });
});
