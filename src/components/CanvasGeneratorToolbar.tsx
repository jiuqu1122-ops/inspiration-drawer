import { useLayoutEffect, useRef, type ReactNode } from 'react';

type Props = {
  adaptive: boolean;
  className: string;
  children: ReactNode;
  onWidthChange: (width: number) => boolean | void;
};

/** Measure unscaled control widths, so canvas zoom never changes the layout. */
export function CanvasGeneratorToolbar({ adaptive, className, children, onWidthChange }: Props) {
  const outerRef = useRef<HTMLDivElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const reportRef = useRef(onWidthChange);
  useLayoutEffect(() => { reportRef.current = onWidthChange; });
  useLayoutEffect(() => {
    if (!adaptive || !outerRef.current || !rowRef.current) return;
    const outer = outerRef.current;
    const row = rowRef.current;
    let lastWidth = 0;
    let deferred = false;
    let frame: number | null = null;
    const measure = () => {
      const controls = Array.from(row.children).filter((child): child is HTMLElement => child instanceof HTMLElement && getComputedStyle(child).display !== 'none');
      if (!controls.length) return;
      const padding = getComputedStyle(outer);
      const gap = parseFloat(getComputedStyle(row).columnGap) || 0;
      // Include the node surface's two one-pixel borders, outside this footer.
      const required = controls.reduce((total, control) => total + control.offsetWidth, 0)
        + Math.max(0, controls.length - 1) * gap
        + (parseFloat(padding.paddingLeft) || 0) + (parseFloat(padding.paddingRight) || 0) + 2;
      const width = Math.ceil(required / 8) * 8;
      if (width === lastWidth) return;
      deferred = reportRef.current(width) === false;
      if (!deferred) lastWidth = width;
    };
    const schedule = () => {
      if (frame !== null) return;
      frame = requestAnimationFrame(() => { frame = null; measure(); });
    };
    const finishPointerInteraction = () => { if (deferred) schedule(); };
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    const observed = new Set<Element>();
    const observeControls = () => {
      for (const child of observed) if (!row.contains(child)) { resize?.unobserve(child); observed.delete(child); }
      for (const child of row.children) if (!observed.has(child)) { resize?.observe(child); observed.add(child); }
    };
    observeControls();
    const mutation = new MutationObserver(() => { observeControls(); schedule(); });
    mutation.observe(row, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('pointerup', finishPointerInteraction);
    window.addEventListener('pointercancel', finishPointerInteraction);
    measure();
    return () => {
      if (frame !== null) cancelAnimationFrame(frame);
      resize?.disconnect(); mutation.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pointerup', finishPointerInteraction);
      window.removeEventListener('pointercancel', finishPointerInteraction);
    };
  }, [adaptive]);
  return <div ref={outerRef} data-canvas-edit-control="true" className={className}>
    {adaptive ? <div ref={rowRef} data-canvas-image-toolbar="true" className="flex min-w-full w-max items-center gap-2 [&>*]:shrink-0 [&>[data-canvas-run-control]]:min-w-[148px]">{children}</div> : children}
  </div>;
}
