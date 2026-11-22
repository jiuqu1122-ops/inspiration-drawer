import { ArrowDown, ArrowUp, ChevronDown, Download, Eye, EyeOff, GripHorizontal, ImagePlus, Layers2, LockKeyhole, Scan, Undo2, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { CanvasRunAction } from '../../../components/CanvasAiRunButton';
import type { CanvasImageItem } from '../../canvasModel';
import { getCanvasItemThumbnailSource, getCanvasOriginalImageSource } from '../../../utils/canvasItemSelectors';
import { CanvasStableImage } from '../components/CanvasStableImage';
import { CanvasItemResizeHandles } from '../components/CanvasItemResizeHandles';
import { getLayerCatalog } from './canvasLayerApi';
import { canvasLayerInputSource, layerSourceKey } from './canvasLayerActions';
import { layerAssetUrl, orderedLayers } from './canvasLayerAssets';
import type { CanvasLayer, CanvasLayerGroup, LayerCatalog } from './canvasLayerTypes';
import './CanvasLayerNode.css';

const button = 'rounded-md bg-stone-200/65 px-2 py-1 text-xs font-semibold hover:bg-cyan-100 disabled:opacity-40 dark:bg-stone-700/80 dark:hover:bg-stone-600';

function Frame({ scope, item, children, onDoubleClick }: { scope: Record<string, any>; item: CanvasImageItem; children: ReactNode; onDoubleClick?: () => void }) {
  const group = item.layerResult?.group;
  const selected = scope.canvasSelectedIdsSet?.has(item.id);
  return <div data-canvas-item-id={item.id} data-canvas-selected-state={selected ? 'true' : undefined}
    className={`group/canvas-item absolute isolate ${item.layerOperation ? 'canvas-layer-operation' : group ? 'canvas-layer-group' : 'rounded-xl bg-white/95 shadow-lg dark:bg-stone-900/95'}`}
    style={{ left: item.x, top: item.y, width: item.width, height: item.height, contain: item.layerResult ? 'layout style' : undefined,
      zIndex: selected ? 2 : 0 }}
    onPointerDown={event => scope.startCanvasItemDrag(event, item.id)}
    onPointerEnter={() => { scope.canvasHoveredItemIdRef.current = item.id; }}
    onPointerLeave={() => { if (scope.canvasHoveredItemIdRef.current === item.id) scope.canvasHoveredItemIdRef.current = ''; }}
    onContextMenu={event => {
      scope.updateCanvasSelection([item.id]);
      scope.openCanvasContextMenu(event, 'item', { itemId: item.id });
    }}
    onDoubleClick={event => { if (onDoubleClick) { event.stopPropagation(); onDoubleClick(); } }}>
    {group ? <div className="canvas-layer-group__card" style={{
      '--layer-scale': scope.canvasRenderScale ?? 1,
      '--layer-node-y': `${item.y}px`,
    } as CSSProperties}>
      <header className="canvas-layer-group__title" title="拖动整个图层组">
        <Layers2 size={15} aria-hidden="true" />
        <span className="truncate">{item.item.name} · {group.layers.length + 1} 层（含底图）</span>
        <GripHorizontal size={16} aria-hidden="true" className="canvas-layer-group__grip" />
      </header>
      {children}
      {selected && scope.canvasSelectedIdsSet.size === 1 && !scope.canvasAiPromptEditorSessions?.[item.id] &&
        <div className="canvas-layer-group__handles"><CanvasItemResizeHandles itemId={item.id}
          scale={scope.canvasRenderScale} onResize={scope.startCanvasItemResize} /></div>}
    </div> : children}
  </div>;
}

export function CanvasLayerNode({ scope, item }: { scope: Record<string, any>; item: CanvasImageItem }) {
  if (item.layerOperation) return <OperationCard scope={scope} item={item} />;
  return <ResultCard scope={scope} item={item} />;
}

function OperationCard({ scope, item }: { scope: Record<string, any>; item: CanvasImageItem }) {
  const config = item.layerOperation!;
  const [catalog, setCatalog] = useState<LayerCatalog>();
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const refresh = useCallback(() => {
    setError('');
    void getLayerCatalog().then(setCatalog).catch(() => { setCatalog(undefined); setError('无法读取可用能力和积分，请检查服务连接'); });
  }, []);
  const { mode } = config;
  const offer = catalog?.[mode]?.[0];
  const price = offer?.creditsPerRequest;
  const unit = offer?.creditsPerOutputImage;
  const creditLabel = price === undefined ? undefined
    : `${Number(unit ?? price).toLocaleString('zh-CN', { maximumFractionDigits: 6 })}${unit === undefined ? '积分' : ' 积分/层'}`;
  const source = scope.canvasItemsById.get(item.inputs?.[0]) as CanvasImageItem | undefined;
  const src = canvasLayerInputSource(source);
  const sourceName = source?.item.name || '已连接图片';
  const thumbnail = source?.item.type === 'image' ? getCanvasItemThumbnailSource(source.item) || src : src;
  const latest = scope.canvasItemsById.get(config.outputs?.[mode]) as CanvasImageItem | undefined;
  const busy = latest?.layerResult?.status === 'processing';
  const failed = latest?.layerResult?.status === 'failed';
  useEffect(refresh, [refresh, mode, failed]);
  const prompt = config.prompts?.[mode] ?? '';
  const promptLabel = mode === 'split' ? '拆分要求' : '修改要求';
  const selection = config.selection?.sourceId === source?.id && config.selection?.source === layerSourceKey(src) ? config.selection?.value : undefined;
  return <Frame scope={scope} item={item}>
    <header className="canvas-layer-operation__header">
      <Layers2 size={16} aria-hidden="true" />
      <span>图层操作</span>
    </header>
    <div className="canvas-layer-operation__body" data-no-drag="true" data-canvas-wheel-scroll="true"
      onPointerDown={event => event.stopPropagation()}
      onDragOver={event => { if (event.dataTransfer.types.includes('Files')) { event.preventDefault(); event.stopPropagation(); } }}
      onDrop={event => { if (event.dataTransfer.files[0]) { event.preventDefault(); event.stopPropagation(); void scope.importCanvasLayerImage(item.id, event.dataTransfer.files[0]); } }}>
      <div className="canvas-layer-operation__modes" role="group" aria-label="操作模式">
        {(['split', 'edit'] as const).map(value => (
          <button key={value} type="button" aria-pressed={value === mode}
            onClick={() => scope.patchCanvasLayerOperation(item.id, { mode: value })}>
            {value === 'split' ? '图层拆分' : '交互编辑'}
          </button>
        ))}
      </div>
      <button type="button" className="canvas-layer-operation__source" aria-label="导入图片"
        title={src ? `替换输入图片 · ${sourceName}` : '导入图片'} onClick={() => fileRef.current?.click()}>
        <span className="canvas-layer-operation__thumb">
          {src ? <img src={thumbnail} alt="" loading="lazy" decoding="async" draggable={false} /> : <ImagePlus size={15} aria-hidden="true" />}
        </span>
        <span className="canvas-layer-operation__source-copy">
          <span>{src ? '输入图片' : '导入图片'}</span>
          <span>{src ? sourceName : '也可拖入图片或连线'}</span>
        </span>
        <Upload size={14} aria-hidden="true" className="canvas-layer-operation__upload" />
      </button>
      <input type="file" hidden ref={fileRef} accept="image/*" onChange={event => {
        const file = event.currentTarget.files?.[0]; if (file) void scope.importCanvasLayerImage(item.id, file);
        event.currentTarget.value = '';
      }} />
      <div className="canvas-layer-operation__prompt">
        <div className="canvas-layer-operation__prompt-header">
          <label htmlFor={`layer-prompt-${item.id}`}>{promptLabel}</label>
          {mode === 'edit' && <button type="button" className="canvas-layer-operation__region" disabled={!src}
            data-active={Boolean(selection)} title="点选或框选用于引导修改" onClick={() => scope.openCanvasLayerSelection(item.id)}>
            <Scan size={13} aria-hidden="true" />{selection ? '已选区' : '选区'}
          </button>}
        </div>
        <textarea id={`layer-prompt-${item.id}`} data-canvas-edit-control="true" maxLength={4000} value={prompt}
          placeholder={mode === 'split' ? '留空自动拆分，或指定人物、标题等元素' : '描述要怎么修改。选区用于引导。'}
          onChange={event => scope.patchCanvasLayerOperation(item.id, { prompts: { ...config.prompts, [mode]: event.target.value } })} />
      </div>
    </div>
    <footer className="canvas-layer-operation__footer" data-no-drag="true" onPointerDown={event => event.stopPropagation()}>
      {unit !== undefined && <span className="canvas-layer-operation__catalog-status">
        最多 {offer?.maxOutputImages} 层（含底图）<br />预留 {Number(price)} 积分，按层结算
      </span>}
      {price === undefined && <div className="canvas-layer-operation__availability">
        <span role="status" className="canvas-layer-operation__catalog-status" data-warning={Boolean(error || catalog)}>
          {error || (catalog ? '尚未配置可用渠道或价格' : '正在读取可用能力和积分…')}
        </span>
        {(error || catalog) && <button type="button" className="canvas-layer-operation__retry" onClick={refresh}>刷新目录</button>}
      </div>}
      <CanvasRunAction label={busy ? '运行中' : '运行'} isWorking={busy}
        disabled={price === undefined || !src || busy || (mode === 'edit' && !prompt.trim())}
        creditLabel={creditLabel}
        onClick={() => { if (price !== undefined) scope.startCanvasLayerOperation(item.id, mode, price, catalog?.referenceUpload, unit); }} />
    </footer>
  </Frame>;
}

function ResultCard({ scope, item }: { scope: Record<string, any>; item: CanvasImageItem }) {
  const result = item.layerResult!;
  const group = result.group;
  const originalSource = getCanvasOriginalImageSource(item.item);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState('');
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<{ id: string; x: number; y: number }>();
  const viewport = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; layer: CanvasLayer; start: { x: number; y: number } } | null>(null);
  const ordered = group ? orderedLayers(group) : [];
  const frontToBack = [...ordered].reverse();
  const active = frontToBack.find(layer => layer.id === chosen) ?? frontToBack.find(layer => !layer.hidden) ?? frontToBack[0];
  const perform = async (work: () => Promise<unknown>) => {
    setSaving(true);
    try { await work(); } catch (error) { scope.showToast(String(error)); }
    finally { setSaving(false); }
  };
  const change = (update: (value: CanvasLayerGroup) => CanvasLayerGroup, title: string) =>
    void perform(() => scope.updateCanvasLayerStack(item.id, update, title));
  const amend = (id: string, patch: Partial<CanvasLayer>, label: string) => change(value =>
    ({ ...value, layers: value.layers.map(layer => layer.id === id ? { ...layer, ...patch } : layer) }), label);
  const reorder = (delta: number) => {
    if (!active) return;
    const destination = ordered[ordered.indexOf(active) + delta];
    if (!destination) return;
    setChosen(active.id);
    change(value => ({ ...value, layers: value.layers.map(layer => layer.id === active.id
      ? { ...layer, order: destination.order } : layer.id === destination.id ? { ...layer, order: active.order } : layer) }), '调整图层顺序');
  };
  const dragPosition = (event: PointerEvent) => {
    if (!group || !drag.current || !viewport.current) return;
    const { layer, start } = drag.current;
    const box = viewport.current.getBoundingClientRect();
    if (!box.width || !box.height) return;
    return { id: layer.id,
      x: Math.min(group.width - 1, Math.max(1 - layer.width, Math.round(layer.x + (event.clientX - start.x) * group.width / box.width))),
      y: Math.min(group.height - 1, Math.max(1 - layer.height, Math.round(layer.y + (event.clientY - start.y) * group.height / box.height))) };
  };
  return <Frame scope={scope} item={item} onDoubleClick={group ? () => setOpen(value => !value) : result.asset && originalSource
    ? () => scope.openSelectedImagePreview(originalSource, { fromCanvas: true }) : undefined}>
    {!group && <div className={`absolute truncate text-[11px] font-bold ${result.mode === 'split' ? 'inset-x-3 top-2' : 'left-0 -top-6 max-w-full'}`}>
      {item.item.name}
    </div>}
    {result.status !== 'success' ? <div className={`flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs ${group ? 'canvas-layer-group__preview' : ''}`}>
      <span>{result.message || (result.status === 'processing' ? '正在处理…' : '任务失败')}</span>
      {result.status === 'processing' && result.message && <button type="button" className={button} onPointerDown={event => event.stopPropagation()}
        onClick={() => scope.resumeCanvasLayerOperation(item)}>查询原请求</button>}
    </div> : group && open ? <div ref={viewport} className="canvas-layer-group__preview relative w-full overflow-hidden" style={{ touchAction: 'none' }}
      onPointerDown={event => event.stopPropagation()}
      onPointerMove={event => {
        if (drag.current) setDraft(dragPosition(event));
      }}
      onPointerUp={event => {
        const position = dragPosition(event);
        if (drag.current && position && (position.x !== drag.current.layer.x || position.y !== drag.current.layer.y)) {
          amend(position.id, { x: position.x, y: position.y }, '移动图层');
        }
        drag.current = null; setDraft(undefined);
      }} onPointerCancel={() => { drag.current = null; setDraft(undefined); }}>
      <img src={layerAssetUrl(group.base.path)} alt="底图" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
      {ordered.filter(layer => !layer.hidden).map(layer => {
        const position = draft?.id === layer.id ? draft : layer;
        return <img key={layer.id} src={layerAssetUrl(layer.path)} alt={layer.name} draggable={false} data-layer-id={layer.id}
          className={`absolute cursor-move select-none ${active?.id === layer.id ? 'outline outline-1 outline-cyan-400' : ''}`}
          style={{ left: `${position.x / group.width * 100}%`, top: `${position.y / group.height * 100}%`,
            width: `${layer.width / group.width * 100}%`, height: `${layer.height / group.height * 100}%`, opacity: layer.opacity }}
          onPointerDown={event => {
            if (event.button !== 0 || saving) return;
            event.stopPropagation(); setChosen(layer.id);
            drag.current = { id: layer.id, layer, start: { x: event.clientX, y: event.clientY } };
            event.currentTarget.setPointerCapture(event.pointerId);
          }} />;
      })}
    </div> : <CanvasStableImage data-canvas-main-media="true"
      className={`w-full select-none object-contain ${group ? 'canvas-layer-group__preview' : 'h-full rounded-xl'}`}
      src={scope.getStableCanvasImageSource?.(item) || item.item.thumbnail || originalSource}
      alt={item.item.name} loading="lazy" decoding="async" draggable={false} />}
    {group && <section className="canvas-layer-panel" aria-label="图层组工具" data-no-drag="true"
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      <div className="canvas-layer-panel__bar">
        <button type="button" className="canvas-layer-panel__toggle" aria-expanded={open} title={open ? '收起图层' : '编辑图层'} onClick={() => setOpen(value => !value)}>
          {open ? '收起图层' : '编辑图层'}<ChevronDown size={12} />
        </button>
        <div className="canvas-layer-panel__exports" role="group" aria-label="导出图层组">
          <Download size={12} aria-hidden="true" />
          <button type="button" title="导出 PNG 图层压缩包" disabled={saving} onClick={() => void perform(() => scope.exportCanvasLayerStack(group, 'zip'))}>PNG 组</button>
          <button type="button" title="导出分层 PSD" disabled={saving} onClick={() => void perform(() => scope.exportCanvasLayerStack(group, 'psd'))}>PSD</button>
        </div>
      </div>
      {open && <>
        <ul className="canvas-layer-panel__list" aria-label="图层列表" data-canvas-wheel-scroll="true">
          {frontToBack.map(layer => <li key={layer.id} data-selected={active?.id === layer.id} data-hidden={Boolean(layer.hidden)}>
            <button type="button" className="canvas-layer-panel__pick" aria-pressed={active?.id === layer.id} onClick={() => setChosen(layer.id)} title={layer.name}>
              <img src={layerAssetUrl(layer.path)} alt="" draggable={false} loading="lazy" /><span>{layer.name}</span>
            </button>
            <button type="button" className="canvas-layer-panel__icon" title={layer.hidden ? '显示图层' : '隐藏图层'}
              aria-label={`${layer.hidden ? '显示' : '隐藏'}${layer.name}`} disabled={saving}
              onClick={() => {
                if (active?.id === layer.id) setChosen(layer.id);
                amend(layer.id, { hidden: !layer.hidden }, '切换图层可见性');
              }}>
              {layer.hidden ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>
          </li>)}
          <li className="canvas-layer-panel__base"><img src={layerAssetUrl(group.base.path)} alt="" draggable={false} loading="lazy" />底图
            <span title="底图固定" aria-label="底图固定"><LockKeyhole size={12} /></span>
          </li>
        </ul>
        <div className="canvas-layer-panel__bar canvas-layer-panel__actions">
          <div role="group" aria-label="图层顺序和撤销">
            <button type="button" className="canvas-layer-panel__icon" title="上移图层" aria-label="上移图层" disabled={saving || active === frontToBack[0]} onClick={() => reorder(1)}><ArrowUp size={14} /></button>
            <button type="button" className="canvas-layer-panel__icon" title="下移图层" aria-label="下移图层" disabled={saving || active === ordered[0]} onClick={() => reorder(-1)}><ArrowDown size={14} /></button>
            <button type="button" className="canvas-layer-panel__icon" title="撤销" aria-label="撤销" disabled={saving} onClick={() => scope.undoLastCanvasChange()}><Undo2 size={14} /></button>
          </div>
          <div role="group" aria-label="使用所选图层">
            <button type="button" disabled={!active || saving} onClick={() => active && scope.referenceCanvasLayer(item.id, active.id, false)}>引用此层</button>
            <button type="button" className="canvas-layer-panel__edit" disabled={!active || saving} onClick={() => active && scope.referenceCanvasLayer(item.id, active.id, true)}>编辑此层</button>
          </div>
        </div>
      </>}
      {result.imageBilling && result.chargedCredits !== undefined && <div className="canvas-layer-panel__receipt">
        <span>{result.imageBilling.imageCount} 层 × {Number(result.imageBilling.creditsPerOutputImage)} 积分</span>
        <strong>实扣 {Number(result.chargedCredits)} 积分</strong>
      </div>}
    </section>}
    {result.asset && result.sourceLayer && <button type="button" className={button + ' absolute top-full'} disabled={saving || !scope.canReplaceCanvasLayerResult(item)}
      title="仅允许相同像素尺寸、保留透明通道的结果替换仍匹配的原图层"
      onPointerDown={event => event.stopPropagation()} onClick={() => void perform(() => scope.applyCanvasLayerReplacement(item))}>替换原图层</button>}
  </Frame>;
}
