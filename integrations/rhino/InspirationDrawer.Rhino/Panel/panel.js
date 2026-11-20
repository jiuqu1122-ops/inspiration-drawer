/* Native Rhino client. All inference and existing tools stay in the desktop Chat. */
const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
const documentId = Number(new URLSearchParams(location.search).get('documentId'));
history.replaceState(null, '', location.pathname + location.search);
const byId = id => document.getElementById(id);
let state = {}, connected = false, submitting = false, lastMessages = '', uncertain, lastParts = '', lastPartsAt = 0, partsBusy = false;
let deleteTarget = '', deletingConversation = '';
let pendingConversation;
const pendingSettings = new Map();
const settingFields = { model:'model', 'image-model':'imageModel', 'image-resolution':'imageResolution', 'image-aspect-ratio':'imageAspectRatio', 'image-quality':'imageQuality' };
const labels = { rhino_get_context:'\u8bfb\u53d6 Rhino \u4e0a\u4e0b\u6587',rhino_read_modeling_skill_resource:'\u8bfb\u53d6\u5185\u7f6e\u5efa\u6a21 Skill \u8d44\u6599',rhino_review_viewport:'\u5bf9\u7167 Rhino \u89c6\u53e3\u4e0e\u53c2\u8003\u56fe',rhino_list_objects:'\u67e5\u8be2 Rhino \u5bf9\u8c61',rhino_list_layers:'\u67e5\u8be2 Rhino \u56fe\u5c42',rhino_list_parts:'\u8bfb\u53d6\u5bf9\u8c61\u5206\u4ef6\u4e0e\u6750\u8d28',generate_image:'\u751f\u6210\u56fe\u7247',edit_image:'\u7f16\u8f91\u56fe\u7247',get_canvas_selection:'\u8bfb\u53d6\u753b\u5e03',generate_image_variants:'\u751f\u6210\u65b9\u6848' };
const statuses = { completed:'\u5df2\u5b8c\u6210',running:'\u6267\u884c\u4e2d',pending:'\u7b49\u5f85\u6267\u884c','awaiting-approval':'\u7b49\u5f85\u786e\u8ba4',error:'\u5931\u8d25',failed:'\u5931\u8d25',cancelled:'\u5df2\u505c\u6b62',declined:'\u5df2\u62d2\u7edd',accepted:'\u5df2\u63a5\u6536' };
function notice(text) { byId('notice').textContent = text || ''; byId('notice').hidden = !text; }
async function request(path, body) {
  const response = await fetch(path, { method:body ? 'POST':'GET',headers:{ Authorization:`Bearer ${token}`,...(body ? {'Content-Type':'application/json'}:{}) },body:body ? JSON.stringify(body):undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(25_000) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `连接失败 (${response.status})`);
  return result;
}
function choices(id, options, value) {
  const select = byId(id);
  // Focus protects an open native dropdown, not its enabled state. Previously a
  // focused selector could stay disabled or empty until New Chat blurred it.
  select.disabled = !connected || state.busy || submitting || Boolean(pendingConversation) || options.length === 0;
  select.title = state.busy ? '当前任务执行中，完成或停止后可切换模型' : '';
  const focused = document.activeElement === select;
  const signature = JSON.stringify(options);
  if (select.dataset.options !== signature && (!focused || !select.children.length || !select.dataset.options)) {
    select.replaceChildren(...options.map(item => {
      const option = document.createElement('option'); option.value = item.value; option.textContent = item.label || item.value; return option;
    }));
    select.dataset.options = signature;
  }
  if (!focused) select.value = pendingSettings.get(id)?.value ?? value ?? '';
  window.rhinoPickers?.sync(select);
}
function reconcileSettings(commands) {
  for (const [kind, pending] of pendingSettings) {
    if (pending.conversationId !== (state.conversationId || '') && kind === 'model') { pendingSettings.delete(kind); continue; }
    const ack = commands.find(item => item.id === pending.id);
    if (state[settingFields[kind]] === pending.value || ack?.status === 'failed') pendingSettings.delete(kind);
    else if (Date.now() - pending.at > 20_000) { pendingSettings.delete(kind); notice('模型设置未同步，请检查连接后重试。'); }
  }
}
function reconcileConversation(commands) {
  if (!pendingConversation) return;
  const receipt = commands.find(item => item.id === pendingConversation.id);
  if (receipt?.status === 'failed') { pendingConversation = undefined; return; }
  const id = state.conversationId || '';
  const published = id && (state.conversations || []).some(item => item.id === id);
  const matches = pendingConversation.kind === 'select'
    ? id === pendingConversation.targetId : id !== pendingConversation.previousId;
  // Queue acceptance and even completion can precede the next desktop state
  // snapshot. Keep the draft and wait for the actual new ID before enabling send.
  if (receipt?.status === 'completed' && published && matches) pendingConversation = undefined;
}
function updateButtons() {
  const synchronizing = Boolean(pendingConversation);
  byId('send').disabled = !connected || state.busy || submitting || synchronizing || preparingImages || !byId('input').value.trim();
  byId('attach-local-image').disabled = !connected || state.busy || submitting || preparingImages;
  byId('new').disabled = !connected || state.busy || submitting || synchronizing || Boolean(deletingConversation);
  byId('delete-conversation').disabled = !connected || state.busy || submitting || synchronizing || Boolean(deletingConversation) || !state.conversationId
    || !(state.conversations || []).some(item => item.id === state.conversationId);
  if (deleteTarget && (!connected || state.busy || deleteTarget !== state.conversationId)) cancelDelete();
  byId('stop').hidden = !state.stoppable;
  for (const [id, key] of [['model','modelOptions'], ['conversation','conversations'], ['image-model','imageModelOptions'], ['image-resolution','imageResolutionOptions'], ['image-aspect-ratio','imageAspectRatioOptions'], ['image-quality','imageQualityOptions']]) {
    byId(id).disabled = !connected || state.busy || submitting || synchronizing || !(state[key] || []).length;
  }
  const mask = byId('mask');
  const imageOptions = state.imageModelOptions || [];
  const autoImageModel = !state.imageModel || state.imageModel === '__auto__';
  const maskSupported = imageOptions.some(item => item.value === state.imageModel && item.supportsMask === true)
    || (autoImageModel && imageOptions.some(item => item.supportsMask === true));
  mask.disabled = !connected || state.busy || submitting || !maskSupported;
  mask.title = maskSupported ? '生成视口图时同时导出当前选择或指定图层的对象遮罩' : '当前服务端未声明所选模型支持遮罩编辑';
  byId('viewport').checked = mask.checked ? true : byId('viewport').checked;
  byId('viewport').disabled = mask.checked || !connected || state.busy || submitting;
  byId('mask-layer').disabled = !mask.checked || !connected || state.busy || submitting;
  const maskLayerLabel = byId('mask-layer').selectedOptions[0]?.textContent || '当前选择';
  byId('beta-note').textContent = mask.checked
    ? `对象遮罩已开启 · 来源：${maskLayerLabel} · 遮罩语义由模型线路决定`
    : '支持文字建模与参考图建模 · 图片和对象遮罩均可选';
  byId('reference-settings-toggle').disabled = !connected || state.busy || submitting;
  byId('image-settings-toggle').disabled = !connected || state.busy || submitting;
  window.rhinoPickers?.syncAll();
}
function renderParts(result) {
  const parts = result.parts || [];
  const signature = JSON.stringify(result);
  if (signature === lastParts) return;
  lastParts = signature;
  const truncated = result.truncated || result.selectionTruncated;
  byId('parts-count').textContent = `${parts.length}${truncated ? '+' : ''}`;
  byId('parts-note').textContent = `${truncated ? '分件清单已截断 · ' : ''}真实图层与材质数据 · 分件清单不含区域映射`;
  const layerSelect = byId('mask-layer');
  const previousLayer = state.maskLayer || layerSelect.value || 'selection';
  const visibleLayers = (result.layers || []).filter(layer => layer.visible && layer.path);
  const layerOptions = [{ value:'selection', label:'当前选择' }, ...visibleLayers.map(layer => ({ value:layer.path, label:layer.path }))];
  layerSelect.replaceChildren(...layerOptions.map(item => {
    const option = document.createElement('option'); option.value = item.value; option.textContent = item.label; return option;
  }));
  layerSelect.value = layerOptions.some(item => item.value === previousLayer) ? previousLayer : 'selection';
  window.rhinoPickers?.sync(layerSelect);
  const container = byId('parts-list');
  if (!parts.length) {
    container.replaceChildren(Object.assign(document.createElement('p'), { className:'parts-empty', textContent:'在 Rhino 中选择对象以读取分件' }));
    return;
  }
  container.replaceChildren(...parts.slice(0,40).map(part => {
    const row = document.createElement('div'); row.className = `part ${part.kind || 'object'}`;
    const title = document.createElement('strong'); title.textContent = part.name || part.id;
    const detail = document.createElement('span');
    const materialSource = { object:'对象材质',layer:'图层材质',parent:'父级继承',subobject:'面材质',unknown:'材质来源未知' }[part.material?.source] || '默认材质';
    const instance = part.instancePath?.length ? `块 ${part.instancePath.join(' / ')}` : '';
    detail.textContent = [part.layer || '无图层', part.kind === 'subobject' ? part.componentType : part.type,
      instance, part.material?.name || part.material?.renderName || (!part.material?.available ? '材质不可用' : part.material?.sourceResolved === false ? '父级材质未解析' : materialSource)].filter(Boolean).join(' · ');
    row.append(title, detail);
    const color = part.material?.diffuseColor;
    if (/^#[0-9a-f]{6}$/i.test(color || '')) { const swatch = document.createElement('i'); swatch.className = 'part-swatch'; swatch.style.backgroundColor = color; row.prepend(swatch); }
    return row;
  }));
}
function renderMessages(messages) {
  const fingerprint = JSON.stringify(messages);
  if (fingerprint === lastMessages) return;
  lastMessages = fingerprint;
  const container = byId('messages');
  const follow = container.scrollHeight - container.scrollTop - container.clientHeight < 90;
  if (!messages.length) { container.replaceChildren(); return; }
  container.replaceChildren(...messages.filter(message => ['user','assistant'].includes(message.role)).map(message => {
    const element = document.createElement('article'); element.className = `message ${message.role}`;
    const role = document.createElement('div'); role.className = 'role'; role.textContent = message.role === 'user' ? '你' : '灵感抽屉';
    const text = document.createElement('div'); text.className = 'text';
    const visibleText = message.content.split('\n\n[Rhino \u53ea\u8bfb\u4e0a\u4e0b\u6587\uff1b')[0];
    if (message.role === 'assistant' || message.markdown === true) text.append(window.rhinoMarkdown.render(document, visibleText));
    else text.textContent = visibleText;
    element.append(role,text);
    if (message.role === 'user' && message.attachmentImageCount) {
      const count = document.createElement('div'); count.className = 'auto-reference-hint';
      count.textContent = '本条消息附带 ' + message.attachmentImageCount + ' 张图片';
      element.append(count);
    }
    const tools = message.tools || [];
    if (tools.length) {
      const history=document.createElement('details');history.className='tool-history';
      const active=tools.some(tool=>['pending','running','awaiting-approval'].includes(tool.status));
      const failures=tools.filter(tool=>['error','failed','declined'].includes(tool.status)).length;
      history.open=active;
      const summary=document.createElement('summary');summary.className='tool-history__summary';
      summary.textContent=`\u5de5\u5177\u8bb0\u5f55 \u00b7 ${tools.length} \u6b65 \u00b7 ${active?'\u5904\u7406\u4e2d':failures?`${failures} \u9879\u5f85\u67e5\u770b`:'\u5df2\u5b8c\u6210'}`;
      history.append(summary);
      const rows=document.createElement('div');rows.className='tool-history__items';
      for (const tool of tools) {
        const row=document.createElement('div'); row.className = 'tool';
        const label=document.createElement('div'); label.textContent=`${labels[tool.name] || tool.name || 'Tool'} \u00b7 ${statuses[tool.status] || tool.status}`; row.append(label);
        if (typeof tool.diagnostic === 'string' && tool.diagnostic) { const diagnostic=document.createElement('div'); diagnostic.className='tool-diagnostic'; diagnostic.textContent=tool.diagnostic.slice(0,2000); row.append(diagnostic); }
        if(tool.name?.startsWith('rhino_native_') && tool.status==='awaiting-approval') {
          const details=document.createElement('details'); details.className='native-approval-details';
          const approvalSummary=document.createElement('summary'); approvalSummary.textContent='Review execution arguments'; details.append(approvalSummary);
          const pre=document.createElement('pre'); pre.className='native-approval-args';
          try { pre.textContent=JSON.stringify(JSON.parse(tool.argumentsJson || '{}'),null,2).slice(0,12000); } catch { pre.textContent=String(tool.argumentsJson || '{}').slice(0,12000); }
          details.append(pre); row.append(details);
          const actions=document.createElement('div'); actions.className='native-approval-actions';
          const allow=document.createElement('button'); allow.type='button'; allow.textContent='Allow'; allow.dataset.approveTool=tool.id; allow.dataset.approved='true';
          const deny=document.createElement('button'); deny.type='button'; deny.textContent='Deny'; deny.dataset.approveTool=tool.id; deny.dataset.approved='false';
          actions.append(allow,deny); row.append(actions);
        }
        rows.append(row);
      }
      history.append(rows);element.append(history);
    }
    if (message.hiddenReferenceCount) { const hint=document.createElement('div');hint.className='auto-reference-hint';hint.textContent='已在后台附带 '+message.hiddenReferenceCount+' 张参考图';element.append(hint); }
    const imageContainer = message.role === 'user' ? document.createElement('div') : element;
    if (imageContainer !== element) imageContainer.className = 'reference-image-grid';
    for (const [imagePosition, source] of (message.images || []).entries()) {
      if(!/^data:image\/(?:jpeg|png|webp);base64,/i.test(source))continue;
      const button=document.createElement('button');button.type='button';button.className='message-image-button';button.title='点击放大预览';button.setAttribute('aria-label','点击放大图片');
      const img=document.createElement('img');img.className='message-image message-image--preview';img.src=source;img.alt='图片 · 点击放大预览';img.loading='lazy';img.dataset.previewSrc=source;img.dataset.messageId=message.id;img.dataset.imageIndex=String(message.imageIndices?.[imagePosition] ?? imagePosition);button.append(img);imageContainer.append(button);
    }
    if (imageContainer !== element && imageContainer.children.length) element.append(imageContainer);
    if (message.status === 'streaming' || message.status === 'error' || message.status === 'cancelled') { const status=document.createElement('div');status.className='status';status.textContent=message.status==='streaming'?'正在处理…':statuses[message.status];element.append(status); }
    return element;
  }));
  if (follow) container.scrollTop = container.scrollHeight;
}
async function poll() {
  try {
    const result = await request(`/panel/state?documentId=${documentId}`);
    state = result.state || {}; connected = result.connected;
    reconcileConversation(result.commands || []);
    reconcileSettings(result.commands || []);
    window.rhinoImagePreview.sync(state.conversationId || '');
    if (deletingConversation && !(state.conversations || []).some(item => item.id === deletingConversation)) deletingConversation = '';
    if (deletingConversation && (result.commands || []).some(item => item.request?.kind === 'delete' && item.request?.conversationId === deletingConversation && ['completed','failed'].includes(item.status))) deletingConversation = '';
    byId('mask').checked = state.imageMaskEnabled === true;
    byId('dot').classList.toggle('online',connected);
    byId('connection').textContent = connected ? state.busy ? '已连接 · Chat 正在执行' : pendingConversation ? '已连接 · 正在同步对话' : '已连接灵感抽屉' : '等待配套 Beta 桌面端';
    byId('document').textContent = `${result.context?.name || '未保存文档'} · 选中 ${result.context?.selection?.length || 0} 个 Rhino 对象`;
    if (result.processId) byId('document').textContent += ` \u00b7 \u7a97\u53e3 ${result.processId}`;
    byId('document').title = `Rhino ${result.instanceId || ''} / document ${documentId}`;
    byId('selected-count').textContent = state.selectedCount || 0;
    byId('selected-count').hidden = !(state.selectedCount > 0);
    byId('reference-settings-toggle').title = `参考设置 · 画布图片 ${state.selectedCount || 0} 张 · ${byId('viewport').checked ? '附带视口' : '不附带视口'}${state.imageMaskEnabled ? ' · 已开启遮罩' : ''}`;
    choices('conversation',(state.conversations || []).map(item=>({value:item.id,label:item.title || '\u65b0\u5bf9\u8bdd'})),state.conversationId);
    choices('model',(state.modelOptions || []).map(value=>({value,label:value})),state.model);
    choices('image-model',state.imageModelOptions || [],state.imageModel);
    choices('image-resolution',state.imageResolutionOptions || [],state.imageResolution);
    choices('image-aspect-ratio',state.imageAspectRatioOptions || [],state.imageAspectRatio);
    choices('image-quality',state.imageQualityOptions || [],state.imageQuality);
    byId('image-quality-field').hidden = !(state.imageQualityOptions || []).length;
    if (state.messages?.length || lastMessages) renderMessages(state.messages || []);
    if (!partsBusy && Date.now() - lastPartsAt >= 3_000) {
      partsBusy = true;
      lastPartsAt = Date.now();
      void request(`/panel/parts?documentId=${documentId}`).then(renderParts).catch(() => {}).finally(() => { partsBusy = false; });
    }
    const failed = (result.commands || []).filter(command=>command.status==='failed').at(-1);
    if(failed && byId('notice').dataset.error!==failed.id) { notice(failed.error || '操作失败，请检查抽屉设置');byId('notice').dataset.error=failed.id; }
    if (uncertain) {
      const found = (result.commands || []).find(command=>command.id===uncertain.id);
      if (found) { if(uncertain.kind==='send')clearComposerDraft();uncertain=undefined;submitting=false;notice('请求已收到，请等待结果。'); }
    }
    updateButtons();
  } catch(error) { connected=false;byId('dot').classList.remove('online');byId('connection').textContent='连接中断，请检查 Rhino 文档是否仍然打开';updateButtons(); }
  finally { setTimeout(poll,1000); }
}
async function command(kind,extra={}) {
  if(submitting || !connected || (pendingConversation && kind !== 'stop'))return false;
  const payload={id:crypto.randomUUID(),kind,documentId,conversationId:state.conversationId || '',...extra};
  const setting = settingFields[kind] && { id:payload.id, value:extra.value, at:Date.now(), conversationId:state.conversationId || '' };
  if (setting) pendingSettings.set(kind, setting);
  if (kind === 'new' || kind === 'select') pendingConversation = { id:payload.id, kind, previousId:state.conversationId || '', targetId:extra.value || '' };
  submitting=true;updateButtons();
  try { await request('/panel/command',payload);if(kind==='send')clearComposerDraft();notice('');return true; }
  catch(error) {
    // Do not automatically submit a new request after an ambiguous transport failure.
    if(error.name==='TimeoutError' || error instanceof TypeError) { uncertain=payload;notice('连接中断，正在确认请求状态。请勿重复发送；可在桌面 Chat 查看是否已经执行。');return false; }
    if (setting && pendingSettings.get(kind)?.id === payload.id) pendingSettings.delete(kind);
    if (pendingConversation?.id === payload.id) pendingConversation = undefined;
    notice(error.message);return false;
  }
  finally { if(!uncertain)submitting=false;updateButtons(); }
}
function cancelDelete() {
  deleteTarget = '';
  byId('delete-confirmation').hidden = true;
}
byId('delete-conversation').addEventListener('click', () => {
  if (byId('delete-conversation').disabled) return;
  const conversation = (state.conversations || []).find(item => item.id === state.conversationId);
  if (!conversation) return;
  deleteTarget = conversation.id;
  byId('delete-question').textContent = `\u786e\u5b9a\u5220\u9664\u5f53\u524d\u5bf9\u8bdd\u201c${conversation.title || 'Rhino \u5bf9\u8bdd'}\u201d\uff1f`;
  byId('delete-confirmation').hidden = false;
  byId('cancel-delete').focus();
});
byId('cancel-delete').addEventListener('click', cancelDelete);
byId('confirm-delete').addEventListener('click', () => {
  if (!deleteTarget || deleteTarget !== state.conversationId || byId('delete-conversation').disabled) { cancelDelete(); return; }
  const target = deleteTarget;
  cancelDelete();
  deletingConversation = target;
  void command('delete', { conversationId:target }).then(queued => {
    if (!queued && !uncertain) deletingConversation = '';
    updateButtons();
  });
});
byId('messages').addEventListener('click',event=>{const button=event.target.closest('button[data-approve-tool]');if(!button)return;void command('approve-tool',{toolCallId:button.dataset.approveTool,approved:button.dataset.approved==='true'});});
let localImages = [];
let preparingImages = false;
function resizeComposerInput() {
  const input = byId('input');
  if (!input.style) return;
  input.style.height = 'auto';
  const maxHeight = Math.max(64, Math.min(260, (globalThis.innerHeight || 800) * 0.32));
  input.style.height = Math.min(maxHeight, Math.max(46, input.scrollHeight || 46)) + 'px';
  input.style.overflowY = input.scrollHeight > (input.clientHeight || maxHeight) + 1 ? 'auto' : 'hidden';
}
function renderLocalImages() {
  const list = byId('local-image-list');
  list.replaceChildren(); list.hidden = localImages.length === 0;
  for (const image of localImages) {
    const item = document.createElement('div'); item.className = 'local-image-item';
    const thumbnail = document.createElement('img'); thumbnail.src = image.dataUrl; thumbnail.alt = image.name;
    const remove = document.createElement('button'); remove.type = 'button'; remove.textContent = '×'; remove.title = '移除 ' + image.name;
    remove.addEventListener('click', () => { localImages = localImages.filter(value => value !== image); renderLocalImages(); });
    item.append(thumbnail, remove); list.append(item);
  }
  byId('local-image-status').textContent = localImages.length ? localImages.length + ' 张本地参考图' : '';
}
function clearComposerDraft() { byId('input').value = ''; localImages = []; renderLocalImages(); resizeComposerInput(); }
async function prepareLocalImage(file) {
  if (!/image\/(?:png|jpeg|webp|bmp)$/i.test(file.type) || file.size > 20 * 1024 * 1024) throw new Error('请选择 20MB 以内的 PNG、JPG、WebP 或 BMP 图片');
  // Match the host's img-src data: policy. blob: object URLs are deliberately
  // not allowed there, so use FileReader before rasterizing/compressing.
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('图片读取失败，请重新选择图片'));
    reader.onabort = () => reject(new Error('图片读取已取消'));
    reader.readAsDataURL(file);
  });
  const image = new Image(); image.src = source; await image.decode();
  let scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
  for (let attempt = 0; attempt < 5; attempt++, scale *= 0.72) {
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d'); context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
    const dataUrl = canvas.toDataURL(mimeType, 0.86);
    if (dataUrl.length <= 1024 * 1024) return { name: file.name, dataUrl };
  }
  throw new Error('图片过大，压缩后仍无法添加，请缩小图片再试');
}

