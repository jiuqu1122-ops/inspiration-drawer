import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { convertWorkflowDraftToDefinition } from '../kernel/appAgentKernel';
import type { WorkflowRecipeDraft } from '../workflows/workflowRecipeTypes';
import { ImageRuleSwitchPanel } from '../../canvas/components/ImageRuleSwitchPanel';
import { getDefaultImageRuleState, getRecommendedImageRuleState } from './imageRuleDefaults';
import { buildFinalImagePrompt } from './imageRulePromptBuilder';

describe('image rule quality', () => {
  it('enables product consistency and random text protection by default', () => {
    const rules = getDefaultImageRuleState({ hasReferenceImage: true, outputRole: 'hero_main' });

    expect(rules.product_consistency).toBe(true);
    expect(rules.structure_credibility).toBe(true);
    expect(rules.no_random_text).toBe(true);
    expect(rules.no_structure_drift).toBe(true);
    expect(rules.atmosphere).toBeUndefined();
    expect(rules.brand_feel).toBeUndefined();
    expect(rules.premium_lighting).toBeUndefined();

    const recommended = getRecommendedImageRuleState({ outputRole: 'hero_main' });
    expect(recommended.atmosphere).toBe(true);
    expect(recommended.brand_feel).toBe(true);
  });

  it('injects enabled rules and keeps negative constraints separate', () => {
    const finalPrompt = buildFinalImagePrompt({
      userPrompt: '生成一张产品主视觉。',
      presetPrompt: 'Premium product render.',
      rules: {
        atmosphere: true,
        product_consistency: true,
        no_random_text: true,
        no_fake_specs: true,
      },
      nodeType: { mediaType: 'image', hasReferenceImage: true, nodeRole: 'hero_main' },
    });

    expect(finalPrompt.prompt).toContain('Image quality rules:');
    expect(finalPrompt.prompt).toContain('严格保持参考产品轮廓');
    expect(finalPrompt.prompt).toContain('增强空间氛围');
    expect(finalPrompt.prompt).toContain('Negative constraints:');
    expect(finalPrompt.negativeConstraints.some(item => item.includes('未请求的标题'))).toBe(true);
    expect(finalPrompt.negativeConstraints.some(item => item.includes('未提供的尺寸'))).toBe(true);
  });

  it('omits disabled default rules from final image prompt', () => {
    const finalPrompt = buildFinalImagePrompt({
      userPrompt: 'Create a product render.',
      rules: {
        product_consistency: true,
        structure_credibility: true,
        no_random_text: false,
      },
      nodeType: { mediaType: 'image', hasReferenceImage: true, nodeRole: 'hero_main' },
    });

    expect(finalPrompt.prompt).toContain('Image quality rules:');
    expect(finalPrompt.negativeConstraints.some(item => item.includes('未请求的标题'))).toBe(false);
    expect(finalPrompt.prompt).not.toContain('未请求的标题');
  });

  it('renders the image rule switch panel with enabled rule switches', () => {
    const html = renderToStaticMarkup(React.createElement(ImageRuleSwitchPanel, {
      rules: {
        atmosphere: true,
        no_random_text: true,
      },
      expanded: true,
      onToggle: () => undefined,
      onToggleExpanded: () => undefined,
    }));

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('图像规则');
  });

  it('preserves workflow draft imagePolicy rules in image generator definitions', () => {
    const draft: WorkflowRecipeDraft = {
      id: 'draft-1',
      name: '规则测试工作流',
      description: '测试 imagePolicy 继承',
      templateId: 'industrial-design-review',
      languagePolicy: {
        promptLanguage: 'zh-CN',
        visibleTextLanguage: 'zh-CN',
        imageTextLanguage: 'zh-CN',
        allowEnglishTechnicalTerms: true,
      },
      inputs: [{
        id: 'product_reference_image',
        label: '产品参考图',
        type: 'image',
        required: true,
      }],
      strategy: {
        enabled: false,
        mode: 'disabled',
        title: '',
        prompt: '',
      },
      outputs: [{
        id: 'hero_main',
        title: '主视觉',
        type: 'image_generator',
        enabled: true,
        order: 1,
        aspectRatio: '16:9',
        targetSize: null,
        resolution: null,
        provider: null,
        model: null,
        prompt: '生成产品主视觉。',
        inputRoles: ['product_reference_image'],
        requiresReferenceImages: true,
        editable: true,
        imagePolicy: {
          rules: {
            product_consistency: true,
            no_random_text: false,
            brand_feel: true,
          },
        },
      }],
      metadata: {
        originalRequest: '生成产品主视觉',
        createdBy: 'app-agent',
        editable: true,
      },
    };

    const definition = convertWorkflowDraftToDefinition(draft, ['product-image-node'], '生成产品主视觉', 'workflow_module');
    const step = definition.steps.find(item => item.type === 'image_generator' && item.id === 'hero_main');
    const imageStep = step?.type === 'image_generator' ? step : null;

    expect(imageStep?.imagePolicy?.rules?.product_consistency).toBe(true);
    expect(imageStep?.imagePolicy?.rules?.brand_feel).toBe(true);
    expect(imageStep?.imagePolicy?.rules?.no_random_text).toBe(false);
  });
});
