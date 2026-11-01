import { describe, expect, it } from 'vitest';
import { canGenerateChatPresentationImages, CHAT_PRESENTATION_SCHEMA, CHAT_PRESENTATION_SYSTEM_RULES, isChatFileDeliveryRequest, isChatPresentationRequest } from './chatPresentation';

describe('Chat presentation intent', () => {
  it.each([
    '生成一份PPT',
    '生成PPT',
    '出ppt',
    '出 PPTX',
    '输出ppt',
    '帮我出一份调研PPT',
    '请帮我制作演示文稿',
    '制作一份中文幻灯片',
    '帮我设计一套产品发布会 PowerPoint',
    '把上面的内容整理成演示文稿',
    '生成一份含图片的PPT',
    '把这三张图片分别放进演示文稿，制作PPT',
    '把之前的图片改成 PPTX 文件',
    '导出 pptx',
    'PPTX',
    '.pptx',
    '用 PPT 格式',
    'PowerPoint',
    'Create an editable PowerPoint presentation',
    'Generate a PPTX with the attached pictures',
    'Please make a slide deck from this report',
    'Build a presentation',
    'Export this as .pptx',
    'Turn these images into a slide deck',
    'PowerPoint please',
    'PPT 下载',
    '生成一份PPT，不要只给大纲',
    '生成一份PPT，不用额外生成图片',
    '不用配图直接生成一份PPT',
    'Create a PowerPoint; do not generate images',
  ])('recognizes a real presentation request: %s', text => {
    expect(isChatPresentationRequest(text)).toBe(true);
  });

  it.each([
    '你好',
    'PowerPoint 是什么？',
    '介绍一下 PPTX 格式',
    '如何制作演示文稿？',
    '请问怎么生成PPT？',
    'How do I create a PowerPoint?',
    'Can you explain how to make a slide deck?',
    'Generate a PowerPoint outline',
    '帮我生成一份PPT大纲',
    '帮我生成一份 PPT 的大纲',
    '生成一份PPT，只要大纲',
    '生成一份PPT，先只给大纲，不要制作文件',
    'Create a PowerPoint, only an outline for now',
    '只写演示文稿的讲稿',
    '不要生成PPT',
    '先别出ppt',
    '不要输出PPT',
    '如何出ppt？',
    '出ppt封面图',
    '请先别制作演示文稿',
    "Don't create a PowerPoint",
    'Do not make a PPTX',
    '生成一张PPT封面图',
    '生成一张 PowerPoint 的配图',
    'Make a PowerPoint cover image',
    'Create a PowerPoint style poster',
    'Generate an image for the PowerPoint',
    '生成图片用于PPT',
    '帮我做个 Excel 表格',
  ])('does not turn advice, outlines, negations, or image assets into PPTX work: %s', text => {
    expect(isChatPresentationRequest(text)).toBe(false);
  });

  it.each([
    '给我文件', '请给我可下载的文件', '我要文件，不要只贴内容',
    '导出成文件', '把刚才的演示文稿保存为文件',
    'Give me the file', 'Please export a downloadable version',
  ])('recognizes an explicit file-delivery follow-up: %s', text => {
    expect(isChatFileDeliveryRequest(text)).toBe(true);
  });

  it.each([
    '先给我大纲', '什么是文件？', '不要给我文件', '请不要给我文件',
    '不用导出文件', "Don't give me a file", 'Please do not export a file',
  ])('does not force delivery for discussion or a negated file request: %s', text => {
    expect(isChatFileDeliveryRequest(text)).toBe(false);
  });
});


