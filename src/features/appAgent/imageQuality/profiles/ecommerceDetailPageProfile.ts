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
    'Page 01 建立视觉母版；后续页面延续母版的背景、光影、配色、图形语言、留白和局部特写框样式。',
    'Page 02-08 同时参考 product_reference_image 与 master_page_image。',
  ],
  copyRules: [
    '默认使用简体中文标题、副标题和三个卖点标签。',
    'composited_final_page 默认由程序化 overlay 放置文字和图标，底图 prompt 不要求模型生成中文文字。',
    '禁止乱码、英文替代中文、伪文字、空白文本框和模糊小字。',
  ],
  layoutRules: [
    '每页只表达一个 uniqueSellingPoint。',
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
  `Layout: product ${spec.layout.productPosition}, angle ${spec.layout.productAngle}, title ${spec.layout.titleArea}, labels ${spec.layout.labelArea}, closeups ${spec.layout.closeupCount}.`,
].join('\n');
