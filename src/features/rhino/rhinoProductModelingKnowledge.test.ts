import { describe, expect, it } from 'vitest';
import skill from './skills/rhino-product-modeling/SKILL.md?raw';
import { buildRhinoProductModelingInstruction, readRhinoModelingSkillResource, RHINO_MODELING_INTENT_GATE, RHINO_MODELING_SKILL_RESOURCE_PATHS, RHINO_MODELING_SKILL_RESOURCE_TOOL, RHINO_PRODUCT_MODELING_INSTRUCTION, RHINO_REFERENCE_IMAGE_ANALYSIS_INSTRUCTION, rhinoModelingSkillResourceTool } from './rhinoProductModelingKnowledge';
import { buildRhinoWorkflowInstruction } from './rhinoWorkflow';

describe('bundled user-provided Rhino product modeling Skill', () => {
  it('embeds the supplied complete SKILL.md rather than the superseded local runbook', () => {
    expect(RHINO_PRODUCT_MODELING_INSTRUCTION).toBe(skill.trim());
    expect(RHINO_PRODUCT_MODELING_INSTRUCTION).toContain('## 1 确认输入与环境');
    expect(RHINO_PRODUCT_MODELING_INSTRUCTION).toContain('references/modeling-methods.md');
    expect(RHINO_PRODUCT_MODELING_INSTRUCTION).toContain('references/acceptance.md');
    expect(RHINO_PRODUCT_MODELING_INSTRUCTION).toContain('assets/acceptance-report-template.md');
    expect(RHINO_PRODUCT_MODELING_INSTRUCTION).not.toContain('RHINO_PRODUCT_MODELING_METHOD_V2');
  });

  it('keeps semantic task analysis general and never chooses a route from product keywords', () => {
    for (const brief of ['Design a handle', 'Design a supercar', '设计未知产品', '只分析，不要建模']) {
      const instruction = buildRhinoProductModelingInstruction(brief);
      expect(instruction).toContain(RHINO_MODELING_INTENT_GATE);
      expect(instruction).toContain('product names and surfacing keywords are not triggers');
      expect(instruction).toContain('Attachments alone do not authorize edits');
      expect(instruction).toContain(skill.trim());
      expect(instruction).toContain(RHINO_MODELING_SKILL_RESOURCE_TOOL);
    }
  });

  it('requires inspecting actual image pixels before a reference-driven modeling route is selected', () => {
    expect(buildRhinoProductModelingInstruction('按这个做', { hasReferenceImage: true })).toContain(RHINO_REFERENCE_IMAGE_ANALYSIS_INSTRUCTION);
    expect(RHINO_REFERENCE_IMAGE_ANALYSIS_INSTRUCTION).toContain('all received image pixels');
    expect(buildRhinoProductModelingInstruction('按这个做')).not.toContain(RHINO_REFERENCE_IMAGE_ANALYSIS_INSTRUCTION);
  });

  it('exposes only fixed bundled Markdown resources and rejects arbitrary paths', () => {
    expect(RHINO_MODELING_SKILL_RESOURCE_PATHS).toEqual([
      'references/modeling-methods.md',
      'references/acceptance.md',
      'references/automotive-case.md',
      'references/tutorial-synthesis.md',
      'assets/project-record-template.md',
      'assets/acceptance-report-template.md',
    ]);
    expect(rhinoModelingSkillResourceTool.function.name).toBe(RHINO_MODELING_SKILL_RESOURCE_TOOL);
    expect(rhinoModelingSkillResourceTool.function.parameters).toMatchObject({ required: ['resourcePath'], additionalProperties: false });
    expect(readRhinoModelingSkillResource('references/modeling-methods.md').content).toContain('NetworkSrf');
    expect(readRhinoModelingSkillResource('assets/acceptance-report-template.md').content).toContain('未验证');
    for (const path of ['../SKILL.md', 'C:/Users/user/.ssh/id_rsa', '/etc/passwd', 'references/../SKILL.md', null]) {
      expect(() => readRhinoModelingSkillResource(path)).toThrow('Unknown bundled Rhino modeling Skill resource');
    }
  });

  it('loads the whole Skill in Rhino workflows and makes related references available on demand', () => {
    const instruction = buildRhinoWorkflowInstruction('继续');
    expect(instruction).toContain(skill.trim());
    expect(instruction).toContain('RHINO_MODELING_INTENT_GATE_V4');
    expect(instruction).toContain(RHINO_MODELING_SKILL_RESOURCE_TOOL);
    expect(instruction).toContain('Never repeat a successful write');
    expect(instruction).not.toContain('RHINO_PRODUCT_MODELING_METHOD_V2');
  });
});