describe('Chat PPTX optional AI illustration policy', () => {
  it.each([
    '生成PPT', '生成一份含图片的PPT', 'Generate an editable slide deck',
    '制作演示文稿，有需要时生成插画',
  ])('allows model-selected illustrations without requiring them: %s', text => {
    expect(canGenerateChatPresentationImages(text)).toBe(true);
  });

  it.each([
    '生成PPT，不用AI生图', '生成PPT，纯文字', '生成PPT，只用附件',
    '制作演示文稿，不需要图片', '生成PPT，不额外生图',
    '制作演示文稿，不要进行AI生图', '制作PPT，仅使用上传的图片',
    'Make a text-only slide deck', 'Create a presentation without AI-generated images',
    'Make a PowerPoint, please do not generate any images',
    'Make a presentation; use only existing images',
    '你好', '生成图片',
  ])('respects opting out and never enables generation for unrelated turns: %s', text => {
    expect(canGenerateChatPresentationImages(text)).toBe(false);
  });
});
describe('Chat presentation schema and composition contract', () => {
  it('supports optional design direction, structured slide layouts, and editable native elements', () => {
    const schema = CHAT_PRESENTATION_SCHEMA as any;
    const presentation = schema.properties;
    const slide = presentation.slides.items.properties;
    const item = slide.items.items;
    const element = slide.elements.items;
    expect(presentation.designStyle).toEqual({ type: 'string', enum: ['editorial', 'technical', 'minimal', 'cinematic', 'brutalist', 'soft', 'custom'] });
    expect(presentation.theme).toEqual({ type: 'string', enum: ['light', 'dark', 'warm', 'mono', 'vivid', 'pastel'] });
    expect(presentation.accentColor.pattern).toBe('^#[0-9A-Fa-f]{6}$');
    expect(slide.layout.enum).toEqual([
      'cover', 'section', 'content', 'two-column', 'image-left', 'image-right',
      'statement', 'insight', 'metrics', 'process', 'comparison', 'grid', 'canvas', null,
    ]);
    expect(slide.backgroundColor.pattern).toBe('^#[0-9A-Fa-f]{6}$');
    expect(slide.items.maxItems).toBe(6);
    expect(item.required).toEqual(['title']);
    expect(item.properties.value.type).toEqual(['string', 'null']);
    expect(slide.elements.maxItems).toBe(40);
    expect(element.required).toEqual(['kind', 'x', 'y', 'width', 'height']);
    expect(element.properties.kind.enum).toEqual(['rect', 'ellipse', 'line', 'text']);
    expect(element.properties.x).toMatchObject({ type: 'number', minimum: 0, maximum: 100 });
    expect(element.properties.strokeWidth).toMatchObject({ minimum: 0, maximum: 8 });
    expect(element.properties.opacity).toMatchObject({ minimum: 0, maximum: 1 });
    expect(element.properties.fontSize).toMatchObject({ minimum: 12, maximum: 72 });
    expect(element.properties.fill.pattern).toBe('^#[0-9A-Fa-f]{6}$');
    expect(element.additionalProperties).toBe(false);
  });

  it('keeps composition guidance content-led, native-editable, and safe for visual evidence', () => {
    for (const rule of [
      '先做逐页分镜', '默认 8–12 页', '不要把少量内容拆成 24 页',
      '避免连续 3 页 content', '不要全篇 two-column', '封面 cover 需要强标题层级',
      'comparison 的 items 恰好 2 项', 'process 使用 3–5 项', 'grid 使用 3–6 项',
      'elements 添加原生可编辑的示意图', '不是每页必加的装饰',
      '禁止传入任意 SVG 字符串、原始 HTML、脚本或外部 URL',
      'AI 生成插图只能标作概念/示意，不是竞品证据', '不得虚构产品、照片或数据',
      '用户禁用图片、附件已足够', 'backgroundColor 可逐页选择', '每份演示都必须重新做视觉决策', '不要固定左文右图封面', '每页构图独立服务内容', '先遵循用户本轮明确指定的风格',
    ]) expect(CHAT_PRESENTATION_SYSTEM_RULES).toContain(rule);
    expect(CHAT_PRESENTATION_SYSTEM_RULES).not.toContain('强制每页使用矢量');
    expect(CHAT_PRESENTATION_SYSTEM_RULES).not.toContain('editorial 适合叙事与研究，technical 适合技术与系统说明，minimal 适合克制的信息呈现');
  });
});
