import type { DetailPageRenderMode, DetailPageSpec } from './detailPageLayoutTypes';
import { buildEcommerceDetailPageQualityNotes } from '../imageQuality/profiles/ecommerceDetailPageProfile';

export const inferDetailPageRenderMode = (userText: string): DetailPageRenderMode => {
  if (/后期.*加字|自己.*加字|只要底图|不要文案|不要文字|不要图标|无文字|no\s*(?:copy|text|icon)/i.test(userText)) {
    return 'visual_background_only';
  }
  if (/模型.*直接.*(?:文字|文案)|直接.*模型.*(?:生成|出).*(?:文字|文案)|文字.*烘焙|model_text_baked/i.test(userText)) {
    return 'model_text_baked';
  }
  return 'composited_final_page';
};

export const buildDetailPageVisualBackgroundPrompt = (spec: DetailPageSpec) => [
  `Page ${String(spec.pageIndex).padStart(2, '0')} ${spec.pageName}`,
  `Core selling point: ${spec.uniqueSellingPoint}.`,
  buildEcommerceDetailPageQualityNotes(spec),
  `Composition: ${spec.layout.aspectRatio} ecommerce detail-page background, product position ${spec.layout.productPosition}, product angle ${spec.layout.productAngle}, title area at ${spec.layout.titleArea}, label area at ${spec.layout.labelArea}, closeup frames ${spec.layout.closeupCount}.`,
  `Visual system: ${spec.styleAnchor.backgroundStyle}; main color ${spec.styleAnchor.mainColor}; auxiliary colors ${spec.styleAnchor.auxiliaryColors.join(', ')}; accent color ${spec.styleAnchor.accentColor}; lighting ${spec.styleAnchor.lighting}; closeup frame style ${spec.styleAnchor.closeupFrameStyle}.`,
  'Generate the product visual background, product rendering, lighting, scene depth, clean negative space, and optional closeup frames with premium ecommerce quality.',
  'Strictly reference product_reference_image for product structure, proportion, material, color, key part positions and functional relationships.',
  spec.pageIndex > 1
    ? 'Also reference master_page_image for the visual system, background language, lighting direction, color palette, frame style and layout rhythm.'
    : 'This page establishes the master visual system for the whole detail-page set.',
  'The product must stay the largest and clearest visual subject. Do not crop or cover key structures. Keep all later pages visually compatible with the master page.',
  'Reserve the top title area and selling-point label area. Do not generate readable text, icons, logo, watermark, fake certificates or fake numerical claims in the image model output.',
  'The final Chinese page number, title, subtitle, three selling tags and icons will be composited by the programmatic overlay layer.',
  'Final self-check before output: same product identity, no invented parts, clean background hierarchy, readable reserved layout zones, no fake text.',
].join('\n');

export const buildDetailPageModelTextPrompt = (spec: DetailPageSpec) => [
  `Page ${String(spec.pageIndex).padStart(2, '0')} ${spec.pageName}`,
  buildEcommerceDetailPageQualityNotes(spec),
  `Composition: ${spec.layout.aspectRatio}, product position ${spec.layout.productPosition}, product angle ${spec.layout.productAngle}, closeup frames ${spec.layout.closeupCount}.`,
  'Generate a complete ecommerce detail page with baked-in Chinese copy and icons. This mode is only used when the user explicitly wants model-rendered text.',
  `页面编号：${spec.copy.pageNo}`,
  `一级标题：${spec.copy.title}`,
  `副标题：${spec.copy.subtitle}`,
  ...spec.copy.tags.map((tag, index) => `卖点标签 ${index + 1}：${tag.text}（图标：${tag.icon}）`),
  '文字必须使用简体中文，清晰可读，层级明确；标题和标签不得遮挡产品主体。',
  '不要英文替代、乱码、伪文字、空白文本框、虚假参数、品牌 logo 或水印。',
  'Final self-check before output: same product identity, one selling point, three clear tags, no invented structure, no fake certification.',
].join('\n');

export const buildDetailPagePrompt = (spec: DetailPageSpec) => (
  spec.renderMode === 'model_text_baked'
    ? buildDetailPageModelTextPrompt(spec)
    : buildDetailPageVisualBackgroundPrompt(spec)
);
