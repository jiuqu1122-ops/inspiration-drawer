export const ANALYSIS_HOVER_DELAY_MS = 500;

/** One timer per continuous visit, including browsers sending both pointer/mouse enter. */
export const createDelayedHover = (onChange: (visible: boolean) => void, delay = ANALYSIS_HOVER_DELAY_MS) => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inside = false;
  let generation = 0;
  const cancel = () => {
    generation += 1;
    inside = false;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    enter() {
      if (inside) return;
      inside = true;
      const current = ++generation;
      timer = setTimeout(() => {
        timer = null;
        if (inside && current === generation) onChange(true);
      }, delay);
    },
    leave() {
      cancel();
      onChange(false);
    },
    // Unmount cleanup cancels work without setting state on a removed component.
    cancel,
  };
};
