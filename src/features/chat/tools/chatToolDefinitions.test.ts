import { describe, expect, it } from 'vitest';
import { CHAT_TOOL_DEFINITIONS, getChatToolDefinitions, shouldDirectGenerateImage, shouldExposeBatchImageOperation, shouldExposeChatTools, shouldExposeWebSearch } from './chatToolDefinitions';

describe('Chat tool exposure', () => {
  it('registers only the supported Chat tools', () => {
    expect(CHAT_TOOL_DEFINITIONS.map(tool => tool.function.name)).toEqual([
      'web_search',
      'create_file',
      'get_canvas_selection',
      'search_assets',
      'generate_image',
      'edit_image',
      'batch_image_operation',
      'generate_video',
      'add_to_canvas',
      'create_canvas_generator',
      'list_workflows',
      'run_workflow',
    ]);
  });

  it.each([
    '你好',
    '你是谁？',
    '帮我想几个车载音响造型方向',
    '给我设计 5 款宝马车载音响',
    '解释一下 HTML Canvas 是什么',
  ])('keeps ordinary conversation tool-free: %s', text => {
    expect(shouldExposeChatTools(text)).toBe(false);
  });

  it.each([
    '生成一张蓝色跑车图片',
    '帮我生成一张风景照',
    '生成一张写实电影感的雪山湖泊日出风景照',
    '把第三个方向生成一张 16:9 图',
    '搜索素材库里的宝马内饰参考',
    '看看当前画布里有什么',
    '运行产品设计工作流',
    '把刚生成的图放进画布',
  ])('exposes tools for explicit software or media intent: %s', text => {
    expect(shouldExposeChatTools(text)).toBe(true);
  });

  it.each(['帮我生成一张风景照', '生成一张海报'])('marks direct image requests for the runtime fallback: %s', text => {
    expect(shouldDirectGenerateImage(text)).toBe(true);
  });

  it('does not route an explicit video request through the image fallback', () => {
    expect(shouldDirectGenerateImage('帮我生成一段城市夜景视频')).toBe(false);
  });

  it('allows an image-edit follow-up only when generated media exists', () => {
    expect(shouldExposeChatTools('把这张图调暖一点', false)).toBe(false);
    expect(shouldExposeChatTools('把这张图调暖一点', true)).toBe(true);
  });

  it('lets the model choose among relevant image tools for a multi-image task', () => {
    expect(shouldExposeBatchImageOperation('把每张都换成白色背景', 3)).toBe(true);
    expect(shouldExposeBatchImageOperation('帮我把这几张图都排一下版', 6)).toBe(true);
    expect(shouldExposeBatchImageOperation('帮我给这几张产品图排一下版，要有简单的英文说明', 6)).toBe(true);
    expect(shouldExposeBatchImageOperation('把水印去掉', 6)).toBe(true);
    expect(shouldExposeBatchImageOperation('把每张都换成白色背景', 1)).toBe(false);
    const tools = getChatToolDefinitions('把每张都换成白色背景', false, false, false, 3)
      .map(tool => tool.function.name);
    expect(tools).toContain('batch_image_operation');
    expect(tools).toContain('generate_image');
    expect(tools).toContain('edit_image');
  });

  it('requires a concrete conversational plan before a batch image tool can run', () => {
    const definition = CHAT_TOOL_DEFINITIONS.find(tool => (
      tool.function.name === 'batch_image_operation'
    ));
    const parameters = definition?.function.parameters as {
      required?: string[];
      properties?: Record<string, unknown>;
    };

    expect(parameters.required).toEqual(expect.arrayContaining([
      'taskUnderstanding',
      'sourceAssessment',
      'executionPlan',
      'specificChanges',
      'perImageInstructions',
      'preservationRules',
      'deliveryPlan',
      'instruction',
    ]));
    expect(parameters.properties).toHaveProperty('analysisSummary');
  });

  it('keeps combined-reference requests on ordinary image generation tools', () => {
    expect(shouldExposeBatchImageOperation('参考这几张图做一个新的设计', 3)).toBe(false);
    const tools = getChatToolDefinitions('参考这几张图做一个新的设计', false, false, false, 3)
      .map(tool => tool.function.name);
    expect(tools).toContain('generate_image');
    expect(tools).not.toContain('batch_image_operation');
  });

  it('lets a later explicit per-image correction override an earlier combined request', () => {
    const text = [
      '参考这几张图做一个新的设计',
      '不要整合，每一张图都要单独排版',
      '开始制作吧',
    ].join('\n');
    expect(shouldExposeBatchImageOperation(text, 3)).toBe(true);
    const tools = getChatToolDefinitions(text, false, false, false, 3)
      .map(tool => tool.function.name);
    expect(tools).toContain('batch_image_operation');
    expect(tools).toContain('generate_image');
  });

  it('keeps both routes available when historical multi-image intent is ambiguous', () => {
    const tools = getChatToolDefinitions(
      '整理成一份产品设计作品集，帮我排版并添加英文说明\n开始做吧',
      false,
      false,
      false,
      6,
    ).map(tool => tool.function.name);
    expect(tools).toContain('generate_image');
    expect(tools).toContain('batch_image_operation');
  });

  it('exposes web search for explicit current-information requests or when enabled', () => {
    expect(shouldExposeWebSearch('联网查一下今天的 AI 新闻')).toBe(true);
    expect(getChatToolDefinitions('你好', false, true).map(tool => tool.function.name)).toEqual(['web_search']);
    expect(getChatToolDefinitions('你好', false, false)).toEqual([]);
    expect(getChatToolDefinitions('联网查一下今天的 AI 新闻', false, true, true)).toEqual([]);
  });

  it('exposes only the file tool for an explicit downloadable-file request', () => {
    expect(getChatToolDefinitions('帮我生成一份可以下载的 Word 报告').map(tool => tool.function.name))
      .toEqual(['create_file']);
    expect(getChatToolDefinitions('帮我做个 Excel 表格').map(tool => tool.function.name))
      .toEqual(['create_file']);
    expect(getChatToolDefinitions('帮我写一份报告')).toEqual([]);
  });
});
