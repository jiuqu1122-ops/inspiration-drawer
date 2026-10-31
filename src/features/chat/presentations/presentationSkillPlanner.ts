export type PresentationDesignSkill =
  | 'product-research'
  | 'research'
  | 'product-proposal'
  | 'executive-brief'
  | 'comparison'
  | 'visual-concept'
  | 'technical-explainer'
  | 'general-story';
export type PresentationDesignPlan = { skill: PresentationDesignSkill; title: string; guidance: string[]; preferredLayouts: string[] };
const categories = [
  { skill: 'product-research', pattern: /(?:调研|研究|竞品|用户研究|行业分析).{0,40}(?:产品|工业设计|工业品|设备|硬件|消费品)|(?:产品|工业设计|工业品|设备|汽车|硬件|消费品).{0,40}(?:调研|研究|竞品)/i,
    guidance: ['围绕真实研究问题讲述：结论 → 证据与来源 → 竞品比较 → 用户/场景 → 设计机会 → 建议。', '产品图和 AI 图只作视觉参考；竞品特征、材料参数和市场数据必须有来源，无来源就标注待验证。', '优先安排 insight、comparison、process、image-right、grid；不要把搜索摘要逐段复制成页面。'] },
  { skill: 'comparison', pattern: /(?:比较|对比|选型|评估).{0,35}(?:方案|产品|供应商|竞品|版本|方向|配置)|(?:compare|comparison|versus|vs\.)/i,
    guidance: ['先建立相同评价维度，再并列呈现差异、权衡和选择条件。', '只有来源支持的参数进入表格或数字页；缺失值写待确认，不填猜测数字。', '结构化双方案用 comparison，多项目用 grid，不把两段长文伪装成比较。'] },
  { skill: 'executive-brief', pattern: /(?:汇报|经营|季度|月度|年度|复盘|董事会|管理层|决策|执行摘要|业绩)/i,
    guidance: ['结论和需要的决策先行；每页一个事实或行动，减少过程性长段落。', '只将有来源的指标放进 metrics；注明口径与时间范围，不能从示例中补数字。', '优先 insight、metrics、comparison，行动建议用 statement 或 process；给图表留足空间。'] },
  { skill: 'technical-explainer', pattern: /(?:技术|架构|系统|工程|流程|API|工作原理|技术方案|部署|开发)/i,
    guidance: ['按问题 → 原理 → 组件/数据流 → 流程 → 风险 → 部署或验证来组织。', '对结构、步骤使用原生可编辑框线和流程图，而不是生一张不能核验的“技术图”。', '优先 process、comparison 与少量说明页，技术图使用 elements 中的原生图元。'] },
  { skill: 'visual-concept', pattern: /(?:概念提案|设计提案|视觉方向|创意方向|品牌方向|概念方案|设计方案|风格探索)/i,
    guidance: ['围绕设计命题、灵感原则、概念、形态语言、材质色彩、场景及验证展开。', '内容确需视觉示意、且用户允许时，可用已提供的图片或 AI 生图；AI 图须标成概念示意，不是实物或事实证据；如需方案板或排版方向，可生成单张横版视觉素材，但 PPT 文字、图形和数据仍须保持可编辑。', '优先 image-left、image-right、statement、grid、comparison；少用长列表，给主视觉和标题建立明确层级。'] },
  { skill: 'product-proposal', pattern: /(?:产品|功能|服务).{0,20}(?:提案|规划|路线图|方案)|(?:product).{0,20}(?:proposal|roadmap|pitch)/i,
    guidance: ['先定义目标用户和问题，再以证据说明产品机会、核心体验、方案权衡和实施顺序。', '方案承诺与已验证事实分开，成本、收益和时间没有来源时标注待确认。', '优先 insight、grid、process 和 comparison，以原生可编辑流程说明体验。'] },
  { skill: 'research', pattern: /(?:研究|调研|调查|分析|报告|白皮书|市场研究|行业研究)/i,
    guidance: ['先明确研究问题和执行结论，再展示方法、证据、差异、局限和行动建议。', '引用只来自用户材料和本轮真实搜索结果，缺失部分明确写待确认。', '优先用 statement、insight、comparison、metrics（仅有来源数据时）与简洁结论页。'] },
] as const;
type StoryBeat = { layout: string; objective: string };

