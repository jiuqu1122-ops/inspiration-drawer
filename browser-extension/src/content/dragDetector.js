let activeDragId = '';

const createDragId = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `drag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
};

document.addEventListener('dragstart', (event) => {
  const resolver = globalThis.InspirationImageResolver;
  const image = resolver?.resolveImageFromElement(event.target);
  if (!image) return;
  const dragId = createDragId();
  activeDragId = dragId;
  void resolver.prepareImageForTransfer(image).then(prepared => {
    if (!prepared || activeDragId !== dragId) return;
    return chrome.runtime.sendMessage({
      type: 'web_image_drag_started',
      payload: { dragId, image: prepared },
    });
  }).catch(() => {});
}, true);

document.addEventListener('dragend', () => {
  const dragId = activeDragId;
  activeDragId = '';
  if (!dragId) return;
  chrome.runtime.sendMessage({ type: 'web_image_drag_ended', payload: { dragId } }).catch(() => {});
}, true);
