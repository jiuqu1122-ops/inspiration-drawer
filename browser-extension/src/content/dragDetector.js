const resolveDraggedImage = (target) => {
  const element = target instanceof Element ? target.closest('img') : null;
  if (!(element instanceof HTMLImageElement)) return null;
  const imageUrl = String(element.currentSrc || element.src || '').trim();
  if (!/^https?:\/\//i.test(imageUrl)) return null;
  return {
    imageUrl,
    pageUrl: location.href,
    pageTitle: document.title,
    imageTitle: element.title || element.alt || '',
    alt: element.alt || '',
    width: element.naturalWidth || element.width || 0,
    height: element.naturalHeight || element.height || 0,
  };
};

document.addEventListener('dragstart', (event) => {
  const image = resolveDraggedImage(event.target);
  if (!image) return;
  chrome.runtime.sendMessage({ type: 'web_image_drag_started', payload: image }).catch(() => {});
}, true);
