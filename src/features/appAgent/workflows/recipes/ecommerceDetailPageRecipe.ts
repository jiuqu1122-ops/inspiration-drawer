import type { DetailPageRenderMode, DetailPageSpec, DetailPageStatus } from '../../pageLayout/detailPageLayoutTypes';
import { buildDetailPagePrompt, inferDetailPageRenderMode } from '../../pageLayout/detailPagePromptBuilder';
import type { WorkflowRecipeDraft, WorkflowOutputSpec, WorkflowTextPolicy } from '../workflowRecipeTypes';
import { DEFAULT_EN_LANGUAGE_POLICY, DEFAULT_ZH_LANGUAGE_POLICY } from './industrialDesignReviewRecipe';

const createId = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function detectUserLanguagePolicyForDetail(userText: string): WorkflowTextPolicy {
  return /[一-鿿㐀-䶿]/.test(userText) ? DEFAULT_ZH_LANGUAGE_POLICY : DEFAULT_EN_LANGUAGE_POLICY;
}

const defaultLockedFeatures = [
  '整体轮廓',
  '长宽比例',
  '主色和材质',
  '关键零件位置',
  '功能结构关系',
];

const defaultForbiddenChanges = [
  '新增按钮/孔位/接口',
  '改变产品主色或材质',
  '生成原图不存在的配件',
  '虚构认证、品牌 logo 或具体参数',
  '让不同页面变成不同型号',
];

const copyOrEmpty = (
  renderMode: DetailPageRenderMode,
  copy: DetailPageSpec['copy'],
): DetailPageSpec['copy'] => (
  renderMode === 'visual_background_only'
    ? { pageNo: copy.pageNo, title: '', subtitle: '', tags: [], localNotes: [] }
    : copy
);

const makeSpec = (input: {
  pageIndex: number;
  pageName: string;
  uniqueSellingPoint: string;
  title: string;
  subtitle: string;
  tags: Array<{ text: string; icon: string }>;
  localNotes?: string[];
  adaptiveCopy?: boolean;
  sourceBrief?: string;
  closeupCount: 0 | 1 | 2 | 3;
  productPosition?: DetailPageSpec['layout']['productPosition'];
  productAngle?: string;
  labelArea?: DetailPageSpec['layout']['labelArea'];
  closeupPosition?: DetailPageSpec['layout']['closeupPosition'];
  layoutLanguage?: string;
  renderMode: DetailPageRenderMode;
  aspectRatio?: string;
}): DetailPageSpec => ({
  pageIndex: input.pageIndex,
  pageName: input.pageName,
  uniqueSellingPoint: input.uniqueSellingPoint,
  productAnchor: {
    referenceImageNodeIds: [],
    lockedFeatures: defaultLockedFeatures,
    forbiddenChanges: defaultForbiddenChanges,
  },
  styleAnchor: {
    masterPageNodeId: input.pageIndex > 1 ? 'master_page_image' : undefined,
    backgroundStyle: '高端电商详情页，干净背景，克制装饰图形，产品主体突出',
    mainColor: '中性浅色背景',
    auxiliaryColors: ['产品主色', '浅灰'],
    accentColor: '低饱和蓝色或产品强调色',
    lighting: '柔和棚拍光，边缘清晰',
    iconStyle: '统一线性图标',
    closeupFrameStyle: '圆角描边局部特写框',
    layoutLanguage: input.layoutLanguage || '顶部标题区 + 产品主体 + 三个卖点标签',
  },
  layout: {
    aspectRatio: input.aspectRatio || '3:4',
    productPosition: input.productPosition || 'center',
    productAngle: input.productAngle || '三分之二视角',
    titleArea: 'top',
    labelArea: input.labelArea || 'top',
    closeupCount: input.closeupCount,
    closeupPosition: input.closeupPosition,
  },
  copy: copyOrEmpty(input.renderMode, {
    pageNo: `PAGE ${String(input.pageIndex).padStart(2, '0')}`,
    title: input.title,
    subtitle: input.subtitle,
    tags: input.tags,
    localNotes: input.localNotes,
    adaptive: input.adaptiveCopy,
    sourceBrief: input.sourceBrief,
  }),
  renderMode: input.renderMode,
});

