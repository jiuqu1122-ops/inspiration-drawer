import { Eye, EyeOff, ImagePlus, Layers2, MoveDown, MoveUp, Scan, Upload } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
import { CanvasRunAction } from '../../../components/CanvasAiRunButton';
import type { CanvasImageItem } from '../../canvasModel';
import { getCanvasItemThumbnailSource, getCanvasOriginalImageSource } from '../../../utils/canvasItemSelectors';
import { CanvasStableImage } from '../components/CanvasStableImage';
import { getLayerCatalog } from './canvasLayerApi';
import { canvasLayerInputSource, layerSourceKey } from './canvasLayerActions';
import { layerAssetUrl, orderedLayers } from './canvasLayerAssets';
import type { CanvasLayer, CanvasLayerGroup, LayerCatalog } from './canvasLayerTypes';
import './CanvasLayerNode.css';

const button = 'rounded-md bg-stone-200/65 px-2 py-1 text-xs font-semibold hover:bg-cyan-100 disabled:opacity-40 dark:bg-stone-700/80 dark:hover:bg-stone-600';
const field = 'w-full rounded-md border border-stone-300 bg-transparent px-2 py-1.5 text-xs dark:border-stone-600';

function Frame({ scope, item, children, onDoubleClick }: { scope: Record<string, any>; item: CanvasImageItem; children: ReactNode; onDoubleClick?: () => void }) {
  return <div data-canvas-item-id={item.id} data-canvas-selected-state={scope.canvasSelectedIdsSet?.has(item.id) ? 'true' : undefined}
    className={`group/canvas-item absolute isolate ${item.layerOperation ? 'canvas-layer-operation' : 'rounded-xl bg-white/95 shadow-lg dark:bg-stone-900/95'}`}
    style={{ left: item.x, top: item.y, width: item.width, height: item.height, contain: item.layerResult ? 'layout style' : undefined,
      zIndex: scope.canvasSelectedIdsSet?.has(item.id) ? 2 : 0 }}
    onPointerDown={event => scope.startCanvasItemDrag(event, item.id)}
    onPointerEnter={() => { scope.canvasHoveredItemIdRef.current = item.id; }}
    onPointerLeave={() => { if (scope.canvasHoveredItemIdRef.current === item.id) scope.canvasHoveredItemIdRef.current = ''; }}
    onContextMenu={event => {
      scope.updateCanvasSelection([item.id]);
      scope.openCanvasContextMenu(event, 'item', { itemId: item.id });
    }}
    onDoubleClick={event => { if (onDoubleClick) { event.stopPropagation(); onDoubleClick(); } }}>
    {children}
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
  const price = catalog?.[mode]?.[0]?.creditsPerRequest;
  const creditLabel = price === undefined ? undefined
    : `${Number(price).toLocaleString('zh-CN', { maximumFractionDigits: 6 })}积分`;
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
      {price === undefined && <div className="canvas-layer-operation__availability">
        <span role="status" className="canvas-layer-operation__catalog-status" data-warning={Boolean(error || catalog)}>
          {error || (catalog ? '尚未配置可用渠道或价格' : '正在读取可用能力和积分…')}
        </span>
        {(error || catalog) && <button type="button" className="canvas-layer-operation__retry" onClick={refresh}>刷新目录</button>}
      </div>}
      <CanvasRunAction label={busy ? '运行中' : '运行'} isWorking={busy}
        disabled={price === undefined || !src || busy || (mode === 'edit' && !prompt.trim())}
        creditLabel={creditLabel}
        onClick={() => { if (price !== undefined) scope.startCanvasLayerOperation(item.id, mode, price, catalog?.referenceUpload); }} />
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
  const active = ordered.find(layer => layer.id === chosen);
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
    const index = ordered.findIndex(layer => layer.id === chosen);
    if (index < 0 || !ordered[index + delta]) return;
    const destination = ordered[index + delta];
    change(value => ({ ...value, layers: value.layers.map(layer => layer.id === chosen
      ? { ...layer, order: destination.order } : layer.id === destination.id ? { ...layer, order: ordered[index].order } : layer) }), '调整图层顺序');
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
    <div className="absolute -top-6 left-0 truncate text-[11px] font-bold">{item.item.name}{group ? ` · ${group.layers.length} 层` : ''}</div>
    {result.status !== 'success' ? <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-xs">
      <span>{result.message || (result.status === 'processing' ? '正在处理…' : '任务失败')}</span>
      {result.status === 'processing' && result.message && <button type="button" className={button} onPointerDown={event => event.stopPropagation()}
        onClick={() => scope.resumeCanvasLayerOperation(item)}>查询原请求</button>}
    </div> : group && open ? <div ref={viewport} className="relative h-full w-full overflow-hidden rounded-xl" style={{ touchAction: 'none' }}
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
          className={`absolute cursor-move select-none ${chosen === layer.id ? 'outline outline-1 outline-cyan-400' : ''}`}
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
      className="h-full w-full select-none rounded-xl object-contain"
      src={scope.getStableCanvasImageSource?.(item) || item.item.thumbnail || originalSource}
      alt={item.item.name} loading="lazy" decoding="async" draggable={false} />}
    {group && <div className="absolute top-full z-10 flex min-w-full flex-wrap items-center gap-1 rounded-md bg-white/95 p-1 shadow dark:bg-stone-900/95"
      onPointerDown={event => event.stopPropagation()} onDoubleClick={event => event.stopPropagation()}>
      <button type="button" className={button} onClick={() => setOpen(value => !value)}>{open ? '收起图层' : '编辑图层'}</button>
      {open && <button type="button" className={button} disabled={saving} onClick={() => scope.undoLastCanvasChange()}>撤销</button>}
      <button type="button" className={button} disabled={saving} onClick={() => void perform(() => scope.exportCanvasLayerStack(group, 'zip'))}>PNG 组</button>
      <button type="button" className={button} disabled={saving} onClick={() => void perform(() => scope.exportCanvasLayerStack(group, 'psd'))}>PSD</button>
      {open && <div className="flex w-full flex-wrap items-center gap-1">
        <select className={field} aria-label="选择图层" value={chosen} onChange={event => setChosen(event.target.value)}>
          <option value="">选择图层</option>{[...ordered].reverse().map(layer => <option key={layer.id} value={layer.id}>{layer.name}{layer.hidden ? '（隐藏）' : ''}</option>)}
        </select>
        <button type="button" className={button} disabled={!active || saving} aria-label="切换图层可见性" onClick={() => active && amend(active.id, { hidden: !active.hidden }, '切换图层可见性')}>{active?.hidden ? <EyeOff size={13} /> : <Eye size={13} />}</button>
        <button type="button" className={button} disabled={!active || saving} aria-label="上移图层" onClick={() => reorder(1)}><MoveUp size={13} /></button>
        <button type="button" className={button} disabled={!active || saving} aria-label="下移图层" onClick={() => reorder(-1)}><MoveDown size={13} /></button>
        <button type="button" className={button} disabled={!active || saving} onClick={() => scope.referenceCanvasLayer(item.id, chosen, false)}>引用此层</button>
        <button type="button" className={button} disabled={!active || saving} onClick={() => scope.referenceCanvasLayer(item.id, chosen, true)}>编辑此层</button>
      </div>}
    </div>}
    {result.asset && result.sourceLayer && <button type="button" className={button + ' absolute top-full'} disabled={saving || !scope.canReplaceCanvasLayerResult(item)}
      title="仅允许相同像素尺寸、保留透明通道的结果替换仍匹配的原图层"
      onPointerDown={event => event.stopPropagation()} onClick={() => void perform(() => scope.applyCanvasLayerReplacement(item))}>替换原图层</button>}
  </Frame>;
}
