import type { AppAgentSkill, ContextScope, SkillMatchInput } from './types';
import { createSkillMatch, noSkillMatch } from './types';
import { findKeywordHits, normalizeSkillText, uniqueStrings } from './skillUtils';
import { parseWorkflowBuilderIntent } from './workflowBuilderSkill';
import type { DesignReferencePlan, DesignReferencePlanItem } from '../inspirationMemory/types';

export type CreativeImageRole = 'BASE' | 'STYLE_REF' | 'LAYOUT_REF' | 'SUBJECT_REF' | 'NONE';

export type CreativeFidelityLevel = 'L1' | 'L2' | 'L3' | 'L4';

export type CreativeTaskKind =
  | 'generate'
  | 'edit'
  | 'product_design'
  | 'cmf'
  | 'storyboard'
  | 'video'
  | 'prompt'
  | 'review';

export interface CreativeImageRoleAssignment {
  imageId: string;
  role: CreativeImageRole;
  reason: string;
  parameterTarget?: 'source_image_url' | 'reference_image_urls' | 'none';
  ambiguous?: boolean;
}

export interface CreativeDimensions {
  aspectRatio?: string;
  targetSize?: string;
  resolution?: string;
  orientation?: 'landscape' | 'portrait' | 'square';
  sources: string[];
}

export interface ProductDesignContext {
  isProductTask: boolean;
  category: string;
  usageMode: string;
  goal: string;
  iterationStage: string;
  focus: string[];
  risks: string[];
}

export interface CreativeBrief {
  originalRequest: string;
  taskKind: CreativeTaskKind;
  mediaType: 'image' | 'video';
  isEdit: boolean;
  dimensions: CreativeDimensions;
  imageRoles: CreativeImageRoleAssignment[];
  fidelity: CreativeFidelityLevel;
  product: ProductDesignContext;
  toolHint?: string;
  requiresStoryboardFirst: boolean;
  requiresStrategyFirst: boolean;
  generatorPrompt: string;
  projectBrief: ProjectBrief;
}

export interface ProjectBrief {
  productType: string;
  targetUsers: string[];
  styleKeywords: string[];
  materialPreferences: string[];
  colorPreferences: string[];
  prohibitedDirections: string[];
  outputGoals: string[];
}

export interface CreativeGeneratorValidationInput {
  args: Record<string, unknown>;
  userText: string;
  hasReferenceImages?: boolean;
}

const CREATIVE_KEYWORDS = [
  '生成',
  '出图',
  '做图',
  '渲染',
  '效果图',
  '产品图',
  '产品设计',
  '工业设计',
  'cmf',
  '材质',
  '配色',
  '改图',
  '换背景',
  '扩图',
  '参考图',
  '分镜',
  '故事板',
  '视频',
  '海报',
  '场景图',
  'generate',
  'render',
  'image',
  'video',
  'storyboard',
  'product design',
  'industrial design',
] as const;

const EDIT_KEYWORDS = [
  '改图',
  '修改',
  '编辑',
  '修复',
  '扩图',
  '换背景',
  '替换',
  '只改',
  '保持不变',
  '不要改',
  'edit',
  'modify',
  'change',
  'fix',
  'extend',
  'remove',
] as const;

const PRODUCT_KEYWORDS = [
  '产品',
  '工业设计',
  '外观',
  '造型',
  '结构',
  '按键',
  '接口',
  'cmf',
  '材质',
  '配色',
  '渲染',
  '效果图',
  'product',
  'industrial',
  'material',
  'color',
] as const;

const DIRECT_EXECUTION_KEYWORDS = ['直接生成', '直接出', '直接跑', '直接执行', '马上生成', '立刻生成', 'auto run'] as const;