export const buildDefaultEcommerceDetailPageSpecs = (
  renderMode: DetailPageRenderMode,
  options: { aspectRatio?: string; sourceBrief?: string } = {},
): DetailPageSpec[] => [
  makeSpec({
    pageIndex: 1,
    pageName: '主视觉母版页',
    uniqueSellingPoint: '建立统一视觉系统并展示产品核心价值',
    title: '一眼看懂产品优势',
    subtitle: '清爽版式呈现核心卖点，产品质感一目了然',
    tags: [
      { text: '结构清晰', icon: 'focus' },
      { text: '质感统一', icon: 'sparkle' },
      { text: '卖点明确', icon: 'target' },
    ],
    closeupCount: 0,
    productPosition: 'center',
    labelArea: 'top',
    layoutLanguage: '首屏英雄母版：产品居中大图，顶部标题区，顶部三标签，背景留白充足',
    renderMode,
    aspectRatio: options.aspectRatio,
    adaptiveCopy: renderMode === 'model_text_baked',
    sourceBrief: options.sourceBrief,
  }),
  makeSpec({
    pageIndex: 2,
    pageName: '核心结构页',
    uniqueSellingPoint: '展示产品关键结构和真实比例',
    title: '核心结构清晰可见',
    subtitle: '关键部位清楚展示，细节层次更直观',
    tags: [
      { text: '轮廓准确', icon: 'outline' },
      { text: '结构稳定', icon: 'shield' },
      { text: '细节真实', icon: 'zoom' },
    ],
    localNotes: ['结构清楚', '细节放大'],
    closeupCount: 2,
    productPosition: 'right',
    labelArea: 'left',
    closeupPosition: 'left',
    layoutLanguage: '左右分栏结构解析：右侧产品大图，左侧两个真实局部特写框和结构说明留白',
    renderMode,
    aspectRatio: options.aspectRatio,
    adaptiveCopy: renderMode === 'model_text_baked',
    sourceBrief: options.sourceBrief,
  }),
  makeSpec({
    pageIndex: 3,
    pageName: '核心功能页',
    uniqueSellingPoint: '说明产品最重要的使用功能',
    title: '核心功能直观呈现',
    subtitle: '把常用功能讲清楚，操作体验更直观',
    tags: [
      { text: '功能明确', icon: 'bolt' },
      { text: '操作直观', icon: 'hand' },
      { text: '体验高效', icon: 'speed' },
    ],
    localNotes: ['功能聚焦'],
    closeupCount: 1,
    productPosition: 'center',
    labelArea: 'bottom',
    closeupPosition: 'right',
    layoutLanguage: '功能焦点页：中心产品，右侧单一功能放大特写，底部卖点标签区',
    renderMode,
    aspectRatio: options.aspectRatio,
    adaptiveCopy: renderMode === 'model_text_baked',
    sourceBrief: options.sourceBrief,
  }),
  makeSpec({
    pageIndex: 4,
    pageName: '稳定 / 安全页',
    uniqueSellingPoint: '强调支撑、连接、防滑或安全感',
    title: '稳定支撑更安心',
    subtitle: '稳固承托日常使用，关键连接更可靠',
    tags: [
      { text: '支撑稳固', icon: 'shield' },
      { text: '防滑安心', icon: 'grip' },
      { text: '圆润安全', icon: 'lock' },
    ],
    localNotes: ['连接稳固', '防滑触面'],
    closeupCount: 2,
    productPosition: 'center',
    labelArea: 'left',
    closeupPosition: 'right',
    layoutLanguage: '稳定安全页：产品居中偏下，右侧支撑/防滑特写列，左侧安全卖点区',
    renderMode,
    aspectRatio: options.aspectRatio,
    adaptiveCopy: renderMode === 'model_text_baked',
    sourceBrief: options.sourceBrief,
  }),
  makeSpec({
    pageIndex: 5,
    pageName: '材质 / 舒适性页',
    uniqueSellingPoint: '展示材质、触感、圆角和表面工艺',
    title: '细腻材质触感舒适',
    subtitle: '放大真实纹理与边缘处理，突出产品质感',
    tags: [
      { text: '质感细腻', icon: 'texture' },
      { text: '触感舒适', icon: 'palm' },
      { text: '做工精致', icon: 'gem' },
    ],
    localNotes: ['表面纹理', '圆角细节', '边缘处理'],
    closeupCount: 3,
    productPosition: 'left',
    labelArea: 'right',
    closeupPosition: 'right',
    layoutLanguage: '材质工艺页：左侧产品斜切大图，右侧三联材质/边缘特写矩阵',
    renderMode,
    aspectRatio: options.aspectRatio,
    adaptiveCopy: renderMode === 'model_text_baked',
    sourceBrief: options.sourceBrief,
  }),
  makeSpec({
    pageIndex: 6,
    pageName: '操作 / 收纳 / 效率页',
    uniqueSellingPoint: '说明使用步骤、收纳方式或效率提升',
    title: '使用流程简单高效',
    subtitle: '从上手到收纳更顺畅，桌面使用更省心',
    tags: [
      { text: '上手简单', icon: 'steps' },
      { text: '收纳省心', icon: 'box' },
      { text: '效率提升', icon: 'clock' },
    ],
    localNotes: ['操作顺畅'],
    closeupCount: 1,
    productPosition: 'center',
    labelArea: 'bottom',
    closeupPosition: 'bottom',
    layoutLanguage: '操作流程页：三步动线横向展开，产品居中，底部步骤/效率信息区',
    renderMode,
    aspectRatio: options.aspectRatio,
    adaptiveCopy: renderMode === 'model_text_baked',
    sourceBrief: options.sourceBrief,
  }),
  makeSpec({
    pageIndex: 7,
    pageName: '真实使用场景页',
    uniqueSellingPoint: '把产品放入可信使用环境，建立购买联想',
    title: '真实场景自然融入',
    subtitle: '融入桌面使用环境，产品状态清楚自然',
    tags: [
      { text: '场景真实', icon: 'home' },
      { text: '比例自然', icon: 'scale' },
      { text: '主体突出', icon: 'spotlight' },
    ],
    closeupCount: 0,
    productPosition: 'bottom-center',
    labelArea: 'top',
    layoutLanguage: '真实场景页：产品位于底部环境中，上方大面积场景氛围和标题留白，无局部特写框',
    renderMode,
    aspectRatio: options.aspectRatio,
    adaptiveCopy: renderMode === 'model_text_baked',
    sourceBrief: options.sourceBrief,
  }),
  makeSpec({
    pageIndex: 8,
    pageName: '产品细节 / 参数总结页',
    uniqueSellingPoint: '总结产品细节和可确认的信息模块',
    title: '细节信息完整收束',
    subtitle: '重点细节集中呈现，购买前看得更清楚',
    tags: [
      { text: '细节汇总', icon: 'list' },
      { text: '信息清楚', icon: 'info' },
      { text: '购买安心', icon: 'check' },
    ],
    localNotes: ['重点细节', '边角工艺'],
    closeupCount: 2,
    productPosition: 'left',
    labelArea: 'right',
    closeupPosition: 'right',
    layoutLanguage: '参数总结页：左侧产品和局部细节拼图，右侧信息模块留白和购买安心标签',
    renderMode,
    aspectRatio: options.aspectRatio,
    adaptiveCopy: renderMode === 'model_text_baked',
    sourceBrief: options.sourceBrief,
  }),
];

