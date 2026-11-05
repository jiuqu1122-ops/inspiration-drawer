/* Native Rhino client. All inference and existing tools stay in the desktop Chat. */
const token = new URLSearchParams(location.hash.slice(1)).get('token') || '';
const documentId = Number(new URLSearchParams(location.search).get('documentId'));
history.replaceState(null, '', location.pathname + location.search);
const byId = id => document.getElementById(id);
let state = {}, connected = false, submitting = false, lastMessages = '', uncertain;
const labels = { rhino_get_context:'读取 Rhino 上下文',rhino_list_objects:'查询 Rhino 对象',rhino_list_layers:'查询 Rhino 图层',generate_image:'生成图片',edit_image:'编辑图片',get_canvas_selection:'读取画布',generate_image_variants:'生成方案' };
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
  if (document.activeElement === select) return;
  const signature = JSON.stringify(options);
  if (select.dataset.options !== signature) {
    select.replaceChildren(...options.map(item => {
      const option = document.createElement('option'); option.value = item.value; option.textContent = item.label || item.value; return option;
    }));
    select.dataset.options = signature;
  }
  select.value = value || '';
  select.disabled = !connected || state.busy || submitting;
}
function updateButtons() {
  byId('send').disabled = !connected || state.busy || submitting || !byId('input').value.trim();
  byId('new').disabled = !connected || state.busy || submitting;
  byId('stop').hidden = !state.stoppable;
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
    const text = document.createElement('div'); text.className = 'text'; text.textContent = message.content.split('\n\n[Rhino 只读上下文；')[0];
    element.append(role,text);
    for (const tool of message.tools || []) { const row=document.createElement('div');row.className='tool';row.textContent=`${labels[tool.name] || '工具'} · ${statuses[tool.status] || tool.status}`;element.append(row); }
    for (const source of message.images || []) { if(!/^data:image\/(?:jpeg|png);base64,/.test(source))continue; const img=document.createElement('img');img.src=source;img.alt='会话图片预览';img.loading='lazy';element.append(img); }
    if (message.status === 'streaming' || message.status === 'error' || message.status === 'cancelled') { const status=document.createElement('div');status.className='status';status.textContent=message.status==='streaming'?'正在处理…':statuses[message.status];element.append(status); }
    return element;
  }));
  if (follow) container.scrollTop = container.scrollHeight;
}
async function poll() {
  try {
    const result = await request(`/panel/state?documentId=${documentId}`);
    state = result.state || {}; connected = result.connected;
    byId('dot').classList.toggle('online',connected);
    byId('connection').textContent = connected ? state.busy ? '已连接 · Chat 正在执行' : '已连接灵感抽屉' : '等待配套 Beta 桌面端';
    byId('document').textContent = `${result.context?.name || '未保存文档'} · 选中 ${result.context?.selection?.length || 0} 个 Rhino 对象`;
    byId('selected-count').textContent = state.selectedCount || 0;
    choices('conversation',(state.conversations || []).map(item=>({value:item.id,label:item.title})),state.conversationId);
    choices('model',(state.modelOptions || []).map(value=>({value,label:value})),state.model);
    choices('image-model',state.imageModelOptions || [],state.imageModel);
    if (state.messages?.length || lastMessages) renderMessages(state.messages || []);
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
  if(submitting || !connected)return;
  const payload={id:crypto.randomUUID(),kind,documentId,conversationId:state.conversationId || '',...extra};
  submitting=true;updateButtons();
  try { await request('/panel/command',payload);if(kind==='send')byId('input').value='';notice(''); }
  catch(error) {
    // Do not automatically submit a new request after an ambiguous transport failure.
    if(error.name==='TimeoutError' || error instanceof TypeError) { uncertain=payload;notice('连接中断，正在确认请求状态。请勿重复发送；可在桌面 Chat 查看是否已经执行。');return; }
    notice(error.message);
  }
  finally { if(!uncertain)submitting=false;updateButtons(); }
}
byId('composer').addEventListener('submit',event=>{event.preventDefault();if(!byId('send').disabled)void command('send',{content:byId('input').value.trim(),includeViewport:byId('viewport').checked,includeCanvasSelection:byId('canvas').checked});});
byId('input').addEventListener('input',updateButtons);
byId('input').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing){event.preventDefault();byId('composer').requestSubmit();}});
byId('new').addEventListener('click',()=>void command('new'));
byId('stop').addEventListener('click',()=>void command('stop'));
byId('conversation').addEventListener('change',event=>void command('select',{value:event.target.value}));
byId('model').addEventListener('change',event=>void command('model',{value:event.target.value}));
byId('image-model').addEventListener('change',event=>void command('image-model',{value:event.target.value}));
void poll();
