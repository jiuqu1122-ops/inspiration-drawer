import type { BufferItem, Folder } from '../../types';
import type { CanvasWorkflowTemplate } from '../canvasTemplates';
import { getDrawerFolderPathName } from '../folderModel';
import {
  inferInspirationReferenceRoleFromFolderName,
  searchDrawerInspirations,
  tokenizeDrawerSearchText,
} from '../appAgent/inspirationMemory/drawerSemanticRetrieval';
import type { InspirationCandidate } from '../appAgent/inspirationMemory/types';
import { extractProjectBrief } from '../appAgent/skills/creativeProductDesignSkill';

export const INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID =
  'industrial-design-full-process';

export const INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE =
  '本次未使用额外灵感参考';

export const INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS = {
  references: 'industrial_design_project_references',
  requirements: 'industrial_design_requirement_analysis',
  research: 'industrial_design_research_insights',
  strategy: 'industrial_design_concept_strategy',
  concepts: 'industrial_design_concept_generation',
  review: 'industrial_design_concept_review',
  development: 'industrial_design_concept_development',
  delivery: 'industrial_design_delivery',
} as const;

export const shouldTolerateIndustrialDesignDependencyFailure = (
  nodeId: string,
  dependencyId: string,
) => dependencyId === INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.review
  && (
    nodeId === INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.development
    || nodeId === INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.delivery
  );

export type IndustrialDesignLocalInspirationContext = {
  references: InspirationCandidate[];
  metadataText: string;
  usedExtraReferences: boolean;
};

const compact = (value: unknown, max = 240) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/**
 * Level 0/1 retrieval for the built-in workflow. This deliberately calls the
 * existing metadata search directly: it does not analyze images, invoke an LLM,
 * browse the web, or use drawer images as hidden visual inputs. Relevant
 * medium-confidence matches with at least two concrete feature hits are safe
 * here because only their metadata is passed downstream and the original image
 * is never attached automatically.
 */
