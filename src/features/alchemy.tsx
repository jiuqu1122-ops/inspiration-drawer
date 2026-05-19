import { AnimatePresence, motion } from 'framer-motion';
import { Image as ImageIcon, Palette } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';

import { BufferItem } from '../types';
import { clamp } from './common';

export const ALCHEMY_CARD_WIDTH = 340;

type AlchemyState = 'raw' | 'analyzing' | 'alchemy' | 'error';

type AlchemyResult = {
  title?: string;
  colors: string[];
  keywords: string[];
  form: string;
  cmf: string;
  summary?: string;
  borrow: string[];
  avoid: string[];
  materials: string[];
  analysisMode?: 'palette' | 'ai' | 'mock';
  colorSource?: string;
  apiStatus?: string;
  generatedAt?: number;
};

type AlchemyData = {
  state: AlchemyState;
  note?: string;
  result?: AlchemyResult;
  createdAt?: number;
  analyzedAt?: number;
  error?: string;
};

type AlchemyBufferItem = BufferItem & {
  alchemy?: AlchemyData;
  isDirectory?: boolean;
  isUrl?: boolean;
};

type AiAnalysisConfig = {
  provider: string;
  endpoint: string;
  apiKey: string;
  model: string;
  proxy?: string;
};

const SILICONFLOW_DEFAULT_ENDPOINT = 'https://api.siliconflow.cn/v1';
const SILICONFLOW_DEFAULT_MODEL = 'Qwen/Qwen3-VL-32B-Instruct';
const SILICONFLOW_VISION_MODEL_FALLBACKS = [
  { value: 'Qwen/Qwen3-VL-32B-Instruct', label: 'Qwen3-VL-32B-Instruct（推荐：视觉 CMF）' },
  { value: 'Qwen/Qwen3-VL-32B-Thinking', label: 'Qwen3-VL-32B-Thinking（视觉推理）' },
  { value: 'Qwen/Qwen3-Omni-30B-A3B-Instruct', label: 'Qwen3-Omni-30B-Instruct（图像/视频/音频）' },
  { value: 'Qwen/Qwen3-Omni-30B-A3B-Thinking', label: 'Qwen3-Omni-30B-Thinking（多模态推理）' },
  { value: 'THUDM/GLM-4.1V-9B-Thinking', label: 'GLM-4.1V-9B-Thinking（视觉理解）' },
  { value: 'deepseek-ai/DeepSeek-OCR', label: 'DeepSeek-OCR（OCR / 文档视觉）' },
  { value: 'Qwen/Qwen2.5-VL-7B-Instruct', label: 'Qwen2.5-VL-7B（旧模型，若可用再选）' },
];
const SILICONFLOW_VISION_MODEL_LABELS: Record<string, string> = Object.fromEntries(
  SILICONFLOW_VISION_MODEL_FALLBACKS.map(model => [model.value, model.label])
);

const isSiliconFlowProvider = (provider: string) => provider === 'siliconflow';
const isSiliconFlowVisionModel = (model: string) => /(?:qwen\/?(?:2(?:\.5)?|3)[-_]?vl|qvq|qwen3[-_]?omni|glm.*(?:v|vision)|deepseek[-_]?vl|deepseek[-_]?ocr|step3|paddleocr[-_]?vl|vision|\bvl\b|omni|ocr)/i.test(model);

const ALCHEMY_PALETTES = [
  {
    colors: ['#e7dfd2', '#b8aea1', '#6f6a63', '#f0a45a'],
    keywords: ['低饱和', '暖灰金属', '柔和倒角', '家居科技'],
    materials: ['喷砂阳极氧化铝', '低光泽 PC/ABS', '细织物网布', '硅胶脚垫'],
  },
  {
    colors: ['#ebe7df', '#9aa0a3', '#5e696f', '#1f2528'],
    keywords: ['半透明', '轻科技', '层次感', '克制'],
    materials: ['烟灰透明 PC', '雾面银喷涂件', '黑色 TPU 密封圈', '半透磨砂纹理'],
  },
  {
    colors: ['#f1eadf', '#c9b8a2', '#8d7d6f', '#4b4038'],
    keywords: ['温暖', '织物', '弱科技感', '亲和'],
    materials: ['针织声学布', '暖灰磨砂 PC', '咖色橡胶', '微纹理喷涂'],
  },
  {
    colors: ['#e8ece9', '#aeb8b2', '#65736b', '#23312c'],
    keywords: ['冷静', '专业', '细节秩序', '耐用感'],
    materials: ['微砂纹喷涂', '雾面金属饰条', '防滑 TPU', '深灰阻燃 PC'],
  },
];