const storyArcs: Record<PresentationDesignSkill, StoryBeat[]> = {
  'product-research': [
    { layout: 'cover', objective: '研究对象、核心问题与一个明确的视觉锚点' },
    { layout: 'statement', objective: '关键研究问题或决策，不用空泛标题' },
    { layout: 'insight', objective: '现有证据支持什么、还缺什么证据' },
    { layout: 'comparison', objective: '按共同维度比较真实案例；缺项写待验证' },
    { layout: 'grid', objective: '用户、任务、触点或设计维度的研究框架' },
    { layout: 'process', objective: '研究方法、原型验证或证据收集流程' },
    { layout: 'image-right', objective: '仅引用真实可用的图片 ID；无图时改用 insight + 原生示意图' },
    { layout: 'insight', objective: '由证据推导出的设计机会与边界' },
    { layout: 'two-column', objective: '方案方向、收益与代价的并列权衡' },
    { layout: 'statement', objective: '优先建议、下一步验证和未决问题' },
  ],
  research: [
    { layout: 'cover', objective: '研究主题、受众和核心结论的视觉入口' },
    { layout: 'statement', objective: '研究问题与结论先行' },
    { layout: 'insight', objective: '关键发现及其来源/证据' },
    { layout: 'comparison', objective: '相同口径下的对象、时期或方案对比' },
    { layout: 'grid', objective: '方法、范围、变量或主题分类' },
    { layout: 'process', objective: '研究过程与分析步骤' },
    { layout: 'content', objective: '证据、局限和仍待确认的内容' },
    { layout: 'insight', objective: '从证据到结论的推导' },
    { layout: 'two-column', objective: '结论、影响与适用边界' },
    { layout: 'statement', objective: '行动建议与后续研究' },
  ],
  comparison: [
    { layout: 'cover', objective: '比较对象与决策场景' },
    { layout: 'statement', objective: '要做出的选择或核心问题' },
    { layout: 'grid', objective: '统一的评价维度和判断标准' },
    { layout: 'comparison', objective: '第一组对象在同一维度上的差异' },
    { layout: 'comparison', objective: '第二组重要差异或权衡；不得重复上一页' },
    { layout: 'insight', objective: '适用场景、风险及关键取舍' },
    { layout: 'content', objective: '证据缺口和需确认的参数' },
    { layout: 'statement', objective: '条件化建议：何种目标适合何种选项' },
  ],
  'executive-brief': [
    { layout: 'cover', objective: '主题、周期/范围（仅当已知）与简洁视觉' },
    { layout: 'statement', objective: '先给结论与需要的决策' },
    { layout: 'metrics', objective: '仅展示有来源、口径和时间范围的真实指标；否则改 insight' },
    { layout: 'insight', objective: '最重要变化及其证据' },
    { layout: 'comparison', objective: '目标/实际或前后对比；无可信数字则比较定性事实' },
    { layout: 'grid', objective: '关键驱动因素、风险或工作流' },
    { layout: 'process', objective: '责任清晰的行动步骤' },
    { layout: 'statement', objective: '决策请求、负责人或下一步（只填已知信息）' },
  ],
  'technical-explainer': [
    { layout: 'cover', objective: '系统/问题及技术视觉锚点' },
    { layout: 'statement', objective: '要解决的问题和约束' },
    { layout: 'grid', objective: '主要组件及职责' },
    { layout: 'process', objective: '数据、请求或控制流' },
    { layout: 'image-right', objective: '仅引用真实可用的架构图附件；无图时改用原生示意图' },
    { layout: 'comparison', objective: '备选方案、取舍与选择依据' },
    { layout: 'insight', objective: '失效模式、安全或性能边界' },
    { layout: 'process', objective: '部署、验证或回滚步骤' },
    { layout: 'statement', objective: '结论与待验证事项' },
  ],
  'visual-concept': [
    { layout: 'cover', objective: '概念命题、设计语气与强主视觉' },
    { layout: 'statement', objective: '设计机会与目标人群/场景' },
    { layout: 'grid', objective: '形态、交互、材质或色彩原则' },
    { layout: 'image-right', objective: '优先使用获准的真实参考或标注为概念的 AI 图；无图时用相关原生矢量构图' },
    { layout: 'comparison', objective: '差异明确的设计方向及权衡' },
    { layout: 'process', objective: '从概念到原型的验证流程' },
    { layout: 'insight', objective: '场景体验与可验证的设计假设' },
    { layout: 'two-column', objective: '推荐方向、风险与待确认问题' },
    { layout: 'statement', objective: '设计原则与下一轮验证重点' },
  ],
  'product-proposal': [
    { layout: 'cover', objective: '产品机会、目标用户与视觉锚点' },
    { layout: 'statement', objective: '用户问题及提案承诺' },
    { layout: 'insight', objective: '问题证据和当前体验缺口' },
    { layout: 'grid', objective: '核心能力与用户收益' },
    { layout: 'process', objective: '关键交互/服务流程' },
    { layout: 'comparison', objective: '方案差异、成本或风险（只用已知信息）' },
    { layout: 'image-right', objective: '仅使用实际可用的产品图或概念示意；无图时用原生结构图' },
    { layout: 'insight', objective: '可行性假设与验证方式' },
    { layout: 'statement', objective: '实施顺序与下一步' },
  ],
  'general-story': [
    { layout: 'cover', objective: '主题和吸引注意的视觉锚点' },
    { layout: 'statement', objective: '核心问题或主张' },
    { layout: 'insight', objective: '第一个关键发现及依据' },
    { layout: 'comparison', objective: '重要对照、变化或选择' },
    { layout: 'process', objective: '过程、因果或演进' },
    { layout: 'grid', objective: '关键要点或分类' },
    { layout: 'insight', objective: '综合洞见及影响' },
    { layout: 'statement', objective: '结论与行动' },
  ],
};