const PRODUCT_CATEGORY_RULES: Array<{
  category: string;
  keywords: readonly string[];
  usageMode: string;
  focus: readonly string[];
}> = [
  {
    category: '手持控制类',
    keywords: ['手柄', '遥控器', '方向盘', '鼠标', '摄影手柄', '工具手柄', 'controller', 'remote', 'mouse'],
    usageMode: '手持',
    focus: ['握持人机', '拇指/食指可达性', '左右平衡', '按键触达路径', '防滑区', '误触风险'],
  },
  {
    category: '桌面输入类',
    keywords: ['键盘', '控制台', '混音台', '旋钮', 'keyboard', 'console', 'mixer'],
    usageMode: '桌面',
    focus: ['操作分区', '视觉层级', '按键间距', '盲操作识别', '状态指示', '线缆/接口逻辑'],
  },
  {
    category: '穿戴类',
    keywords: ['耳机', '手表', '眼镜', '背包', '护具', 'wearable', 'watch', 'headphone', 'glasses'],
    usageMode: '佩戴',
    focus: ['贴合度', '重量分布', '皮肤接触材质', '透气性', '调节结构', '安全边界'],
  },
  {
    category: '移动智能硬件',
    keywords: ['手机', '平板', '掌机', 'pos', '扫描器', 'phone', 'tablet', 'scanner', 'handheld'],
    usageMode: '手持/移动',
    focus: ['屏幕/按键层级', '边框比例', '接口与散热', '跌落保护', '握持姿态', '信息可读性'],
  },
  {
    category: '家电/生活电器',
    keywords: ['咖啡机', '净化器', '风扇', '厨房电器', '家电', 'coffee', 'purifier', 'fan', 'appliance'],
    usageMode: '放置/操作',
    focus: ['家居融入度', '清洁维护', '开合路径', '安全间距', '操作反馈', '品牌质感'],
  },
  {
    category: '工具/户外/运动装备',
    keywords: ['工具', '户外', '运动装备', '电钻', '露营', 'tool', 'outdoor', 'sport'],
    usageMode: '手持/携带',
    focus: ['结构强度', '抓握可靠性', '耐脏耐磨', '功能外露逻辑', '收纳和携带', '环境适应性'],
  },
  {
    category: '家具/空间用品',
    keywords: ['家具', '椅子', '桌子', '灯架', '收纳架', 'furniture', 'chair', 'desk'],
    usageMode: '空间放置',
    focus: ['尺度', '人机姿态', '受力结构', '稳定性', '边角安全', '材料触感'],
  },
  {
    category: '音频/影像设备',
    keywords: ['音箱', '麦克风', '摄像头', '投影仪', 'speaker', 'microphone', 'camera', 'projector'],
    usageMode: '陈列/观看/拾音',
    focus: ['声学/散热开孔', '拾音/出声方向', '镜头/传感器保护', '状态灯', '接口隐藏', '场景陈列'],
  },
  {
    category: '灯具/照明产品',
    keywords: ['灯具', '照明', '台灯', '吊灯', 'light', 'lamp'],
    usageMode: '安装/放置',
    focus: ['发光面', '眩光控制', '散热', '光线方向', '安装方式', '开关可达性'],
  },
  {
    category: '包装/品牌物料',
    keywords: ['包装', '盒子', '瓶标', '海报', '物料', 'package', 'packaging', 'poster'],
    usageMode: '陈列/识别',
    focus: ['正面识别', '货架冲击力', '信息层级', '开箱路径', '材质印刷', '品牌一致性'],
  },
  {
    category: '交通/车载/骑行配件',
    keywords: ['车载', '骑行', '自行车', '汽车', '支架', 'vehicle', 'bike', 'car mount'],
    usageMode: '安装/移动',
    focus: ['安装可靠性', '抗震', '驾驶/骑行安全', '单手操作', '夜间可见性', '线缆与固定结构'],
  },
  {
    category: '医疗/护理/儿童相关产品',
    keywords: ['医疗', '护理', '儿童', '婴儿', '康复', 'medical', 'care', 'baby', 'kids'],
    usageMode: '接触/护理',
    focus: ['安全', '卫生', '易清洁', '圆角', '误用风险', '可信感'],
  },
  {
    category: '装饰/收藏/玩具',
    keywords: ['玩具', '收藏', '摆件', '潮玩', '装饰', 'toy', 'collectible'],
    usageMode: '陈列/互动',
    focus: ['角色识别', '比例趣味', '情绪表达', '材质安全', '陈列姿态', '系列化语言'],
  },
];

const roleToParameterTarget = (role: CreativeImageRole): CreativeImageRoleAssignment['parameterTarget'] => {
  if (role === 'BASE') return 'source_image_url';
  if (role === 'NONE') return 'none';
  return 'reference_image_urls';
};

const makeRole = (
  imageId: string,
  role: CreativeImageRole,
  reason: string,
  ambiguous = false,
): CreativeImageRoleAssignment => ({
  imageId,
  role,
  reason,
  parameterTarget: roleToParameterTarget(role),
  ambiguous,
});

const lowerFidelity = (level: CreativeFidelityLevel): CreativeFidelityLevel => {
  if (level === 'L4') return 'L3';
  if (level === 'L3') return 'L2';
  if (level === 'L2') return 'L1';
  return 'L1';
};

const getImageIds = (input: SkillMatchInput, imageIds?: string[]) => {
  if (imageIds?.length) return imageIds;
  const count = input.selectedItemCount || (input.hasSelectedImages ? 1 : 0);
  return Array.from({ length: count }, (_, index) => `Image #${index + 1}`);
};

export const isCreativeLikeRequest = (userText: string) => (
  findKeywordHits(userText, CREATIVE_KEYWORDS).length > 0
);

export const isCreativeEditRequest = (userText: string) => (
  findKeywordHits(userText, EDIT_KEYWORDS).length > 0
);

export const isDirectCreativeExecutionRequest = (userText: string) => (
  findKeywordHits(userText, DIRECT_EXECUTION_KEYWORDS).length > 0
  || /(?:生成|出图|渲染|运行|执行|run|generate)/i.test(userText)
);

export const isExplicitVideoGenerationRequest = (userText: string) => (
  /(?:生成|做成|输出|制作|直接生成)\s*(?:一段|这个|该)?\s*视频/i.test(userText)
  || /(?:出视频|成片|根据.*分镜.*生成视频)/i.test(userText)
  || /(?:generate|make|render)\s+(?:a\s+)?video/i.test(userText)
);