export const buildIndustrialDesignLocalInspirationContext = (
  items: BufferItem[],
  projectRequest: string,
  options: { excludeItemIds?: string[]; topK?: number; folders?: Folder[] } = {},
): IndustrialDesignLocalInspirationContext => {
  const query = compact(projectRequest, 1_200);
  const excludedIds = new Set((options.excludeItemIds || []).map(String).filter(Boolean));
  const candidates = query
    ? searchDrawerInspirations(items.filter(item => !excludedIds.has(item.id)), {
      query,
      projectBrief: { ...extractProjectBrief(query) } as Record<string, unknown>,
      folderNames: Object.fromEntries((options.folders || []).map(folder => [
        folder.id,
        getDrawerFolderPathName(options.folders || [], folder.id) || folder.name,
      ])),
      topK: Math.min(8, Math.max(1, Number(options.topK) || 8)),
    })
    : [];
  const directQueryTokens = tokenizeDrawerSearchText(projectRequest);
  const folderMatchesDirectQuery = (candidate: InspirationCandidate) => {
    const folderName = String(candidate.folderName || '').toLowerCase();
    return !!folderName && directQueryTokens.some(token => folderName.includes(token.toLowerCase()));
  };
  const directFolderMatches = candidates.filter(folderMatchesDirectQuery);
  const scopedCandidates = directFolderMatches.length >= 2
    ? candidates.filter(candidate => {
      if (folderMatchesDirectQuery(candidate)) return true;
      const curatedRole = inferInspirationReferenceRoleFromFolderName(candidate.folderName);
      return !!curatedRole
        && curatedRole !== 'SUBJECT_REF'
        && candidate.matchedFeatures.length >= 2;
    })
    : candidates;
  const eligibleCandidates = scopedCandidates
    .filter(candidate => (
      candidate.state === 'selected'
      || (candidate.state === 'candidate' && candidate.matchedFeatures.length >= 2)
    ))
    .filter(candidate => !excludedIds.has(candidate.itemId));
  const references: InspirationCandidate[] = [];
  const selectedIds = new Set<string>();
  const selectedRoles = new Set<string>();
  for (const candidate of eligibleCandidates) {
    if (selectedRoles.has(candidate.recommendedRole)) continue;
    references.push(candidate);
    selectedIds.add(candidate.itemId);
    selectedRoles.add(candidate.recommendedRole);
    if (references.length >= 4) break;
  }
  for (const candidate of eligibleCandidates) {
    if (references.length >= 4) break;
    if (selectedIds.has(candidate.itemId)) continue;
    references.push(candidate);
    selectedIds.add(candidate.itemId);
  }

  if (references.length === 0) {
    return {
      references: [],
      usedExtraReferences: false,
      metadataText: [
        `${INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE}。`,
        '没有从当前灵感抽屉 metadata 中找到可自动采用的高置信度素材。',
        '不要调用外部搜索或网页采集，不要虚构竞品、品牌、型号、销量、价格或市场数据；直接依据原始需求、产品参考图和当前画布输入继续。',
      ].join('\n'),
    };
  }

  return {
    references,
    usedExtraReferences: true,
    metadataText: [
      '本地灵感参考（仅来自抽屉已有 metadata / InspirationProfile，未重新分析图片，也未把原图接入生成节点）：',
      ...references.map((reference, index) => [
        `${index + 1}. itemId: ${reference.itemId}`,
        reference.folderName ? `Folder: ${reference.folderName}` : '',
        `Role: ${reference.recommendedRole}`,
        `Summary: ${compact(reference.summary, 180)}`,
        reference.matchedFeatures.length > 0
          ? `Matched features: ${reference.matchedFeatures.map(feature => compact(feature, 48)).join('、')}`
          : '',
        `Reason: ${compact(reference.reason, 220)}`,
      ].filter(Boolean).join('\n')),
      '只迁移上述有证据的设计原则，不复制具体产品；这些条目不是视觉上游，只有用户在画布中显式连线的图片才是视觉参考。',
      '不得补充 metadata 中不存在的品牌、型号或市场事实。',
    ].join('\n\n'),
  };
};

export const buildIndustrialDesignRuntimeContextText = (input: {
  projectRequest: string;
  connectedInputLabels?: string[];
  localInspirationContext: IndustrialDesignLocalInspirationContext;
}) => [
  'Original request:',
  compact(input.projectRequest, 2_400)
    || '未提供单独文字需求；仅依据已连接的产品参考图和当前画布输入。',
  'Connected canvas inputs:',
  (input.connectedInputLabels || []).slice(0, 12).map((label, index) => (
    `${index + 1}. ${compact(label, 120)}`
  )).join('\n') || '无',
  input.localInspirationContext.metadataText,
].filter(Boolean).join('\n\n');

const LOCAL_ONLY_POLICY = `资料边界（必须遵守）：
- 只使用用户原始需求、已连接的产品参考图、当前画布输入，以及上游明确提供的本地灵感 metadata。
- 抽屉检索结果只作为 metadata 参考线索，不等于原图视觉输入；只有画布中显式连接的图片可以作为视觉上游。
- 不调用外部搜索，不打开网页采集器，不要求补做全库图片分析；已有 InspirationProfile 直接复用。
- 不虚构竞品、品牌、型号、销量、价格、趋势或市场统计；缺少证据时标记“未知/待确认”。
- 如果上游写有“${INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE}”，必须保留这个事实，并直接依据需求和产品参考图继续。`;

const REQUIREMENT_PROMPT = `执行工业设计全流程的“需求拆解”阶段。

把 Original request 与已连接输入整理成 DesignBrief，至少包含：
- 产品类型与核心功能
- 目标用户、使用场景和使用动作
- 设计阶段与输出目标
- 功能、人机、结构、制造、尺寸和安全约束
- 风格、材质、色彩倾向
- 必须保留项、禁止方向
- 已知事实、合理推断、待确认项（严格分开）

产品参考图只能用于读取可见的品类、轮廓、比例、功能布局和 CMF 证据；不要从图片猜测品牌、型号、内部结构或市场表现。

${LOCAL_ONLY_POLICY}`;

