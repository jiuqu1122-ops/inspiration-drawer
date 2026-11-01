import { getGeneratedMediaFromToolCall, type ChatToolExecutionContext } from '../model/chatTypes';
import { resolvePresentationArtDirection } from './presentationArtDirection';


const finiteNumber = (value: unknown, fallback: number) => {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const sanitizePresentationElements = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return value.flatMap(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
    const element = raw as Record<string, unknown>;
    const kind = String(element.kind || '').trim();
    if (!['rect', 'ellipse', 'line', 'text'].includes(kind)) return [];
    const x = Math.min(100, Math.max(0, finiteNumber(element.x, 0)));
    const y = Math.min(100, Math.max(0, finiteNumber(element.y, 0)));
    const width = Math.min(100 - x, Math.max(0, finiteNumber(element.width, 0)));
    const height = Math.min(100 - y, Math.max(0, finiteNumber(element.height, 0)));
    if (kind !== 'line' && (width <= 0 || height <= 0)) return [];
    if (kind === 'line' && width <= 0 && height <= 0) return [];
    const next: Record<string, unknown> = { ...element, kind, x, y, width, height };
    for (const key of ['strokeWidth', 'opacity', 'fontSize']) {
      if (key in next) {
        const fallback = key === 'opacity' ? 1 : key === 'fontSize' ? 18 : 1;
        const number = finiteNumber(next[key], fallback);
        next[key] = key === 'opacity'
          ? Math.min(1, Math.max(0, number))
          : key === 'fontSize'
            ? Math.min(72, Math.max(8, number))
            : Math.min(12, Math.max(0, number));
      }
    }
    if (kind === 'text') {
      const text = String(next.text || '').trim();
      if (!text) return [];
      next.text = text.slice(0, 600);
    } else {
      delete next.text;
    }
    return [next];
  }).slice(0, 40);
};

