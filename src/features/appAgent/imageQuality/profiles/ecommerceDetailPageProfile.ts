import type { DetailPageSpec } from '../../pageLayout/detailPageLayoutTypes';

export const ecommerceDetailPageQualityProfile = {
  id: 'ecommerce_detail_page',
  label: '电商产品详情页质量 Profile',
  scope: 'ecommerce-detail-page-only',
  productAnchorRules: [
    '锁定原始产品图中的轮廓、比例、颜色、材质、零件位置和功能关系。',
    '禁止新增原图不存在的按钮、孔位、接口、结构、配件、品牌 logo 或认证标识。',
    '当文字描述和产品图冲突时，以产品图为准。',
  ],
  styleAnchorRules: [
    'Page 01 建立视觉母版；后续页面只延续母版的背景、光影、配色、图形语言、留白和局部特写框样式，不复制母版构图。',
    'Page 02-08 同时参考 product_reference_image 与 master_page_image。',
  ],
  copyRules: [
    '默认使用简体中文标题、副标题和三个卖点标签，但可见文案必须根据 product_reference_image 和用户需求自动改写成具体产品文案。',
    'model_text_baked 默认直接生成完整详情页排版：页面编号、大标题、副标题、卖点图标/标签、局部信息卡片必须在图内可见，且不得把 prompt 规则或内部约束当成文案。',
    'composited_final_page 仅用于用户明确要求后期程序合成文字的场景。',
    '禁止乱码、英文替代中文、伪文字、空白文本框和模糊小字。',
  ],
  layoutRules: [
    '每页只表达一个 uniqueSellingPoint。',
    '每页必须执行自己的 layoutLanguage，避免整套图都变成同一个首屏母版构图。',
    '保留标题区、标签区和局部说明区，文字不得遮挡产品主体。',
    '局部特写框最多三个，必须对应真实产品结构。',
  ],
} as const;

export const buildEcommerceDetailPageQualityNotes = (spec: DetailPageSpec) => [
  `Quality profile: ${ecommerceDetailPageQualityProfile.id}.`,
  `Page ${String(spec.pageIndex).padStart(2, '0')}: ${spec.pageName}.`,
  `Unique selling point: ${spec.uniqueSellingPoint}.`,
  `Product locks: ${spec.productAnchor.lockedFeatures.join('；')}.`,
  `Forbidden changes: ${spec.productAnchor.forbiddenChanges.join('；')}.`,
  `Style anchor: ${spec.styleAnchor.backgroundStyle} / ${spec.styleAnchor.mainColor} / ${spec.styleAnchor.lighting}.`,
  `Layout language: ${spec.styleAnchor.layoutLanguage}.`,
  `Layout: product ${spec.layout.productPosition}, angle ${spec.layout.productAngle}, title ${spec.layout.titleArea}, labels ${spec.layout.labelArea}, closeups ${spec.layout.closeupCount}${spec.layout.closeupPosition ? ` at ${spec.layout.closeupPosition}` : ''}.`,
].join('\n');