const RESEARCH_PROMPT = `执行工业设计全流程的“调研洞察”阶段。

输入包括 DesignBrief、产品/画布参考图，以及运行前注入的本地灵感 metadata。输出 ResearchReport：
1. 输入资料清单与证据边界；
2. 产品参考图的可见轮廓、比例、结构、交互和 CMF 特征；
3. 本地灵感的可迁移原则，并为每项保留 FORM_REF / CMF_REF / STRUCTURE_REF / INTERACTION_REF / MOOD_REF / SUBJECT_REF 角色；
4. 用户需求与现有输入之间的机会点、冲突、风险和待验证假设；
5. Design Reference Plan，仅列真正采用的本地参考。

没有可采用的本地素材时，明确写“${INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE}”，不要用常识伪装成真实竞品调研。

${LOCAL_ONLY_POLICY}`;

const STRATEGY_PROMPT = `执行“概念生成”的设计策略子阶段。

依据 DesignBrief 和 ResearchReport 输出 DesignStrategy，提出 3 个真正差异化的工业设计概念方向。每个方向必须说明：
- 设计意图和目标场景
- 轮廓架构、比例与姿态
- 主体体块和曲面语言
- 功能分区、交互与人机逻辑
- 结构/制造可信度
- CMF 逻辑
- 使用了哪些本地参考角色，以及只迁移什么原则
- 风险、取舍和验证方式
- 可直接传给图片生成节点的视觉描述

三个方向至少在轮廓架构、体块组织、功能分区、曲面语言、CMF 逻辑中的三项不同；只换颜色不算不同方向。

${LOCAL_ONLY_POLICY}`;

const CONCEPT_GENERATION_PROMPT = `生成工业设计“概念方向探索板”。

严格执行上游 DesignBrief、ResearchReport 与 DesignStrategy。连接的用户产品图是 SUBJECT_REF；本地灵感 metadata 只能按照 ResearchReport 中的角色贡献指定特征，禁止把未连接的抽屉图片当作视觉输入，也禁止融合成拼贴或复制某个现有产品。

输出一张 16:9 横版工业设计概念板，在同一画布中清楚展示 3 个差异化方向：
- 每个方向拥有不同的轮廓架构、体块组织和功能分区；去掉颜色后仍可区分。
- 产品类型、核心功能和用户约束一致，结构、人机、接缝、按键、接口、通风和材质边界可信。
- 使用统一的中性棚拍背景、清楚三季度视角和一致尺度；允许少量局部细节视图。
- 不生成品牌 Logo、虚假参数、乱码说明、网页截图或竞品名称。

如果没有额外灵感参考，只依据原始需求和用户产品参考图进行原创设计，不降低流程完整性。

${LOCAL_ONLY_POLICY}`;

const REVIEW_PROMPT = `执行“方案深化”的评审子阶段。

对概念探索图中的方向进行 DesignReview：
- 按需求匹配、可识别轮廓、比例、人机、功能布局、结构/制造可信度、CMF、差异化和参考保真逐项评审；
- 选择一个最值得深化的方向；若需要综合，只能组合有兼容逻辑的优点，不得生成第四个无依据方向；
- 明确要保留的设计 DNA、要修正的 2-3 个最高优先级问题、不可改变项和深化验收标准；
- 输出可直接驱动下一张深化图的精确修改指令。

只评价可见证据和上游资料，不编造市场反馈、测试数据或工程参数。

${LOCAL_ONLY_POLICY}`;

