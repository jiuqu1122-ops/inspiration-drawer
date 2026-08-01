import type { BufferItem } from '../types';

export const AI_CLASSIFICATION_DIMENSIONS = [
  { id: 'product', label: '产品类别' },
  { id: 'form', label: '造型参考' },
  { id: 'color', label: '颜色参考' },
] as const;

export type AiClassificationDimension = typeof AI_CLASSIFICATION_DIMENSIONS[number]['id'];

export type AiClassificationGroup = {
  label: string;
  count: number;
};

export const AI_CLASSIFICATION_UNCLASSIFIED_LABEL = '未分析';

const readClassificationLabel = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const record = value as Record<string, unknown>;
  for (const key of ['name', 'label', 'value', 'color', 'hex']) {
    const candidate = record[key];
    if (typeof candidate === 'string' || typeof candidate === 'number') return String(candidate);
  }
  return '';
};

const cleanClassificationLabel = (value: unknown) => readClassificationLabel(value)
  .replace(/[\\/:*?"<>|]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^\[object Object\]$/i, '')
  .slice(0, 28);

type LabelNormalizer = (value: unknown) => string;

const PRODUCT_CATEGORY_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: '投影仪', pattern: /投影(?:仪|机|器|设备)|projector/i },
  { label: '游戏手柄', pattern: /游戏(?:手柄|控制器)|游戏机手柄|game\s*(?:pad|controller)/i },
  { label: '耳机', pattern: /耳机|耳麦|耳塞|headphone|headset|earbud|\btws\b/i },
  { label: '音箱', pattern: /音箱|音响|扬声器|soundbar|speaker/i },
  { label: '摄像头', pattern: /摄像头|网络摄像机|webcam/i },
  { label: '对讲机', pattern: /对讲机|walkie[ -]?talkie/i },
  { label: '鼠标', pattern: /鼠标|mouse/i },
  { label: '键盘', pattern: /键盘|keyboard/i },
  { label: '显示器', pattern: /显示器|监视器|monitor/i },
  { label: '笔记本电脑', pattern: /笔记本(?:电脑)?|laptop|notebook/i },
  { label: '平板电脑', pattern: /平板(?:电脑)?|tablet/i },
  { label: '手机', pattern: /智能手机|手机|smartphone/i },
  { label: '智能手表', pattern: /智能手表|手表|smartwatch/i },
  { label: '台灯', pattern: /台灯|桌灯|desk\s*lamp/i },
  { label: '灯具', pattern: /吊灯|壁灯|落地灯|灯具|lamp|light/i },
  { label: '咖啡机', pattern: /咖啡机|coffee\s*machine/i },
  { label: '空气净化器', pattern: /空气净化器|air\s*purifier/i },
  { label: '加湿器', pattern: /加湿器|humidifier/i },
  { label: '风扇', pattern: /风扇|循环扇|fan/i },
];

const PRODUCT_CATEGORY_NOISE = new Set([
  '产品', '设备', '消费电子', '电子产品', '工业设计', '概念设计',
  '客厅', '卧室', '书房', '办公室', '工作室', '室内', '户外', '桌面',
  '按键', '按钮', '旋钮', '屏幕', '镜头', '支架', '底座', '外壳', '手柄',
]);

const normalizeProductCategoryLabel: LabelNormalizer = value => {
  const label = cleanClassificationLabel(value);
  if (!label) return '';
  const canonical = PRODUCT_CATEGORY_RULES.find(rule => rule.pattern.test(label));
  if (canonical) return canonical.label;
  if (PRODUCT_CATEGORY_NOISE.has(label)) return '';
  const withoutQualifier = label
    .replace(/^(?:便携式?|家用|家庭|桌面式?|智能|迷你|微型|户外|无线|有线|专业|商务|儿童|车载|手持式?)+/g, '')
    .replace(/(?:产品|设备)$/g, '')
    .trim();
  return withoutQualifier.length >= 2 && !PRODUCT_CATEGORY_NOISE.has(withoutQualifier)
    ? withoutQualifier
    : '';
};

const findCanonicalProductFamily = (values: unknown[]) => {
  for (const value of values) {
    const label = cleanClassificationLabel(value);
    const canonical = PRODUCT_CATEGORY_RULES.find(rule => rule.pattern.test(label));
    if (canonical) return canonical.label;
  }
  return '';
};

const normalizeFormLabel: LabelNormalizer = value => {
  const label = cleanClassificationLabel(value)
    .replace(/(?:造型|形态|设计|风格)$/g, '')
    .trim();
  if (/圆润|圆角|圆弧|圆滑/.test(label)) return '圆润';
  if (/几何|切面|多边形/.test(label)) return '几何';
  if (/流线/.test(label)) return '流线';
  if (/极简|简约|简洁/.test(label)) return '极简';
  if (/悬浮|漂浮/.test(label)) return '悬浮';
  if (/方正|方形|矩形/.test(label)) return '方正';
  return label;
};

