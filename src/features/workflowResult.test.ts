import { describe, expect, it } from 'vitest';
import {
  buildWorkflowResultCardData,
  normalizeWorkflowResultCardData,
  upsertWorkflowResultMessage,
} from './workflowResult';

describe('Workflow Result Card data', () => {
  it('updates the existing workflow result message as nodes complete', () => {
    const firstResult = buildWorkflowResultCardData({
      workflowId: 'workflow',
      workflowNodeId: 'workflow-node',
      workflowName: '实时工作流',
      status: 'running',
      completedSteps: 1,
      totalSteps: 3,
      textAssets: [{ nodeId: 'brief', title: '需求拆解', content: '第一步完成。' }],
    });
    const firstMessage = {
      id: 'result-message',
      role: 'agent' as const,
      type: 'workflow_result' as const,
      content: firstResult.summary,
      timestamp: 100,
      status: 'completed' as const,
      workflowResult: firstResult,
    };
    const secondResult = buildWorkflowResultCardData({
      workflowId: 'workflow',
      workflowNodeId: 'workflow-node',
      workflowName: '实时工作流',
      status: 'running',
      completedSteps: 2,
      totalSteps: 3,
      textAssets: [
        { nodeId: 'brief', title: '需求拆解', content: '第一步完成。' },
        { nodeId: 'strategy', title: '设计策略', content: '第二步完成。' },
      ],
    });
    const updated = upsertWorkflowResultMessage([firstMessage], {
      ...firstMessage,
      id: 'new-result-message',
      timestamp: 200,
      content: secondResult.summary,
      workflowResult: secondResult,
    });

    expect(updated).toHaveLength(1);
    expect(updated[0]?.id).toBe('result-message');
    expect(updated[0]?.timestamp).toBe(100);
    expect(updated[0]?.workflowResult?.completedSteps).toBe(2);
    expect(updated[0]?.workflowResult?.analysisResults).toHaveLength(2);
    expect(updated[0]?.workflowResult?.status).toBe('running');
    expect(updated[0]?.workflowResult?.summary).toContain('分析中 2/3 个步骤');
    expect(updated[0]?.workflowResult?.nextSteps).not.toContain('检查失败或缺失的节点后重新运行工作流');
  });

  it('classifies DesignStrategy and keeps the remaining text outputs as analysis assets', () => {
    const result = buildWorkflowResultCardData({
      workflowId: 'industrial-design',
      workflowNodeId: 'workflow-node',
      workflowName: '工业设计工作流',
      status: 'success',
      completedSteps: 4,
      totalSteps: 4,
      textAssets: [
        {
          nodeId: 'brief',
          title: '需求拆解',
          content: '目标用户：通勤人群',
          designAgentConfig: { agentRole: 'requirement_analyzer', outputArtifactType: 'DesignBrief' },
        },
        {
          nodeId: 'strategy',
          title: '设计策略',
          content: '采用紧凑体块与暖灰 CMF。',
          designAgentConfig: { agentRole: 'design_strategist', outputArtifactType: 'DesignStrategy' },
        },
      ],
    });

    expect(result.designStrategy?.nodeId).toBe('strategy');
    expect(result.analysisResults.map(asset => asset.nodeId)).toEqual(['brief']);
    expect(result.title).toBe('工业设计工作流');
    expect(result.stages.map(stage => stage.stage)).toEqual(['requirement', 'concept']);
    expect(result.summary).toContain('2 份文本成果');
  });

  it('deduplicates and caps references and removes oversized data URLs', () => {
    const references = Array.from({ length: 10 }, (_, index) => ({
      id: `reference-${index}`,
      itemId: `item-${index}`,
      name: `参考 ${index}`,
      thumbnail: index === 0 ? `data:image/png;base64,${'a'.repeat(100_000)}` : `https://example.com/${index}.jpg`,
    }));
    references.push({ ...references[1], id: 'duplicate' });
    const result = buildWorkflowResultCardData({
      workflowId: 'workflow',
      workflowNodeId: 'node',
      workflowName: '测试工作流',
      status: 'success',
      completedSteps: 1,
      totalSteps: 1,
      inspirationReferences: references,
    });

    expect(result.inspirationReferences).toHaveLength(8);
    expect(result.references).toHaveLength(8);
    expect(result.inspirationReferences[0]?.thumbnail).toBeUndefined();
    expect(new Set(result.inspirationReferences.map(reference => reference.itemId)).size).toBe(8);
  });

  it('extracts next actions from review output without another model call', () => {
    const result = buildWorkflowResultCardData({
      workflowId: 'workflow',
      workflowNodeId: 'node',
      workflowName: '评审工作流',
      status: 'partial',
      completedSteps: 3,
      totalSteps: 4,
      error: '生成节点失败',
      textAssets: [{
        nodeId: 'review',
        title: '方案评审',
        content: '- 下一步：验证握持区域的人机尺寸\n- 建议优化镜头模块与主体的比例',
        designAgentConfig: { agentRole: 'design_reviewer', outputArtifactType: 'DesignReview' },
      }],
    });

    expect(result.nextSteps).toEqual([
      '下一步：验证握持区域的人机尺寸',
      '建议优化镜头模块与主体的比例',
    ]);
    expect(result.status).toBe('partial');
    expect(result.error).toBe('生成节点失败');
  });

  it('aggregates the complete industrial design process into five ordered stages', () => {
    const result = buildWorkflowResultCardData({
      workflowId: 'industrial-design-full-process',
      workflowNodeId: 'workflow-node',
      workflowName: '工业设计全流程｜本地优先',
      status: 'success',
      completedSteps: 7,
      totalSteps: 7,
      textAssets: [
        {
          nodeId: 'industrial_design_requirement_analysis',
          title: '1. 需求拆解',
          content: '目标用户与产品约束。',
          designAgentConfig: { agentRole: 'requirement_analyzer', outputArtifactType: 'DesignBrief' },
        },
        {
          nodeId: 'industrial_design_research_insights',
          title: '2. 调研洞察',
          content: '参考证据与设计机会点。',
          designAgentConfig: { agentRole: 'inspiration_analyzer', outputArtifactType: 'ResearchReport' },
        },
        {
          nodeId: 'industrial_design_concept_strategy',
          title: '3A. 概念策略',
          content: '三个差异化概念方向。',
          designAgentConfig: { agentRole: 'design_strategist', outputArtifactType: 'DesignStrategy' },
        },
        {
          nodeId: 'industrial_design_concept_review',
          title: '4A. 方案评审',
          content: '选择第二个方向继续深化。',
          designAgentConfig: { agentRole: 'design_reviewer', outputArtifactType: 'DesignReview' },
        },
        {
          nodeId: 'industrial_design_delivery',
          title: '5. 交付整理',
          content: '最终方案说明与下一步建议。',
          designAgentConfig: { agentRole: 'presentation_writer', outputArtifactType: 'Document' },
        },
      ],
      inspirationReferences: [{
        id: 'reference-1',
        itemId: 'drawer-item-1',
        name: '暖白磨砂参考',
        thumbnail: 'https://example.com/reference.jpg',
        role: 'CMF_REF',
      }],
      generationResults: [
        {
          id: 'concept-output',
          nodeId: 'industrial_design_concept_generation',
          name: '概念生成',
          mediaType: 'image',
          url: 'https://example.com/concept.jpg',
        },
        {
          id: 'refinement-output',
          nodeId: 'industrial_design_concept_development',
          name: '方案深化',
          mediaType: 'image',
          url: 'https://example.com/refinement.jpg',
        },
      ],
    });

    expect(result.stages.map(stage => stage.stage)).toEqual([
      'requirement',
      'research',
      'concept',
      'refinement',
      'delivery',
    ]);
    expect(result.stages.find(stage => stage.stage === 'concept')?.summary).toContain('视觉结果：概念生成');
    expect(result.stages.find(stage => stage.stage === 'refinement')?.summary).toContain('视觉结果：方案深化');
    expect(result.references).toEqual([{
      id: 'reference-1',
      title: '暖白磨砂参考',
      thumbnail: 'https://example.com/reference.jpg',
      role: 'CMF_REF',
    }]);
    expect(result.media?.map(media => [media.id, media.type])).toEqual([
      ['concept-output', 'image'],
      ['refinement-output', 'image'],
    ]);
  });

  it('normalizes a compact AgentChatMessage workflowResult without legacy arrays', () => {
    const normalized = normalizeWorkflowResultCardData({
      workflowId: 'industrial-design-full-process',
      title: '工业设计成果',
      stages: [
        { stage: 'requirement', title: '需求分析', summary: '需求摘要', nodeId: 'requirement-node' },
        { stage: 'delivery', title: '最终交付', summary: '交付摘要', nodeId: 'delivery-node' },
      ],
      references: [{ id: 'ref', title: '产品参考', role: 'SUBJECT_REF' }],
      media: [{ id: 'image', nodeId: 'delivery-node', type: 'image', url: 'https://example.com/final.jpg' }],
    });

    expect(normalized?.workflowName).toBe('工业设计成果');
    expect(normalized?.stages.map(stage => stage.stage)).toEqual(['requirement', 'delivery']);
    expect(normalized?.analysisResults.map(asset => asset.agentRole)).toEqual([
      'requirement_analyzer',
      'presentation_writer',
    ]);
    expect(normalized?.inspirationReferences[0]?.name).toBe('产品参考');
    expect(normalized?.generationResults[0]?.mediaType).toBe('image');
  });
});