const DEVELOPMENT_PROMPT = `生成工业设计“方案深化板”。

把上游概念探索图作为 BASE/主视觉依据，严格执行 DesignReview 选中的方向和修改优先级；用户产品参考图用于保持品类、功能与必须保留项，本地灵感 metadata 仅按已分配角色提供局部原则。
如果 DesignReview 因超时或渠道故障不可用，必须根据 DesignStrategy 与概念探索图独立选择完成度最高、最符合需求的方向继续深化，不得停止生成。

输出一张精致的 16:9 横版四分区工业设计展示板：
- 左上：最大权重的最终三季度主视图；
- 右上：正面、侧面或背面补充视角；
- 左下：使用、人机或功能布局视图；
- 右下：CMF、接缝、按键、接口、握持、通风或材质过渡细节。

四个区域必须是同一产品、同一比例、同一 CMF 和一致光照。几何、壁厚、装配边界、接触阴影和材质粗糙度可信。不要随机装饰、过度灯效、品牌 Logo、虚假参数、乱码或水印。

${LOCAL_ONLY_POLICY}`;

const DELIVERY_PROMPT = `执行工业设计全流程的“交付整理”阶段。

把上游 DesignBrief、ResearchReport、DesignStrategy、DesignReview 和最终深化图整理成可复制交付的 Markdown Document，包含：
如果 DesignReview 不可用但方案深化图已生成，以 DesignStrategy 和方案深化图为准继续交付，并明确标注评审环节使用了自动降级。
1. 项目目标与需求摘要；
2. 资料边界与参考使用情况；
3. Design Reference Plan（itemId、role、reason；没有时写“${INDUSTRIAL_DESIGN_FULL_PROCESS_NO_EXTRA_REFERENCE}”）；
4. 概念方向与选择依据；
5. 最终方案的造型、结构/交互、CMF 和场景说明；
6. 已解决问题、剩余风险和待确认项；
7. 下一步建议与交付清单。

不得把推断写成已验证事实，不添加上游没有支持的品牌、竞品、型号、市场数据或工程参数。

${LOCAL_ONLY_POLICY}`;

