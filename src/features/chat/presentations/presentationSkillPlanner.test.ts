import { describe, expect, it } from 'vitest';
import { planPresentationDesign } from './presentationSkillPlanner';
describe('automatic invisible PPT design skills', () => {
  it.each([
    ['帮我做一个产品外观设计调研，并做一份调研Ppt', 'product-research'],
    ['制作一份市场研究报告', 'research'],
    ['帮我比较两套产品方案', 'comparison'],
    ['做一份公司季度经营汇报', 'executive-brief'],
    ['解释一下软件系统技术架构', 'technical-explainer'],
    ['帮我做一个品牌视觉概念提案', 'visual-concept'],
    ['介绍下这个主题', 'general-story'],
    ['制作公司季度经营分析报告PPT', 'executive-brief'],
    ['制作技术架构研究报告PPT', 'technical-explainer'],
    ['做一份产品提案PPT', 'product-proposal'],
    ['做一份产品概念设计提案PPT', 'visual-concept'],
  ] as const)('selects the internal skill based on the brief, with no user picker: %s', (brief, skill) => {
    const plan = planPresentationDesign(brief);
    expect(plan.skill).toBe(skill);
    expect(plan.guidance.join(' ')).toContain('自动匹配');
    expect(plan.guidance.join(' ')).not.toContain('PPT types from closed source');
  });
  it('respects the requested page count or uses a restrained default', () => {
    expect(planPresentationDesign('制作一份产品调研PPT，10页').guidance[0]).toContain('10 页');
    expect(planPresentationDesign('总结成 5 slides').guidance[0]).toContain('5 页');
    expect(planPresentationDesign('制作一份技术方案 PPT').guidance[0]).toContain('8–12 页');
  });
  it('injects an explicit page-by-page storyboard and requires layout selection', () => {
    const plan = planPresentationDesign('帮我做一个产品外观设计调研，并做一份调研Ppt，10页');
    const guidance = plan.guidance.join('\n');
    expect(guidance).toContain('内容节拍建议（10 页');
    expect(guidance).toContain('1.研究对象');
    expect(guidance).toContain('4.按共同维度比较真实案例');
    expect(guidance).toContain('10.优先建议');
    expect(guidance).toContain('不是固定模板');
    expect(guidance).not.toContain('1.cover=');
    expect(planPresentationDesign('制作一份季度汇报PPT').guidance.join(' ')).toContain('有来源、口径和时间范围的真实指标');
  });

  it('keeps every requested page explicit, with one cover and a real closing task', () => {
    const text = planPresentationDesign('制作 40 页研究 PPT').guidance[1];
    expect(text).toContain('内容节拍建议（40 页');
    expect(text).not.toContain('.cover=');
    expect(text).toContain('40.');
    expect(text).not.toContain('40.statement=');
    for (let i = 1; i <= 40; i++) expect(text).toContain(`${i}.`);
    expect(planPresentationDesign('做 1 页 PPT').guidance[1]).toContain('1.在一页内直接给出主题');
  });

  it('does not silently exceed the native requested-slide limit or leave damaged prompts', () => {
    const oversized = planPresentationDesign('做 100 页 PPT');
    expect(oversized.guidance[0]).toContain('先说明限制');
    expect(oversized.guidance[1]).toContain('40 页');
    expect(planPresentationDesign('做 0 页 PPT').guidance[0]).toContain('至少需要 1 页');
    for (const brief of ['方向盘产品调研', '季度汇报', '产品概念提案', '技术架构']) {
      const guidance = planPresentationDesign(brief).guidance.join(' ');
      expect(guidance).not.toMatch(/\?{3,}|\uFFFD/);
      expect(guidance).not.toMatch(/image-focus|next-steps|technical diagrams/);
      expect(guidance).toContain('metrics 使用 2–4 项');
      expect(guidance).toContain('没有真实图片 ID');
      expect(guidance).toContain('不固定在封面右侧');
      expect(guidance).toContain('不要固定回退到同一套蓝白 editorial');
    }
  });

  it('prevents making AI concept illustrations look like real evidence', () => {
    const plan = planPresentationDesign('产品概念提案');
    expect(plan.guidance.join(' ')).toContain('概念示意');
    expect(plan.guidance.join(' ')).toContain('不编造来源');
  });
});


describe('research scope is not a hardcoded product route', () => {
  const brief = (topic: string) => `制作一份${topic}的工业设计调研PPT`;
  it('provides the same neutral methodology for ambiguous, simulated, real and unrelated product research', () => {
    const subjects = ['欧卡方向盘', '模拟器方向盘', '实车方向盘', '家用咖啡机'];
    const plans = subjects.map(subject => planPresentationDesign(brief(subject)));
    for (const plan of plans) {
      expect(plan.skill).toBe('product-research');
      expect(plan.guidance.join('\n')).toContain('以当前会话中用户明确表达的需求为准');
      expect(plan.guidance.join('\n')).toContain('歧义时先询问');
      expect(plan.guidance.join('\n')).not.toMatch(/MOZA|HORI|ETS2|Euro Truck|游戏外设处理|实车处理|truck-simulator|Volvo|Scania/i);
      expect(plan.guidance).toEqual(plans[0].guidance);
    }
  });
  it('does not carry this conversation scope into subsequent briefs', () => {
    const before = planPresentationDesign(brief('实车方向盘'));
    planPresentationDesign(brief('模拟器方向盘'));
    expect(planPresentationDesign(brief('实车方向盘'))).toEqual(before);
  });
});
