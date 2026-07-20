import { describe, expect, it } from 'vitest';
import { convertWorkflowDraftToDefinition } from './appAgent/kernel/appAgentKernel';
import type { WorkflowRecipeDraft } from './appAgent/workflows/workflowRecipeTypes';
import {
  buildDesignAgentSystemPrompt,
  normalizeDesignAgentConfig,
} from './designAgentNode';

describe('Design Agent Node', () => {
  it('derives role-specific defaults without changing legacy nodes', () => {
    expect(normalizeDesignAgentConfig(undefined)).toEqual({
      agentRole: 'general',
      outputArtifactType: 'Document',
      thinkingMode: 'generation',
    });
    expect(normalizeDesignAgentConfig({ agentRole: 'design_reviewer' })).toEqual({
      agentRole: 'design_reviewer',
      outputArtifactType: 'DesignReview',
      thinkingMode: 'review',
    });
  });

  it('builds an industrial-design role prompt for the selected artifact', () => {
    const prompt = buildDesignAgentSystemPrompt({
      agentRole: 'inspiration_analyzer',
      outputArtifactType: 'InspirationAnalysis',
      thinkingMode: 'analysis',
    });
    expect(prompt).toContain('灵感分析');
    expect(prompt).toContain('造型比例');
    expect(prompt).toContain('可迁移设计原则');
    expect(prompt).toContain('不要输出 JSON');
  });

  it('preserves a multi-stage Design Agent chain in the industrial workflow definition', () => {
    const draft: WorkflowRecipeDraft = {
      id: 'design-agent-workflow',
      name: 'Design Agent Workflow',
      description: 'requirement to delivery',
      templateId: 'industrial-design-review',
      languagePolicy: {
        promptLanguage: 'zh-CN',
        visibleTextLanguage: 'zh-CN',
        imageTextLanguage: 'zh-CN',
        allowEnglishTechnicalTerms: true,
      },
      inputs: [{ id: 'product_reference_image', label: '参考图', type: 'image', required: true }],
      strategy: { enabled: false, mode: 'disabled', title: '', prompt: '' },
      outputs: [
        {
          id: 'requirements', title: '需求拆解', type: 'text_agent', enabled: true, order: 1,
          prompt: '拆解需求', inputRoles: ['product_reference_image'], requiresReferenceImages: false, editable: true,
          designAgentConfig: { agentRole: 'requirement_analyzer', outputArtifactType: 'DesignBrief', thinkingMode: 'analysis' },
        },
        {
          id: 'strategy', title: '设计策略', type: 'text_agent', enabled: true, order: 2,
          prompt: '形成策略', inputRoles: ['requirements'], requiresReferenceImages: false, editable: true,
          designAgentConfig: { agentRole: 'design_strategist', outputArtifactType: 'DesignStrategy', thinkingMode: 'analysis' },
        },
        {
          id: 'concept', title: '概念生成', type: 'image_generator', enabled: true, order: 3,
          prompt: '生成概念图', inputRoles: ['product_reference_image', 'strategy'], requiresReferenceImages: true, editable: true,
        },
        {
          id: 'review', title: '方案评审', type: 'text_agent', enabled: true, order: 4,
          prompt: '评审概念', inputRoles: ['concept'], requiresReferenceImages: false, editable: true,
          designAgentConfig: { agentRole: 'design_reviewer', outputArtifactType: 'DesignReview', thinkingMode: 'review' },
        },
        {
          id: 'delivery', title: '交付整理', type: 'text_agent', enabled: true, order: 5,
          prompt: '整理交付', inputRoles: ['review'], requiresReferenceImages: false, editable: true,
          designAgentConfig: { agentRole: 'presentation_writer', outputArtifactType: 'Document', thinkingMode: 'generation' },
        },
      ],
      metadata: { originalRequest: '设计一款产品', createdBy: 'app-agent', editable: true },
    };

    const definition = convertWorkflowDraftToDefinition(
      draft,
      ['reference-node'],
      '设计一款产品',
      'workflow_module',
    );
    const steps = definition.steps as Array<Record<string, unknown>>;
    const textSteps = steps.filter(step => step.type === 'text_agent');
    expect(textSteps.map(step => step.id)).toEqual(['requirements', 'strategy', 'review', 'delivery']);
    expect((textSteps[2]?.designAgentConfig as Record<string, unknown>)?.agentRole).toBe('design_reviewer');
    expect(textSteps[2]?.inputStepIds).toEqual(['concept']);
    expect(steps.find(step => step.id === 'concept')?.textInputStepIds).toEqual(['strategy']);
    expect(definition.executionOrder).toEqual([
      ['product_reference_image'],
      ['requirements'],
      ['strategy'],
      ['concept'],
      ['review'],
      ['delivery'],
    ]);
  });
});