export const INDUSTRIAL_DESIGN_FULL_PROCESS_BUILT_IN_WORKFLOW:
  CanvasWorkflowTemplate = {
    id: INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID,
    label: '工业设计全流程｜本地优先',
    hint: '需求拆解 → 本地调研洞察 → 概念生成 → 方案深化 → 交付整理；不使用外部搜索',
    userInput: {
      enabled: true,
      type: 'text',
      label: '设计需求',
      placeholder: '例如：为年轻租房用户设计一款轻量、温暖、便携的桌面投影仪…',
      required: true,
      acceptImages: true,
      acceptFiles: false,
    },
    builtin: true,
    createdAt: 0,
    nodes: [
      {
        id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.references,
        x: 0,
        y: 0,
        width: 320,
        height: 220,
        item: {
          id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.references,
          type: 'text',
          content: '项目上下文将在运行时由用户需求、已连接画布素材与本地灵感 metadata 组成。',
          name: '项目需求与本地参考',
          remark: '可连接需求文字、用户产品图和当前画布相关图片；抽屉参考仅以 metadata 列入参考计划，不会自动添加图片节点',
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: [],
        fixedInput: true,
        textMode: 'plain',
        acceptsExternalInputs: true,
        externalInputTypes: ['text', 'image'],
        outputType: 'text',
      },
      {
        id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.requirements,
        x: 420,
        y: 0,
        width: 480,
        height: 360,
        item: {
          id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.requirements,
          type: 'text',
          content: REQUIREMENT_PROMPT,
          name: '1. 需求拆解',
          remark: '输出 DesignBrief',
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: [INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.references],
        textMode: 'agent',
        designAgentConfig: {
          agentRole: 'requirement_analyzer',
          outputArtifactType: 'DesignBrief',
          thinkingMode: 'analysis',
        },
        outputType: 'text',
      },
      {
        id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.research,
        x: 1000,
        y: 0,
        width: 480,
        height: 390,
        item: {
          id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.research,
          type: 'text',
          content: RESEARCH_PROMPT,
          name: '2. 调研洞察',
          remark: '仅使用当前画布和灵感抽屉已有 metadata',
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: [
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.references,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.requirements,
        ],
        textMode: 'agent',
        designAgentConfig: {
          agentRole: 'inspiration_analyzer',
          outputArtifactType: 'ResearchReport',
          thinkingMode: 'analysis',
        },
        outputType: 'text',
      },
      {
        id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.strategy,
        x: 1580,
        y: 0,
        width: 500,
        height: 420,
        item: {
          id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.strategy,
          type: 'text',
          content: STRATEGY_PROMPT,
          name: '3A. 概念策略',
          remark: '输出三个差异化方向的 DesignStrategy',
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: [
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.references,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.requirements,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.research,
        ],
        textMode: 'agent',
        designAgentConfig: {
          agentRole: 'design_strategist',
          outputArtifactType: 'DesignStrategy',
          thinkingMode: 'analysis',
        },
        outputType: 'text',
      },
      {
        id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.concepts,
        x: 2180,
        y: 0,
        width: 560,
        height: 720,
        item: {
          id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.concepts,
          type: 'text',
          content: '',
          name: '3B. 概念生成',
          remark: '三方向概念探索板',
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: [
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.references,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.strategy,
        ],
        outputType: 'image',
        ai: {
          type: 'image-generator',
          presetId: 'workflow-industrial-design-full-process-concepts',
          presetLabel: '概念生成',
          presetPrompt: CONCEPT_GENERATION_PROMPT,
          aspectRatio: '16:9',
          outputFormat: 'jpg',
          count: 1,
          status: 'idle',
          outputs: [],
          skillMeta: {
            workflowTemplateId: INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID,
            workflowStage: 'concept_generation',
            localOnly: true,
            allowExternalSearch: false,
            inspirationRetrieval: 'metadata-only',
          },
        },
      },
      {
        id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.review,
        x: 2840,
        y: 0,
        width: 500,
        height: 410,
        item: {
          id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.review,
          type: 'text',
          content: REVIEW_PROMPT,
          name: '4A. 方案评审',
          remark: '选择并定义深化方向',
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: [
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.requirements,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.research,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.strategy,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.concepts,
        ],
        textMode: 'agent',
        designAgentConfig: {
          agentRole: 'design_reviewer',
          outputArtifactType: 'DesignReview',
          thinkingMode: 'review',
        },
        outputType: 'text',
      },
      {
        id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.development,
        x: 3440,
        y: 0,
        width: 560,
        height: 720,
        item: {
          id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.development,
          type: 'text',
          content: '',
          name: '4B. 方案深化',
          remark: '最终四分区工业设计展示板',
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: [
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.concepts,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.review,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.references,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.requirements,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.research,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.strategy,
        ],
        outputType: 'image',
        ai: {
          type: 'image-generator',
          presetId: 'workflow-industrial-design-full-process-development',
          presetLabel: '方案深化',
          presetPrompt: DEVELOPMENT_PROMPT,
          aspectRatio: '16:9',
          outputFormat: 'jpg',
          count: 1,
          status: 'idle',
          outputs: [],
          skillMeta: {
            workflowTemplateId: INDUSTRIAL_DESIGN_FULL_PROCESS_WORKFLOW_ID,
            workflowStage: 'concept_development',
            localOnly: true,
            allowExternalSearch: false,
            inspirationRetrieval: 'metadata-only',
          },
        },
      },
      {
        id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.delivery,
        x: 4100,
        y: 0,
        width: 520,
        height: 440,
        item: {
          id: INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.delivery,
          type: 'text',
          content: DELIVERY_PROMPT,
          name: '5. 交付整理',
          remark: '输出最终设计交付文档',
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: [
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.requirements,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.research,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.strategy,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.review,
          INDUSTRIAL_DESIGN_FULL_PROCESS_NODE_IDS.development,
        ],
        textMode: 'agent',
        designAgentConfig: {
          agentRole: 'presentation_writer',
          outputArtifactType: 'Document',
          thinkingMode: 'generation',
        },
        outputType: 'text',
      },
    ],
  };
