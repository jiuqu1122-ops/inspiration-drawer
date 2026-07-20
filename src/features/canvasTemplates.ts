import type { BufferItem } from '../types';
import type {
  CanvasAiProvider,
  CanvasImageItem,
  CanvasItemBox,
  DesignAgentConfig,
} from './canvasModel';
import { getCanvasAiNodeAutoSize } from './canvasAiNodeLayout';
import {
  PRODUCT_DETAILS_FIVE_IMAGES_OUTPUT_SPECS,
  PRODUCT_DETAILS_FIVE_IMAGES_STRATEGY_PROMPT,
  PRODUCT_DETAILS_FIVE_IMAGES_WORKFLOW_HINT,
  PRODUCT_DETAILS_FIVE_IMAGES_WORKFLOW_ID,
  PRODUCT_DETAILS_FIVE_IMAGES_WORKFLOW_LABEL,
} from './productDetailsFiveImagesWorkflow';

export type CanvasWorkflowNodeTemplate = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  item: Pick<BufferItem, 'type' | 'content'> & Partial<BufferItem>;
  inputs?: string[];
  fixedInput?: boolean;
  textMode?: CanvasImageItem['textMode'];
  designAgentConfig?: DesignAgentConfig;
  acceptsExternalInputs?: boolean;
  externalInputTypes?: Array<'image' | 'text' | 'video'>;
  outputType?: 'image' | 'image[]' | 'text' | 'video' | 'video[]';
  bridgeType?: 'reference_image';
  ai?: Partial<NonNullable<CanvasImageItem['ai']>>;
};

export type CanvasWorkflowTemplate = {
  id: string;
  label: string;
  hint: string;
  nodes: CanvasWorkflowNodeTemplate[];
  createdAt?: number;
  builtin?: boolean;
};

export type CanvasWorkflowSaveDraft = {
  label: string;
  defaultLabel: string;
  nodes: CanvasWorkflowNodeTemplate[];
  bounds: CanvasItemBox;
  externalInputIds: string[];
  selectedItemIds: string[];
  aiCount: number;
  fixedImageCount: number;
  fixedTextCount: number;
};

export type CanvasWorkflowRuntimeNodeSnapshot = {
  templateId: string;
  item?: Partial<BufferItem>;
  ai?: Partial<NonNullable<CanvasImageItem['ai']>>;
};

export type CanvasWorkflowExpandedGroup = {
  groupId: string;
  templateId: string;
  workflowId: string;
  workflowLabel: string;
  workflowHint: string;
  workflowBuiltin?: boolean;
  module: CanvasImageItem;
  expandedAt: number;
};

export type CanvasAiPromptPreset = {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  count?: number;
};
const INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT = `统一渲染质量与一致性：
- Treat connected image(s) as SUBJECT_REF: preserve silhouette, proportions, key parts, functional layout, CMF boundaries and material logic
- 4k resolution, highly detailed, photorealistic, premium industrial design render
- Physically credible geometry: clean parting lines, realistic wall thickness, subtle micro-bevels, no melted or warped edges
- Controlled studio lighting: coherent key/fill/rim light, natural contact shadows, readable dark areas, no blown highlights
- Accurate materials: correct roughness, reflection, texture scale, translucency or soft-touch finish when applicable
- Camera discipline: natural product photography perspective, 70-100mm lens feel, clear subject hierarchy, important design details not hidden by depth of field
- 输出前自检：同一产品身份一致、结构不漂移、材质可信、边缘干净、背景不抢主体、无乱文字/水印/伪 logo`;

const BUILT_IN_WORKFLOW_QUALITY_FOOTER = `通用工作流质量约束：
- 上游连接图是最高优先级参考。只在当前节点职责内变化，不重设计主体，不随意增删结构、角色、场景或零件。
- 多节点 workflow 必须保持同一主体身份、比例、材质、色彩体系、光线方向和版式节奏；后续节点继承前序节点已经确认的信息。
- 画面要有清晰主次、干净边缘、稳定曝光和可信接触阴影；避免低清、脏噪、过度锐化、塑料蜡感、随机装饰和无意义特效。
- 除非节点明确要求文字或说明栏，不生成可读文字、品牌 logo、水印、虚假参数、认证章、乱码或空白文本框。
- 输出前自检：数量/版式正确，主体一致，关键结构没有漂移，细节真实，构图服务当前节点目标。`;

