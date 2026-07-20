import { describe, expect, it } from 'vitest';
import { buildWorkflowResultCardData } from './workflowResult';

describe('Workflow Result Card data', () => {
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
});
