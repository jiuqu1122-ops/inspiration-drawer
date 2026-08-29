import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Image as ImageIcon,
  Lightbulb,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Upload,
  Workflow,
  X,
} from 'lucide-react';
import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { invoke, isTauri } from '@tauri-apps/api/core';
import {
  INSPIRATION_SPACE_API_BASE_URL,
  isPromptSharePayload,
  type InspirationSpaceDrawerImageOption,
  type InspirationSpacePreparedTemplate,
  type InspirationSpaceTemplateKind,
  type InspirationSpaceTemplateOption,
  type InspirationShare,
  type InspirationShareKind,
} from './model';
import './InspirationSpaceWindow.css';

type SubmitMode = 'JSON' | 'PROMPT';
type PreviewImage = { dataUrl: string; width: number; height: number };
type PreparedJson = {
  fileName: string;
  payload: unknown;
  kind: InspirationShareKind;
  embeddedPreviews: PreviewImage[];
  imageCount: number;
  compressedBytes: number;
};

const SHARE_KIND_LABELS: Record<InspirationShareKind, string> = {
  NODE_PRESET: '节点预设',
  WORKFLOW: '工作流',
  PROMPT: '提示词',
};
const MAX_IMAGE_DIMENSION = 1_600;
const MAX_IMAGE_BYTES = 850 * 1024;
const MAX_EMBEDDED_IMAGES = 30;
const DRAWER_IMAGE_PAGE_SIZE = 24;

const isRecord = (value: unknown): value is Record<string, unknown> => (
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)
);

const classifyJson = (value: unknown): InspirationShareKind[] => {
  const kinds = new Set<InspirationShareKind>();
  const classify = (candidate: unknown) => {
    if (!isRecord(candidate)) return;
    if (isPromptSharePayload(candidate)) {
      kinds.add('PROMPT');
      return;
    }
    if (typeof candidate.label === 'string' && typeof candidate.prompt === 'string') kinds.add('NODE_PRESET');
    if (typeof candidate.label === 'string' && Array.isArray(candidate.nodes)) kinds.add('WORKFLOW');
  };
  if (Array.isArray(value)) {
    value.forEach(classify);
  } else if (isRecord(value)) {
    if (value.type === 'inspiration-drawer-workflow-instance' && isRecord(value.workflow)) {
      classify(value.workflow);
    } else {
      if (Array.isArray(value.presets)) value.presets.forEach(classify);
      if (Array.isArray(value.workflows)) value.workflows.forEach(classify);
      if (isRecord(value.preset)) classify(value.preset);
      if (isRecord(value.workflow)) classify(value.workflow);
      if (kinds.size === 0) classify(value);
    }
  }
  return [...kinds];
};

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
  reader.readAsDataURL(blob);
});

const loadImage = (source: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('图片无法解码'));
  image.src = source;
});

const compressImage = async (source: string | Blob): Promise<PreviewImage> => {
  const inputUrl = typeof source === 'string' ? source : URL.createObjectURL(source);
  try {
    const image = await loadImage(inputUrl);
    const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    for (const dimensionScale of [1, 0.85, 0.7, 0.55]) {
      const outputWidth = Math.max(1, Math.round(width * dimensionScale));
      const outputHeight = Math.max(1, Math.round(height * dimensionScale));
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d', { alpha: true });
      if (!context) throw new Error('无法创建图片压缩画布');
      context.drawImage(image, 0, 0, outputWidth, outputHeight);
      for (const quality of [0.84, 0.72, 0.6]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (blob && blob.size <= MAX_IMAGE_BYTES) {
          return { dataUrl: await blobToDataUrl(blob), width: outputWidth, height: outputHeight };
        }
      }
    }
    throw new Error('图片压缩后仍超过 850 KB，请换一张较小的图片');
  } finally {
    if (typeof source !== 'string') URL.revokeObjectURL(inputUrl);
  }
};