const specToOutput = (spec: DetailPageSpec): WorkflowOutputSpec => {
  const id = spec.pageIndex === 1
    ? 'master_page_image'
    : `page_${String(spec.pageIndex).padStart(2, '0')}_${spec.pageName
      .replace(/\s*\/\s*/g, '_')
      .replace(/[^\w\u4e00-\u9fa5]+/g, '_')
      .replace(/^_+|_+$/g, '')}`;
  const status: DetailPageStatus = spec.pageIndex === 1 ? 'pending' : 'waiting_for_master';
  return {
    id,
    title: `Page ${String(spec.pageIndex).padStart(2, '0')}：${spec.pageName}`,
    type: 'image_generator',
    enabled: true,
    order: spec.pageIndex,
    aspectRatio: spec.layout.aspectRatio,
    prompt: buildDetailPagePrompt(spec),
    inputRoles: spec.pageIndex === 1
      ? ['product_reference_image']
      : ['product_reference_image', 'master_page_image'],
    requiresReferenceImages: true,
    editable: true,
    uniqueSellingPoint: spec.uniqueSellingPoint,
    pageSpec: spec,
    status,
    imageTextLanguage: 'zh-CN',
    renderMode: spec.renderMode,
  };
};

export interface BuildEcommerceDetailPageDraftInput {
  originalRequest: string;
  strategyEnabled?: boolean;
  outputIds?: string[];
  languagePolicy?: WorkflowTextPolicy;
  renderMode?: DetailPageRenderMode;
  aspectRatio?: string;
  targetSize?: string | null;
  resolution?: string | null;
  provider?: string | null;
  model?: string | null;
}