byId('attach-local-image').addEventListener('click', () => byId('local-image-input').click());
byId('local-image-input').addEventListener('change', async event => {
  if (preparingImages) return;
  preparingImages = true; byId('attach-local-image').disabled = true; byId('send').disabled = true;
  try {
    for (const file of Array.from(event.target.files || [])) {
      if (localImages.length >= 6) { notice('每次最多附带 6 张本地图片'); break; }
      localImages.push(await prepareLocalImage(file)); renderLocalImages();
    }
  } catch (error) { notice(error.message || '图片读取失败'); }
  finally { event.target.value = ''; preparingImages = false; byId('attach-local-image').disabled = false; updateButtons(); }
});
globalThis.addEventListener?.('resize', resizeComposerInput);

byId('image-settings-toggle').addEventListener('click', () => {
  window.rhinoPickers?.closeAll();
  const panel = byId('image-settings'); panel.hidden = !panel.hidden;
  byId('image-settings-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  resizeComposerInput();
});
function closeReferenceSettings() {
  byId('reference-settings').hidden = true;
  byId('reference-settings-toggle').setAttribute('aria-expanded', 'false');
}
function placeReferenceSettings() {
  const panel = byId('reference-settings');
  if (panel.hidden || !panel.style) return;
  const anchor = byId('reference-settings-toggle').getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  panel.style.maxHeight = Math.max(60, Math.min(180, anchor.top - 16)) + 'px';
  const bounds = panel.getBoundingClientRect();
  panel.style.left = Math.max(8, Math.min(anchor.left, width - bounds.width - 8)) + 'px';
  panel.style.top = Math.max(8, anchor.top - 7 - bounds.height) + 'px';
}
byId('reference-settings-toggle').addEventListener('click', () => {
  window.rhinoPickers?.closeAll();
  const panel = byId('reference-settings'); panel.hidden = !panel.hidden;
  byId('reference-settings-toggle').setAttribute('aria-expanded', String(!panel.hidden));
  placeReferenceSettings();
});
document.addEventListener?.('click', event => {
  const panel = byId('reference-settings');
  if (panel.hidden || panel.contains(event.target) || byId('reference-settings-toggle').contains(event.target) || event.target.closest?.('.panel-picker-menu')) return;
  closeReferenceSettings();
});
document.addEventListener?.('keydown', event => {
  if (event.key === 'Escape' && !event.defaultPrevented && !byId('reference-settings').hidden) {
    closeReferenceSettings(); byId('reference-settings-toggle').focus();
  }
});
globalThis.addEventListener?.('resize', placeReferenceSettings);


byId('composer').addEventListener('submit',event=>{event.preventDefault();if(!byId('send').disabled)void command('send',{content:byId('input').value.trim(),includeViewport:byId('viewport').checked,includeCanvasSelection:byId('canvas').checked,localImages:localImages.map(image=>({...image}))});});
// A narrow native focus signal; no text or keystrokes leave the page through this bridge.
let keyboardFocusSequence = 0;
function notifyKeyboardOwner(active) {
  const message = active ? 'idraw:keyboard-focus' : 'idraw:keyboard-release';
  if (typeof window.eto?.postMessage === 'function') window.eto?.postMessage?.(message);
  else document.title = message + ':' + (++keyboardFocusSequence); // Rhino 8 Eto compatibility, no navigation.
}
document.addEventListener?.('focusin', event => {
  if (event.target?.matches?.('input,textarea,select,button,[contenteditable="true"]')) notifyKeyboardOwner(true);
});
globalThis.addEventListener?.('blur', () => notifyKeyboardOwner(false));
let composingInput = false;
byId('input').addEventListener('compositionstart', () => { composingInput = true; });
byId('input').addEventListener('compositionend', () => { composingInput = false; });
byId('input').addEventListener('input',()=>{resizeComposerInput();updateButtons();});
byId('input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&!composingInput&&event.keyCode!==229){event.preventDefault();byId('composer').requestSubmit();}});
byId('new').addEventListener('click',()=>void command('new'));
byId('stop').addEventListener('click',()=>void command('stop'));
byId('conversation').addEventListener('change',event=>void command('select',{value:event.target.value}));
byId('model').addEventListener('change',event=>void command('model',{value:event.target.value}));
byId('image-model').addEventListener('change',event=>void command('image-model',{value:event.target.value}));
byId('image-resolution').addEventListener('change',event=>void command('image-resolution',{value:event.target.value}));
byId('image-aspect-ratio').addEventListener('change',event=>void command('image-aspect-ratio',{value:event.target.value}));
byId('image-quality').addEventListener('change',event=>void command('image-quality',{value:event.target.value}));
byId('mask').addEventListener('change', event => {
  const checkbox = event.target;
  const enabled = checkbox.checked;
  void command('mask-mode', { value: enabled ? 'on' : 'off', maskLayer: byId('mask-layer').value || 'selection' }).then(queued => {
    if (!queued || !enabled) return;
    byId('viewport').checked = true;
    byId('canvas').checked = true;
  }).catch(() => { checkbox.checked = false; });
});
byId('mask-layer').addEventListener('change', event => {
  if (byId('mask').checked) void command('mask-mode', { value:'on', maskLayer:event.target.value || 'selection' });
});
void poll();

async function loadImagePreview(messageId, imageIndex) {
  const conversationId = state.conversationId;
  if (!connected || !conversationId) throw new Error('抽屉未连接');
  const id = crypto.randomUUID();
  await request('/panel/command', { id, kind: 'preview-image', documentId, conversationId, messageId, imageIndex });
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (state.conversationId !== conversationId) throw new Error('对话已切换');
    const result = await request('/panel/image', { id, documentId, conversationId });
    if (result.status === 'completed') return result.image;
    if (result.status === 'failed') throw new Error(result.error || '图片读取失败');
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('图片读取超时');
}
window.rhinoImagePreview.configure({ load: loadImagePreview });
