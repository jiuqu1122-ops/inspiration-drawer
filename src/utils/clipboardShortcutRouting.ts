/** Text copy always wins over application-level element shortcuts. */
const TEXT_ENTRY_SELECTOR = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [data-canvas-edit-control="true"]';
const NON_CANVAS_COPY_SELECTOR = '[data-chat-view="true"], [data-drawer-dialog="true"], [role="dialog"], [data-canvas-agent-sidebar="true"]';

const asElement = (target: EventTarget | null): Element | null => (
  typeof Element !== 'undefined' && target instanceof Element ? target : null
);

export const isTextCopyTarget = (target: EventTarget | null) => Boolean(
  asElement(target)?.closest(TEXT_ENTRY_SELECTOR),
);

export const hasDocumentTextSelection = () => {
  const selection = typeof window === 'undefined' ? null : window.getSelection?.();
  // Whitespace is copyable too. Do not trim or clear the user's selection.
  return Boolean(selection && !selection.isCollapsed && selection.rangeCount > 0 && selection.toString().length > 0);
};

export const shouldPreserveNativeTextCopy = (event: Pick<KeyboardEvent, 'target' | 'defaultPrevented' | 'isComposing'>) => (
  event.defaultPrevented
  || event.isComposing
  || isTextCopyTarget(event.target)
  || isTextCopyTarget(typeof document === 'undefined' ? null : document.activeElement)
  || hasDocumentTextSelection()
);

export const isCanvasClipboardTarget = (target: EventTarget | null, surface: HTMLElement | null) => {
  const element = asElement(target);
  return Boolean(surface && element && surface.contains(element)
    && !element.closest(NON_CANVAS_COPY_SELECTOR));
};
