import { useLayoutEffect, type RefObject } from 'react';

/** Grow in place without remounting the input or losing the caret/IME selection. */
export const resizeChatInput = (input: HTMLTextAreaElement) => {
  const previousScrollTop = input.scrollTop;
  input.style.height = 'auto';
  const style = getComputedStyle(input);
  const min = parseFloat(style.minHeight) || 46;
  const max = parseFloat(style.maxHeight) || 320;
  const border = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  const desired = input.scrollHeight + border;
  const height = Math.min(max, Math.max(min, desired));
  input.style.height = `${height}px`;
  // max-height may be a CSS min()/viewport expression; use the actual box
  // after layout so short windows still get a scrollbar rather than clipping.
  const actualHeight = input.clientHeight > 0 ? input.clientHeight + border : height;
  input.style.overflowY = desired > actualHeight + 1 ? 'auto' : 'hidden';
  if (desired > actualHeight) input.scrollTop = previousScrollTop;
};

export const useAutosizeChatInput = (ref: RefObject<HTMLTextAreaElement | null>, value: string) => {
  useLayoutEffect(() => { if (ref.current) resizeChatInput(ref.current); }, [ref, value]);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    let frame = 0;
    let width = input.getBoundingClientRect().width;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => resizeChatInput(input));
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const nextWidth = input.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth; schedule(); }
    });
    observer?.observe(input);
    window.addEventListener('resize', schedule);
    return () => { observer?.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); };
  }, [ref]);
};
