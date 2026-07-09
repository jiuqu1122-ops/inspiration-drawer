import type { AppAgentSkill, ContextScope } from './types';
import { createSkillMatch, noSkillMatch } from './types';
import { findKeywordHits } from './skillUtils';

export const ECOMMERCE_DETAIL_PAGE_SKILL_ID = 'ecommerce-detail-page-skill' as const;

export const ECOMMERCE_DETAIL_PAGE_KEYWORDS = [
  '详情页',
  '电商详情页',
  '商品详情页',
  '详情页图片',
  '做一套详情页',
  '生成详情页',
  '主图',
  '卖点图',
  '功能图',
  '参数图',
  '长图',
  '淘宝详情',
  '亚马逊 listing',
  '小红书商品图',
  'listing images',
] as const;

const ECOMMERCE_DETAIL_PAGE_PATTERN = /详情页|电商详情|商品详情|详情页图片|做一套详情页|生成详情页|主图|卖点图|功能图|参数图|长图|淘宝详情|亚马逊\s*listing|amazon\s*listing|listing\s*images|小红书商品图/i;

export const isEcommerceDetailPageRequest = (userText: string) => (
  ECOMMERCE_DETAIL_PAGE_PATTERN.test(userText)
);

export const ecommerceDetailPageSkill: AppAgentSkill = {
  id: ECOMMERCE_DETAIL_PAGE_SKILL_ID,
  label: 'Ecommerce Detail Page',
  description: '电商/商品详情页图片工作流、母版机制、中文排版和质量约束。',
  match: input => {
    if (!isEcommerceDetailPageRequest(input.userText)) return noSkillMatch();
    const hits = findKeywordHits(input.userText, ECOMMERCE_DETAIL_PAGE_KEYWORDS);
    const selectedImageBonus = input.hasSelectedImages ? 0.08 : 0;
    return createSkillMatch(
      Math.min(0.97, 0.72 + hits.length * 0.04 + selectedImageBonus),
      hits.length > 0 ? hits.map(hit => `keyword:${hit}`) : ['ecommerce detail-page intent'],
    );
  },
  getRequiredContext: (): ContextScope[] => ['canvas'],
  buildPromptPatch: () => [
    'Active skill: ecommerce-detail-page-skill.',
    'Use only for explicit ecommerce/product detail-page tasks such as 详情页, 商品详情页, 主图卖点图, 功能图, 参数图, 长图, listing images.',
    'Route to ecommerce-detail-page/product-detail-page workflow draft, not industrial-design-review.',
    'Default renderMode is composited_final_page: image model creates the product/background visual, then the programmatic layout layer overlays Chinese page number, title, subtitle, three tags and icons.',
    'Use visual_background_only only when the user says they will add text later or asks for no copy/icons.',
    'Use Page 01 as master_page_image first; Page 02+ waits for master approval and references both product_reference_image and master_page_image.',
  ].join('\n'),
};
