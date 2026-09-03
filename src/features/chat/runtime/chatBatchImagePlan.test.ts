import { describe, expect, it } from 'vitest';
import type { ChatProviderResult } from './chatStream';
import { extractChatBatchImagePlan } from './chatBatchImagePlan';

const fallback = {
  analysisSummary: '兜底分析',
  instruction: '兜底指令',
};

describe('Chat batch image plan', () => {
  it('prefers the structured LLM plan over placeholder content', () => {
    const result: ChatProviderResult = {
      requestId: 'request-1',
      content: '\u200B',
      toolCalls: [{
        id: 'call-1',
        name: 'propose_batch_image_plan',
        arguments: JSON.stringify({
          analysisSummary: '### 版式结构\n\n左侧安排主视觉，右侧组织细节与场景。',
          instruction: '采用克制的工业设计作品集网格，并增加简洁说明。',
        }),
      }],
    };

    expect(extractChatBatchImagePlan(result, fallback)).toEqual({
      analysisSummary: '### 版式结构\n\n左侧安排主视觉，右侧组织细节与场景。',
      instruction: '采用克制的工业设计作品集网格，并增加简洁说明。',
    });
  });

  it('uses visible content and then the fallback when structured output is unavailable', () => {
    expect(extractChatBatchImagePlan({
      requestId: 'request-2',
      content: '可见分析正文',
      toolCalls: [],
    }, fallback).analysisSummary).toBe('可见分析正文');

    expect(extractChatBatchImagePlan({
      requestId: 'request-3',
      content: '\u200B',
      toolCalls: [],
    }, fallback)).toEqual(fallback);
  });

  it('assembles a task-specific image operation plan without assuming layout work', () => {
    const result: ChatProviderResult = {
      requestId: 'request-4',
      content: '',
      toolCalls: [{
        id: 'call-4',
        name: 'batch_image_operation',
        arguments: JSON.stringify({
          taskUnderstanding: '把每张产品图的背景替换为干净的摄影棚浅灰背景。',
          sourceAssessment: '- 图片 1：主体边缘完整\\n- 图片 2：透明部件需要精细抠图',
          executionPlan: '逐张分离主体，重建接触阴影，再匹配原图光向。',
          specificChanges: '移除原背景和杂物，替换为 #F1F2F3 浅灰无缝背景。',
          perImageInstructions: [
            { imageIndex: 1, instruction: '保留完整硬边轮廓，重建右下方接触阴影。' },
            { imageIndex: 2, instruction: '精细保留透明部件与内部折射。' },
          ],
          preservationRules: '保留产品造型、颜色、Logo、材质纹理和原始透视。',
          deliveryPlan: '每张图独立输出，并按附件顺序自动编组。',
          instruction: '逐张替换浅灰摄影棚背景，保留产品本身并匹配接触阴影。',
        }),
      }],
    };

    expect(extractChatBatchImagePlan(result, fallback)).toEqual({
      analysisSummary: [
        '### 任务理解',
        '',
        '把每张产品图的背景替换为干净的摄影棚浅灰背景。',
        '',
        '### 源图分析',
        '',
        '- 图片 1：主体边缘完整\n- 图片 2：透明部件需要精细抠图',
        '',
        '### 执行安排',
        '',
        '逐张分离主体，重建接触阴影，再匹配原图光向。',
        '',
        '### 具体改动',
        '',
        '移除原背景和杂物，替换为 #F1F2F3 浅灰无缝背景。',
        '',
        '### 逐图执行',
        '',
        '- **图片 1**：保留完整硬边轮廓，重建右下方接触阴影。\n- **图片 2**：精细保留透明部件与内部折射。',
        '',
        '### 保留与限制',
        '',
        '保留产品造型、颜色、Logo、材质纹理和原始透视。',
        '',
        '### 结果组织',
        '',
        '每张图独立输出，并按附件顺序自动编组。',
      ].join('\n'),
      instruction: [
        '对当前输入的这一张图片执行以下方案。当前图片是独立任务，不得与其他图片拼接、融合或串用主体。',
        '',
        '用户原始要求：逐张替换浅灰摄影棚背景，保留产品本身并匹配接触阴影。',
        '',
        '任务目标：',
        '把每张产品图的背景替换为干净的摄影棚浅灰背景。',
        '',
        '通用执行步骤：',
        '逐张分离主体，重建接触阴影，再匹配原图光向。',
        '',
        '必须完成的改动：',
        '移除原背景和杂物，替换为 #F1F2F3 浅灰无缝背景。',
        '',
        '必须保留与禁止修改：',
        '保留产品造型、颜色、Logo、材质纹理和原始透视。',
      ].join('\n'),
    });
  });

  it('turns escaped newline markers from tool arguments into real markdown lines', () => {
    const plan = extractChatBatchImagePlan({
      requestId: 'request-5',
      content: '',
      toolCalls: [{
        id: 'call-5',
        name: 'batch_image_operation',
        arguments: JSON.stringify({
          analysisSummary: '源图分析：\\n- 图片 1\\n- 图片 2',
          instruction: '分别处理',
        }),
      }],
    }, fallback);

    expect(plan.analysisSummary).toBe('源图分析：\n- 图片 1\n- 图片 2');
    expect(plan.analysisSummary).not.toContain('\\n');
  });
});