const appendBuiltInWorkflowQualityPrompt = (prompt: string) => [
  prompt.trim(),
  BUILT_IN_WORKFLOW_QUALITY_FOOTER,
].filter(Boolean).join('\n\n');
export const CANVAS_AI_PROMPT_PRESETS: CanvasAiPromptPreset[] = [
  {
    id: 'product-render',
    label: '产品渲染',
    hint: '自动选择深浅场景',
    aspectRatio: '16:9',
    outputFormat: 'jpg',
    prompt: `基于连接的参考图，为图中产品生成一张可直接用于评审、提案或展示的高级工业设计渲染图。

执行顺序：
1. 先读取 SUBJECT_REF：锁定产品外轮廓、比例、关键零件、按键/接口/开孔、分件线、主色、材质和功能关系。
2. 判断产品类型、价格感、使用环境和情绪气质，再选择浅色或深色渲染场景。
3. 只提升光影、材质、背景层次和摄影质感，不重新设计产品，不添加参考图不存在的功能。

${INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT}

场景选择规则：
- 浅色场景：白色、浅灰、米色或柔和自然光背景；适合浅色产品、生活方式产品、家居小物、医疗/清洁感产品、柔和材质、温暖亲和或清爽高级的产品
- 深色场景：深灰、黑色或暗调渐变背景；适合黑色/深色产品、金属质感、性能感、专业设备、电竞/科技感、力量感或奢华冷峻的产品
- 如果产品没有明显暗调气质，优先使用浅色场景；只有产品本身适合深色氛围时才选择深色场景
- 场景只做简洁背景、台面、地面或柔和空间暗示，不扩展成复杂生活空间，不加入无关道具

视觉要求：
- 产品是绝对主角，场景服务于产品，不喧宾夺主
- 产品占画面约 55%-75%，主体完整清晰，不被裁切，不被景深遮挡关键结构
- 背景在深色或浅色中二选一，并与产品主色、材质和价格带匹配
- 浅色场景使用柔和棚光或自然窗光；深色场景使用克制轮廓光和受控高光
- 保留产品原有主色和材质气质，不要强行改成黑色科技风
- 轻微虚焦背景，真实材质表现，干净、克制、有质感；暗部仍能看清产品结构
- 禁止默认深色背景；也不要为了浅色而把深色产品洗白，必须根据产品适配

产品要求：
- 保持原产品结构、比例、按键、接口、分件线、屏幕/灯带/孔位位置不变
- 不改变产品功能布局，不新增配件，不凭空添加品牌 logo
- 表面干净，不要脏污、油腻、划痕、错误反射或塑料蜡感
- 不要文字、不要说明标签、不要水印、不要虚假参数`,
  },
  {
    id: 'cmf-exploration',
    label: 'CMF 探索',
    hint: '材质与配色方向',
    aspectRatio: '16:9',
    outputFormat: 'jpg',
    prompt: `基于连接的参考图，为图中产品生成一张高质量 CMF 设计探索板。

目标：在不改变产品结构的前提下，探索 3 个可信的颜色、材料、表面工艺方向，并保持同一产品身份。

${INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT}

要求：
- 三个方案使用同一外轮廓、同一比例、同一按键/接口/分件线和同一功能布局
- 每个方案只改变颜色、材质、粗糙度、纹理或表面工艺，不改变造型和零件数量
- 方案之间差异清楚但克制：例如哑光塑料、阳极金属、玻璃高光、织物纹理、软触涂层
- 排版像高级设计评审板：三栏或三组等宽视图，背景干净，光线统一，材质样本可辅助但不抢主体
- 不生成品牌 logo、虚假参数、复杂说明箭头；除非用户要求，不生成可读文字标签`,
  },
  {
    id: 'lifestyle-scene',
    label: '场景氛围',
    hint: '真实使用场景',
    aspectRatio: '16:9',
    outputFormat: 'jpg',
    prompt: `基于连接的参考图，为图中产品生成一张真实、可信、有高级感的生活方式场景图。

先判断产品最自然的使用环境，再把产品放入场景中；场景只服务于使用价值和尺度感，不改造产品。

${INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT}

场景方向：
- 根据产品类型选择现代居家、办公桌面、厨房浴室、户外、运动、宠物、母婴或专业工作环境
- 环境干净、有真实生活痕迹但不杂乱；道具数量克制，不能抢产品主体
- 产品占据清晰视觉中心，人物或手只作为辅助尺度参考，不遮挡核心结构
- 光线柔和自然，产品与桌面/地面/手部接触可信，有真实阴影和正确透视
- 构图自然但有商业品质，不要硬广促销感，不要夸张特效

产品约束：
- 保持原产品结构、比例、颜色、材质、功能布局不变
- 不增加不存在的屏幕内容、按钮、接口、配件或品牌标识
- 不要文字、不要说明标签、不要促销元素、不要水印`,
  },
  {
    id: 'detail-hero',
    label: '细节特写',
    hint: '边缘高光与材质',
    aspectRatio: '16:9',
    outputFormat: 'jpg',
    prompt: `基于连接的参考图，为图中产品生成一张高级产品细节特写图。

先从参考图里选择一个真实存在、最能体现品质或功能的细节，再做微距渲染；不要凭空创造看不见的结构。

${INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT}

画面要求：
- 聚焦真实可见的关键边缘、倒角、按键、接口、分件线、纹理、转轴、握持区或材质交界
- 画面只讲一个细节，主体区域清晰锐利，背景和非关键区域轻微虚化
- 微距产品摄影质感，边缘高光干净，材质粗糙度、反射和纹理尺度可信
- 特写与原产品整体结构保持可追溯关系，不把局部渲染成另一种产品
- 画面克制，不要过度锐化或赛博风

产品约束：
- 不改变原结构、比例、功能布局
- 表面干净，不要划痕、污渍、指纹
- 不要文字、不要 logo 乱生成、不要说明标签、不要虚构参数`,
  },
];
const makeCanvasWorkflowAiNode = (
  id: string,
  label: string,
  hint: string,
  prompt: string,
  x: number,
  y: number,
  inputs: string[] = [],
  aspectRatio = '16:9',
  options: { provider?: CanvasAiProvider; model?: string; count?: number; presetId?: string } = {}
): CanvasWorkflowNodeTemplate => {
  const size = getCanvasAiNodeAutoSize({
    type: 'image-generator',
    aspectRatio,
    count: options.count || 1,
    hasPreset: true,
  });
  return {
    id,
    x,
    y,
    width: size.width,
    height: size.height,
    inputs,
    item: {
      id,
      type: 'text',
      content: '',
      name: `AI ${label}`,
      remark: hint,
      createdAt: 0,
      isQuickAccess: false,
    },
    ai: {
      type: 'image-generator',
      presetId: options.presetId || `workflow-${id}`,
      presetLabel: label,
      presetPrompt: appendBuiltInWorkflowQualityPrompt(prompt),
      aspectRatio,
      outputFormat: 'jpg',
      count: options.count || 1,
      provider: options.provider,
      model: options.model,
      status: 'idle',
    },
  };
};