export function parseCreativeDimensions(userText: string): CreativeDimensions {
  const text = userText.trim();
  const lower = normalizeSkillText(text);
  const dimensions: CreativeDimensions = { sources: [] };
  const widthHeight = /\bwidth\s*(\d{2,5})\s*height\s*(\d{2,5})\b/i.exec(text);
  const pixelSize = /(?:^|[^\w])(\d{2,5})\s*(?:x|\*|×)\s*(\d{2,5})(?:[^\w]|$)/i.exec(text);
  if (widthHeight) {
    dimensions.targetSize = `${widthHeight[1]}x${widthHeight[2]}`;
    dimensions.sources.push(widthHeight[0].trim());
  } else if (pixelSize) {
    dimensions.targetSize = `${pixelSize[1]}x${pixelSize[2]}`;
    dimensions.sources.push(pixelSize[0].trim());
  }

  const ratio = /(?:^|[^\d])([1-9]\d?)\s*(?::|：|比)\s*([1-9]\d?)(?:[^\d]|$)/.exec(text);
  if (ratio) {
    dimensions.aspectRatio = `${ratio[1]}:${ratio[2]}`;
    dimensions.sources.push(ratio[0].trim());
  }

  if (!dimensions.aspectRatio) {
    if (/(横版|landscape|horizontal|banner)/i.test(text)) {
      dimensions.aspectRatio = '16:9';
      dimensions.orientation = 'landscape';
      dimensions.sources.push('landscape');
    } else if (/(竖版|portrait|vertical|手机壁纸|phone wallpaper|instagram story)/i.test(text)) {
      dimensions.aspectRatio = '9:16';
      dimensions.orientation = 'portrait';
      dimensions.sources.push('portrait');
    } else if (/(方图|square|instagram feed|小红书)/i.test(text)) {
      dimensions.aspectRatio = '1:1';
      dimensions.orientation = 'square';
      dimensions.sources.push('square');
    } else if (/海报/i.test(text)) {
      dimensions.aspectRatio = '3:4';
      dimensions.orientation = 'portrait';
      dimensions.sources.push('poster');
    }
  }

  if (/\b4k\b|超高清/i.test(lower)) {
    dimensions.resolution = '4K';
    dimensions.sources.push('4K');
  } else if (/\b2k\b/i.test(lower)) {
    dimensions.resolution = '2K';
    dimensions.sources.push('2K');
  } else if (/\b1080p\b|full hd|高清/i.test(lower)) {
    dimensions.resolution = '1080p';
    dimensions.sources.push('1080p');
  }

  return dimensions;
}

export function parseCreativeFidelity(
  userText: string,
  options: { hasImages?: boolean; isEdit?: boolean } = {},
): CreativeFidelityLevel {
  const text = normalizeSkillText(userText);
  let level: CreativeFidelityLevel = options.isEdit || options.hasImages ? 'L2' : 'L3';
  if (/(其余不变|角度不要变|只改|保持细节|保持不变|不要改结构|only change|keep.*unchanged|same angle)/i.test(text)) {
    level = 'L1';
  } else if (/(在这个基础上|局部优化|重新设计中间|按键重新排|based on this|local optimize)/i.test(text)) {
    level = 'L2';
  } else if (/(深化|增加设计点|更高级|方案深化|refine|make it premium|more advanced)/i.test(text)) {
    level = 'L3';
  } else if (/(完全重新设计|重新做|重做|换风格|不要沿用|redesign from scratch|do not reuse)/i.test(text)) {
    level = 'L4';
  }
  if (/(不要改太多|别改太多|not too much|subtle)/i.test(text)) return lowerFidelity(level);
  return level;
}

