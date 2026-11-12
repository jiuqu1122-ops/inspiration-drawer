/* Native Rhino client. All inference and existing tools stay in the desktop Chat. */
const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
const documentId = Number(new URLSearchParams(location.search).get('documentId'));
history.replaceState(null, '', location.pathname + location.search);
const byId = id => document.getElementById(id);
let state = {}, connected = false, submitting = false, lastMessages = '', uncertain, lastParts = '', lastPartsAt = 0, partsBusy = false;
let deleteTarget = '', deletingConversation = '';
const pendingSettings = new Map();
const settingFields = { model:'model', 'image-model':'imageModel', 'image-resolution':'imageResolution', 'image-aspect-ratio':'imageAspectRatio', 'image-quality':'imageQuality' };
const labels = { rhino_get_context:'读取 Rhino 上下文',rhino_list_objects:'查询 Rhino 对象',rhino_list_layers:'查询 Rhino 图层',rhino_list_parts:'读取对象分件与材质',generate_image:'生成图片',edit_image:'编辑图片',get_canvas_selection:'读取画布',generate_image_variants:'生成方案' };
const statuses = { completed:'已完成',running:'执行中',pending:'等待执行','awaiting-approval':'等待确认',error:'失败',failed:'失败',cancelled:'已停止',declined:'已取消',accepted:'执行中' };
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
  select.disabled = !connected || state.busy || submitting || options.length === 0;
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
}
function reconcileSettings(commands) {
  for (const [kind, pending] of pendingSettings) {
    if (pending.conversationId !== (state.conversationId || '') && kind === 'model') { pendingSettings.delete(kind); continue; }
    const ack = commands.find(item => item.id === pending.id);
    if (state[settingFields[kind]] === pending.value || ack?.status === 'failed') pendingSettings.delete(kind);
    else if (Date.now() - pending.at > 20_000) { pendingSettings.delete(kind); notice('模型设置未同步，请检查连接后重试。'); }
  }
}
function updateButtons() {
  byId('send').disabled = !connected || state.busy || submitting || !byId('input').value.trim();
  byId('new').disabled = !connected || state.busy || submitting || Boolean(deletingConversation);
  byId('delete-conversation').disabled = !connected || state.busy || submitting || Boolean(deletingConversation) || !state.conversationId
    || !(state.conversations || []).some(item => item.id === state.conversationId);
  if (deleteTarget && (!connected || state.busy || deleteTarget !== state.conversationId)) cancelDelete();
  byId('stop').hidden = !state.stoppable;
  for (const [id, key] of [['model','modelOptions'], ['conversation','conversations'], ['image-model','imageModelOptions'], ['image-resolution','imageResolutionOptions'], ['image-aspect-ratio','imageAspectRatioOptions'], ['image-quality','imageQualityOptions']]) {
    byId(id).disabled = !connected || state.busy || submitting || !(state[key] || []).length;
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
    : '普通参考图生成 · 未启用对象遮罩，不保证严格保形';
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
    for (const tool of message.tools || []) {
      const row=document.createElement('div'); row.className='tool';
      const label=document.createElement('div'); label.textContent=`${labels[tool.name] || tool.name || 'Tool'} \u00b7 ${statuses[tool.status] || tool.status}`; row.append(label);
      if (typeof tool.diagnostic === 'string' && tool.diagnostic) { const diagnostic=document.createElement('div'); diagnostic.className='tool-diagnostic'; diagnostic.textContent=tool.diagnostic.slice(0,2000); row.append(diagnostic); }
      if(tool.name?.startsWith('rhino_native_') && tool.status==='awaiting-approval') {
        const details=document.createElement('details'); details.className='native-approval-details';
        const summary=document.createElement('summary'); summary.textContent='Review execution arguments'; details.append(summary);
        const pre=document.createElement('pre'); pre.className='native-approval-args';
        try { pre.textContent=JSON.stringify(JSON.parse(tool.argumentsJson || '{}'),null,2).slice(0,12000); } catch { pre.textContent=String(tool.argumentsJson || '{}').slice(0,12000); }
        details.append(pre); row.append(details);
        const actions=document.createElement('div'); actions.className='native-approval-actions';
        const allow=document.createElement('button'); allow.type='button'; allow.textContent='Allow'; allow.dataset.approveTool=tool.id; allow.dataset.approved='true';
        const deny=document.createElement('button'); deny.type='button'; deny.textContent='Deny'; deny.dataset.approveTool=tool.id; deny.dataset.approved='false';
        actions.append(allow,deny); row.append(actions);
      }
      element.append(row);
    }
    if (message.hiddenReferenceCount) { const hint=document.createElement('div');hint.className='auto-reference-hint';hint.textContent='已在后台附带 '+message.hiddenReferenceCount+' 张参考图';element.append(hint); }
    for (const [imagePosition, source] of (message.images || []).entries()) {
      if(!/^data:image\/(?:jpeg|png|webp);base64,/i.test(source))continue;
      const button=document.createElement('button');button.type='button';button.className='message-image-button';button.title='点击放大预览';button.setAttribute('aria-label','点击放大图片');
      const img=document.createElement('img');img.className='message-image message-image--preview';img.src=source;img.alt='图片 · 点击放大预览';img.loading='lazy';img.dataset.previewSrc=source;img.dataset.messageId=message.id;img.dataset.imageIndex=String(message.imageIndices?.[imagePosition] ?? imagePosition);button.append(img);element.append(button);
    }
    if (message.status === 'streaming' || message.status === 'error' || message.status === 'cancelled') { const status=document.createElement('div');status.className='status';status.textContent=message.status==='streaming'?'正在处理…':statuses[message.status];element.append(status); }
    return element;
  }));
  if (follow) container.scrollTop = container.scrollHeight;
}
async function poll() {
  try {
    const result = await request(`/panel/state?documentId=${documentId}`);
    state = result.state || {}; connected = result.connected;
    reconcileSettings(result.commands || []);
    window.rhinoImagePreview.sync(state.conversationId || '');
    if (deletingConversation && !(state.conversations || []).some(item => item.id === deletingConversation)) deletingConversation = '';
    if (deletingConversation && (result.commands || []).some(item => item.request?.kind === 'delete' && item.request?.conversationId === deletingConversation && ['completed','failed'].includes(item.status))) deletingConversation = '';
    byId('mask').checked = state.imageMaskEnabled === true;
    byId('dot').classList.toggle('online',connected);
    byId('connection').textContent = connected ? state.busy ? '已连接 · Chat 正在执行' : '已连接灵感抽屉' : '等待配套 Beta 桌面端';
    byId('document').textContent = `${result.context?.name || '未保存文档'} · 选中 ${result.context?.selection?.length || 0} 个 Rhino 对象`;
    if (result.processId) byId('document').textContent += ` \u00b7 \u7a97\u53e3 ${result.processId}`;
    byId('document').title = `Rhino ${result.instanceId || ''} / document ${documentId}`;
    byId('selected-count').textContent = state.selectedCount || 0;
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
      if (found) { if(uncertain.kind==='send')byId('input').value='';uncertain=undefined;submitting=false;notice('请求已收到，请等待结果。'); }
    }
    updateButtons();
  } catch(error) { connected=false;byId('dot').classList.remove('online');byId('connection').textContent='连接中断，请检查 Rhino 文档是否仍然打开';updateButtons(); }
  finally { setTimeout(poll,1000); }
}
async function command(kind,extra={}) {
  if(submitting || !connected)return false;
  const payload={id:crypto.randomUUID(),kind,documentId,conversationId:state.conversationId || '',...extra};
  const setting = settingFields[kind] && { id:payload.id, value:extra.value, at:Date.now(), conversationId:state.conversationId || '' };
  if (setting) pendingSettings.set(kind, setting);
  submitting=true;updateButtons();
  try { await request('/panel/command',payload);if(kind==='send')byId('input').value='';notice('');return true; }
  catch(error) {
    // Do not automatically submit a new request after an ambiguous transport failure.
    if(error.name==='TimeoutError' || error instanceof TypeError) { uncertain=payload;notice('连接中断，正在确认请求状态。请勿重复发送；可在桌面 Chat 查看是否已经执行。');return false; }
    if (setting && pendingSettings.get(kind)?.id === payload.id) pendingSettings.delete(kind);
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
byId('composer').addEventListener('submit',event=>{event.preventDefault();if(!byId('send').disabled)void command('send',{content:byId('input').value.trim(),includeViewport:byId('viewport').checked,includeCanvasSelection:byId('canvas').checked});});
byId('input').addEventListener('input',updateButtons);
byId('input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();byId('composer').requestSubmit();}});
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