export const PRODUCT_DETAILS_FIVE_IMAGES_BUILT_IN_WORKFLOW: CanvasWorkflowTemplate = {
  id: PRODUCT_DETAILS_FIVE_IMAGES_WORKFLOW_ID,
  label: PRODUCT_DETAILS_FIVE_IMAGES_WORKFLOW_LABEL,
  hint: PRODUCT_DETAILS_FIVE_IMAGES_WORKFLOW_HINT,
  builtin: true,
  createdAt: 0,
  nodes: [
    {
      id: 'product_refs',
      x: 0,
      y: 0,
      width: 320,
      height: 220,
      item: {
        id: 'product_refs',
        type: 'image',
        content: '',
        name: '产品参考图',
        remark: '连接一张或多张同款产品参考图',
        createdAt: 0,
        isQuickAccess: false,
      },
      inputs: [],
      fixedInput: true,
      acceptsExternalInputs: true,
      externalInputTypes: ['image'],
      outputType: 'image[]',
      bridgeType: 'reference_image',
    },
    {
      id: 'product_strategy',
      x: 420,
      y: 0,
      width: 460,
      height: 320,
      item: {
        id: 'product_strategy',
        type: 'text',
        content: PRODUCT_DETAILS_FIVE_IMAGES_STRATEGY_PROMPT,
        name: '产品识别与详情页视觉策略',
        remark: '先锁定产品身份、视觉系统和五图排版策略',
        createdAt: 0,
        isQuickAccess: false,
      },
      inputs: ['product_refs'],
      fixedInput: false,
      textMode: 'agent',
      designAgentConfig: {
        agentRole: 'design_strategist',
        outputArtifactType: 'DesignStrategy',
        thinkingMode: 'analysis',
      },
      acceptsExternalInputs: false,
      outputType: 'text',
    },
    ...PRODUCT_DETAILS_FIVE_IMAGES_OUTPUT_SPECS.map((spec, index) => {
      const node = makeCanvasWorkflowAiNode(
        spec.id,
        spec.label,
        spec.hint,
        spec.prompt,
        980,
        index * 560,
        ['product_refs', 'product_strategy'],
        spec.aspectRatio,
        {
          provider: 'xais-chat',
          model: 'Xais Nano Pro_2K',
          presetId: `workflow-product-details-${spec.id}`,
        },
      );
      return {
        ...node,
        acceptsExternalInputs: false,
        outputType: 'image' as const,
        ai: {
          ...node.ai,
          skillMeta: {
            workflowTemplateId: 'ecommerce-detail-page',
            workflowOutputType: spec.id,
            qualityProfileId: 'ecommerce_detail_page',
          },
        },
      };
    }),
  ],
};

