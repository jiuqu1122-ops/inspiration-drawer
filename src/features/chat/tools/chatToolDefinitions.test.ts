import { describe, expect, it } from 'vitest';
import type { ChatMessage } from '../model/chatTypes';
import { CHAT_TOOL_DEFINITIONS, getChatToolDefinitions, isChatAgentCreationFollowup, isChatAgentCreationRequest, resolveDirectVisualTool, shouldComposeImageVariants, shouldDirectGenerateImage, shouldExposeBatchImageOperation, shouldExposeChatTools, shouldExposeWebSearch, shouldForceChatAgentCreation, shouldUseIndependentImageVariants } from './chatToolDefinitions';

const imageToolNames = ['generate_image', 'generate_image_variants', 'edit_image'];

describe('Chat tool exposure', () => {
  it('exposes canvas tools for an active agent even when the user refers to its instructions briefly', () => {
    expect(getChatToolDefinitions('按这个智能体继续', false, false, false, 0, true)
      .map(tool => tool.function.name)).toContain('create_workflow');
  });
  it.each(['出ppt', '出 PPTX', '输出ppt', '帮我出一份调研PPT'])('offers the real file tool for short delivery wording: %s', text => {
    const names = getChatToolDefinitions(text).map(tool => tool.function.name);
    expect(names).toContain('create_file');
    expect(names).not.toContain('edit_image');
    expect(shouldDirectGenerateImage(text)).toBe(false);
  });
  it('registers only the supported Chat tools', () => {
    expect(CHAT_TOOL_DEFINITIONS.map(tool => tool.function.name)).toEqual([
      'web_search',
      'create_file',
      'create_agent',
      'get_canvas_selection',
      'search_assets',
      'generate_image',
      'generate_image_variants',
      'edit_image',
      'batch_image_operation',
      'generate_video',
      'interpolate_video',
      'enhance_image',
      'enhance_video',
      'fuse_images',
      'add_to_canvas',
      'create_canvas_generator',
      'create_workflow',
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
    '出图',
    '那你帮我改一下，然后出图',
    '搜索素材库里的宝马内饰参考',
    '看看当前画布里有什么',
    '运行产品设计工作流',
    '帮我创建一个产品设计工作流',
    'Build a reusable workflow',
    '把刚生成的图放进画布',
  ])('exposes tools for explicit software or media intent: %s', text => {
    expect(shouldExposeChatTools(text)).toBe(true);
  });

  it('offers a real creation tool for workflow requests', () => {
    expect(getChatToolDefinitions('创建一个产品设计工作流').map(tool => tool.function.name)).toContain('create_workflow');
    expect(resolveDirectVisualTool('帮我创建一套商品图片工作流')).toBeNull();
  });

  it('exposes agent creation for a natural language request without confusing usage or how-to questions', () => {
    expect(isChatAgentCreationRequest('帮我创建一个专门做产品外观设计的智能体')).toBe(true);
    expect(isChatAgentCreationRequest('新增一个写营销文案的 skill')).toBe(true);
    expect(isChatAgentCreationRequest('帮我创建一个整理素材的技能')).toBe(true);
    expect(isChatAgentCreationRequest('帮我创建一个整理素材的 skllis')).toBe(true);
    expect(isChatAgentCreationRequest('帮我创建一个整理素材的 skills')).toBe(true);
    expect(isChatAgentCreationRequest('Build a research skills agent')).toBe(true);
    expect(isChatAgentCreationRequest('创建一个可以先分析工业设计需求、再整理参考素材、最后提出三套 CMF 方案的智能体')).toBe(true);
    expect(getChatToolDefinitions('帮我创建一个专门做产品外观设计的智能体').map(tool => tool.function.name))
      .toContain('create_agent');
    expect(isChatAgentCreationRequest('帮我用智能体创建一个工作流')).toBe(false);
    expect(isChatAgentCreationRequest('如何创建一个智能体？')).toBe(false);
    expect(isChatAgentCreationRequest('创建一个智能体要怎么做？')).toBe(false);
    expect(shouldForceChatAgentCreation('创建一个产品设计智能体')).toBe(true);
    expect(shouldForceChatAgentCreation('创建一个智能体')).toBe(false);
    expect(getChatToolDefinitions('如何创建一个智能体？').map(tool => tool.function.name))
      .not.toContain('create_agent');
  });

  it('keeps agent creation available after Chat asks for the missing purpose', () => {
    const user = {
      id: 'user-1', conversationId: 'conversation-1', role: 'user', content: '帮我创建一个技能',
      status: 'completed', createdAt: 1, attachments: [], toolCalls: [],
    } satisfies ChatMessage;
    const assistant = {
      id: 'assistant-1', conversationId: 'conversation-1', role: 'assistant', content: '你希望这个技能负责什么任务？',
      status: 'completed', createdAt: 2, attachments: [], toolCalls: [],
    } satisfies ChatMessage;
    expect(isChatAgentCreationFollowup([user, assistant], '负责产品外观分析')).toBe(true);
    expect(isChatAgentCreationFollowup([
      user, assistant,
      { ...user, id: 'user-2', content: '负责产品外观分析', createdAt: 3 },
    ], '负责产品外观分析')).toBe(true);
    expect(getChatToolDefinitions('负责产品外观分析', false, false, false, 0, false, true)
      .map(tool => tool.function.name)).toContain('create_agent');
    expect(isChatAgentCreationFollowup([user, assistant], '算了')).toBe(false);
  });

  it.each([
    ['给这个视频补帧', 'interpolate_video'],
    ['这个视频清晰一点', 'enhance_video'],
    ['把这张图增强', 'enhance_image'],
    ['把这两张图溶一下', 'fuse_images'],
  ])('exposes %s media tooling through the ordinary Chat tool set', (text, expectedTool) => {
    expect(getChatToolDefinitions(text).map(tool => tool.function.name)).toContain(expectedTool);
  });

  it.each(['帮我生成一张风景照', '生成一张海报', '出图', '输出两张图'])('recognizes explicit image requests in the intent hint: %s', text => {
    expect(shouldDirectGenerateImage(text)).toBe(true);
  });

  it.each(['先不要出图', '暂时不用生成图片', '别生图，先分析一下'])('respects explicit requests not to render yet: %s', text => {
    expect(shouldDirectGenerateImage(text)).toBe(false);
  });
  it.each([
    '\u5e2e\u6211\u751f\u6210\u4e00\u4e2a\u7528\u4e8e Midjourney \u7684\u56fe\u7247\u63d0\u793a\u8bcd',
    '\u5199\u4e00\u4e2a\u751f\u6210\u56fe\u7247\u7684\u63d0\u793a\u8bcd',
    '\u4f18\u5316\u8fd9\u6bb5\u751f\u56fe\u63d0\u793a\u8bcd',
    'Write an image-generation prompt for a futuristic car',
    'Improve this prompt for image generation',
  ])('keeps image-prompt authoring text-only: %s', text => {
    expect(shouldDirectGenerateImage(text)).toBe(false);
    expect(resolveDirectVisualTool(text)).toBeNull();
    expect(getChatToolDefinitions(text).map(tool => tool.function.name))
      .not.toContain('generate_image');
  });

  it.each([
    '\u5e2e\u6211\u5199\u4e00\u4e2a\u751f\u56fe\u63d0\u793a\u8bcd\uff0c\u7136\u540e\u6309\u5b83\u751f\u6210\u56fe\u7247',
    '\u5148\u5199\u63d0\u793a\u8bcd\uff0c\u518d\u751f\u6210\u4e00\u5f20\u56fe',
    'Write an image prompt, then generate the image',
    '\u5e2e\u6211\u5199\u63d0\u793a\u8bcd\uff0c\u7136\u540e\u5e2e\u6211\u751f\u6210\u56fe\u7247',
    '\u751f\u6210\u63d0\u793a\u8bcd\uff0c\u56fe\u7247\u4e5f\u751f\u6210\u4e00\u4e0b',
  ])('preserves a separate explicit render request: %s', text => {
    expect(shouldDirectGenerateImage(text)).toBe(true);
    expect(getChatToolDefinitions(text).map(tool => tool.function.name))
      .toContain('generate_image');
  });

  it('does not route an explicit video request through the image fallback', () => {
    expect(shouldDirectGenerateImage('帮我生成一段城市夜景视频')).toBe(false);
  });

  it.each([
    '生成三个不同设计方向，每个方向各自出一张图',
    '按你的想法帮我生成这三款不同方案的图，每个方案一张',
    '这三个方案分别生成三张图',
    '把同一角色做成两种差异化风格版本',
    '根据以上对话，生成2种不同场景的图片',
    '做三种不同环境氛围的图',
    'Create three distinct poster variants',
    'Generate two different scenes',
  ])('recognizes a general independent image-variant request: %s', text => {
    expect(shouldUseIndependentImageVariants(text)).toBe(true);
  });

  it.each([
    '同一个方案帮我生成三张候选图',
    '生成一张蓝色跑车图片',
    '帮我想三个方向，先不要出图',
  ])('does not confuse ordinary candidates or ideation with independent image variants: %s', text => {
    expect(shouldUseIndependentImageVariants(text)).toBe(false);
  });

  it.each([
    '生成一张图，里面并排展示三个不同设计方案',
    '把这几个方向放在同一个版面里做成方案板',
    '生成一张图，里面展示两个不同场景',
    '生成一张包含两个不同场景的图片',
    '把两种不同场景做在同一张图里',
    '生成一张左右分屏图，同时表现两个场景',
    'Create one comparison board containing three distinct variants',
  ])('keeps explicitly composited multi-option output as one image task: %s', text => {
    expect(shouldUseIndependentImageVariants(text)).toBe(false);
    expect(shouldComposeImageVariants(text)).toBe(true);
  });

  it('allows an image-edit follow-up only when generated media exists', () => {
    expect(shouldExposeChatTools('把这张图调暖一点', false)).toBe(false);
    expect(shouldExposeChatTools('把这张图调暖一点', true)).toBe(true);
    expect(shouldExposeChatTools('再做一个红色版本', false)).toBe(false);
    expect(shouldExposeChatTools('再做一个红色版本', true)).toBe(true);
    expect(shouldExposeChatTools(
      '我想要红色宫墙的视觉效果，同样保留以上对话的特点，建筑不要纹理太复杂',
      false,
    )).toBe(false);
    expect(shouldExposeChatTools(
      '我想要红色宫墙的视觉效果，同样保留以上对话的特点，建筑不要纹理太复杂',
      true,
    )).toBe(true);
  });

  it.each([
    '我希望整体色彩更明亮',
    '保留上述设计的特点，但材质不要太粗糙',
    '背景简化一点，主体结构保持不变',
    'Make the texture simpler while retaining the previous design',
  ])('exposes image tools for a general visual revision when generated media exists: %s', text => {
    expect(shouldExposeChatTools(text, false)).toBe(false);
    expect(shouldExposeChatTools(text, true)).toBe(true);
  });

  it('exposes image tools when a visual revision restores a historical attachment', () => {
    const tools = getChatToolDefinitions(
      '分析这张建筑参考图的视觉特点\n我想要红色宫墙的视觉效果，同样保留以上对话的特点，建筑不要纹理太复杂',
      false,
      false,
      false,
      1,
    ).map(tool => tool.function.name);
    expect(tools).toContain('generate_image');
    expect(tools).toContain('edit_image');
  });

  it('selects an executable fallback for contextual visual revisions', () => {
    const text = '我想要红色宫墙的视觉效果，同样保留以上对话的特点，建筑不要纹理太复杂';
    expect(resolveDirectVisualTool(text, false, 0)).toBeNull();
    expect(resolveDirectVisualTool(text, false, 1)).toBe('generate_image');
    expect(resolveDirectVisualTool(text, true, 0)).toBe('edit_image');
    expect(resolveDirectVisualTool('出图', true, 0)).toBe('generate_image');
  });

  it('does not mistake 分别出图 for a negated image request', () => {
    const text = '三个方案都分别出图我看看';
    expect(shouldDirectGenerateImage(text)).toBe(true);
    expect(shouldUseIndependentImageVariants(text)).toBe(true);
    expect(getChatToolDefinitions(text).map(tool => tool.function.name))
      .toContain('generate_image_variants');
    expect(shouldDirectGenerateImage('先别出图')).toBe(false);
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
    expect(tools).toContain('generate_image_variants');
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
    expect(getChatToolDefinitions('hello', false, true).map(tool => tool.function.name)).toEqual(['web_search', ...imageToolNames]);
    expect(getChatToolDefinitions('hello', false, false).map(tool => tool.function.name)).toEqual(imageToolNames);
    expect(getChatToolDefinitions('current news', false, true, true).map(tool => tool.function.name)).toEqual(imageToolNames);
  });

  it('always exposes image capabilities for model-side intent classification', () => {
    expect(getChatToolDefinitions('ordinary text query').map(tool => tool.function.name)).toEqual(imageToolNames);
  });

  it('exposes file creation on request while leaving visual intent to the model', () => {
    expect(getChatToolDefinitions('帮我生成一份可以下载的 Word 报告').map(tool => tool.function.name))
      .toEqual(['create_file', ...imageToolNames]);
    expect(getChatToolDefinitions('帮我做个 Excel 表格').map(tool => tool.function.name))
      .toEqual(['create_file', ...imageToolNames]);
    expect(getChatToolDefinitions('write a report').map(tool => tool.function.name)).toEqual(imageToolNames);
  });
});


describe('Chat PPTX file tool', () => {
  const fileTool = CHAT_TOOL_DEFINITIONS.find(tool => tool.function.name === 'create_file')!;
  type Schema = {
    type?: string | string[];
    enum?: unknown[];
    properties?: Record<string, Schema>;
    required?: string[];
    items?: Schema;
    additionalProperties?: boolean;
    minItems?: number;
    maxItems?: number;
    default?: unknown;
  };
  const presentationTools = ['create_file', 'generate_image', 'generate_image_variants'];
  const parameters = fileTool.function.parameters as Schema;
  const properties = parameters.properties!;
  const presentation = properties.presentation;
  const slides = presentation.properties!.slides;
  const slide = slides.items!;

  it('extends the existing tool rather than adding a separate PPT route', () => {
    expect(CHAT_TOOL_DEFINITIONS.filter(tool => tool.function.name === 'create_file')).toHaveLength(1);
    expect(properties.format).toEqual({ type: 'string', enum: ['txt', 'md', 'csv', 'json', 'docx', 'xlsx', 'pdf', 'pptx'] });
    expect(parameters.required).toEqual(['fileName', 'format']);
    expect(parameters.additionalProperties).toBe(false);
    expect(properties.content.type).toEqual(['string', 'null']);
    expect(fileTool.function.description).toContain('可编辑幻灯片');
  });

  it('keeps the original XLSX sheet contract unchanged', () => {
    expect(properties.sheets).toEqual({
      type: ['array', 'null'], description: '仅 XLSX 使用。第一行应为表头。',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          rows: { type: 'array', items: { type: 'array', items: { type: ['string', 'number', 'boolean', 'null'] } } },
        },
        required: ['name', 'rows'], additionalProperties: false,
      },
    });
  });

  it('requires presentation and slide titles, bounds requests to 40, and rejects undeclared payload fields', () => {
    expect(presentation.type).toEqual(['object', 'null']);
    expect(presentation.required).toEqual(['title', 'theme', 'designStyle', 'slides']);
    expect(presentation.properties!.title).toEqual({ type: 'string' });
    expect(presentation.additionalProperties).toBe(false);
    expect(slides).toMatchObject({ type: 'array', minItems: 1, maxItems: 40 });
    expect(slide.type).toBe('object');
    expect(slide.required).toEqual(['title']);
    expect(slide.additionalProperties).toBe(false);
    expect(Object.keys(presentation.properties!)).toEqual(['title', 'subtitle', 'theme', 'designStyle', 'accentColor', 'slides']);
    expect(Object.keys(slide.properties!)).toEqual([
      'layout', 'title', 'subtitle', 'body', 'bullets', 'leftTitle', 'leftBody',
      'rightTitle', 'rightBody', 'imageAttachmentId', 'imageCaption', 'notes', 'eyebrow', 'takeaway', 'items', 'backgroundColor', 'elements',
    ]);
    expect(slide.properties!.title).toEqual({ type: 'string' });
  });

  it('supports the exact nullable theme/layout enums and optional nullable text fields', () => {
    expect(presentation.properties!.theme).toEqual({ type: 'string', enum: ['light', 'dark', 'warm', 'mono', 'vivid', 'pastel'] });
    expect(slide.properties!.layout).toMatchObject({
      type: ['string', 'null'], enum: ['cover', 'section', 'content', 'two-column', 'image-left', 'image-right', 'statement', 'insight', 'metrics', 'process', 'comparison', 'grid', 'canvas', null],
      description: expect.stringContaining('逐页分镜必填'),
    });
    expect(presentation.properties!.subtitle).toEqual({ type: ['string', 'null'] });
    for (const key of ['subtitle', 'body', 'leftTitle', 'leftBody', 'rightTitle', 'rightBody', 'imageAttachmentId', 'imageCaption', 'notes']) {
      expect(slide.properties![key].type).toEqual(['string', 'null']);
      expect(slide.required).not.toContain(key);
    }
    expect(slide.properties!.bullets).toMatchObject({ type: 'array', items: { type: 'string' }, default: [] });
    expect(slide.required).not.toContain('bullets');
  });

  it.each([
    '生成一份PPT', '请帮我制作演示文稿', '生成PPT', '导出成 pptx',
    'Create a PowerPoint presentation', 'Make a slide deck', 'PowerPoint please',
  ])('exposes real file creation for a presentation or file follow-up: %s', text => {
    expect(getChatToolDefinitions(text).map(tool => tool.function.name)).toEqual(presentationTools);
  });

  it.each([
    '生成一份PPT',
    '生成一份含图片的PPT',
    '用这些图片制作演示文稿',
    '把每张图片分别放进幻灯片，生成PPT',
    '把图片换成暖色背景，制作两种不同风格的PPT',
    '把之前的图片改成 PPTX 文件',
    '制作演示文稿，同样保留以上设计的特点',
    '生成一份PPT，不要只给大纲',
    'Generate a PPTX with the attached pictures',
    'Make a presentation with three different image layouts',
    '参考这些图做三种不同设计方向\n制作PPT',
  ])('offers optional illustration tools without forcing presentation composition into the image fallback: %s', text => {
    expect(getChatToolDefinitions(text, true, false, false, 3, true).map(tool => tool.function.name)).toEqual(presentationTools);
    expect(shouldExposeChatTools(text, true)).toBe(false);
    expect(shouldDirectGenerateImage(text)).toBe(false);
    expect(shouldExposeBatchImageOperation(text, 3)).toBe(false);
    expect(shouldUseIndependentImageVariants(text)).toBe(false);
    expect(shouldComposeImageVariants(text)).toBe(false);
    expect(resolveDirectVisualTool(text, true, 3)).toBeNull();
  });

  it.each([
    '给我文件', '请给我可下载的文件', 'Give me the file', 'Export a downloadable file',
  ])('does not automatically execute image tools for a formatless file follow-up: %s', text => {
    expect(getChatToolDefinitions(text).map(tool => tool.function.name)).toEqual(['create_file', ...imageToolNames]);
  });

  it.each([
    '制作PPT，不用AI生图', '生成一份PPT，不用额外生成图片',
    '制作演示文稿，不要生成图片', '生成纯文字PPT', '生成纯文本演示文稿',
    '生成PPT，只用附件', '制作演示文稿，仅使用现有图片',
    '制作PPT，不要AI配图', '制作PPT，无需配图',
    'Create a text-only PowerPoint', 'Create a PPTX without AI images',
    'Make a presentation; only use the attachments',
    'Make a presentation; use only existing images',
    'Make a presentation; do not generate images',
    'Create a PowerPoint without AI-generated images',
    '生成PPT，不使用AI生图', '生成PPT，不要额外调用AI生图',
  ])('suppresses optional AI illustration tools when the user opts out: %s', text => {
    expect(getChatToolDefinitions(text, true, false, false, 3, true).map(tool => tool.function.name)).toEqual(['create_file']);
    expect(resolveDirectVisualTool(text, true, 3)).toBeNull();
    expect(shouldUseIndependentImageVariants(text)).toBe(false);
    expect(shouldComposeImageVariants(text)).toBe(false);
  });

  it('lets the model choose illustrations even when the user explicitly asks for them in a deck', () => {
    const text = '生成PPT，需要时生成产品场景插画';
    expect(getChatToolDefinitions(text).map(tool => tool.function.name)).toEqual(presentationTools);
    expect(shouldDirectGenerateImage(text)).toBe(false);
    expect(resolveDirectVisualTool(text)).toBeNull();
  });

  it.each([2, 3, 6])('never exposes batch side effects for PPTX with %i image attachments', imageCount => {
    for (const request of [
      '把每张附件分别放进幻灯片，生成PPT',
      '把每张附件分别放进幻灯片，生成PPT，不用AI生图',
      '把每张附件分别放进幻灯片，生成纯文字PPT',
      '把每张附件分别放进幻灯片，生成PPT，只用附件',
    ]) {
      const tools = getChatToolDefinitions(request, true, false, false, imageCount, true)
        .map(tool => tool.function.name);
      expect(tools).toContain('create_file');
      expect(tools).not.toContain('batch_image_operation');
      expect(tools).not.toContain('edit_image');
      expect(shouldExposeBatchImageOperation(request, imageCount)).toBe(false);
    }
  });

  it('keeps explicit batch-only image work available outside presentation requests', () => {
    const request = '把每张图片都换成白色背景';
    expect(shouldExposeBatchImageOperation(request, 3)).toBe(true);
    expect(getChatToolDefinitions(request, false, false, false, 3)
      .map(tool => tool.function.name)).toContain('batch_image_operation');
  });

  it('retains explicit web search settings on a presentation request', () => {
    expect(getChatToolDefinitions('制作演示文稿', false, true).map(tool => tool.function.name)).toEqual(['web_search', ...presentationTools]);
    expect(getChatToolDefinitions('制作演示文稿', false, true, true).map(tool => tool.function.name)).toEqual(presentationTools);
  });

  it.each([
    '如何制作演示文稿', 'PowerPoint 是什么', '生成一份PPT大纲',
    '生成一份PPT，只要大纲', 'Create a PowerPoint outline',
    '生成一份PPT，先只给大纲，不要制作文件', '不要生成PPT',
  ])('does not expose file creation for advice, outline-only work, or cancellation: %s', text => {
    expect(getChatToolDefinitions(text).map(tool => tool.function.name)).toEqual(imageToolNames);
    expect(resolveDirectVisualTool(text)).toBeNull();
  });

  it.each(['生成一张PPT封面图', 'Make a PowerPoint cover image', 'Create a PowerPoint style poster'])('preserves actual image-generation intent: %s', text => {
    expect(getChatToolDefinitions(text).map(tool => tool.function.name)).toContain('generate_image');
    expect(getChatToolDefinitions(text).map(tool => tool.function.name)).not.toContain('create_file');
    expect(shouldDirectGenerateImage(text)).toBe(true);
  });

  it.each([
    '帮我生成一份可以下载的 Word 报告', '帮我做个 Excel 表格', '帮我生成 PDF 文件',
    '帮我导出 CSV', '生成 JSON 文件', '创建 Markdown 文件', '给我 TXT 文件',
  ])('keeps existing non-PPT format exposure intact: %s', text => {
    expect(getChatToolDefinitions(text).map(tool => tool.function.name)).toEqual(['create_file', ...imageToolNames]);
  });

  it('keeps PPTX optional for other formats and survives provider JSON serialization', () => {
    const providerTool = JSON.parse(JSON.stringify(getChatToolDefinitions('生成一份PPT')[0]));
    expect(providerTool).toEqual(fileTool);
    expect(providerTool.function.parameters.required).not.toContain('presentation');
    expect(providerTool.function.parameters.properties.presentation.properties.slides.items.properties.bullets.default).toEqual([]);
  });
});
