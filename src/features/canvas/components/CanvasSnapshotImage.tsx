import { useLayoutEffect, useRef, useState } from 'react';
import type { SnapshotBitmap, SnapshotBitmapCache } from '../snapshot/snapshotBitmapCache';
import { CanvasStableImage } from './CanvasStableImage';

/** Keep one bounded bitmap on the selected/hovered node, even when the resting
 * view needs an original. The existing surface zoom attribute switches pixels
 * synchronously in CSS: no wheel-time React state, decoder, source swap or paint.
 * Original pixels and the interactive root remain mounted for inspection/drag. */
export function CanvasSnapshotImage({ bitmap, cache, source, maxEdge = 512, originalSource, showOriginalAtRest,
  style, name, onDragStart }: {
  bitmap: SnapshotBitmap; cache?: SnapshotBitmapCache; source?: string; maxEdge?: number;
  originalSource: string; showOriginalAtRest: boolean; style: React.CSSProperties; name: string;
  onDragStart: React.DragEventHandler<HTMLElement>;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [painted, setPainted] = useState<SnapshotBitmap | null>(null);
  const [failed, setFailed] = useState<SnapshotBitmap | null>(null);
  useLayoutEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const lease = cache && source ? cache.pin(source, maxEdge) : null;
    if (cache && !lease) { setFailed(bitmap); return; }
    const image = lease?.bitmap || bitmap;
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Snapshot surface unavailable');
      if (canvas.width !== image.width) canvas.width = image.width;
      if (canvas.height !== image.height) canvas.height = image.height;
      ctx.clearRect(0, 0, image.width, image.height);
      ctx.drawImage(image.drawable, 0, 0);
      setPainted(bitmap); setFailed(null);
    } catch { setFailed(bitmap); }
    finally { lease?.release(); }
  }, [bitmap, cache, source, maxEdge]);

  const original = <CanvasStableImage data-canvas-main-media="true" src={originalSource}
    alt={name} loading="lazy" decoding="async" className="h-full w-full select-none object-contain"
    style={style} draggable={false} onDragStart={onDragStart} />;
  if (failed === bitmap) return original;
  return <div data-canvas-snapshot-media="true" data-canvas-snapshot-ready={painted === bitmap ? 'true' : undefined}
    data-canvas-original-at-rest={showOriginalAtRest ? 'true' : undefined} className="relative h-full w-full">
    <canvas ref={ref} width={1} height={1} data-canvas-main-media="true" data-canvas-snapshot-preview="true"
      role="img" aria-label={name} className="h-full w-full select-none object-contain" style={style}
      draggable={false} onDragStart={onDragStart} />
    {showOriginalAtRest && <div data-canvas-snapshot-original="true" className="absolute inset-0">{original}</div>}
  </div>;
}