export const CANVAS_BUILT_IN_WORKFLOWS: CanvasWorkflowTemplate[] = [
  PRODUCT_DETAILS_FIVE_IMAGES_BUILT_IN_WORKFLOW,
  {
    id: 'imported-workflow-mqxvzmig-0-epcv',
    label: '单元剧｜固定场景与角色一致性增强版',
    hint: '角色设定+场景设定+脚本 -> 联合母版 / 故事 / 表演 / 镜头 / 初稿 / 一致性修正',
    builtin: true,
    nodes: [
      makeCanvasWorkflowAiNode(
        'canvas_ai_cast_scene_master_01',
        '角色与固定场景联合母版',
        '上排锁角色，下排锁场景空间与本集状态',
        `基于封装节点外部连接的多个角色设定图、一个或多个场景设定图和本集文字分镜脚本，生成唯一的角色与固定场景联合母版。先按内容自动区分参考角色：角色设定图作为 CHARACTER_REF；纯环境、场景三视图、空间设定、室内外参考、平面图和道具陈设图作为 SCENE_REF；文字脚本负责本集角色出场、事件、动作、台词、音效和节奏。不得把角色图与场景图互相融合。

角色身份锁定：
- 逐张读取角色设定中的姓名或稳定称呼、角色职能、物种或性别、脸型、体型、相对身高、肤色或毛色花纹、眼色、耳形、尾巴、发型、服装、领结、围脖、饰品、道具和标志性表情
- 人物保持五官、肤色、发型、体型、服装和配件；动物或拟人角色保持物种、脸部花纹、毛色分区、毛长、耳形、眼色、鼻口、尾巴、体型、服装与饰品
- 不串脸、不换毛色、不交换服装或配件、不融合角色、不新增设定和脚本中不存在的角色

固定场景锁定：
- 从 SCENE_REF 严格提取建筑或房间轮廓、长宽高比例、墙面、地面、门窗、天花、桌椅、台面、灯具、主要道具、入口、背景层次、颜色、材质、照明方向和时间氛围
- 同一场景的不同参考视角视为同一空间，不拼成新房间；冲突时以信息最完整、最清晰的主场景图为准
- 不改变房间结构、家具数量与位置、门窗方向、主要道具、墙地材质和色彩；不添加无关装饰或把场景替换成其他类型空间

严格2×4联合母版：
- 输出一张 16:9 横版，严格 2 行 × 4 列，共 8 张完全等大的卡片
- 上排用于角色：按本集重要度展示最多四名主要角色的标准三分之四视角、完整服装与中性表情；少于四名角色时，用主角侧视、背视、关键表情或全员比例合照补足；多于四名时优先本集有台词和关键动作的角色，其余角色只在下排本集状态格出现
- 下排第1格：固定场景主视角或脚本指定主机位；第2格：同一空间的反向或侧向互补视角；第3格：俯视空间关系、门窗、家具、主要道具与角色初始站位；第4格：脚本核心冲突或群像状态在该固定场景中的标准画面
- 每格上方是严格 16:9 画面，下方是窄浅色说明栏；四列等宽、两行等高；禁止跨格、合并、英雄大格、自由拼贴、缺格或第九格

说明栏：
- 上排：角色：姓名或称呼；识别：不超过 10 个汉字的外观锚点
- 下排：场景：主视、反向、空间或剧情状态；锁定：不超过 12 个汉字的空间或道具锚点
- 统一深灰小号中文印刷体、左对齐；不要英文、乱码、长段落或无关信息

风格与比例：
- 角色与场景统一到同一美术风格，但不得因此改变角色设计和场景结构
- 群像中保持角色相对体型、座位高度、人与家具或动物与家具的尺度可信
- 输出是图片，不是报告；该图是后续所有节点唯一的 CHARACTER_REF 和 SCENE_REF。

Original request: "我还要固定场景的，一开始我会把场景设定和角色设定一起输入。现在到后面我发现角色的一致性没法保持了，特别是最终输出的那一张"。`,
        0,
        0,
        [],
        '16:9',
        { provider: 'xais-chat', model: 'Xais Nano Pro_2K', presetId: 'workflow-episodic-cast-scene-master-v2' }
      ),
      makeCanvasWorkflowAiNode(
        'canvas_ai_episode_storyboard_02',
        '固定场景分集故事板',
        'Image2 1K；保持角色与场景的八镜头叙事',
        `基于连接的角色与固定场景联合母版，生成本集八镜头故事板。若仍可读取外部文字脚本，以原脚本的时间、事件、动作、表情、对白、旁白和音效为最高优先级；否则围绕母版下排最后一格的核心剧情状态展开。

本阶段只解决镜头内容、角色出场、事件顺序、情绪变化与对白落点，采用低饱和导演草图风格，不制作相机路径、站位俯视图、技术箭头、起止残影或最终商业渲染。

4:3画布与2×4卡片：
- 输出一张 4:3 横版，严格 2 行 × 4 列，共 8 张完全等大的卡片
- 每卡上方是严格 16:9 故事画面，下方是同宽说明栏
- 上排镜头1-4、下排镜头5-8；四列等宽、两行等高；禁止跨格、合并、英雄大格、画中画、缺格、重复格或第九格

脚本转译：
- 按原脚本时间顺序分配八格；段落不足时拆分关键动作、对话与反应，多于八段时只合并相邻且功能相同的动作
- 开场快速交代固定场景和角色关系；中段保持对话、反应、冲突或任务递进；结尾明确落点、反转、笑点或余韵
- 对话场景必须包含说话者、听者反应和必要群体反应，避免八格全是单人正面特写

角色与场景连续性：
- 上排角色卡是唯一身份标准；每个角色保持自己的脸、毛色或肤色、花纹、眼睛、耳尾、体型、发型、服装、饰品和道具
- 下排场景卡是唯一空间标准；八格保持同一墙面、地面、门窗、桌椅、灯具、主要道具、背景方向、颜色材质和光线
- 多人同框保持相对体型、座位或站位、左右关系和视线方向；不得换座位、换门窗方向、增加家具或改变场景类型
- 不串脸、不换装、不交换配件、不新增角色，不产生多余头部、肢体、耳朵或尾巴

说明栏：第一行写剧情，不超过14个汉字；第二行写关键对白、动作、旁白或音效，不超过12个汉字。文字统一深灰小号、左对齐，不写英文、乱码、长段落或摄影参数。

输出必须是一张角色身份清楚、固定场景稳定、故事连续的分集草图板。`,
        520,
        220,
        ['canvas_ai_cast_scene_master_01'],
        '4:3',
        { provider: 'xais-chat', model: 'Xais img2_1k', presetId: 'workflow-fixed-scene-storyboard-v2' }
      ),
      makeCanvasWorkflowAiNode(
        'canvas_ai_performance_blocking_03',
        '表演与固定场景调度',
        'Image2 1K；锁定表情、视线、动作和空间位置',
        `将第一张连接图作为 CONTENT_REF，继承八镜头剧情、角色出场和事件顺序；将第二张连接图同时作为 CHARACTER_REF 和 SCENE_REF，校准每名角色身份与固定空间。把故事板转换成表演与场景调度板，明确角色位置、朝向、视线、表情、姿态、动作节拍和相互反应，不要只复制故事板并换文字。

使用中性浅灰或淡米色预演风格，角色轮廓、脸部表情、视线线条、动作方向、地面定位和家具关系清楚；可使用视线虚线和主体动作箭头，但不绘制相机路径、焦距或摄影蓝图。

4:3画布与2×4卡片：输出一张4:3横版，严格2行×4列，共8张等大卡片；每卡上方严格16:9表演调度画面，下方说明栏；上排镜头1-4、下排镜头5-8；禁止跨格、合并、遗漏、重复或第九格。

调度规则：
- 固定场景的入口、墙面、门窗、桌椅、灯具与主要道具位置不变；角色移动必须有起点、终点和动机
- 对话时明确说话者姿态、听者视线和反应；群戏避免所有角色同时做相同动作
- 喜剧、悬疑或日常单元剧强调停顿、迟疑、对视、抢话、反应镜头和包袱落点，情绪变化逐镜可见
- 动物或拟人角色的四肢、耳朵、尾巴、重心和道具接触自然；人物手部、关节、坐姿、站姿和接触可信

说明栏第一行写表演，不超过12个汉字；第二行写调度，不超过10个汉字。统一中文小号印刷体、左对齐。

角色外观以 CHARACTER_REF 为最高标准，家具与空间以 SCENE_REF 为最高标准。不得串脸、交换毛色或服装、改变体型、增加角色或多余肢体；不得移动固定家具、改变门窗方向或生成另一套场景。`,
        1040,
        440,
        ['canvas_ai_episode_storyboard_02', 'canvas_ai_cast_scene_master_01'],
        '4:3',
        { provider: 'xais-chat', model: 'Xais img2_1k', presetId: 'workflow-fixed-scene-performance-v2' }
      ),
      makeCanvasWorkflowAiNode(
        'canvas_ai_camera_edit_plan_04',
        '固定场景镜头与剪辑',
        'Image2 1K；景别、轴线、运镜与切点',
        `将第一张连接图作为 CONTENT_REF，继承剧情和顺序；第二张作为 PERFORMANCE_REF，继承表演、视线、动作和站位；第三张作为 CHARACTER_REF 与 SCENE_REF，校准角色身份和固定空间。生成镜头与剪辑技术规划板，重点说明景别、机位、轴线、运镜、焦点和切点。

使用蓝灰或深灰技术预演风格、简化角色和场景、相机图标、视锥、180度轴线、运动路径、焦点变化和剪辑方向。每格至少包含一种清楚摄影信息，不追求最终材质与漂亮静帧。

4:3画布与2×4卡片：输出一张4:3横版，严格2行×4列，共8张等大卡片；每卡上方严格16:9技术图，下方说明栏；上排镜头1-4、下排镜头5-8；不得交换、遗漏、重复、跨格、合并或增加镜头。

镜头与剪辑规则：
- 依据脚本选择全景、中景、双人、过肩、近景、特写或反应镜头，避免八格同一正面景别
- 对话遵守180度轴线和视线匹配，正反打保持左右方向稳定；固定机位脚本不得擅自改成复杂环绕
- 每镜只设置一个主要摄影动作：固定、轻推、轻拉、横移、俯仰、跟随、焦点转移或自然切镜
- 剪辑点落在停顿、动作完成、视线变化、信息揭示、反应或包袱落点；避免无动机跳切、越轴和方向反转
- 相邻镜头保持动作接续、道具位置、角色座位、光线和视线连续
- 相机变化只能在 SCENE_REF 已定义的同一空间内发生，不得生成不存在的走廊、门、窗、舞台、家具或另一间房

说明栏第一行写镜头，不超过10个汉字；第二行写剪辑，不超过12个汉字。统一中文小号印刷体、左对齐。角色以 CHARACTER_REF 为准，空间以 SCENE_REF 为准。`,
        1560,
        660,
        ['canvas_ai_episode_storyboard_02', 'canvas_ai_performance_blocking_03', 'canvas_ai_cast_scene_master_01'],
        '4:3',
        { provider: 'xais-chat', model: 'Xais img2_1k', presetId: 'workflow-fixed-scene-camera-edit-v2' }
      ),
      makeCanvasWorkflowAiNode(
        'canvas_ai_episode_draft_05',
        '单元剧分镜初稿',
        '2K全彩初稿；融合角色、场景、表演和镜头',
        `综合四张连接图生成全彩单元剧分镜初稿。第一张联合母版是 CHARACTER_REF 与 SCENE_REF；第二张故事板是 CONTENT_REF；第三张表演调度板是 PERFORMANCE_REF；第四张镜头剪辑板是 CAMERA_REF。按四种职责重新渲染，不原样复制技术图。

输出一张16:9横版、严格2行×4列、共8张等大卡片；每卡上方严格16:9全彩关键帧，下方说明栏；上排镜头1-4、下排镜头5-8。禁止跨格、合并、英雄大格、缺格、重复格或第九格。

画面继承角色设定和场景设定的美术风格；清晰、细节充足、表情可读、毛发或材质可信、曝光稳定。去掉草图线、视线虚线、相机图标、箭头、视锥、轴线和蓝图元素。

角色规则：每名角色回到联合母版上排校准，不串脸、不换毛色、不交换服装配件、不改变体型、不新增角色、不产生多余肢体耳尾；群像与正反打保持左右位置、视线和相对体型。

场景规则：每镜回到联合母版下排校准，保持同一墙地、门窗、桌椅、灯具、主要道具、背景方向、颜色材质和光线；不得扩大房间、移动家具、换背景或创造新空间。

表演和镜头：剧情对白以CONTENT_REF为准；表情动作和站位以PERFORMANCE_REF为准；景别机位与切点以CAMERA_REF为准。

说明栏第一行写剧情，不超过14个汉字；第二行写镜头，不超过12个汉字。说明只在栏内，不覆盖画面。

这是初稿，优先保证故事、构图和画面完成度；后续节点将进行角色与场景一致性校正。`,
        2080,
        880,
        ['canvas_ai_cast_scene_master_01', 'canvas_ai_episode_storyboard_02', 'canvas_ai_performance_blocking_03', 'canvas_ai_camera_edit_plan_04'],
        '16:9',
        { provider: 'xais-chat', model: 'Xais Nano Pro_2K', presetId: 'workflow-episodic-draft-2k-v2' }
      ),
      makeCanvasWorkflowAiNode(
        'canvas_ai_continuity_fix_06',
        '最终角色场景一致性修正',
        '只校正身份和固定场景，不改镜头与剧情',
        `执行一次严格的图像一致性校正。第一张连接图是唯一 BASE 和 LAYOUT_REF：已经确定好的八格全彩分镜初稿。第二张连接图是 CHARACTER_REF 与 SCENE_REF：角色身份和固定场景的最高标准。第三张连接图是 CONTENT_REF：用于核对每格应出现的角色、剧情和顺序。只修正角色身份、场景结构、比例、材质、肢体和连续性错误；不得重新创作、换镜头、换场景、改剧情、改站位、改机位或重新排版。

必须完整保留 BASE：
- 保留16:9横版、2行×4列、八张等大卡片、镜头1-8顺序、每格构图、景别、人物位置、动作、表情、视线、道具、光线和说明栏
- 不删除、不新增、不交换、不重复、不合并镜头；不生成英雄大格、自由拼贴或第九格
- 不把初稿重新渲染成另一套故事，只做局部、定向的一致性修复

逐格角色审计与修正：
- 先依据 CONTENT_REF 判断该格应该出现哪些角色，再逐一对照联合母版上排的对应角色
- 校正脸型、五官、肤色或毛色花纹、眼色、耳形、尾巴、体型、发型、服装、领结、围脖、饰品和道具，使同名角色八格一致
- 若初稿角色串脸、换毛色、换装、配件错位或长相漂移，只替换该角色的错误外观，保留原姿势、表情、动作方向、光线和遮挡关系
- 不融合角色、不交换身份、不新增或删除角色；同一角色在同一格只出现一次
- 修正多余或缺失的头、手臂、手指、腿、爪、耳朵、尾巴，修正肢体穿插、错误握持、漂浮和不自然接触
- 群像中保持联合母版定义的相对体型，以及BASE已经确定的左右位置、座位和视线

逐格固定场景审计与修正：
- 每格背景对照联合母版下排的主视角、反向视角和空间关系，校正墙面、地面、门窗、桌椅、灯具、主要道具、入口、背景方向、颜色、材质和光线
- 若初稿背景漂移，只修正错误区域；保留该镜头原机位、透视、人物构图和景别
- 不改变房间大小和结构，不移动固定家具，不新增门窗、走廊、舞台、柜子、装饰或另一套空间
- 保持跨镜头的道具数量、位置、开合状态、光照方向和时间连续

最终质量：
- 保持角色设定与场景设定的原始美术风格，画面清晰、细节准确、毛发或材质可信、边缘干净、曝光稳定
- 不保留草图、箭头、相机图标、视锥、轴线、蓝图、残影或技术标记
- 说明栏尽量原样保留；如必须重写，仅保留两行简短中文，不覆盖16:9画面

输出前逐格核对：角色数量和身份正确；毛色脸型服装配件一致；无多余肢体耳尾；相对体型正确；固定场景结构一致；门窗家具道具不漂移；镜头、剧情、站位和构图未改变。全部满足后再输出最终2K分镜。

Original request: "一开始我会把场景设定和角色设定一起输入，角色的一致性没法保持，特别是最终输出"。`,
        2600,
        1100,
        ['canvas_ai_episode_draft_05', 'canvas_ai_cast_scene_master_01', 'canvas_ai_episode_storyboard_02'],
        '16:9',
        { provider: 'xais-chat', model: 'Xais Nano Pro_2K', presetId: 'workflow-episodic-continuity-fix-2k-v2' }
      ),
    ],
  },
  {
    id: 'imported-workflow-mqxu783h-0-kjaz',
    label: '产品动画分镜｜2×2母版·2K高质量最终版',
    hint: '2×2产品母版 -> Image2 1K 4:3故事板 -> Image2 1K 4:3运镜板 -> 2K最终2×4分镜',
    builtin: true,
    nodes: [
      makeCanvasWorkflowAiNode(
        'canvas_ai_product_master_01',
        '2×2产品母版',
        '四格锁定产品结构、CMF、细节和情境',
        `基于封装节点外部连接的产品参考图和文字脚本，生成唯一的 2×2 产品母版。此阶段只锁定产品身份、关键细节、功能状态与脚本情境，不制作故事分镜。

输入角色：
- 产品参考图均为 SUBJECT_REF，严格锁定外轮廓、比例、体块、曲面、按键、接口、屏幕、灯带、开孔、分件线、Logo 位置、真实颜色与 CMF
- 文字脚本只用于确认核心卖点、必要功能状态、使用情境、广告气质与光线方向，不得借脚本重新设计产品
- 多图是同一产品的多角度依据；冲突时以最清晰、结构最完整的参考为准，不融合矛盾特征

严格2×2版式：
- 输出一张 16:9 横版画布，严格 2 行 × 2 列，共 4 个完全等大的 16:9 画面
- 左上：最准确的三分之四主视角，完整展示外轮廓与主要体块
- 右上：与主视角互补的正面、侧面、背面或俯视角，补足结构信息
- 左下：脚本核心卖点对应的真实按键、接口、屏幕、灯效、机构或 CMF 细节
- 右下：产品在脚本要求的功能状态或最简使用情境中的标准姿态，用于锁定尺度、接触关系、背景与光线
- 四格尺寸一致、边缘对齐、等距细窄留白；禁止跨格、合并、重叠、自由拼贴或第五格
- 不生成编号、文字、参数、说明、箭头或 HUD

产品锁定：
- 四格必须是同一产品、同一结构、同一比例、同一 CMF、同一功能布局
- 不重新设计、不镜像、不增减按键、接口、屏幕、灯带、开孔、分件线或部件，不添加新 Logo 和不存在的功能
- 看不清的局部保持简洁，不凭空补造；脚本未要求时不添加人物、手和复杂道具
- 统一色温、光线方向、中性高级背景、自然产品摄影透视、真实材质、清楚边缘和可信接地

输出是无字的 2×2 产品身份母版，作为后续所有节点的 SUBJECT_REF。

Original request: "产品母版改成2*2，然后注意最终分镜细节和质量一定要高"。`,
        0,
        0,
        [],
        '16:9',
        { provider: 'xais-chat', model: 'Xais Nano Pro_2K', presetId: 'workflow-product-master-2x2-v9' }
      ),
      makeCanvasWorkflowAiNode(
        'canvas_ai_storyboard_02',
        '4:3叙事草图故事板',
        'Image2 1K；2行×4列叙事草图',
        `基于连接的 2×2 产品母版生成八镜头故事板。若仍能读取外部文字脚本，以原脚本为最高优先级；否则围绕母版右下格的使用情境和功能状态展开。本阶段只解决故事顺序、画面内容、景别和叙事目的，不设计运镜，不追求最终商业渲染。

阶段视觉语言：
- 采用导演故事板草图风格：灰度或低饱和色块、简洁线稿、粗略光影、少量单一强调色
- 不使用最终广告级材质高光，不制作技术箭头、相机图标、运动轨迹、起止残影或蓝图界面
- 产品轮廓与关键结构仍以母版为准，草图风格不能成为改变结构的理由

4:3画布与2×4版式：
- 输出一张 4:3 横版画布，严格 2 行 × 4 列，共 8 张完全等大的卡片
- 每卡上方是严格 16:9 故事画面，下方是同宽说明栏
- 上排从左到右为镜头1-4，下排从左到右为镜头5-8；四列等宽、两行等高
- 禁止跨格英雄图、合并、重叠、自由拼贴、缺格、重复格或第九格

固定叙事位置：
- 上排：情境钩子、轮廓揭示、完整亮相、第二角度或功能转折
- 下排：卖点铺垫、核心功能或交互、结果或价值、片尾完整定格
- 每格只表达一个主要信息，镜头有因果、节奏和景别变化，不能只是同一产品反复换角度

说明栏写两行：
- 第一行：画面：不超过 12 个汉字
- 第二行：目的：不超过 8 个汉字
- 深灰小号中文印刷体、左对齐；不要编号、英文、乱码、长段落、运镜术语或参数

产品母版是唯一产品标准。八格保持同一外轮廓、比例、CMF、按键、接口、屏幕、灯带、开孔、分件线、Logo 位置与材质边界；不重设计、不镜像、不增减零件。

输出是一张 4:3 横版、2行×4列的低精度叙事草图板。`,
        520,
        220,
        ['canvas_ai_product_master_01'],
        '4:3',
        { provider: 'xais-chat', model: 'Xais img2_1k', presetId: 'workflow-narrative-storyboard-4x3-v9' }
      ),
      makeCanvasWorkflowAiNode(
        'canvas_ai_camera_plan_03',
        '4:3技术运镜预演',
        'Image2 1K；2行×4列技术图解',
        `将第一张连接图作为 CONTENT_REF：继承八镜头故事内容、顺序和主体关系。将第二张连接图作为 SUBJECT_REF：校准产品结构。把故事板转换成明显不同的技术运镜预演板，不要只替换说明文字。

阶段视觉语言：
- 使用蓝灰色或深灰色技术预演风格、简化场景、清楚轮廓、半透明起止位置、相机图标、运动路径和方向箭头
- 每个 16:9 图解至少出现一种可见技术信息：相机位置与朝向、起点与终点残影、运动路径、焦点平面或转场方向
- 不是最终商业渲染；不要原样复制故事板图片，应保留同一镜头含义但转换成技术图解

4:3画布与2×4版式：
- 输出一张 4:3 横版画布，严格 2 行 × 4 列，共 8 张完全等大的卡片
- 每卡上方是严格 16:9 运镜图解，下方是同宽说明栏
- 上排从左到右对应镜头1-4，下排对应镜头5-8；四列等宽、两行等高
- 与故事板逐格对应；禁止跨格、合并、放大英雄画面、遗漏、重复或第九格

运镜规则：
- 每镜只选一个主要运动：固定机位、缓慢推近、轻微拉远、平稳横移、克制环绕、俯仰揭示、焦点转移或整体切入细节
- 运镜服务于揭示产品、说明尺度、强调卖点、跟随操作或衔接下一镜
- 相邻镜头保持轴线、视线、主体位置、光线方向和运动方向连续；禁止甩镜、夸张变焦、无意义旋转、粒子爆炸、液化、解体或变形转场

说明栏写两行：
- 第一行：机位：不超过 8 个汉字
- 第二行：运动：不超过 10 个汉字
- 深灰小号中文印刷体、左对齐；不要编号、英文、乱码、长段落或复杂参数

故事内容以 CONTENT_REF 为准，产品外观以 SUBJECT_REF 为准。不得重设计、镜像、增减按键、接口、屏幕、灯带、开孔、分件线、部件或 Logo。

输出是一张 4:3 横版、2行×4列的技术运镜预演板，与故事板明显不同。`,
        1040,
        440,
        ['canvas_ai_storyboard_02', 'canvas_ai_product_master_01'],
        '4:3',
        { provider: 'xais-chat', model: 'Xais img2_1k', presetId: 'workflow-camera-tech-previz-4x3-v9' }
      ),
      makeCanvasWorkflowAiNode(
        'canvas_ai_final_storyboard_04',
        '最终2K高质量2×4分镜',
        '2K商业渲染；强化产品细节与八格一致性',
        `综合三张连接图生成最终 2K 高质量产品动画分镜。第一张 2×2 产品母版是 SUBJECT_REF，产品外观与结构的最高标准；第二张 4:3 故事板是 CONTENT_REF，只负责镜头内容、顺序、场景与叙事目的；第三张 4:3 运镜板是 MOTION_REF，只负责机位、运动方向、起止关系与转场。不要原样复制任何一张上游图，而要依据三种角色重新渲染最终商业关键帧。

镜头与版式：
- 上游两张 2×4 板均按上排镜头1-4、下排镜头5-8读取，最终必须逐格一一对应，不交换、遗漏、重复、合并或新增镜头
- 输出一张 16:9 横版，严格 2 行 × 4 列，共 8 张完全等大的卡片
- 每卡上方是严格 16:9 全彩关键帧，下方是同宽浅色说明栏
- 四列等宽、两行等高；禁止英雄大格、跨格、合并、重叠、自由拼贴、缺格、重复格或第九格

2K高质量商业渲染：
- 八个关键帧必须清晰、锐利、细节充足，具备高端产品广告成片质感，不使用草图、低清贴图、过度降噪、塑料蜡感或模糊材质
- 材质必须可辨：金属、哑光塑料、橡胶、玻璃、织物、皮革或涂层要有正确的粗糙度、反射、纹理尺度与边缘高光
- 保持自然产品摄影透视、真实接地阴影、合理景深、干净轮廓、克制高光和稳定曝光；暗部仍要看清结构
- 使用统一世界观、色温和光线逻辑，但每格应有明确景别与机位变化，不能反复使用同一正视产品图
- 使用 MOTION_REF 确定相机角度、主体位置、空间方向与运动趋势，但最终画面不保留相机图标、箭头、残影、蓝图线或技术界面
- 不继承故事板的草图质感，也不继承运镜板的蓝灰技术图风格

产品细节一致性最高规则：
- 每个镜头都必须回到 2×2 SUBJECT_REF 母版校准，严格保持同一外轮廓、尺寸比例、体块、曲面转折、CMF、按键数量与位置、接口、屏幕、灯带、开孔、分件线、Logo 位置和材质边界
- 不重新设计、不镜像、不增减零件，不改变功能布局，不把不同角度的矛盾细节拼接到同一产品
- 特写只拍母版中真实存在且清楚可见的细节；看不清的结构保持克制，不凭空添加按钮、接口、传感器、灯效或机械机构
- 人物和手只在 CONTENT_REF 确有必要时出现；手指数目、关节、握持、接触点、受力方向和产品尺度必须正确，不能遮挡核心卖点
- 避免产品变形、融化、重复、穿插、比例漂移、悬浮、错误反射、锯齿边缘、脏污噪点和不合理裁切

八镜头完成度：
- 镜头1建立情境，镜头2揭示轮廓，镜头3完整亮相，镜头4完成角度或功能转折
- 镜头5铺垫卖点，镜头6清楚展示核心功能或交互，镜头7呈现结果或价值，镜头8形成完整稳定的英雄定格
- 八格必须有叙事递进、构图差异和视觉连续性，不能用产品母版的四格简单重复填充

说明栏写两行：
- 第一行：分镜：不超过 12 个汉字，准确概括画面与叙事目的
- 第二行：运镜：不超过 10 个汉字，准确概括相机、主体动作或转场
- 深灰小号中文印刷体、左对齐；不写编号、英文、乱码、长段落、镜头参数或多余标题
- 说明文字只放在说明栏，不得覆盖 16:9 画面

输出前自检并修正：八格数量与顺序正确；产品结构一致；按键接口与母版一致；不存在重复镜头；特写真实；手部正确；材质清楚；无箭头技术图；无跨格；画面锐利；说明简洁可读。只有全部满足后再输出最终图片。

Original request: "最终分镜还是2k就好"。`,
        1560,
        660,
        ['canvas_ai_product_master_01', 'canvas_ai_storyboard_02', 'canvas_ai_camera_plan_03'],
        '16:9',
        { provider: 'xais-chat', model: 'Xais Nano Pro_2K', presetId: 'workflow-final-commercial-storyboard-2k-v10' }
      ),
    ],
  },
  {
    id: 'industrial-design-basic',
    label: '基础工业设计',
    hint: '线稿 -> 效果图 -> 细节 / 多角度 / 场景',
    builtin: true,
    nodes: [
      makeCanvasWorkflowAiNode(
        'industrial-render',
        '线稿转效果图',
        '从线稿生成效果图',
        `基于连接的线稿、草图或产品参考图，生成一张可信、可评审的工业设计主效果图。

输入理解：
- 如果连接的是线稿/草图：保留原始轮廓、比例、透视、结构分区和功能暗示，将其转译为真实产品渲染。
- 如果连接的是产品参考图：以参考图为 SUBJECT_REF，锁定结构、CMF、按键/接口/开孔和材质边界。

${INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT}

要求：
- 只提升完成度，不重新发明产品；模糊区域保持克制，不凭空增加复杂机构
- 主体完整展示，三分之二或正侧结合视角，关键比例和轮廓清楚
- 材质、倒角、分件线、按键、接口、支撑/握持/开合关系表现清晰
- 背景简洁高级，产品与地面/台面接触可信，光影服务结构可读性
- 不要文字、不要 logo 乱生成、不要说明标签、不要装饰性 HUD`,
        0,
        0,
        [],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'industrial-detail',
        '细节图',
        '从效果图生成细节特写',
        `基于连接的产品效果图，生成一张高级产品细节特写图。

目标：从上游主效果图中选择一个真实存在的关键细节，放大展示其结构、材质或工艺价值。

${INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT}

要求：
- 聚焦关键边缘、倒角、按键、接口、分件线、纹理、转轴或材质交界
- 细节必须能从上游产品追溯回来，不生成上游没有的按钮、传感器、接口或内部结构
- 微距产品摄影质感，关键区域清晰，非关键区域轻微虚化，边缘高光干净
- 保持产品结构、颜色、材质和功能布局一致
- 不要文字、不要 logo 乱生成、不要说明箭头、不要虚构参数`,
        480,
        -120,
        ['industrial-render'],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'industrial-multiview',
        '多角度设计图',
        '从效果图生成多角度设计图',
        `基于连接的产品效果图，生成同一产品的多角度设计评审图。

目标：用多个视角说明同一产品的体块、轮廓、比例和关键结构，方便设计评审。

${INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT}

要求：
- 展示正面、侧面、背面、俯视或 3/4 角度中的 3-4 个互补视角
- 所有视角必须是同一产品：结构、比例、CMF、分件线、按键/接口数量和位置一致
- 视角之间等距排列，尺度统一，背景简洁，像干净的工业设计评审板
- 不做爆炸图，不新增内部结构，不使用夸张透视
- 不要文字标签、不要说明箭头、不要品牌 logo 乱生成、不要虚假参数`,
        480,
        420,
        ['industrial-render'],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'industrial-scene',
        '场景图',
        '从效果图生成使用场景',
        `基于连接的产品效果图，生成真实生活方式或办公使用场景图。

目标：把同一产品放入可信使用环境，展示尺度、使用关系和情绪价值，而不是重新设计产品。

${INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT}

要求：
- 根据产品类型选择居家、办公、桌面、厨房、浴室、户外或专业工作环境
- 产品是画面主角，环境现代、干净、有审美，人物/手/道具只作为辅助尺度参考
- 产品与环境接触可信，有真实阴影、正确透视和合理景深
- 保持产品结构、比例、颜色、材质、按键、接口和分件线一致
- 不要文字、不要 logo 乱生成、不要促销元素、不要夸张特效`,
        960,
        150,
        ['industrial-render'],
        '16:9'
      ),
    ],
  },
  {
    id: 'cmf-review',
    label: 'CMF 评审',
    hint: '参考图 -> CMF 方向 -> 细节特写',
    builtin: true,
    nodes: [
      makeCanvasWorkflowAiNode(
        'cmf-board',
        'CMF 方向板',
        '生成材质与配色方向',
        CANVAS_AI_PROMPT_PRESETS.find(preset => preset.id === 'cmf-exploration')?.prompt || '',
        0,
        0,
        [],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'cmf-detail',
        'CMF 细节特写',
        '生成材质细节图',
        `基于连接的 CMF 方向图，生成一张高质量产品材质细节特写。

目标：从已选 CMF 方向里提取一个最有代表性的材质/工艺细节，做可信微距展示。

${INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT}

要求：
- 强调材质纹理、表面工艺、倒角高光、颜色过渡、粗糙度和真实反射
- 保持产品结构、比例、CMF 方向和材质边界一致
- 画面像设计评审中的材质细节页：干净、聚焦、可判断工艺
- 不要文字、不要品牌标识、不要说明箭头、不要虚构材料标签`,
        480,
        0,
        ['cmf-board'],
        '16:9'
      ),
    ],
  },
  {
    id: 'ecommerce-showcase',
    label: '电商展示',
    hint: '主图 -> 细节图 / 场景图',
    builtin: true,
    nodes: [
      makeCanvasWorkflowAiNode(
        'commerce-hero',
        '电商主图',
        '生成产品主视觉',
        `基于连接的产品参考图，生成一张干净高级的电商产品主图。

目标：输出适合商品展示的主视觉底图，主体明确、品质感强、结构准确；这不是详情页长图，不生成促销文案。

${INDUSTRIAL_DESIGN_RENDER_QUALITY_PROMPT}

要求：
- 产品居中或轻微偏中，完整展示，轮廓清晰，材质真实，关键卖点区域可读
- 背景简洁但不空洞，可使用柔和渐变、台面、阴影或轻量图形层次
- 保持产品结构、比例、颜色、材质和功能布局一致，不新增配件或虚假功能
- 不要促销文字、不要价格、不要 logo 乱生成、不要水印、不要虚假认证`,
        0,
        0,
        [],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'commerce-detail',
        '卖点细节图',
        '生成产品细节展示',
        CANVAS_AI_PROMPT_PRESETS.find(preset => preset.id === 'detail-hero')?.prompt || '',
        480,
        -120,
        ['commerce-hero'],
        '16:9'
      ),
      makeCanvasWorkflowAiNode(
        'commerce-scene',
        '使用场景图',
        '生成真实场景图',
        CANVAS_AI_PROMPT_PRESETS.find(preset => preset.id === 'lifestyle-scene')?.prompt || '',
        480,
        420,
        ['commerce-hero'],
        '16:9'
      ),
    ],
  },
];