const makeStoryboardGuidance = (skill: PresentationDesignSkill, count: number) => {
  const arc = storyArcs[skill];
  const beats = count === 1
    ? [{ layout: 'statement', objective: '在一页内直接给出主题、关键结论、证据和行动，不单独制作封面' }]
    : Array.from({ length: count }, (_, index) => {
      if (index === 0) return arc[0];
      if (index === count - 1) return arc[arc.length - 1];
      const position = count <= arc.length
        ? Math.round(index * (arc.length - 1) / (count - 1))
        : 1 + Math.floor((index - 1) * (arc.length - 2) / (count - 2));
      const beat = arc[position];
      return count <= arc.length ? beat : {
        ...beat,
        objective: `${beat.objective}（第 ${index + 1} 页的独立证据/子主题，不复用上一页结论）`,
      };
    });
  return `内容节拍建议（${count} 页；只约束叙事任务，不是固定模板）：${beats.map((beat, i) => `${i + 1}.${beat.objective}`).join('；')}。根据本页素材和全篇视觉方向自行选择不同 layout；可合并、替换或调整节奏，但保留关键证据与结论。`;
};
export const planPresentationDesign = (brief: string): PresentationDesignPlan => {
  const text = brief.trim();
  const selected = categories.find(entry => entry.pattern.test(text)) || {
    skill: 'general-story' as const,
    guidance: ['将材料整理成面向目标受众的清晰故事：背景/问题 → 关键发现 → 可执行结论。', '只展示简短支持信息，避免长段落与仅换标题的重复页面。', '根据内容交替选择 insight、comparison、process、image-right、grid 和简短 content。'],
  };
  const requestedCount = text.match(/(?:^|\D)(\d{1,3})\s*(?:页|张(?:幻灯片)?|slides?)(?![a-z])/i)?.[1];
  const count = requestedCount ? Math.max(1, Math.min(40, Number(requestedCount))) : 10;
  const pageGuidance = requestedCount
    ? Number(requestedCount) > 40
      ? '单次最多 40 页；用户要求超出上限时先说明限制，压缩为不超过 40 页，不声称已满足原页数。'
      : Number(requestedCount) < 1
        ? '至少需要 1 页；用户要求为 0 页时先说明限制。'
        : `遵从用户指定的 ${count} 页；必要时清晰压缩，而不是偷偷扩页。`
    : `默认制作约 8–12 页；本轮建议 ${count} 页，只有有效内容较少时才缩短到 5–7 页，不通过拆句凑页。`;
  return {
    skill: selected.skill,
    title: `自动设计路线：${selected.skill}`,
    guidance: [
      pageGuidance,
      makeStoryboardGuidance(selected.skill, count),
      ...selected.guidance,
      '研究对象、使用场景与资料范围以当前会话中用户明确表达的需求为准；本轮澄清仅用于本轮任务，不成为其他会话或用户的默认偏好。存在会改变检索对象或比较口径的歧义时先询问，不自行选定领域、品牌、案例或产品。证据不足时如实说明并缩小结论范围，不用“待验证”凑成完整调研。',
      '输出前逐页校对原生契约：metrics 使用 2–4 项且每项 value 有真实来源；comparison 恰好 2 项；process 使用 3–5 项；grid 使用 3–6 项。每个 slides[i] 必须是一张完整最终页，不要让 writer 自动分页；标题精炼，副标题最多两行；正文控制在 2–4 条短证据或 45–80 字，细节放 notes，不在标题区堆长段落。相邻页面不得重复标题。',
      '没有真实图片 ID 时，不选择 image-left/image-right；改用 insight、statement 或可编辑原生示意图。elements 按每页实际构图与安全区域安放，不固定在封面右侧，不遮挡标题、正文和来源。',
      '每份输出都必须填写 theme 和 designStyle；用户本轮风格/品牌/颜色要求优先。未指定时按本次内容重新选择 editorial、technical、minimal、cinematic、brutalist、soft 或 custom，并配套选择 light/dark/warm/mono/vivid/pastel 与协调的强调色；不要固定回退到同一套蓝白 editorial。逐页至少填写 layout、title；有洞见时填写 takeaway，有比较/步骤/分类时使用 items，图示需要时填写 elements。不要省略 layout 让 writer 猜版式；指标没有来源时改用 insight，不要编造数字。',
      '先在内部规划每页一个独立任务和支持证据，再生成页面；不同类型页面采用真正不同的视觉结构。',
      '视觉系统在整套内一致，但封面、洞见、证据、比较、流程和收尾的构图可以显著不同；按本次视觉方向使用字体层级、留白、图片裁切、色块、边线和图形语汇，不要只通过换主题色伪装风格变化，也不要每页套同一标题+列表模板。',
      '设计类调研优先用真实附件或获准的 AI 概念图；没有视觉素材时仍用原生矢量构图建立层级，不能退化为重复白底文字页。不编造来源、数字、产品外观或引用。',
      '整套采用连贯的 typography/配色/图元系统，但不要每页重复同一条色线、页眉、底线和白底文字框。需要突破固定标题位置或封面构图时选 canvas：全部可见内容使用 text/rect/ellipse/line 图元，title 仅为页名且须由 text 图元显示，渲染器不再叠加标题或页码；不要混用模板正文与 items。',
      '用可编辑文本、原生矢量、图片与留白建立层次；不使用整页图片，不编造事实、数据或引用。',
      'Skill 自动匹配，不向用户询问类别或显示技能选择器；以用户本轮要求优先。',
    ],
    preferredLayouts: storyArcs[selected.skill].map(beat => beat.layout),
  };
};
