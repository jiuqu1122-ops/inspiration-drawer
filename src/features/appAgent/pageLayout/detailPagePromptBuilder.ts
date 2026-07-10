import type { DetailPageRenderMode, DetailPageSpec } from './detailPageLayoutTypes';
import { buildEcommerceDetailPageQualityNotes } from '../imageQuality/profiles/ecommerceDetailPageProfile';

export const inferDetailPageRenderMode = (userText: string): DetailPageRenderMode => {
  if (/后期.*加字|自己.*加字|只要底图|不要文案|不要文字|不要图标|无文字|no\s*(?:copy|text|icon)/i.test(userText)) {
    return 'visual_background_only';
  }
  if (/后期.*合成|程序.*(?:加字|叠字|排版)|overlay|composited_final_page/i.test(userText)) {
    return 'composited_final_page';
  }
  return 'model_text_baked';
};

export const buildDetailPageVisualBackgroundPrompt = (spec: DetailPageSpec) => [
  `Page ${String(spec.pageIndex).padStart(2, '0')} ${spec.pageName}`,
  `Core selling point: ${spec.uniqueSellingPoint}.`,
  buildEcommerceDetailPageQualityNotes(spec),
  `Page-specific layout contract: ${spec.styleAnchor.layoutLanguage}.`,
  `Composition: ${spec.layout.aspectRatio} ecommerce detail-page background, product position ${spec.layout.productPosition}, product angle ${spec.layout.productAngle}, title area at ${spec.layout.titleArea}, label area at ${spec.layout.labelArea}, closeup frames ${spec.layout.closeupCount}${spec.layout.closeupPosition ? ` at ${spec.layout.closeupPosition}` : ''}.`,
  `Visual system: ${spec.styleAnchor.backgroundStyle}; main color ${spec.styleAnchor.mainColor}; auxiliary colors ${spec.styleAnchor.auxiliaryColors.join(', ')}; accent color ${spec.styleAnchor.accentColor}; lighting ${spec.styleAnchor.lighting}; closeup frame style ${spec.styleAnchor.closeupFrameStyle}.`,
  'Generate the product visual background, product rendering, lighting, scene depth, clean negative space, and optional closeup frames with premium ecommerce quality.',
  'Strictly reference product_reference_image for product structure, proportion, material, color, key part positions and functional relationships.',
  spec.pageIndex > 1
    ? 'Use master_page_image only as a style reference for color palette, lighting, background language and frame treatment. Do not copy its product placement, crop, camera angle, title/tag positions or overall composition.'
    : 'This page establishes the master visual system for the whole detail-page set.',
  spec.pageIndex > 1
    ? 'This page must look compositionally different from Page 01 and from neighboring pages while keeping the same product identity and visual system.'
    : 'Later pages should inherit this page as a style system, not as a repeated layout template.',
  'The product must stay the clearest visual subject. Do not crop or cover key structures. Follow the current page-specific layout even when the master reference suggests a different arrangement.',
  'Reserve the top title area and selling-point label area. Do not generate readable text, icons, logo, watermark, fake certificates or fake numerical claims in the image model output.',
  'The final Chinese page number, title, subtitle, three selling tags and icons will be composited by the programmatic overlay layer.',
  'Final self-check before output: same product identity, no invented parts, clean background hierarchy, page-specific layout is clearly different, readable reserved layout zones, no fake text.',
].join('\n');

