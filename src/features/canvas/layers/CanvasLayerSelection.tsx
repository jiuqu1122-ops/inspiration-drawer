import { useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import type { LayerSelection } from './canvasLayerTypes';

type Point = { x: number; y: number };
export function imagePoint(client: Point, box: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  return { x: clamp((client.x - box.left) / box.width), y: clamp((client.y - box.top) / box.height) };
}
const rect = (start: Point, end: Point): LayerSelection => ({
  kind: 'rect', x: Math.min(start.x, end.x), y: Math.min(start.y, end.y),
  width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
});

export type LayerPreviewSelection = { value?: LayerSelection; onChange: (value?: LayerSelection) => void };

export function CanvasLayerSelection({ src, style, selection, onPan }: {
  src: string; style: CSSProperties; selection: LayerPreviewSelection; onPan: (e: PointerEvent<HTMLDivElement>) => void;
}) {
  const [tool, setTool] = useState<'point' | 'rect' | 'pan'>('rect');
  const [draft, setDraft] = useState<LayerSelection>();
  const start = useRef<{ id: number; point: Point } | null>(null);
  const image = useRef<HTMLImageElement>(null);
  const point = (event: PointerEvent<HTMLDivElement>) => {
    const box = image.current?.getBoundingClientRect();
    return box?.width && box.height ? imagePoint({ x: event.clientX, y: event.clientY }, box) : null;
  };
  const active = draft ?? selection.value;
  return <>
    <div className="absolute left-1/2 top-3 z-[10003] flex -translate-x-1/2 items-center gap-2 rounded-lg bg-stone-900/90 p-2 text-xs text-white"
      onPointerDown={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}>
      {([['rect', '框选'], ['point', '点选'], ['pan', '平移']] as const).map(([key, label]) =>
        <button key={key} type="button" aria-pressed={tool === key} className={tool === key ? 'text-cyan-300' : ''} onClick={() => setTool(key)}>{label}</button>)}
      <button type="button" onClick={() => selection.onChange(undefined)}>清除</button>
      <span className="text-stone-300">滚轮缩放 · 选区用于引导</span>
    </div>
    <div className="relative flex max-h-full max-w-full items-center justify-center select-none" style={{ ...style, touchAction: 'none' }}
      onMouseDown={event => event.stopPropagation()}
      onPointerDown={event => {
        event.stopPropagation();
        if (event.button !== 0) return;
        if (tool === 'pan') { onPan(event); return; }
        const p = point(event);
        if (!p) return;
        if (tool === 'point') { selection.onChange({ kind: 'point', ...p }); return; }
        start.current = { id: event.pointerId, point: p };
        event.currentTarget.setPointerCapture(event.pointerId);
        setDraft(rect(p, p));
      }}
      onPointerMove={event => {
        const p = point(event);
        if (p && start.current?.id === event.pointerId) setDraft(rect(start.current.point, p));
      }}
      onPointerUp={event => {
        const p = point(event);
        if (!p || !start.current || start.current.id !== event.pointerId) return;
        const value = rect(start.current.point, p);
        if (value.kind === 'rect' && value.width > 0.001 && value.height > 0.001) selection.onChange(value);
        start.current = null;
        setDraft(undefined);
      }}
      onPointerCancel={() => { start.current = null; setDraft(undefined); }}>
      <img ref={image} src={src} alt="图片选区预览" draggable={false} className="block max-h-[80vh] max-w-full w-auto h-auto select-none" />
      {active && <span aria-hidden className="pointer-events-none absolute border-2 border-cyan-400 bg-cyan-400/20"
        style={active.kind === 'point' ? { left: `${active.x * 100}%`, top: `${active.y * 100}%`, width: 12, height: 12, borderRadius: 12, transform: 'translate(-50%, -50%)' }
          : { left: `${active.x * 100}%`, top: `${active.y * 100}%`, width: `${active.width * 100}%`, height: `${active.height * 100}%` }} />}
    </div>
  </>;
}