const normalizeColorLabel: LabelNormalizer = value => {
  const label = cleanClassificationLabel(value).replace(/(?:颜色|色调)$/g, '').trim();
  if (!label || /^(?:暖|冷|暖色|冷色|中性|多色|彩色|混合色)$/.test(label)) return '';
  if (/木色|原木|木纹/.test(label)) return '木色';
  if (/黑|墨色|black/i.test(label)) return '黑色';
  if (/白|象牙|乳白|white/i.test(label)) return '白色';
  if (/灰|grey|gray/i.test(label)) return '灰色';
  if (/银|silver/i.test(label)) return '银色';
  if (/红|red/i.test(label)) return '红色';
  if (/橙|orange/i.test(label)) return '橙色';
  if (/黄|yellow/i.test(label)) return '黄色';
  if (/绿|green/i.test(label)) return '绿色';
  if (/蓝|青|cyan|blue/i.test(label)) return '蓝色';
  if (/紫|purple/i.test(label)) return '紫色';
  if (/粉|pink|rose/i.test(label)) return '粉色';
  if (/棕|褐|咖啡|brown/i.test(label)) return '棕色';
  if (/米|奶油|beige|cream/i.test(label)) return '米色';
  if (/金|gold/i.test(label)) return '金色';
  if (/透明|clear|transparent/i.test(label)) return '透明';
  return label;
};

const uniqueLabels = (values: unknown[], limit = 8, normalize: LabelNormalizer = cleanClassificationLabel) => {
  const seen = new Set<string>();
  const labels: string[] = [];
  values.forEach(value => {
    const label = normalize(value);
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key) || labels.length >= limit) return;
    seen.add(key);
    labels.push(label);
  });
  return labels;
};

const getAiTagNames = (item: BufferItem, categories: string[]) => (
  (item.inspirationProfile?.aiTags || [])
    .filter(tag => categories.includes(tag.category))
    .sort((a, b) => b.confidence - a.confidence)
    .map(tag => tag.name)
);

export const getItemAiClassificationLabels = (
  item: BufferItem,
  dimension: AiClassificationDimension,
): string[] => {
  const profile = item.inspirationProfile;
  if (item.type !== 'image' || !profile) return [];

  if (dimension === 'product') {
    const candidates = [
      ...getAiTagNames(item, ['产品类别']),
      profile.category,
      ...(profile.objects || []),
    ];
    const canonicalFamily = findCanonicalProductFamily(candidates);
    return canonicalFamily
      ? [canonicalFamily]
      : uniqueLabels(candidates, 1, normalizeProductCategoryLabel);
  }

  if (dimension === 'form') {
    return uniqueLabels([
      ...getAiTagNames(item, ['形态', '风格']),
      ...(profile.form?.silhouette || []),
      ...(profile.form?.geometry || []),
      ...(profile.form?.proportion || []),
      ...(profile.style || []),
    ], 8, normalizeFormLabel);
  }

  return uniqueLabels([
    ...(profile.cmf?.colors || []),
    ...getAiTagNames(item, ['色彩']),
  ], 1, normalizeColorLabel);
};

export const getItemPrimaryAiClassificationLabel = (
  item: BufferItem,
  dimension: AiClassificationDimension,
) => getItemAiClassificationLabels(item, dimension)[0] || AI_CLASSIFICATION_UNCLASSIFIED_LABEL;

export const buildAiClassificationGroups = (
  items: BufferItem[],
  dimension: AiClassificationDimension,
): AiClassificationGroup[] => {
  const counts = new Map<string, number>();
  items.forEach(item => {
    const labels = getItemAiClassificationLabels(item, dimension);
    const itemLabels = labels.length > 0 ? labels : [AI_CLASSIFICATION_UNCLASSIFIED_LABEL];
    itemLabels.forEach(label => counts.set(label, (counts.get(label) || 0) + 1));
  });

  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => {
      if (a.label === AI_CLASSIFICATION_UNCLASSIFIED_LABEL) return 1;
      if (b.label === AI_CLASSIFICATION_UNCLASSIFIED_LABEL) return -1;
      return b.count - a.count || a.label.localeCompare(b.label, 'zh-CN');
    });
};

export const itemMatchesAiClassification = (
  item: BufferItem,
  dimension: AiClassificationDimension,
  label: string,
) => {
  if (label === 'all') return true;
  const labels = getItemAiClassificationLabels(item, dimension);
  if (label === AI_CLASSIFICATION_UNCLASSIFIED_LABEL) return labels.length === 0;
  return labels.includes(label);
};
