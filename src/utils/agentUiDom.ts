let agentUiElementSequence = 0;

export const isAgentUiElementVisible = (element: HTMLElement) => {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== 'none'
    && style.visibility !== 'hidden'
    && Number(style.opacity || 1) > 0
    && rect.width > 1
    && rect.height > 1
    && !element.closest('[aria-hidden="true"]');
};

export const getVisibleAgentUiSnapshot = () => Array.from(document.querySelectorAll<HTMLElement>(
  'button, input, textarea, select, a[href], [role="button"], [contenteditable="true"]',
)).filter(element => {
  return isAgentUiElementVisible(element);
}).slice(0, 240).map(element => {
  if (!element.dataset.agentUiId) {
    agentUiElementSequence += 1;
    element.dataset.agentUiId = `ui-${agentUiElementSequence}`;
  }
  const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement
    ? element
    : null;
  const select = element instanceof HTMLSelectElement ? element : null;
  const text = String(
    element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.textContent
      || input?.placeholder
      || element.getAttribute('name')
      || '',
  ).replace(/\s+/g, ' ').trim().slice(0, 120);
  return {
    elementId: element.dataset.agentUiId,
    tag: element.tagName.toLowerCase(),
    type: input?.type || element.getAttribute('role') || undefined,
    text,
    value: input?.type === 'password'
      ? '[redacted]'
      : String(input?.value ?? select?.value ?? '').slice(0, 160),
    disabled: 'disabled' in element ? Boolean((element as HTMLButtonElement).disabled) : false,
  };
});

export const setAgentUiElementValue = (element: HTMLElement, value: string) => {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    const prototype = element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) setter.call(element, value);
    else element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (element instanceof HTMLSelectElement) {
    element.value = value;
    element.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (element.isContentEditable) {
    element.textContent = value;
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
    return;
  }
  throw new Error('目标控件不支持输入');
};