const containsUncondensedResearchDump = (value: unknown) => {
  const text = typeof value === 'string' ? value : '';
  if (text.length < 900) return false;
  const urls = (text.match(/https?:\/\//gi) || []).length;
  const sourceMarkers = (text.match(/(?:来源|参考资料|检索结果|搜索结果|publishedAt|snippet|content)/gi) || []).length;
  return urls >= 2 || sourceMarkers >= 3;
};

const cleanSlideText = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
    .map(line => line.trim())
    .filter(line => line && !/^[；;、,，。.|｜\s]+$/.test(line));
  return lines.join('\n').trim();
};

const hasSlideContent = (slide: Record<string, unknown>) => {
  const fields = ['body', 'subtitle', 'takeaway', 'leftTitle', 'leftBody', 'rightTitle', 'rightBody', 'imageAttachmentId'];
  if (fields.some(key => typeof slide[key] === 'string' && String(slide[key]).trim())) return true;
  if (Array.isArray(slide.bullets) && slide.bullets.some(value => String(value || '').trim())) return true;
  if (Array.isArray(slide.items) && slide.items.some(value => value && typeof value === 'object')) return true;
  if (Array.isArray(slide.elements) && slide.elements.length > 0) return true;
  return false;
};

const validatePresentationQuality = (slides: Record<string, unknown>[]) => {
  const adjacentDuplicate = slides.some((slide, index) => index > 0 && String(slide.title || '').trim() === String(slides[index - 1].title || '').trim());
  if (adjacentDuplicate) throw new Error('PPT 不能连续出现相同标题的残片页。请把每页压缩为一个完整结论，细节放入 notes，不要依赖自动分页。');
  const empty = slides.findIndex((slide, index) => index > 0 && !hasSlideContent(slide));
  if (empty >= 0) throw new Error(`PPT 第 ${empty + 1} 页没有完整内容。请删除空页或补充结论、证据、图示或图片。`);
  const fragment = slides.findIndex((slide, index) => index > 0 && typeof slide.body === 'string' && /^[；;、,，。|｜]/.test(String(slide.body).trim()));
  if (fragment >= 0) throw new Error(`PPT 第 ${fragment + 1} 页正文是分页残句。请重新组织为完整句子，不要提交自动分页后的片段。`);
};

/** Resolve IDs, never paths. Native code rechecks persisted conversation scope
 * and embeds local raster bytes; this guard gives immediate actionable errors. */
export const preparePresentationFileRequest = (args: Record<string, unknown>, context: ChatToolExecutionContext): Record<string, unknown> => {
  const format = String(args.format || '').trim().replace(/^\./, '').toLowerCase();
  if (format !== 'pptx' && format !== 'powerpoint') return args;
  const source = args.presentation;
  if (!source || typeof source !== 'object' || Array.isArray(source)) throw new Error('生成 PPT 需要 presentation 结构和 slides 分页内容，不能只返回大纲');
  const presentation = source as Record<string, unknown>;
  if (!String(presentation.title || '').trim()) throw new Error('PPT 需要一个标题');
  const artDirection = resolvePresentationArtDirection(
    presentation.designStyle, presentation.theme,
  );
  if (!Array.isArray(presentation.slides) || !presentation.slides.length || presentation.slides.length > 40) throw new Error('PPT 需要 1～40 页，请拆分过长内容');
  const imageIds = new Set([
    ...(context.currentUserAttachments || []).filter(item => item.type === 'image').map(item => item.id),
    ...context.recentMessages.filter(message => message.conversationId === context.conversationId).flatMap(message => [
      ...message.attachments.filter(item => item.type === 'image').map(item => item.id),
      ...message.toolCalls.flatMap(getGeneratedMediaFromToolCall).filter(item => item.type === 'image').flatMap(item => [item.id, item.assetId || '']),
    ]),
  ].filter(Boolean));
  const slides = presentation.slides.map((value, index) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`PPT 第 ${index + 1} 页结构无效`);
    const slide = value as Record<string, unknown>;
    const id = String(slide.imageAttachmentId || '').trim();
    if (id && !imageIds.has(id)) throw new Error(`PPT 第 ${index + 1} 页图片 ID 不在当前会话已提供的附件或生成结果中，请重新附图；不能猜测路径或下载网址`);
    const textFields = [slide.body, slide.leftBody, slide.rightBody, slide.takeaway];
    if (textFields.some(containsUncondensedResearchDump)) {
      throw new Error(`PPT 第 ${index + 1} 页包含未提炼的检索原文。请先提炼 1 个结论、2～4 条证据和必要的来源，再把细节放入 notes；不要整段复制网页内容。`);
    }
    const items = Array.isArray(slide.items)
      ? slide.items.flatMap(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const next = { ...(item as Record<string, unknown>) };
        if (containsUncondensedResearchDump(next.body)) throw new Error(`PPT 第 ${index + 1} 页的结构化内容包含未提炼检索原文，请改成短标题、短证据和来源`);
        if ('title' in next) next.title = cleanSlideText(next.title);
        if ('body' in next) { const cleanedBody = cleanSlideText(next.body); next.body = cleanedBody; }
        if ('value' in next) next.value = cleanSlideText(next.value);
        return [next];
      })
      : [];
    const cleaned: Record<string, unknown> = { ...slide, items, elements: sanitizePresentationElements(slide.elements), bullets: Array.isArray(slide.bullets) ? slide.bullets.map(cleanSlideText).filter(value => typeof value === 'string' && value) : [], imageAttachmentId: id || null };
    for (const key of ['subtitle', 'body', 'leftTitle', 'leftBody', 'rightTitle', 'rightBody', 'takeaway', 'eyebrow', 'notes']) {
      if (key in cleaned) cleaned[key] = cleanSlideText(cleaned[key]);
    }
    if (slide.layout === 'canvas') {
      const elements = cleaned.elements as Array<Record<string, unknown>>;
      if (elements.some(element => element.kind === 'text' && !/^#[0-9a-f]{6}$/i.test(String(element.color || '')))) throw new Error(`PPT 第 ${index + 1} 页 canvas 的每个文字图元需要显式 color，保证与背景对比。`);
      const text = elements.filter(element => element.kind === 'text').map(element => String(element.text || '')).join('\n');
      if (!text.includes(String(slide.title || '').trim())) throw new Error(`PPT 第 ${index + 1} 页 canvas 需要用 text 图元显示本页标题，自行安排位置；不自动叠加模板标题。`);
      if (id || (Array.isArray(cleaned.items) && cleaned.items.length) || (Array.isArray(cleaned.bullets) && cleaned.bullets.length)
        || ['subtitle', 'body', 'leftTitle', 'leftBody', 'rightTitle', 'rightBody', 'eyebrow', 'takeaway'].some(key => typeof cleaned[key] === 'string' && String(cleaned[key]).trim())) {
        throw new Error(`PPT 第 ${index + 1} 页 canvas 请把所有可见文字写入 text 图元；不要同时提供模板正文、items 或图片。图片页可选 image-left/image-right。`);
      }
    }
    return cleaned;
  });
  validatePresentationQuality(slides);
  const normalizedPresentation: Record<string, unknown> = { ...presentation, ...artDirection, slides };
  return { ...args, format: 'pptx', presentation: normalizedPresentation };
};
