/* Read-only image viewer. It never sends a model/generation request. */
(() => {
  const overlay = document.getElementById('image-preview');
  const image = document.getElementById('image-preview-image');
  const close = document.getElementById('image-preview-close');
  const status = document.getElementById('image-preview-status');
  const messages = document.getElementById('messages');
  let load, conversation = '', sequence = 0, trigger;
  const raster = value => /^data:image\/(?:jpeg|png|webp);base64,/i.test(value || '');
  const hide = () => {
    sequence++;
    overlay.hidden = true;
    image.removeAttribute('src');
    document.body.classList.remove('image-preview-open');
    for (const child of document.body.children) if (child !== overlay) child.inert = false;
    const replacement = trigger?.isConnected ? trigger : [...messages.querySelectorAll('img[data-preview-src]')].find(item => item.dataset.messageId === trigger?.dataset.messageId && item.dataset.imageIndex === trigger?.dataset.imageIndex);
    (replacement?.closest('button.message-image-button') || replacement || document.getElementById('input')).focus();
  };
  const show = async target => {
    if (!raster(target.dataset.previewSrc)) return;
    const current = ++sequence; trigger = target;
    image.src = target.dataset.previewSrc;
    overlay.hidden = false; status.textContent = '正在读取清晰预览…';
    document.body.classList.add('image-preview-open');
    for (const child of document.body.children) if (child !== overlay) child.inert = true;
    close.focus();
    try {
      if (!load) throw new Error('预览暂不可用');
      const source = await load(target.dataset.messageId, Number(target.dataset.imageIndex));
      if (current !== sequence) return;
      if (!raster(source)) throw new Error('预览格式无效');
      const decoded = new Image();
      decoded.onload = () => { if (current === sequence) { image.src = source; status.textContent = '清晰预览 · Esc 关闭'; } };
      decoded.onerror = () => { if (current === sequence) status.textContent = '清晰预览载入失败，当前显示缩略图'; };
      decoded.src = source;
    } catch (error) {
      if (current === sequence) status.textContent = '暂时无法读取大图，当前显示缩略图';
    }
  };
  messages.addEventListener('click', event => { const target = event.target.closest('img[data-preview-src]') || event.target.closest('button.message-image-button')?.querySelector('img[data-preview-src]'); if (target) void show(target); });
  messages.addEventListener('keydown', event => {
    const target = event.target.closest('img[data-preview-src]');
    if (target && !target.closest('button.message-image-button') && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); void show(target); }
  });
  close.addEventListener('click', hide);
  overlay.addEventListener('click', event => { if (event.target === overlay) hide(); });
  document.addEventListener('keydown', event => {
    if (overlay.hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); hide(); }
    if (event.key === 'Tab') { event.preventDefault(); close.focus(); }
  });
  window.rhinoImagePreview = {
    configure(options) { load = options.load; },
    sync(value) { if (conversation !== value && !overlay.hidden) hide(); conversation = value; },
  };
})();