const isAlchemyCandidate = (item: AlchemyBufferItem) => (
  item.type === 'image' && !item.isDirectory && !!(item.url || item.path)
);

const getAlchemyState = (item: AlchemyBufferItem): AlchemyState => {
  if (!isAlchemyCandidate(item)) return item.alchemy?.state || 'raw';
  return item.alchemy?.state || 'raw';
};

const safeTextList = (values?: string[]) => (Array.isArray(values) ? values.filter(Boolean) : []);

const getItemRemarkEntries = (item: Pick<BufferItem, 'remark' | 'remarks'>) => {
  const fromList = Array.isArray(item.remarks)
    ? item.remarks.map(value => String(value || '').trim()).filter(Boolean)
    : [];
  if (fromList.length > 0) return fromList;
  return typeof item.remark === 'string'
    ? item.remark.split(/\r?\n/).map(value => value.trim()).filter(Boolean)
    : [];
};

const replaceFirstItemRemark = (item: Pick<BufferItem, 'remark' | 'remarks'>, firstRemark: string) => {
  const rest = getItemRemarkEntries(item).slice(1);
  const remarks = [firstRemark.trim(), ...rest].filter(Boolean);
  return {
    remark: remarks.join('\n'),
    remarks: remarks.length > 0 ? remarks : undefined,
  };
};

const getAlchemySearchText = (item: AlchemyBufferItem) => {
  const result = item.alchemy?.result;
  return [
    item.name,
    item.content,
    item.remark,
    ...safeTextList(item.remarks),
    item.path,
    item.url,
    item.alchemy?.note,
    result?.title,
    result?.cmf,
    result?.form,
    ...safeTextList(result?.keywords),
    ...safeTextList(result?.borrow),
    ...safeTextList(result?.avoid),
    ...safeTextList(result?.materials),
  ].filter(Boolean).join(' ').toLowerCase();
};

const hashStringToIndex = (value: string, modulo: number) => {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  return Math.abs(hash) % modulo;
};

const buildLocalAlchemyResult = (item: AlchemyBufferItem, apiStatus = 'ai-placeholder'): AlchemyResult => {
  const title = item.name || item.content || '参考图';
  const preset = ALCHEMY_PALETTES[hashStringToIndex(title, ALCHEMY_PALETTES.length)];
  return {
    title,
    colors: preset.colors,
    keywords: preset.keywords,
    form: `从「${title}」中提取到偏克制的体量关系：优先保留大面简洁、边缘柔和、局部细节形成记忆点的造型逻辑。`,
    cmf: `${preset.keywords[0]}方向：以 ${preset.colors[1]} / ${preset.colors[2]} 为主体层次，辅以低光泽材料和少量强调色，适合沉稳但有识别度的产品语言。`,
    summary: `${preset.keywords[0]}方向以克制配色和柔和细节形成识别感。`,
    borrow: ['借鉴主色和辅色的比例关系', '借鉴材质之间的粗细/冷暖对比', '借鉴局部细节作为记忆点，而不是照搬整体造型'],
    avoid: ['不要直接复制原图轮廓或装饰比例', '高亮点缀色需要克制使用', '若用于量产产品，需要重新评估耐脏、耐刮和装配分件线'],
    materials: preset.materials,
    analysisMode: 'mock',
    apiStatus,
    generatedAt: Date.now(),
  };
};

const hexFromRgb = (r: number, g: number, b: number) => (
  `#${[r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`
);

const rgbToHsl = (r: number, g: number, b: number) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      default: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return { h: h * 360, s, l };
};

const colorDistance = (a: [number, number, number], b: [number, number, number]) => {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
};

const getPaletteImageSource = (item: AlchemyBufferItem) => {
  const raw = item.url || item.path || item.content || '';
  if (!raw) return '';
  if (/^(https?:|data:image\/|file:|asset:)/i.test(raw) || raw.includes('asset.localhost')) return raw;
  return convertFileSrc(raw);
};