export function buildEcommerceDetailPageDraftFromRequest(
  input: BuildEcommerceDetailPageDraftInput,
): WorkflowRecipeDraft {
  const languagePolicy = input.languagePolicy ?? detectUserLanguagePolicyForDetail(input.originalRequest);
  const renderMode = input.renderMode ?? inferDetailPageRenderMode(input.originalRequest);
  const specs = buildDefaultEcommerceDetailPageSpecs(renderMode, {
    aspectRatio: input.aspectRatio,
    sourceBrief: input.originalRequest,
  });
  const enabledIds = input.outputIds?.length ? new Set(input.outputIds) : null;
  const outputs = specs.map(specToOutput).map(output => ({
    ...output,
    targetSize: input.targetSize ?? output.targetSize,
    resolution: input.resolution ?? output.resolution,
    provider: input.provider ?? output.provider,
    model: input.model ?? output.model,
    enabled: enabledIds ? enabledIds.has(output.id) : true,
  }));

  return {
    id: createId('ecommerce-detail-page-draft'),
    name: '产品详情页图片工作流',
    description: '根据产品参考图生成带母版机制的电商产品详情页图片',
    templateId: 'ecommerce-detail-page',
    languagePolicy: {
      ...languagePolicy,
      promptLanguage: 'zh-CN',
      visibleTextLanguage: 'zh-CN',
      imageTextLanguage: 'zh-CN',
    },
    inputs: [
      { id: 'product_reference_image', label: '产品参考图', type: 'image', required: true },
      { id: 'product_description', label: '产品描述', type: 'text', required: false },
      { id: 'selling_points', label: '核心卖点', type: 'text', required: false },
      { id: 'target_user', label: '目标用户', type: 'text', required: false },
      { id: 'usage_scene', label: '使用场景', type: 'text', required: false },
    ],
    strategy: {
      enabled: false,
      mode: 'disabled',
      title: '详情页卖点策略',
      prompt: '',
    },
    outputs,
    metadata: {
      originalRequest: input.originalRequest,
      createdBy: 'app-agent',
      editable: true,
      aspectRatio: input.aspectRatio,
      targetSize: input.targetSize,
      resolution: input.resolution,
      provider: input.provider,
      model: input.model,
    },
  };
}

export const buildProductDetailPageDraft = buildEcommerceDetailPageDraftFromRequest;
export const PRODUCT_DETAIL_PAGE_DEFAULT_OUTPUTS = buildDefaultEcommerceDetailPageSpecs('model_text_baked').map(specToOutput);