export const buildDetailPageModelTextPrompt = (spec: DetailPageSpec) => [
  '角色：电商产品详情页视觉总监、产品渲染指导与详情页生成执行专家。',
  `页面编号：Page ${String(spec.pageIndex).padStart(2, '0')}`,
  `页面主题：${spec.pageName}`,
  `核心卖点：${spec.uniqueSellingPoint}`,
  buildEcommerceDetailPageQualityNotes(spec),
  '产品锚点：严格参考 product_reference_image，保持产品整体轮廓、长宽比例、颜色、材质、零件位置、功能结构和主体尺寸感一致。不得增加原图不存在的按钮、孔位、接口、配件、装饰或功能模块，不得改变产品主色、材质关系和主体比例。',
  spec.pageIndex > 1
    ? '风格锚点：同时参考 master_page_image，仅延续第 1 页主视觉母版的背景色体系、光影方向、图形装饰语言、局部特写框样式、强调色、留白比例和整体高级感。不得复制母版的产品位置、裁切、镜头角度、标题/标签位置或整体构图。'
    : '风格锚点：建立第 1 页主视觉母版，确定整套详情页的背景、光影、配色、图形装饰、标题区、标签区、局部特写框和整体高级感。',
  `画面比例：${spec.layout.aspectRatio}`,
  `产品位置：${spec.layout.productPosition}`,
  `产品展示角度：${spec.layout.productAngle}`,
  '标题留白区域：顶部约 25%，页面编号、一级标题、副标题和卖点标签必须形成清晰层级。',
  `构图锚点：${spec.styleAnchor.layoutLanguage}`,
  `局部特写数量：${spec.layout.closeupCount} 个`,
  `局部特写位置：${spec.layout.closeupPosition || '无'}`,
  `标签/信息模块位置：${spec.layout.labelArea}`,
  `场景与背景：${spec.styleAnchor.backgroundStyle}；主背景 ${spec.styleAnchor.mainColor}；辅助色 ${spec.styleAnchor.auxiliaryColors.join('、')}；强调色 ${spec.styleAnchor.accentColor}。背景干净、有层次，不抢夺产品主体。`,
  `光影与材质：${spec.styleAnchor.lighting}；产品边缘清晰，材质真实，细节清楚，避免错误反射、透视错误、悬浮感、过曝和塑料感过强。`,
  '成品文字与图标要求：当前页面必须生成完整电商详情页成图，不是无文字底图，也不是普通产品渲染图。',
  '以下文字必须直接、清晰、准确地出现在画面中：',
  `页面编号：${spec.copy.pageNo}`,
  `一级标题：${spec.copy.title}`,
  `副标题：${spec.copy.subtitle}`,
  ...spec.copy.tags.map((tag, index) => `卖点标签 ${index + 1}：${tag.text}（图标建议：${tag.icon}）`),
  '文字必须使用简体中文，必须清晰可读，不得省略文字，不得使用英文替代中文，不得使用乱码、伪文字、无意义符号或空白占位框。',
  '排版规则：页面编号置于顶部中央的小型强调色标签中；一级标题置于上方主标题区，使用大号粗黑中文字体；副标题置于标题下方，使用中号深灰中文字体；三个卖点标签使用圆角描边信息框并搭配统一线性图标；标题和标签不能遮挡产品；产品仍然是画面最大、最重要的视觉主体；页面文字层级必须像高端电商详情页。',
  spec.layout.closeupCount > 0
    ? '局部特写规则：生成真实圆角局部特写卡片，特写必须对应产品真实位置，可用细线连接产品与特写；每个特写卡片包含短中文说明，不超过 16 个汉字。'
    : '场景/主图规则：不需要局部特写卡片时，生成完整场景或英雄主图构图，顶部文字和卖点图标完整，产品主体清晰且比例正确。',
  '禁止内容：不要品牌 logo、水印、虚假认证、虚构具体参数、错误结构、无关配件、复杂背景、大段文字、乱码、空白文本框、模糊小字、人物遮挡产品核心结构、产品漂浮、错误透视或夸张无意义特效。',
  '生成目标：生成一张带完整中文标题、卖点标签、图标、产品主体、局部结构展示或场景模块、统一版式的高端电商详情页成图。画面必须与其他页面保持同一产品、同一视觉系统、同一品牌调性。',
  'Final self-check: complete ecommerce detail-page layout, same product identity, one selling point, readable Simplified Chinese copy, page-specific composition, no invented structure, no fake certification.',
].join('\n');

export const buildDetailPagePrompt = (spec: DetailPageSpec) => (
  spec.renderMode === 'model_text_baked'
    ? buildDetailPageModelTextPrompt(spec)
    : buildDetailPageVisualBackgroundPrompt(spec)
);