const extractPaletteFromImageSource = (source: string): Promise<{ colors: string[]; keywords: string[]; colorSource: string }> => (
  new Promise((resolve, reject) => {
    if (!source) {
      reject(new Error('empty image source'));
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    let objectUrl = '';

    img.onload = () => {
      try {
        if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
        const naturalW = img.naturalWidth || img.width;
        const naturalH = img.naturalHeight || img.height;
        if (!naturalW || !naturalH) throw new Error('invalid image size');

        const maxSide = 96;
        const scale = Math.min(1, maxSide / Math.max(naturalW, naturalH));
        const width = Math.max(1, Math.round(naturalW * scale));
        const height = Math.max(1, Math.round(naturalH * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) throw new Error('canvas not available');

        ctx.drawImage(img, 0, 0, width, height);
        const pixels = ctx.getImageData(0, 0, width, height).data;
        const buckets = new Map<string, { count: number; r: number; g: number; b: number; sat: number; lum: number; warm: number; cool: number }>();

        for (let i = 0; i < pixels.length; i += 4) {
          const a = pixels[i + 3];
          if (a < 120) continue;
          const r = pixels[i];
          const g = pixels[i + 1];
          const b = pixels[i + 2];
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          if ((max > 248 && min > 245) || (max < 8 && min < 8)) continue;

          const qr = Math.round(r / 24) * 24;
          const qg = Math.round(g / 24) * 24;
          const qb = Math.round(b / 24) * 24;
          const key = `${qr},${qg},${qb}`;
          const hsl = rgbToHsl(r, g, b);
          const prev = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0, sat: 0, lum: 0, warm: 0, cool: 0 };
          prev.count += 1;
          prev.r += r;
          prev.g += g;
          prev.b += b;
          prev.sat += hsl.s;
          prev.lum += hsl.l;
          if (r > b + 18 && r >= g - 12) prev.warm += 1;
          if (b > r + 18 || g > r + 24) prev.cool += 1;
          buckets.set(key, prev);
        }

        const ranked = Array.from(buckets.values())
          .filter(bucket => bucket.count >= 2)
          .map(bucket => ({
            count: bucket.count,
            rgb: [bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count] as [number, number, number],
            sat: bucket.sat / bucket.count,
            lum: bucket.lum / bucket.count,
            warm: bucket.warm,
            cool: bucket.cool,
          }))
          .sort((a, b) => b.count - a.count);

        const picked: typeof ranked = [];
        for (const bucket of ranked) {
          if (picked.every(existing => colorDistance(existing.rgb, bucket.rgb) > 42)) {
            picked.push(bucket);
          }
          if (picked.length >= 4) break;
        }

        if (picked.length === 0 && ranked.length > 0) picked.push(ranked[0]);
        const colors = picked.map(bucket => hexFromRgb(bucket.rgb[0], bucket.rgb[1], bucket.rgb[2]));
        const avgSat = picked.reduce((sum, item) => sum + item.sat, 0) / Math.max(1, picked.length);
        const avgLum = picked.reduce((sum, item) => sum + item.lum, 0) / Math.max(1, picked.length);
        const warm = picked.reduce((sum, item) => sum + item.warm, 0);
        const cool = picked.reduce((sum, item) => sum + item.cool, 0);
        const keywords = [
          avgSat < 0.2 ? '极简主义' : avgSat > 0.45 ? '活力感' : '现代感',
          avgLum > 0.72 ? '轻盈感' : avgLum < 0.34 ? '沉稳感' : '科技感',
          warm > cool * 1.15 ? '温暖家居' : cool > warm * 1.15 ? '冷静科技' : '中性克制',
          colors.length >= 4 ? '层次配色' : '核心色提取',
        ];

        resolve({ colors: colors.slice(0, 4), keywords, colorSource: 'local-canvas' });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      reject(new Error('image load failed'));
    };

    const assignImageSource = async () => {
      try {
        // 本地文件/截图的 asset.localhost 地址先转成 blob URL，避免 Canvas 因跨源而无法读取像素。
        if (source.includes('asset.localhost') || source.startsWith('file:') || source.startsWith('asset:')) {
          const response = await fetch(source);
          if (response.ok) {
            const blob = await response.blob();
            objectUrl = URL.createObjectURL(blob);
            img.src = objectUrl;
            return;
          }
        }
      } catch (_) {}
      img.src = source;
    };

    void assignImageSource();
  })
);

const buildLocalPaletteOnlyResult = async (item: AlchemyBufferItem, apiStatus = 'local_palette'): Promise<AlchemyResult> => {
  const title = item.name || item.content || '参考图';
  const source = getPaletteImageSource(item);

  try {
    const palette = await extractPaletteFromImageSource(source);
    const colors = palette.colors.length > 0 ? palette.colors : ALCHEMY_PALETTES[0].colors;
    return {
      title,
      colors,
      keywords: palette.keywords,
      form: '',
      cmf: `${palette.keywords.slice(0, 2).join(' · ')}。`,
      summary: `以${palette.keywords.slice(0, 2).join('、')}为主，形成清晰的配色倾向。`,
      borrow: [],
      avoid: [],
      materials: [],
      analysisMode: 'palette',
      colorSource: palette.colorSource,
      apiStatus,
      generatedAt: Date.now(),
    };
  } catch (err) {
    const preset = ALCHEMY_PALETTES[hashStringToIndex(title, ALCHEMY_PALETTES.length)];
    return {
      title,
      colors: preset.colors,
      keywords: ['本地回退', '待重新分析', '可接入 AI'],
      form: '',
      cmf: '回退色板待重试',
      summary: '回退色板待重试',
      borrow: [],
      avoid: [],
      materials: [],
      analysisMode: 'palette',
      colorSource: 'fallback-preset',
      apiStatus: `${apiStatus}_fallback`,
      generatedAt: Date.now(),
    };
  }
};

function AlchemySwatches({ colors, compact = false }: { colors: string[]; compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? 'gap-1.5' : 'gap-2'}`}>
      {colors.slice(0, 4).map((color) => (
        <span
          key={color}
          className={`${compact ? 'h-5 w-5' : 'h-7 w-7'} rounded-full border border-black/10 dark:border-white/10 shadow-inner`}
          style={{ backgroundColor: color }}
          title={color}
        />
      ))}
    </div>
  );
}

function AlchemyDetailPanel({ result }: { result: AlchemyResult }) {
  const hasForm = !!result.form?.trim();
  const borrow = safeTextList(result.borrow);
  const avoid = safeTextList(result.avoid);
  const materials = safeTextList(result.materials);
  const keywords = safeTextList(result.keywords);
  const isPaletteOnly = result.analysisMode === 'palette' || (!hasForm && borrow.length === 0 && avoid.length === 0 && materials.length === 0);

  return (
    <div className="mt-3 space-y-3 rounded-[22px] bg-stone-50/80 dark:bg-stone-950/30 border border-stone-200/60 dark:border-stone-700/60 p-3">
      <div>
        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold text-stone-700 dark:text-stone-200"><Palette className="w-3.5 h-3.5 text-amber-500/85" /> {isPaletteOnly ? '本地配色分析' : 'CMF 判断'}</div>
        <p className="text-xs leading-5 text-stone-600 dark:text-stone-300">{result.cmf}</p>
      </div>
      <AlchemySwatches colors={result.colors} />
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {keywords.map((text) => (
            <span key={text} className="rounded-full bg-white/70 dark:bg-stone-900/60 border border-white/80 dark:border-stone-700/60 px-2 py-1 text-[10px] font-bold text-stone-600 dark:text-stone-300">{text}</span>
          ))}
        </div>
      )}

      {isPaletteOnly && (
        <div className="rounded-[18px] bg-stone-100/70 dark:bg-stone-900/45 border border-stone-200/70 dark:border-stone-700/60 px-3 py-2 text-[11px] leading-5 text-stone-600 dark:text-stone-300">
          未配置 AI 接口时只做本地色板提取；在设置里填写 AI 分析软件 API 后，再生成造型语言、材料建议、可借鉴点和不适合照搬点。
        </div>
      )}

      {hasForm && (
        <div>
          <div className="mb-1 text-[11px] font-bold text-stone-700 dark:text-stone-200">造型语言</div>
          <p className="text-xs leading-5 text-stone-600 dark:text-stone-300">{result.form}</p>
        </div>
      )}

      {(borrow.length > 0 || avoid.length > 0) && (
        <div className="grid gap-2 md:grid-cols-2">
          {borrow.length > 0 && (
            <div className="rounded-[18px] bg-white/70 dark:bg-stone-900/60 p-3 border border-white/80 dark:border-stone-700/60">
              <div className="mb-1 text-[11px] font-bold text-stone-700 dark:text-stone-200">可借鉴</div>
              <ul className="space-y-1 text-xs leading-5 text-stone-600 dark:text-stone-300">
                {borrow.map((text) => <li key={text}>· {text}</li>)}
              </ul>
            </div>
          )}
          {avoid.length > 0 && (
            <div className="rounded-[18px] bg-white/70 dark:bg-stone-900/60 p-3 border border-white/80 dark:border-stone-700/60">
              <div className="mb-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">不要照搬</div>
              <ul className="space-y-1 text-xs leading-5 text-stone-600 dark:text-stone-300">
                {avoid.map((text) => <li key={text}>· {text}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}

      {materials.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {materials.map((text) => (
            <span key={text} className="rounded-full bg-stone-100/80 dark:bg-stone-900/45 border border-stone-200/70 dark:border-stone-700/60 px-2 py-1 text-[10px] font-bold text-stone-600 dark:text-stone-300">{text}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function AlchemyDrawerCard({
  item,
  active,
  onSelect,
  onAlchemy,
  onPreview,
  onRemove,
  onDeleteAlchemy,
  showToast,
  hasAiAnalysis,
}: {
  item: AlchemyBufferItem;
  active: boolean;
  onSelect: () => void;
  onAlchemy: () => void;
  onPreview: () => void;
  onRemove: () => void;
  onDeleteAlchemy: () => void;
  showToast: (msg: string) => void;
  hasAiAnalysis: boolean;
}) {
  const state = getAlchemyState(item);
  const result = item.alchemy?.result;
  const title = item.name || item.content || '参考图';
  const thumb = item.url || (item.path ? convertFileSrc(item.path) : '');
  const isDone = state === 'alchemy' && !!result;
  const isPaletteOnly = result?.analysisMode === 'palette';
  const actionLabel = isPaletteOnly ? 'AI 炼金' : (hasAiAnalysis ? 'AI 炼金' : '分析配色');
  const loadingLabel = isPaletteOnly ? 'AI 正在炼金...' : (hasAiAnalysis ? 'AI 正在炼金...' : '正在提取配色...');

  return (
    <motion.section
      layout={false}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      transition={{ layout: { type: 'tween', duration: 0.24, ease: [0.16, 1, 0.3, 1] }, default: { type: 'tween', duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
      className={`rounded-[26px] border backdrop-blur-xl overflow-hidden shadow-sm transition-colors ${active ? 'bg-stone-900/95 dark:bg-stone-100/95 border-stone-900 dark:border-stone-100 text-white dark:text-stone-900' : 'bg-white/72 dark:bg-stone-800/72 border-white/70 dark:border-stone-700/60 text-stone-800 dark:text-stone-100'}`}
    >
      <div className="p-3">
        <div className="flex gap-3">
          <button onClick={onPreview} className="h-20 w-24 shrink-0 overflow-hidden rounded-[20px] bg-stone-100 dark:bg-stone-900 border border-black/5 dark:border-white/10 shadow-inner">
            {thumb ? <img src={thumb} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} /> : <ImageIcon className="m-auto mt-7 h-5 w-5 text-stone-400" />}
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold">{title}</div>
                <div className={`mt-1 text-[11px] ${active ? 'text-white/65 dark:text-stone-600' : 'text-stone-500 dark:text-stone-400'}`}>
                  {state === 'analyzing' ? loadingLabel : isDone ? (isPaletteOnly ? '配色分析卡' : 'CMF 炼金卡') : '普通灵感卡 · 待分析'}
                </div>
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-white/10 dark:bg-stone-900/10 text-white/75 dark:text-stone-600' : 'bg-stone-100/85 dark:bg-stone-900/45 text-stone-500 dark:text-stone-300 border border-stone-200/60 dark:border-stone-700/50'}`}>{isDone ? (isPaletteOnly ? '配色' : 'CMF') : 'RAW'}</span>
            </div>
            {isDone && result ? (
              <div className="mt-2"><AlchemySwatches colors={result.colors} compact /></div>
            ) : (
              <p className={`mt-2 line-clamp-2 text-xs leading-5 ${active ? 'text-white/70 dark:text-stone-600' : 'text-stone-600 dark:text-stone-300'}`}>{item.remark || item.alchemy?.note || '图片已进入抽屉，可先查看配色，再继续 AI 炼金。'}</p>
            )}
          </div>
        </div>

        {isDone && result && (
          <p className={`mt-3 line-clamp-2 text-xs leading-5 ${active ? 'text-white/70 dark:text-stone-600' : 'text-stone-600 dark:text-stone-300'}`}>{isPaletteOnly ? (result.summary || '已完成本地配色分析，可继续 AI 炼金。') : result.cmf}</p>
        )}

        <div className="mt-3 flex gap-2">
          <button
            onClick={state === 'analyzing' ? undefined : (isDone && !isPaletteOnly ? onSelect : onAlchemy)}
            disabled={state === 'analyzing'}
            className={`flex-1 rounded-[16px] px-3 py-2 text-xs font-bold transition-colors disabled:opacity-60 ${active ? 'bg-white/12 dark:bg-stone-900/10 text-white dark:text-stone-900 hover:bg-white/18 dark:hover:bg-stone-900/20' : 'bg-stone-900 text-stone-50 hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white'}`}
          >
            {state === 'analyzing'
              ? (isPaletteOnly ? '炼金中...' : hasAiAnalysis ? '炼金中...' : '提取中...')
              : isDone
                ? (isPaletteOnly ? 'AI 炼金' : (active ? '收起详情' : '查看详情'))
                : actionLabel}
          </button>
          {isDone && !isPaletteOnly && (
            <button onClick={onAlchemy} className={`rounded-[16px] px-3 py-2 text-xs font-bold transition-colors ${active ? 'bg-white/10 dark:bg-stone-900/10 text-white/85 dark:text-stone-700 hover:bg-white/15 dark:hover:bg-stone-900/15' : 'bg-stone-100/85 dark:bg-stone-700/70 text-stone-600 dark:text-stone-200 hover:bg-stone-200/80 dark:hover:bg-stone-700'}`}>重炼</button>
          )}
          {item.alchemy ? (
            <button
              onClick={onDeleteAlchemy}
              className={`rounded-[16px] px-3 py-2 text-xs font-bold transition-colors ${active ? 'bg-white/10 dark:bg-stone-900/10 text-white/80 dark:text-stone-700 hover:bg-white/15 dark:hover:bg-stone-900/15' : 'bg-stone-100/85 dark:bg-stone-700/70 text-stone-500 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700'}`}
              title="只删除炼金结果，保留原图片卡片"
            >删除炼金</button>
          ) : (
            <button
              onClick={() => {
                if (item.isQuickAccess) { showToast('⚠️ 已开启星标保护，请先取消星标再删除'); return; }
                onRemove();
              }}
              className={`rounded-[16px] px-3 py-2 text-xs font-bold transition-colors ${active ? 'bg-white/10 dark:bg-stone-900/10 text-white/80 dark:text-stone-700 hover:bg-white/15 dark:hover:bg-stone-900/15' : 'bg-stone-100/85 dark:bg-stone-700/70 text-stone-500 dark:text-stone-300 hover:bg-stone-200/80 dark:hover:bg-stone-700'}`}
            >删除原图</button>
          )}
        </div>

        <AnimatePresence initial={false}>
          {active && isDone && result && (
            <motion.div
              key="alchemy-detail-panel"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ type: 'tween', duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden"
            >
              <AlchemyDetailPanel result={result} />
            </motion.div>
          )}
        </AnimatePresence>
        {state === 'error' && item.alchemy?.error && (
          <div className="mt-3 rounded-[16px] bg-stone-100/80 dark:bg-stone-900/45 border border-stone-200/70 dark:border-stone-700/60 px-3 py-2 text-xs text-stone-600 dark:text-stone-300">{item.alchemy.error}</div>
        )}
      </div>
    </motion.section>
  );
}

export {
  SILICONFLOW_DEFAULT_ENDPOINT,
  SILICONFLOW_DEFAULT_MODEL,
  SILICONFLOW_VISION_MODEL_FALLBACKS,
  SILICONFLOW_VISION_MODEL_LABELS,
  isSiliconFlowProvider,
  isSiliconFlowVisionModel,
  isAlchemyCandidate,
  getAlchemyState,
  getItemRemarkEntries,
  replaceFirstItemRemark,
  getAlchemySearchText,
  buildLocalAlchemyResult,
  buildLocalPaletteOnlyResult,
  AlchemySwatches,
  AlchemyDetailPanel,
  AlchemyDrawerCard,
};

export type {
  AlchemyState,
  AlchemyResult,
  AlchemyData,
  AlchemyBufferItem,
  AiAnalysisConfig,
};