const compressJsonImages = async (value: unknown) => {
  const cache = new Map<string, PreviewImage>();
  let imageCount = 0;
  const visit = async (current: unknown, depth: number): Promise<unknown> => {
    if (depth > 40) throw new Error('JSON 嵌套层级过深');
    if (typeof current === 'string' && /^data:image\/(?:png|jpeg|webp);base64,/i.test(current)) {
      imageCount += 1;
      if (imageCount > MAX_EMBEDDED_IMAGES) throw new Error(`带图 JSON 最多支持 ${MAX_EMBEDDED_IMAGES} 张内嵌图片`);
      const cached = cache.get(current);
      if (cached) return cached.dataUrl;
      const compressed = await compressImage(current);
      cache.set(current, compressed);
      return compressed.dataUrl;
    }
    if (Array.isArray(current)) {
      const next: unknown[] = [];
      for (const item of current) next.push(await visit(item, depth + 1));
      return next;
    }
    if (isRecord(current)) {
      const next: Record<string, unknown> = {};
      for (const [key, item] of Object.entries(current)) next[key] = await visit(item, depth + 1);
      return next;
    }
    return current;
  };
  return { payload: await visit(value, 0), previews: [...cache.values()].slice(0, 6), imageCount };
};

const parseApi = async <T,>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({})) as { message?: string };
  if (!response.ok) throw new Error(payload.message || `请求失败（HTTP ${response.status}）`);
  return payload as T;
};

const browserApiBaseUrl = import.meta.env.DEV
  ? '/__inspiration-space-api'
  : INSPIRATION_SPACE_API_BASE_URL;

const listInspirationShares = async (kind: '' | InspirationShareKind, query: string) => {
  if (isTauri()) {
    return invoke<{ items: InspirationShare[] }>('inspiration_space_list', {
      kind: kind || undefined,
      query: query.trim() || undefined,
    });
  }
  const params = new URLSearchParams({ limit: '48' });
  if (kind) params.set('kind', kind);
  if (query.trim()) params.set('query', query.trim());
  const response = await fetch(`${browserApiBaseUrl}/v1/inspiration-space?${params}`);
  return parseApi<{ items: InspirationShare[] }>(response);
};

const downloadInspirationShare = async (shareId: string) => {
  if (isTauri()) return invoke<unknown>('inspiration_space_download', { id: shareId });
  const response = await fetch(`${browserApiBaseUrl}/v1/inspiration-space/${shareId}/download`);
  return parseApi<unknown>(response);
};

const submitInspirationShare = async (submission: Record<string, unknown>) => {
  if (isTauri()) return invoke<{ message: string }>('inspiration_space_submit', { submission });
  const response = await fetch(`${browserApiBaseUrl}/v1/inspiration-space`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(submission),
  });
  return parseApi<{ message: string }>(response);
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('zh-CN');
};

type InspirationSpaceWindowProps = {
  embedded?: boolean;
  onClose?: () => void;
  onAddToCanvas?: (share: InspirationShare, payload: unknown) => Promise<string>;
  templateOptions?: InspirationSpaceTemplateOption[];
  onPrepareTemplate?: (kind: InspirationSpaceTemplateKind, templateId: string) => Promise<InspirationSpacePreparedTemplate>;
  onLoadDrawerImages?: () => Promise<InspirationSpaceDrawerImageOption[]>;
  onReadDrawerImage?: (image: InspirationSpaceDrawerImageOption) => Promise<string>;
};