export function parseCreativeImageRoles(
  input: SkillMatchInput,
  imageIds?: string[],
): CreativeImageRoleAssignment[] {
  const ids = getImageIds(input, imageIds);
  if (ids.length === 0) return [];
  const text = input.userText;
  const normalized = normalizeSkillText(text);
  const imageNumberToId = (value: string) => {
    const index = Math.max(0, Number(value) - 1);
    return ids[index] || `Image #${value}`;
  };
  const roles = new Map<string, CreativeImageRoleAssignment>();
  const setRole = (id: string, role: CreativeImageRole, reason: string) => {
    roles.set(id, makeRole(id, role, reason));
  };

  const placeMatch = /place\s+image\s*#?(\d+).*scene\s+of\s+image\s*#?(\d+)/i.exec(text);
  if (placeMatch) {
    setRole(imageNumberToId(placeMatch[1]), 'SUBJECT_REF', 'placed subject reference');
    setRole(imageNumberToId(placeMatch[2]), 'BASE', 'scene/base image');
  }
  const redrawMatch = /redraw\s+image\s*#?(\d+).*style\s+of\s+image\s*#?(\d+)/i.exec(text);
  if (redrawMatch) {
    setRole(imageNumberToId(redrawMatch[2]), 'STYLE_REF', 'style source');
    setRole(imageNumberToId(redrawMatch[1]), 'BASE', 'redraw target');
  }
  const compositionMatch = /composition\s+of\s+image\s*#?(\d+).*color palette\s+of\s+image\s*#?(\d+)/i.exec(text);
  if (compositionMatch) {
    setRole(imageNumberToId(compositionMatch[1]), 'LAYOUT_REF', 'composition reference');
    setRole(imageNumberToId(compositionMatch[2]), 'STYLE_REF', 'color palette reference');
  }
  const modifyMatch = /modify\s+image\s*#?(\d+).*image\s*#?(\d+).*reference/i.exec(text);
  if (modifyMatch) {
    setRole(imageNumberToId(modifyMatch[1]), 'BASE', 'modify target');
    setRole(imageNumberToId(modifyMatch[2]), 'STYLE_REF', 'reference image');
  }
  const backgroundMatch = /change\s+the\s+background\s+of\s+image\s*#?(\d+).*image\s*#?(\d+).*mood/i.exec(text);
  if (backgroundMatch) {
    setRole(imageNumberToId(backgroundMatch[1]), 'BASE', 'background edit target');
    setRole(imageNumberToId(backgroundMatch[2]), 'STYLE_REF', 'mood reference');
  }
  const mergeMatch = /(merge|blend).*(image\s*#?1).*(image\s*#?2)/i.test(text);
  if (mergeMatch) {
    ids.slice(0, 2).forEach(id => setRole(id, 'SUBJECT_REF', 'merge/blend reference'));
  }

  const explicitBaseMatches = Array.from(text.matchAll(/(?:edit|modify|change|fix|extend|修改|编辑|修复|扩图|改)\s*(?:image|图|图片)?\s*#?(\d+)/gi));
  explicitBaseMatches.forEach(match => setRole(imageNumberToId(match[1]), 'BASE', 'explicit edit verb'));
  const explicitStyleMatches = Array.from(text.matchAll(/(?:style of|follow the style of|参考.*风格|按照)\s*(?:image|图|图片)?\s*#?(\d+)/gi));
  explicitStyleMatches.forEach(match => setRole(imageNumberToId(match[1]), 'STYLE_REF', 'explicit style reference'));

  if (roles.size === 0 && ids.length === 1) {
    const role: CreativeImageRole = isCreativeEditRequest(normalized) ? 'BASE' : 'SUBJECT_REF';
    return [makeRole(ids[0], role, role === 'BASE' ? 'single image with edit intent' : 'single image as generation reference')];
  }

  if (roles.size === 0 && ids.length > 1) {
    if (isCreativeEditRequest(normalized)) {
      return ids.map(id => makeRole(id, 'NONE', 'multiple images with unclear edit target', true));
    }
    return ids.map(id => makeRole(id, 'SUBJECT_REF', 'quick exploration reference', true));
  }

  return ids.map(id => roles.get(id) || makeRole(id, 'NONE', 'not referenced'));
}

export function inferProductDesignContext(userText: string): ProductDesignContext {
  const lower = normalizeSkillText(userText);
  const matchedRule = PRODUCT_CATEGORY_RULES.find(rule => (
    rule.keywords.some(keyword => lower.includes(keyword.toLowerCase()))
  ));
  const productKeywordHits = findKeywordHits(userText, PRODUCT_KEYWORDS);
  const isProductTask = productKeywordHits.length > 0 || !!matchedRule;
  const usageMode = matchedRule?.usageMode
    || (/手持|握持|handheld/.test(lower) ? '手持'
      : /佩戴|wear/.test(lower) ? '佩戴'
        : /安装|mount|install/.test(lower) ? '安装'
          : /桌面|desktop/.test(lower) ? '桌面'
            : '待判断');
  const goal = /cmf|材质|配色/.test(lower) ? 'CMF'
    : /重新|重做|redesign/.test(lower) ? '重新设计'
      : /优化|改进|refine/.test(lower) ? '局部优化'
        : /渲染|效果图|render/.test(lower) ? '效果图'
          : /线稿|sketch/.test(lower) ? '线稿'
            : '视觉生成';
  const iterationStage = /定稿|final/.test(lower) ? '定稿'
    : /深化|refine/.test(lower) ? '深化'
      : /比较|多个|方向|explore|concept/.test(lower) ? '方案比较'
        : /局部|只改/.test(lower) ? '局部修正'
          : '早期概念';
  const baseFocus = matchedRule?.focus ? [...matchedRule.focus] : [];
  const focus = uniqueStrings([
    ...baseFocus,
    ...(/cmf|材质|配色/.test(lower) ? ['CMF 服务产品定位'] : []),
    ...(/结构|分型|接口|散热|按键/.test(lower) ? ['结构合理性', '功能布局'] : []),
    ...(/高级|好看|美观|廉价/.test(lower) ? ['轮廓比例', '视觉层级', '材质克制'] : []),
  ]);
  const risks = uniqueStrings([
    ...(focus.length ? focus.slice(0, 4) : ['轮廓比例', '结构合理性', '人机/使用逻辑']),
    '避免默认添加科技感、发光线、复杂切线、碳纤维或裸露机械',
  ]);
  return {
    isProductTask,
    category: matchedRule?.category || (isProductTask ? '其他产品/视觉设计' : '非产品或待判断'),
    usageMode,
    goal,
    iterationStage,
    focus,
    risks,
  };
}

const collectBriefTerms = (text: string, rules: Array<[RegExp, string]>) => (
  uniqueStrings(rules.filter(([pattern]) => pattern.test(text)).map(([, label]) => label))
);

export function extractProjectBrief(userText: string, product = inferProductDesignContext(userText)): ProjectBrief {
  const text = normalizeSkillText(userText);
  return {
    productType: product.category,
    targetUsers: collectBriefTerms(text, [
      [/(儿童|孩子|亲子|kids?)/i, '儿童/家庭用户'],
      [/(年轻|青年|gen\s*z)/i, '年轻用户'],
      [/(专业|设计师|摄影师|工程师|professional)/i, '专业用户'],
      [/(户外|露营|旅行|outdoor|travel)/i, '移动/户外用户'],
      [/(老人|长辈|senior)/i, '银发用户'],
    ]),
    styleKeywords: collectBriefTerms(text, [
      [/(温暖|warm)/i, '温暖'], [/(复古|retro|vintage)/i, '复古'],
      [/(极简|minimal)/i, '极简'], [/(科技|tech)/i, '科技'],
      [/(高级|premium)/i, '高级'], [/(轻量|lightweight)/i, '轻量'],
      [/(自然|natural)/i, '自然'], [/(可爱|cute)/i, '可爱'],
    ]),
    materialPreferences: collectBriefTerms(text, [
      [/(铝|金属|metal|aluminum)/i, '金属/铝'], [/(木|wood)/i, '木材'],
      [/(塑料|plastic)/i, '塑料'], [/(玻璃|glass)/i, '玻璃'],
      [/(织物|布料|fabric)/i, '织物'], [/(陶瓷|ceramic)/i, '陶瓷'],
      [/(磨砂|matte)/i, '磨砂表面'],
    ]),
    colorPreferences: collectBriefTerms(text, [
      [/(暖白|米白|warm white)/i, '暖白/米白'], [/(黑|black)/i, '黑色'],
      [/(白|white)/i, '白色'], [/(灰|gray|grey)/i, '灰色'],
      [/(红|red)/i, '红色'], [/(蓝|blue)/i, '蓝色'], [/(绿|green)/i, '绿色'],
    ]),
    prohibitedDirections: uniqueStrings([
      ...collectBriefTerms(text, [
        [/(不要|避免|禁止).{0,12}(科技|发光|炫光)/i, '避免泛科技感和发光装饰'],
        [/(不要|避免|禁止).{0,12}(复杂|切线|装饰)/i, '避免复杂切线和装饰噪声'],
        [/(不要|避免|禁止).{0,12}(碳纤维|carbon)/i, '避免碳纤维'],
      ]),
      ...product.risks.filter(risk => /避免|不得|禁止/.test(risk)),
    ]),
    outputGoals: uniqueStrings([
      product.goal,
      ...collectBriefTerms(text, [
        [/(效果图|渲染|render)/i, '产品效果图'], [/(方案|方向|concept)/i, '概念方案'],
        [/(cmf|配色|材质)/i, 'CMF 方案'], [/(工作流|workflow)/i, '设计工作流'],
        [/(分镜|storyboard)/i, '视觉分镜'], [/(视频|video)/i, '视频'],
      ]),
    ]),
  };
}

export const normalizeDesignReferencePlan = (value: unknown): DesignReferencePlan => {
  const references = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as Record<string, unknown>).references)
      ? (value as Record<string, unknown>).references as unknown[]
      : [];
  return {
    references: references.flatMap(item => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
      const record = item as Record<string, unknown>;
      const itemId = String(record.itemId || '').trim();
      const role = String(record.role || record.recommendedRole || '').trim() as DesignReferencePlanItem['role'];
      const reason = String(record.reason || '').trim();
      if (!itemId || !role || !reason) return [];
      return [{
        itemId,
        role,
        reason,
        matchedFeatures: Array.isArray(record.matchedFeatures) ? record.matchedFeatures.map(String).filter(Boolean) : undefined,
        confidence: Number.isFinite(Number(record.confidence)) ? Number(record.confidence) : undefined,
      }];
    }).slice(0, 8),
  };
};

export function buildReferenceContextPrompt(
  originalRequest: string,
  projectBrief: ProjectBrief,
  plan: DesignReferencePlan,
) {
  return [
    'Original Request:',
    originalRequest.trim(),
    '',
    'Design Brief:',
    JSON.stringify(projectBrief),
    '',
    'Selected Inspiration References:',
    ...(plan.references.length > 0
      ? plan.references.map((reference, index) => [
        `${index + 1}. itemId: ${reference.itemId}`,
        `Role: ${reference.role}`,
        `Reason: ${reference.reason}`,
      ].join('\n'))
      : ['None selected.']),
    '',
    'Reference Roles:',
    plan.references.map(reference => `${reference.itemId}=${reference.role}`).join(', ') || 'None',
  ].join('\n');
}

export function parseCreativeToolHint(userText: string, mediaType: 'image' | 'video'): string | undefined {
  const lower = normalizeSkillText(userText).replace(/nano\s*banana/g, 'nanobanana');
  const type = mediaType === 'video' ? 'video' : 'image';
  const version = (prefix: string, match: RegExpMatchArray) => (
    `${prefix}_v${match[1].replace(/\./g, '_')}${match[2] ? '_' + match[2].replace(/\s+/g, '_') : ''}`
  );
  const seedance = lower.match(/seedance\s*(\d+(?:\.\d+)?)(?:\s+(\w+))?/);
  if (seedance) return `generate_video_${version('seedance', seedance)}`;
  const kling = lower.match(/kling\s*(\d+(?:\.\d+)?)(?:\s+(omni))?/);
  if (kling) return `generate_video_${version('kling', kling)}`;
  const seedream = lower.match(/seedream\s*(\d+(?:\.\d+)?)/);
  if (seedream) return `generate_image_seedream_v${seedream[1].replace(/\./g, '_')}`;
  const nano = lower.match(/nanobanana\s*(pro|\d+)?/);
  if (nano && lower.includes('nanobanana')) return `generate_image_nano_banana${nano[1] ? '_' + nano[1] : ''}`;
  const gptImage = lower.match(/gpt\s*image\s*(\d+(?:\.\d+)?)/);
  if (gptImage) return `generate_image_gpt_image_${gptImage[1].replace(/\./g, '_')}`;
  return type === 'image' ? undefined : undefined;
}

export const mentionsDrawerMaterialContext = (userText: string) => (
  /(抽屉|素材库|文件夹|今天收集|今日收集|整理素材|drawer|material library|asset library|folder|today'?s? collected|organize materials)/i
    .test(normalizeSkillText(userText))
);

export const buildOriginalRequestLine = (originalRequest: string) => {
  const escaped = originalRequest.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `Original request: "${escaped}"`;
};

export function buildCreativeGeneratorPrompt(brief: Omit<CreativeBrief, 'generatorPrompt'>): string {
  const lines = [
    `Task: ${brief.taskKind} ${brief.mediaType}.`,
    brief.product.isProductTask
      ? `Product judgement: ${brief.product.category}; usage: ${brief.product.usageMode}; goal: ${brief.product.goal}; stage: ${brief.product.iterationStage}.`
      : '',
    brief.product.isProductTask && brief.product.focus.length
      ? `Design focus: ${brief.product.focus.join(', ')}.`
      : '',
    brief.product.isProductTask
      ? 'Industrial design priorities: silhouette and proportion before decoration; structural credibility before visual tricks; CMF must serve product positioning.'
      : '',
    brief.product.isProductTask
      ? 'Product-adaptive visual direction: infer category, usage scene, target user, CMF, material, main colors and price tier before choosing background, palette, lighting, composition density and graphic language.'
      : '',
    brief.product.isProductTask
      ? 'Avoid unrequested generic tech styling, fixed pale gray/blue templates, forced dark tech mood, glow lines, carbon fiber, exposed mechanics, excessive cut lines, and decorative noise.'
      : '',
    brief.imageRoles.length
      ? `Image roles: ${brief.imageRoles.map(role => `${role.imageId}=${role.role}`).join(', ')}.`
      : '',
    brief.fidelity
      ? `Fidelity level: ${brief.fidelity}. Preserve explicit constraints, spatial relations, camera angle, structure, materials, text and negative prompts.`
      : '',
    brief.dimensions.targetSize ? `Target size: ${brief.dimensions.targetSize}.` : '',
    brief.dimensions.aspectRatio ? `Aspect ratio: ${brief.dimensions.aspectRatio}.` : '',
    brief.dimensions.resolution ? `Resolution: ${brief.dimensions.resolution}.` : '',
    buildOriginalRequestLine(brief.originalRequest),
    `Design Brief: ${JSON.stringify(brief.projectBrief)}`,
  ].filter(Boolean);
  return lines.join('\n');
}

export function extractCreativeBrief(input: SkillMatchInput, imageIds?: string[]): CreativeBrief {
  const originalRequest = input.userText.trim();
  const explicitVideoGeneration = isExplicitVideoGenerationRequest(originalRequest);
  const mediaType: 'image' | 'video' = explicitVideoGeneration ? 'video' : 'image';
  const isEdit = isCreativeEditRequest(originalRequest);
  const product = inferProductDesignContext(originalRequest);
  const workflowIntent = parseWorkflowBuilderIntent(originalRequest);
  const taskKind: CreativeTaskKind = workflowIntent.createWorkflow
    ? 'product_design'
    : /分镜|故事板|storyboard/i.test(originalRequest)
    ? 'storyboard'
    : explicitVideoGeneration
      ? 'video'
      : /cmf|材质|配色/i.test(originalRequest)
        ? 'cmf'
        : isEdit
          ? 'edit'
          : product.isProductTask
            ? 'product_design'
            : 'generate';
  const dimensions = parseCreativeDimensions(originalRequest);
  const imageRoles = parseCreativeImageRoles(input, imageIds);
  const fidelity = parseCreativeFidelity(originalRequest, {
    hasImages: imageRoles.length > 0 || input.hasSelectedImages,
    isEdit,
  });
  const toolHint = parseCreativeToolHint(originalRequest, mediaType);
  const requiresStoryboardFirst = mediaType === 'video' || taskKind === 'storyboard';
  const requiresStrategyFirst = product.isProductTask && (
    taskKind === 'product_design'
    || taskKind === 'cmf'
    || /复杂|多方案|方向|工业设计|产品设计|方案/i.test(originalRequest)
  );
  const promptInput: Omit<CreativeBrief, 'generatorPrompt'> = {
    originalRequest,
    taskKind,
    mediaType,
    isEdit,
    dimensions,
    imageRoles,
    fidelity,
    product,
    toolHint,
    requiresStoryboardFirst,
    requiresStrategyFirst,
    projectBrief: extractProjectBrief(originalRequest, product),
  };
  return {
    ...promptInput,
    generatorPrompt: buildCreativeGeneratorPrompt(promptInput),
  };
}

export function validateCreativeGeneratorAction(input: CreativeGeneratorValidationInput): string[] {
  const errors: string[] = [];
  const args = input.args;
  const prompt = typeof args.prompt === 'string' ? args.prompt : '';
  const brief = extractCreativeBrief({
    userText: input.userText,
    hasSelectedImages: input.hasReferenceImages,
  });
  const referenceRoles = Array.isArray(args.referenceRoles) ? args.referenceRoles as Array<Record<string, unknown>> : [];
  const hasBase = typeof args.sourceImageNodeId === 'string' && args.sourceImageNodeId.trim()
    || referenceRoles.some(role => role.role === 'BASE')
    || (Array.isArray(args.inputIds) && args.inputIds.length === 1 && brief.isEdit);
  const referenceImageNodeIds = Array.isArray(args.referenceImageNodeIds) ? args.referenceImageNodeIds : [];
  const inputIds = Array.isArray(args.inputIds) ? args.inputIds : [];
  if (isCreativeLikeRequest(input.userText) && !/Original request:\s*"/.test(prompt)) {
    errors.push('creative generator prompt must include Original request.');
  }
  if (brief.isEdit && !hasBase) {
    errors.push('image edit task requires a BASE image via sourceImageNodeId, referenceRoles, or one connected inputId.');
  }
  if (input.hasReferenceImages && referenceImageNodeIds.length === 0 && inputIds.length === 0) {
    errors.push('reference images exist but no inputIds or referenceImageNodeIds are connected.');
  }
  if (brief.dimensions.aspectRatio && args.aspectRatio !== brief.dimensions.aspectRatio) {
    errors.push('requested aspect ratio must be passed to generator action.');
  }
  if (brief.dimensions.targetSize && args.targetSize !== brief.dimensions.targetSize) {
    errors.push('requested target size must be passed to generator action.');
  }
  if (brief.dimensions.resolution && args.resolution !== brief.dimensions.resolution) {
    errors.push('requested resolution must be passed to generator action.');
  }
  return errors;
}

export function applyCreativeGeneratorDefaults(
  args: Record<string, unknown>,
  userText: string,
): Record<string, unknown> {
  if (!isCreativeLikeRequest(userText) && !inferProductDesignContext(userText).isProductTask) return args;
  const brief = extractCreativeBrief({
    userText,
    hasSelectedImages: Array.isArray(args.inputIds) && args.inputIds.length > 0,
  });
  const prompt = typeof args.prompt === 'string' && args.prompt.trim()
    ? args.prompt.trim()
    : brief.generatorPrompt;
  const promptWithOriginal = /Original request:\s*"/.test(prompt)
    ? prompt
    : `${prompt}\n${buildOriginalRequestLine(userText)}`;
  const inspirationPlan = normalizeDesignReferencePlan(args.inspirationReferences);
  const referenceContext = inspirationPlan.references.length > 0
    ? buildReferenceContextPrompt(userText, brief.projectBrief, inspirationPlan)
    : '';
  const promptWithContext = referenceContext && !/Selected Inspiration References:/i.test(promptWithOriginal)
    ? `${promptWithOriginal}\n\n${referenceContext}`
    : promptWithOriginal;
  return {
    ...args,
    prompt: promptWithContext,
    ...(brief.dimensions.aspectRatio && !args.aspectRatio ? { aspectRatio: brief.dimensions.aspectRatio } : {}),
    ...(brief.dimensions.targetSize && !args.targetSize ? { targetSize: brief.dimensions.targetSize } : {}),
    ...(brief.dimensions.resolution && !args.resolution ? { resolution: brief.dimensions.resolution } : {}),
    ...(brief.toolHint && !args.toolHint ? { toolHint: brief.toolHint } : {}),
    skillMeta: {
      ...(args.skillMeta && typeof args.skillMeta === 'object' ? args.skillMeta as Record<string, unknown> : {}),
      skillId: 'creative-product-design-skill',
      originalRequest: userText,
      fidelity: brief.fidelity,
      productCategory: brief.product.category,
      focus: brief.product.focus,
      projectBrief: brief.projectBrief,
      designReferencePlan: inspirationPlan,
    },
  };
}

export function applyCreativeWorkflowDefaults(
  args: Record<string, unknown>,
  userText: string,
): Record<string, unknown> {
  const plan = normalizeDesignReferencePlan(args.inspirationReferences);
  if (plan.references.length === 0) return args;
  const brief = extractCreativeBrief({ userText });
  const contextBlock = buildReferenceContextPrompt(userText, brief.projectBrief, plan);
  const patchSteps = (steps: unknown) => Array.isArray(steps) ? steps.map(step => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return step;
    const record = step as Record<string, unknown>;
    const type = String(record.type || record.kind || '').toLowerCase();
    if (!/(generator|image|video)/.test(type)) return step;
    const prompt = String(record.prompt || '').trim();
    return {
      ...record,
      prompt: /Selected Inspiration References:/i.test(prompt)
        ? prompt
        : `${prompt || brief.generatorPrompt}\n\n${contextBlock}`,
    };
  }) : steps;
  const workflowDefinition = args.workflowDefinition && typeof args.workflowDefinition === 'object' && !Array.isArray(args.workflowDefinition)
    ? args.workflowDefinition as Record<string, unknown>
    : null;
  return {
    ...args,
    steps: patchSteps(args.steps),
    ...(workflowDefinition ? {
      workflowDefinition: {
        ...workflowDefinition,
        steps: patchSteps(workflowDefinition.steps),
        metadata: {
          ...(workflowDefinition.metadata && typeof workflowDefinition.metadata === 'object'
            ? workflowDefinition.metadata as Record<string, unknown>
            : {}),
          projectBrief: brief.projectBrief,
          designReferencePlan: plan,
        },
      },
    } : {}),
    metadata: {
      ...(args.metadata && typeof args.metadata === 'object' ? args.metadata as Record<string, unknown> : {}),
      projectBrief: brief.projectBrief,
      designReferencePlan: plan,
    },
  };
}

export const creativeProductDesignSkill: AppAgentSkill = {
  id: 'creative-product-design-skill',
  label: 'Creative Product Design',
  description: '视觉生成/编辑、产品设计、CMF、参考图、分镜和视频生产。',
  match: input => {
    const hits = findKeywordHits(input.userText, CREATIVE_KEYWORDS);
    const selectedImageBonus = input.hasSelectedImages && hits.length > 0 ? 0.12 : 0;
    if (hits.length === 0) return noSkillMatch();
    return createSkillMatch(Math.min(0.98, 0.58 + hits.length * 0.06 + selectedImageBonus), hits.map(hit => `keyword:${hit}`));
  },
  getRequiredContext: (input): ContextScope[] => {
    const scopes: ContextScope[] = ['canvas'];
    if (mentionsDrawerMaterialContext(input.userText) || inferProductDesignContext(input.userText).isProductTask) scopes.push('drawer');
    return scopes;
  },
  buildPromptPatch: input => {
    const brief = extractCreativeBrief(input);
    return [
      'Active skill: creative-product-design-skill.',
      `CreativeBrief: ${JSON.stringify({
        taskKind: brief.taskKind,
        mediaType: brief.mediaType,
        fidelity: brief.fidelity,
        productCategory: brief.product.category,
        usageMode: brief.product.usageMode,
        goal: brief.product.goal,
        focus: brief.product.focus,
        dimensions: brief.dimensions,
        imageRoles: brief.imageRoles,
        toolHint: brief.toolHint,
        projectBrief: brief.projectBrief,
      })}`,
      'Rules:',
      '- If workflow-builder-skill detects workflow creation or multi-output intent, treat CMF/detail/scene/storyboard terms as separate workflow nodes, not as one global CMF task.',
      '- Before creating generators or workflows for a product design request, extract Project Brief fields (productType, targetUsers, styleKeywords, materialPreferences, colorPreferences, prohibitedDirections, outputGoals), then call drawer_search_inspirations with that brief.',
      '- InspirationProfile analysis uses the configured Agent LLM API. When relevant drawer images lack structured profiles and analysis is explicitly requested or needed for a durable library update, use analyze_inspiration or analyze_inspirations_batch; do not use legacy CMF/alchemy data.',
      '- Convert drawer_search_inspirations results into a Design Reference Plan. Pass chosen entries through inspirationReferences and explain itemId, role and reason. Do not invent itemId.',
      '- Use retrieved drawer images only when relevant. Add chosen drawer items to canvas before connecting them to generators; preserve existing deterministic command and workflow input rules.',
      '- Generator and workflow prompts must include Original Request, Design Brief, Selected Inspiration References and Reference Roles.',
      '- For industrial design review workflows, use product_reference_image as a reference_image_bridge that accepts external images and forwards the same visual reference to strategy and all generators.',
      '- For every image/video generator or edit prompt, include `Original request: "用户原话"` exactly with the user request.',
      '- Assign image roles before tool calls: BASE -> sourceImageNodeId/source_image_url; STYLE_REF/LAYOUT_REF/SUBJECT_REF -> referenceImageNodeIds/reference_image_urls; NONE is not passed.',
      '- Edit tasks require BASE. If multiple images are ambiguous and direct edit is requested, ask one necessary clarification instead of guessing.',
      '- Extract targetSize/aspectRatio/resolution from user wording and pass them as action arguments.',
      '- Product tasks must include product category, usage mode, target, iteration stage and design risks in the generator prompt.',
      '- Product visual style must adapt to category, CMF, material, main color, scene and target user; never default to one fixed gray/blue, dark-tech or generic premium template.',
      '- Do not default to tech styling, glow lines, carbon fiber, exposed mechanics or complex cut lines unless requested or visible in references.',
      '- For video/storyboard/multi-scene tasks, create a text-agent storyboard first; video generator autoRun defaults false unless the user explicitly asks to directly generate/run.',
      '- For complex product design, create a text-agent strategy node before the generator node.',
      `Suggested generator prompt base:\n${brief.generatorPrompt}`,
    ].join('\n');
  },
};