export function InspirationSpaceWindow({
  embedded = false,
  onClose,
  onAddToCanvas,
  templateOptions = [],
  onPrepareTemplate,
  onLoadDrawerImages,
  onReadDrawerImage,
}: InspirationSpaceWindowProps = {}) {
  const [items, setItems] = useState<InspirationShare[]>([]);
  const [previewIndexes, setPreviewIndexes] = useState<Record<string, number>>({});
  const [kindFilter, setKindFilter] = useState<'' | InspirationShareKind>('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSubmit, setShowSubmit] = useState(false);
  const [submitMode, setSubmitMode] = useState<SubmitMode>('JSON');
  const [prepared, setPrepared] = useState<PreparedJson | null>(null);
  const [promptText, setPromptText] = useState('');
  const [extraPreviews, setExtraPreviews] = useState<PreviewImage[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [tags, setTags] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pendingShareId, setPendingShareId] = useState('');
  const [addedShareIds, setAddedShareIds] = useState<Set<string>>(() => new Set());
  const [nativePickerMode, setNativePickerMode] = useState<'TEMPLATE' | 'IMAGE' | null>(null);
  const [nativePickerQuery, setNativePickerQuery] = useState('');
  const [drawerImageOptions, setDrawerImageOptions] = useState<InspirationSpaceDrawerImageOption[]>([]);
  const [drawerImageOrigin, setDrawerImageOrigin] = useState<'ALL' | InspirationSpaceDrawerImageOption['origin']>('ALL');
  const [visibleDrawerImageCount, setVisibleDrawerImageCount] = useState(DRAWER_IMAGE_PAGE_SIZE);
  const [nativePickerLoading, setNativePickerLoading] = useState(false);
  const promptPreviewRequired = submitMode === 'PROMPT' || prepared?.kind === 'PROMPT';
  const visibleSubmissionPreviews = [
    ...(promptPreviewRequired ? extraPreviews.slice(0, 1) : extraPreviews),
    ...(promptPreviewRequired ? [] : prepared?.embeddedPreviews || []),
  ].slice(0, 6);
  const filteredTemplateOptions = useMemo(() => {
    const needle = nativePickerQuery.trim().toLocaleLowerCase('zh-CN');
    if (!needle) return templateOptions;
    return templateOptions.filter((template) => (
      `${template.label} ${template.hint} ${SHARE_KIND_LABELS[template.kind]}`.toLocaleLowerCase('zh-CN').includes(needle)
    ));
  }, [nativePickerQuery, templateOptions]);
  const filteredDrawerImageOptions = useMemo(() => {
    const needle = nativePickerQuery.trim().toLocaleLowerCase('zh-CN');
    return drawerImageOptions.filter((image) => (
      (drawerImageOrigin === 'ALL' || image.origin === drawerImageOrigin)
      && (!needle || image.name.toLocaleLowerCase('zh-CN').includes(needle))
    ));
  }, [drawerImageOptions, drawerImageOrigin, nativePickerQuery]);
  const visibleDrawerImageOptions = filteredDrawerImageOptions.slice(0, visibleDrawerImageCount);
  const hasMoreDrawerImages = visibleDrawerImageCount < filteredDrawerImageOptions.length;

  const loadItems = useCallback(async (nextKind: '' | InspirationShareKind, nextQuery: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await listInspirationShares(nextKind, nextQuery);
      setItems(data.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '灵感空间加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadItems('', '');
  }, [loadItems]);

  useEffect(() => {
    if (!onClose) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || busy) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (showSubmit) setShowSubmit(false);
      else onClose();
    };
    window.addEventListener('keydown', handleEscape, true);
    return () => window.removeEventListener('keydown', handleEscape, true);
  }, [busy, onClose, showSubmit]);

  const totalDownloads = useMemo(
    () => items.reduce((sum, item) => sum + item.downloadCount, 0),
    [items],
  );

  const recordDownload = (shareId: string) => {
    setItems((current) => current.map((item) => (
      item.id === shareId ? { ...item, downloadCount: item.downloadCount + 1 } : item
    )));
  };

  const addToCanvas = async (item: InspirationShare) => {
    if (pendingShareId) return;
    if (!onAddToCanvas && !isTauri()) {
      setError('浏览器预览无法连接画布，请在灵感抽屉应用内使用');
      return;
    }
    setPendingShareId(item.id);
    setError('');
    setNotice('正在读取资源并发送到画布…');
    try {
      const payload = await downloadInspirationShare(item.id);
      if (!onAddToCanvas) throw new Error('当前窗口没有可用的画布连接');
      const message = await onAddToCanvas(item, payload);
      recordDownload(item.id);
      setPendingShareId('');
      setAddedShareIds((current) => new Set(current).add(item.id));
      setNotice(message);
      if (embedded) onClose?.();
    } catch (reason) {
      setPendingShareId('');
      setNotice('');
      setError(reason instanceof Error ? reason.message : '添加到画布失败');
    }
  };

  const copyPrompt = async (item: InspirationShare) => {
    setError('');
    try {
      let prompt = item.prompt?.trim() || '';
      if (!prompt) {
        const payload = await downloadInspirationShare(item.id);
        if (!isPromptSharePayload(payload)) throw new Error('这个分享里没有可复制的提示词');
        prompt = payload.prompt.trim();
        recordDownload(item.id);
      }
      await navigator.clipboard.writeText(prompt);
      setNotice(`已复制「${item.title}」的提示词`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提示词复制失败');
    }
  };

  const selectJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusy(true);
    setError('');
    setProgress('正在读取并检查 JSON…');
    try {
      const text = await file.text();
      if (new Blob([text]).size > 20 * 1024 * 1024) throw new Error('原始 JSON 不能超过 20 MB');
      const raw = JSON.parse(text) as unknown;
      const kinds = classifyJson(raw);
      if (!kinds.length) throw new Error('没有识别到节点预设、工作流或提示词分享');
      setProgress('正在自动压缩 JSON 内嵌图片…');
      const compressed = await compressJsonImages(raw);
      const compressedBytes = new Blob([JSON.stringify(compressed.payload)]).size;
      if (compressedBytes > 8 * 1024 * 1024) throw new Error('压缩后的 JSON 仍超过 8 MB');
      const kind: InspirationShareKind = kinds.includes('WORKFLOW')
        ? 'WORKFLOW'
        : kinds.includes('NODE_PRESET') ? 'NODE_PRESET' : 'PROMPT';
      setPrepared({
        fileName: file.name,
        payload: compressed.payload,
        kind,
        embeddedPreviews: compressed.previews,
        imageCount: compressed.imageCount,
        compressedBytes,
      });
      setTitle(file.name.replace(/\.json$/i, '').slice(0, 80));
      setNotice(compressed.imageCount
        ? `已识别并压缩 ${compressed.imageCount} 张内嵌图片`
        : 'JSON 已识别，可继续添加展示图');
    } catch (reason) {
      setPrepared(null);
      setError(reason instanceof Error ? reason.message : 'JSON 处理失败');
    } finally {
      setProgress('');
      setBusy(false);
    }
  };

  const openNativePicker = async (mode: 'TEMPLATE' | 'IMAGE') => {
    setNativePickerMode(mode);
    setNativePickerQuery('');
    setDrawerImageOrigin('ALL');
    setVisibleDrawerImageCount(DRAWER_IMAGE_PAGE_SIZE);
    setError('');
    if (mode !== 'IMAGE' || !onLoadDrawerImages) return;
    setNativePickerLoading(true);
    try {
      setDrawerImageOptions(await onLoadDrawerImages());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '抽屉图片加载失败');
    } finally {
      setNativePickerLoading(false);
    }
  };

  const selectNativeTemplate = async (template: InspirationSpaceTemplateOption) => {
    if (!onPrepareTemplate) return;
    setBusy(true);
    setError('');
    setProgress(`正在准备抽屉${SHARE_KIND_LABELS[template.kind]}…`);
    try {
      const preparedTemplate = await onPrepareTemplate(template.kind, template.id);
      const kinds = classifyJson(preparedTemplate.payload);
      if (!kinds.includes(template.kind)) throw new Error(`没有识别到可分享的${SHARE_KIND_LABELS[template.kind]}内容`);
      setProgress(`正在压缩${SHARE_KIND_LABELS[template.kind]}内嵌图片…`);
      const compressed = await compressJsonImages(preparedTemplate.payload);
      const compressedBytes = new Blob([JSON.stringify(compressed.payload)]).size;
      if (compressedBytes > 8 * 1024 * 1024) throw new Error(`压缩后的${SHARE_KIND_LABELS[template.kind]}仍超过 8 MB`);
      setPrepared({
        fileName: `${preparedTemplate.label.replace(/[\\/:*?"<>|]+/g, '-').slice(0, 72) || SHARE_KIND_LABELS[template.kind]}.json`,
        payload: compressed.payload,
        kind: template.kind,
        embeddedPreviews: compressed.previews,
        imageCount: compressed.imageCount,
        compressedBytes,
      });
      setTitle(preparedTemplate.label.slice(0, 80));
      setNotice(`已直接选择抽屉${SHARE_KIND_LABELS[template.kind]}「${preparedTemplate.label}」`);
      setNativePickerMode(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : `抽屉${SHARE_KIND_LABELS[template.kind]}准备失败`);
    } finally {
      setProgress('');
      setBusy(false);
    }
  };

  const selectNativeDrawerImage = async (image: InspirationSpaceDrawerImageOption) => {
    setBusy(true);
    setError('');
    setProgress('正在压缩抽屉图片…');
    try {
      let compressed: PreviewImage;
      const readableSource = onReadDrawerImage ? await onReadDrawerImage(image) : image.source;
      compressed = await compressImage(readableSource);
      setExtraPreviews((current) => (
        promptPreviewRequired ? [compressed] : [...current, compressed].slice(0, 6)
      ));
      setNotice(`已从抽屉选择图片「${image.name}」`);
      setNativePickerMode(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '抽屉图片处理失败');
    } finally {
      setProgress('');
      setBusy(false);
    }
  };

  const selectPreviews = async (event: ChangeEvent<HTMLInputElement>) => {
    const maxFiles = promptPreviewRequired ? 1 : 6;
    const files = [...(event.target.files || [])].slice(0, maxFiles);
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    setProgress('正在压缩展示图…');
    try {
      const compressed: PreviewImage[] = [];
      for (const file of files) {
        if (file.type.startsWith('image/')) compressed.push(await compressImage(file));
      }
      setExtraPreviews(compressed);
      setNotice(`已准备 ${compressed.length} 张展示图`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '展示图压缩失败');
    } finally {
      setProgress('');
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const isDirectPromptSubmission = submitMode === 'PROMPT';
    if (!isDirectPromptSubmission && !prepared) {
      setError('请先选择 JSON 文件');
      return;
    }
    if (title.trim().length < 2 || authorName.trim().length < 2) {
      setError('标题和分享者名称至少填写 2 个字符');
      return;
    }
    if (isDirectPromptSubmission && promptText.trim().length < 10) {
      setError('提示词内容至少填写 10 个字符');
      return;
    }
    const kind: InspirationShareKind = isDirectPromptSubmission ? 'PROMPT' : prepared!.kind;
    if (kind === 'PROMPT' && extraPreviews.length !== 1) {
      setError('提示词分享必须上传 1 张由该提示词生成的效果图');
      return;
    }
    const previews = [
      ...(kind === 'PROMPT' ? extraPreviews.slice(0, 1) : extraPreviews),
      ...(kind === 'PROMPT' ? [] : prepared?.embeddedPreviews || []),
    ].slice(0, 6);
    const payload = isDirectPromptSubmission
      ? { type: 'inspiration-drawer-prompt-share', version: 1, title: title.trim(), prompt: promptText.trim() }
      : prepared!.payload;
    const fileName = isDirectPromptSubmission
      ? `${title.trim().replace(/\.json$/i, '') || '提示词分享'}.json`
      : prepared!.fileName;
    setBusy(true);
    setError('');
    setProgress('正在提交审核…');
    try {
      const result = await submitInspirationShare({
        kind,
        title: title.trim(),
        description: description.trim() || null,
        authorName: authorName.trim(),
        tags: [...new Set(tags.split(/[,，\s]+/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 8),
        fileName,
        payload,
        previews,
      });
      setNotice(result.message);
      setPrepared(null);
      setPromptText('');
      setExtraPreviews([]);
      setTitle('');
      setDescription('');
      setTags('');
      setShowSubmit(false);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '投稿失败');
    } finally {
      setProgress('');
      setBusy(false);
    }
  };

  const chooseKind = (kind: '' | InspirationShareKind) => {
    setKindFilter(kind);
    void loadItems(kind, query);
  };

  return (
    <main className={`inspiration-space-window ${embedded ? 'embedded' : ''}`}>
      <header className="inspiration-space-header">
        <div className="inspiration-space-brand">
          <span className="inspiration-space-mark"><Lightbulb aria-hidden="true" /></span>
          <div><strong>灵感空间</strong><small>创作者共享库</small></div>
        </div>
        <div className="inspiration-space-header-meta">
          <span>{items.length} 份公开资源</span>
          <span>{totalDownloads} 次添加</span>
          <button type="button" onClick={() => setShowSubmit(true)}><Plus aria-hidden="true" />分享灵感</button>
          {onClose && <button type="button" className="inspiration-space-close" onClick={onClose} aria-label="关闭灵感空间"><X aria-hidden="true" /></button>}
        </div>
      </header>

      <section className="inspiration-space-intro">
        <div>
          <span className="inspiration-space-eyebrow">INSPIRATION SPACE</span>
          <h1>找到灵感，直接放进画布。</h1>
          <p>浏览社区分享的节点预设、工作流和提示词。无需下载文件，点击一次即可添加到当前画布。</p>
        </div>
        <div className="inspiration-space-intro-note">
          <Sparkles aria-hidden="true" />
          <div><strong>应用内原生导入</strong><small>预设生成节点 · 工作流生成模块 · 提示词附带效果图</small></div>
        </div>
      </section>

      <section className="inspiration-space-library">
        <div className="inspiration-space-tools">
          <nav aria-label="资源类型">
            {([
              ['', '全部'],
              ['WORKFLOW', '工作流'],
              ['NODE_PRESET', '节点预设'],
              ['PROMPT', '提示词'],
            ] as Array<['' | InspirationShareKind, string]>).map(([value, label]) => (
              <button
                type="button"
                key={value || 'all'}
                className={kindFilter === value ? 'active' : ''}
                onClick={() => chooseKind(value)}
              >
                {label}
              </button>
            ))}
          </nav>
          <form onSubmit={(event) => { event.preventDefault(); void loadItems(kindFilter, query); }}>
            <Search aria-hidden="true" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、作者或标签" />
            <button type="submit">搜索</button>
          </form>
        </div>

        {(error || notice) && (
          <div className={`inspiration-space-message ${error ? 'error' : 'notice'}`} role="status">
            <span>{error || notice}</span>
            <button type="button" onClick={() => { setError(''); setNotice(''); }} aria-label="关闭提示"><X /></button>
          </div>
        )}

        <div className="inspiration-space-grid" aria-busy={loading}>
          {loading && Array.from({ length: 6 }, (_, index) => (
            <article className="inspiration-space-card skeleton" key={index} aria-hidden="true"><div /><section><i /><b /><p /></section></article>
          ))}
          {!loading && items.map((item) => {
            const previewCount = item.previews.length;
            const previewIndex = previewCount ? Math.min(previewIndexes[item.id] ?? 0, previewCount - 1) : 0;
            const activePreview = item.previews[previewIndex];
            const isPending = pendingShareId === item.id;
            const isAdded = addedShareIds.has(item.id);
            return (
              <article className="inspiration-space-card" key={item.id}>
                <div className="inspiration-space-cover">
                  {activePreview
                    ? <img key={activePreview.id} src={activePreview.url} alt={`${item.title} 的展示图`} loading="lazy" />
                    : <div className="inspiration-space-empty-cover"><ImageIcon /><span>暂无展示图</span></div>}
                  <em>{SHARE_KIND_LABELS[item.kind]}</em>
                  {previewCount > 1 && (
                    <>
                      <span className="inspiration-space-preview-count">{previewIndex + 1} / {previewCount}</span>
                      <button
                        type="button"
                        className="inspiration-space-preview-button previous"
                        onClick={() => setPreviewIndexes((current) => ({ ...current, [item.id]: (previewIndex - 1 + previewCount) % previewCount }))}
                        aria-label="上一张展示图"
                      ><ChevronLeft /></button>
                      <button
                        type="button"
                        className="inspiration-space-preview-button next"
                        onClick={() => setPreviewIndexes((current) => ({ ...current, [item.id]: (previewIndex + 1) % previewCount }))}
                        aria-label="下一张展示图"
                      ><ChevronRight /></button>
                    </>
                  )}
                </div>
                <section>
                  <small>{item.authorName} · {formatDate(item.createdAt)}</small>
                  <h2>{item.title}</h2>
                  {item.kind === 'PROMPT' && item.prompt ? (
                    <div className="inspiration-space-prompt-preview">
                      <span>实际提示词</span>
                      <p>{item.prompt}</p>
                    </div>
                  ) : (
                    <p>{item.description || '作者没有填写额外说明。'}</p>
                  )}
                  <div className="inspiration-space-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                  <footer>
                    {item.kind === 'PROMPT' && (
                      <button type="button" className="secondary" onClick={() => void copyPrompt(item)}><Copy />复制</button>
                    )}
                    <button
                      type="button"
                      className={`primary ${isAdded ? 'added' : ''}`}
                      onClick={() => void addToCanvas(item)}
                      disabled={Boolean(pendingShareId)}
                    >
                      {isPending ? <RefreshCw className="spin" /> : isAdded ? <Check /> : item.kind === 'PROMPT' ? <Plus /> : <Download />}
                      {isPending ? '添加中…' : isAdded ? '已添加' : '添加到画布'}
                      <b>{item.downloadCount}</b>
                    </button>
                  </footer>
                </section>
              </article>
            );
          })}
          {!loading && items.length === 0 && (
            <div className="inspiration-space-empty-state"><Lightbulb /><strong>暂时没有符合条件的分享</strong><span>换个关键词，或者成为第一个分享者。</span></div>
          )}
        </div>
      </section>

      {showSubmit && (
        <div className="inspiration-space-modal-backdrop" onMouseDown={() => !busy && setShowSubmit(false)}>
          <form className="inspiration-space-modal" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
            <header>
              <div><span>SHARE TO COMMUNITY</span><h2>分享你的创作灵感</h2></div>
              <button type="button" onClick={() => !busy && setShowSubmit(false)} aria-label="关闭分享窗口"><X /></button>
            </header>
            <div className="inspiration-space-submit-modes">
              <button type="button" className={submitMode === 'JSON' ? 'active' : ''} onClick={() => setSubmitMode('JSON')}><Workflow />预设 / 工作流</button>
              <button type="button" className={submitMode === 'PROMPT' ? 'active' : ''} onClick={() => setSubmitMode('PROMPT')}><Sparkles />提示词分享</button>
            </div>
            {nativePickerMode && (
              <section className="inspiration-space-native-picker">
                <header>
                  <div>
                    <strong>{nativePickerMode === 'TEMPLATE' ? '选择抽屉预设或工作流' : '选择抽屉图片'}</strong>
                    <small>{nativePickerMode === 'TEMPLATE' ? '节点预设和工作流都可以直接分享，无需导出 JSON' : '大图预览，最近添加的图片优先显示'}</small>
                  </div>
                  <button type="button" onClick={() => setNativePickerMode(null)} aria-label="关闭抽屉内容选择器"><X /></button>
                </header>
                <label className="inspiration-space-native-search">
                  <Search aria-hidden="true" />
                  <input
                    value={nativePickerQuery}
                    onChange={(event) => {
                      setNativePickerQuery(event.target.value);
                      if (nativePickerMode === 'IMAGE') setVisibleDrawerImageCount(DRAWER_IMAGE_PAGE_SIZE);
                    }}
                    placeholder={nativePickerMode === 'TEMPLATE' ? '搜索预设或工作流' : '搜索图片名称'}
                    autoFocus
                  />
                </label>
                {nativePickerMode === 'TEMPLATE' ? (
                  <div className="inspiration-space-native-templates">
                    {filteredTemplateOptions.map((template) => (
                      <button type="button" key={`${template.kind}:${template.id}`} onClick={() => void selectNativeTemplate(template)} disabled={busy}>
                        {template.kind === 'NODE_PRESET' ? <Sparkles aria-hidden="true" /> : <Workflow aria-hidden="true" />}
                        <span><strong>{template.label}</strong><small>{template.hint || `可直接分享的${SHARE_KIND_LABELS[template.kind]}`}</small></span>
                        <em><b>{SHARE_KIND_LABELS[template.kind]}</b>{template.builtin ? '内置' : '自定义'}</em>
                      </button>
                    ))}
                    {!nativePickerLoading && filteredTemplateOptions.length === 0 && <p>没有找到可分享的预设或工作流</p>}
                  </div>
                ) : (
                  <>
                    <div className="inspiration-space-native-image-origins" aria-label="图片来源">
                      {([
                        ['ALL', '全部最近'],
                        ['DRAWER', '最近加入抽屉'],
                        ['GENERATED', '最近生成'],
                      ] as const).map(([origin, label]) => (
                        <button
                          type="button"
                          key={origin}
                          className={drawerImageOrigin === origin ? 'active' : ''}
                          onClick={() => {
                            setDrawerImageOrigin(origin);
                            setVisibleDrawerImageCount(DRAWER_IMAGE_PAGE_SIZE);
                          }}
                        >{label}</button>
                      ))}
                    </div>
                    <div className="inspiration-space-native-images">
                      {visibleDrawerImageOptions.map((image) => (
                        <button type="button" key={`${image.origin}:${image.id}`} onClick={() => void selectNativeDrawerImage(image)} disabled={busy} title={image.name}>
                          <span className="inspiration-space-native-image-origin">{image.origin === 'GENERATED' ? '最近生成' : '最近加入'}</span>
                          <img
                            src={image.preview || image.source}
                            alt={image.name}
                            loading="lazy"
                            decoding="async"
                            onError={(event) => {
                              if (image.preview && image.preview !== image.source && event.currentTarget.src !== image.source) {
                                event.currentTarget.src = image.source;
                              }
                            }}
                          />
                          <span>{image.name}</span>
                        </button>
                      ))}
                      {!nativePickerLoading && filteredDrawerImageOptions.length === 0 && <p>没有找到该来源的最近图片</p>}
                    </div>
                  </>
                )}
                {nativePickerLoading && <div className="inspiration-space-native-loading"><RefreshCw className="spin" />正在读取抽屉内容…</div>}
                {nativePickerMode === 'IMAGE' && !nativePickerLoading && filteredDrawerImageOptions.length > 0 && (
                  <div className="inspiration-space-native-image-pagination">
                    <span>已显示 {visibleDrawerImageOptions.length} / {filteredDrawerImageOptions.length} 张</span>
                    {hasMoreDrawerImages && (
                      <button type="button" onClick={() => setVisibleDrawerImageCount(count => count + DRAWER_IMAGE_PAGE_SIZE)}>
                        加载更多图片
                      </button>
                    )}
                  </div>
                )}
              </section>
            )}
            {submitMode === 'JSON' ? (
              <>
                {onPrepareTemplate && templateOptions.length > 0 && (
                  <button type="button" className="inspiration-space-native-source" onClick={() => void openNativePicker('TEMPLATE')} disabled={busy}>
                    <Workflow aria-hidden="true" />
                    <span><strong>直接选择抽屉预设 / 工作流</strong><small>无需先导出 JSON，工作流固定参考图会自动打包</small></span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                )}
                <label className="inspiration-space-file-drop">
                  <input type="file" accept=".json,application/json" onChange={selectJson} disabled={busy} />
                  <Upload />
                  <span><strong>{prepared ? prepared.fileName : '选择灵感抽屉 JSON 文件'}</strong><small>{prepared
                    ? `${SHARE_KIND_LABELS[prepared.kind]} · ${prepared.imageCount} 张内嵌图 · ${(prepared.compressedBytes / 1024).toFixed(0)} KB`
                    : '也可以从电脑选择节点预设、工作流或提示词 JSON'}</small></span>
                </label>
              </>
            ) : (
              <label className="inspiration-space-field prompt">
                <strong>提示词内容</strong>
                <textarea value={promptText} onChange={(event) => setPromptText(event.target.value)} maxLength={20_000} rows={7} placeholder="粘贴完整提示词，保留必要的格式、变量和使用说明…" />
                <small>{promptText.length.toLocaleString('zh-CN')} / 20,000 字符</small>
              </label>
            )}
            <div className="inspiration-space-form-grid">
              <label className="inspiration-space-field"><strong>标题</strong><input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={80} /></label>
              <label className="inspiration-space-field"><strong>分享者名称</strong><input value={authorName} onChange={(event) => setAuthorName(event.target.value)} maxLength={32} /></label>
            </div>
            <label className="inspiration-space-field"><strong>简介</strong><textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} placeholder="说明适合做什么、如何使用" /></label>
            <label className="inspiration-space-field"><strong>标签</strong><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="工业设计, CMF, 产品展示（最多 8 个）" /></label>
            {onLoadDrawerImages && (
              <button type="button" className="inspiration-space-native-source" onClick={() => void openNativePicker('IMAGE')} disabled={busy}>
                <ImageIcon aria-hidden="true" />
                <span><strong>直接选择抽屉图片</strong><small>{promptPreviewRequired ? '选择一张提示词生成效果图' : '作为本次分享的展示图'}</small></span>
                <ChevronRight aria-hidden="true" />
              </button>
            )}
            <label className="inspiration-space-preview-picker">
              <input type="file" accept="image/png,image/jpeg,image/webp" multiple={!promptPreviewRequired} onChange={selectPreviews} disabled={busy} />
              <ImageIcon />
              <span><strong>{promptPreviewRequired ? '上传提示词生成效果图（必填）' : '添加展示图'}</strong><small>{promptPreviewRequired
                ? '必须上传且只能上传 1 张由这段提示词生成的图片。'
                : '最多 6 张；没有时会使用 JSON 内嵌图片。'}</small></span>
            </label>
            {visibleSubmissionPreviews.length > 0 && (
              <div className="inspiration-space-preview-strip">{visibleSubmissionPreviews.map((preview, index) => (
                <img key={`${preview.dataUrl.slice(-20)}-${index}`} src={preview.dataUrl} alt={`待提交展示图 ${index + 1}`} />
              ))}</div>
            )}
            {(error || progress) && <div className={`inspiration-space-message ${error ? 'error' : 'notice'}`}>{error || progress}</div>}
            <footer>
              <small>投稿会先进入审核，通过后才会公开。</small>
              <button type="submit" disabled={busy || (submitMode === 'JSON' ? !prepared || promptPreviewRequired && extraPreviews.length !== 1 : promptText.trim().length < 10 || extraPreviews.length !== 1)}>
                {busy ? progress || '处理中…' : '提交审核'}
              </button>
            </footer>
          </form>
        </div>
      )}
    </main>
  );
}
