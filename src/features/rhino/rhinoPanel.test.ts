// @ts-expect-error Node types are intentionally absent from the browser tsconfig.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node types are intentionally absent from the browser tsconfig.
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../../integrations/rhino/InspirationDrawer.Rhino/Panel/panel.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../../../integrations/rhino/InspirationDrawer.Rhino/Panel/index.html', import.meta.url), 'utf8');

class ElementFixture {
  value = '';
  textContent = '';
  hidden = true;
  disabled = false;
  checked = false;
  dataset: Record<string, string> = {};
  selectedOptions = [{ textContent: 'Current selection' }];
  classList = { toggle: vi.fn(), remove: vi.fn() };
  children: ElementFixture[] = [];
  listeners = new Map<string, (event?: any) => void>();
  focus = vi.fn();
  setAttribute = vi.fn();
  replaceChildren(...children: ElementFixture[]) { this.children = children; }
  append(...children: ElementFixture[]) { this.children.push(...children); }
  addEventListener(name: string, callback: (event?: any) => void) { this.listeners.set(name, callback); }
  click() { if (!this.disabled) this.listeners.get('click')?.(); }
}
const settle = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

async function setup(options: { busy?: boolean; connected?: boolean; nativeBridge?: boolean } = {}) {
  const elements = new Map<string, ElementFixture>();
  for (const match of html.matchAll(/id="([^"]+)"/g)) elements.set(match[1], new ElementFixture());
  const initialState = {
    conversationId: 'rhino-chat-current', conversations: [{ id: 'rhino-chat-current', title: 'Rhino chat' }],
    busy: options.busy === true, stoppable: false, messages: [], model: 'model-a', modelOptions: ['model-a', 'model-b'], imageModel: 'image-a', imageModelOptions: [{ value:'image-a' }, { value:'image-b' }],
    imageResolution: '2k', imageResolutionOptions: [{ value: '2k', label: '2K' }, { value: '4k', label: '4K' }],
    imageAspectRatio: '1:1', imageAspectRatioOptions: [{ value: '1:1', label: 'Square' }, { value: '16:9', label: 'Landscape' }],
    imageQuality: 'high', imageQualityOptions: [{ value: 'high', label: 'High' }],
  };
  const transport = { connected: options.connected !== false, instanceId: 'a'.repeat(32), processId: 12345, state: initialState, commands: [] };
  const requests: Array<Record<string, unknown>> = [];
  const fetch = vi.fn(async (path: string, input: { body?: string }) => {
    if (path === '/panel/command') requests.push(JSON.parse(input.body || '{}'));
    return { ok: true, json: async () => path.startsWith('/panel/state') ? transport : path.startsWith('/panel/parts') ? { parts: [] } : {} };
  });
  let sequence = 0;
  const postMessage = vi.fn();
  const document = { title: '', getElementById: (id: string) => elements.get(id), createElement: () => new ElementFixture(), activeElement: null as ElementFixture | null };
  const api = runInNewContext(source + '\n({ poll, notifyKeyboardOwner, stageLocalImages: images => { localImages = images; renderLocalImages(); } });', {
    window: { eto: options.nativeBridge ? { postMessage } : undefined, rhinoMarkdown: { render: (_document: unknown, text: string) => { const p = new ElementFixture(); p.textContent = text; return p; } }, rhinoImagePreview: { sync: vi.fn(), configure: vi.fn() } },
    document,
    location: { hash: '#token=test', search: '?documentId=7', pathname: '/' },
    history: { replaceState: vi.fn() }, URLSearchParams, AbortSignal,
    crypto: { randomUUID: () => `request-test-${++sequence}` }, fetch, setTimeout: vi.fn(),
  }) as { poll: () => Promise<void>; notifyKeyboardOwner: (active: boolean) => void; stageLocalImages: (images: Array<{ name: string; dataUrl: string }>) => void };
  await settle();
  return { elements, requests, api, transport, document, postMessage };
}

describe('Rhino panel deletion UI (synthetic DOM and transport)', () => {
  it('opens an inline confirmation and sends nothing when cancelled', async () => {
    const { elements, requests } = await setup();
    elements.get('delete-conversation')!.click();
    expect(elements.get('delete-confirmation')!.hidden).toBe(false);
    expect(elements.get('delete-question')!.textContent).toContain('Rhino chat');
    expect(requests).toEqual([]);
    elements.get('cancel-delete')!.click();
    elements.get('confirm-delete')!.click(); await settle();
    expect(elements.get('delete-confirmation')!.hidden).toBe(true);
    expect(requests).toEqual([]);
  });

  it('submits the selected conversation exactly once only after explicit confirmation', async () => {
    const { elements, requests } = await setup();
    elements.get('delete-conversation')!.click();
    elements.get('confirm-delete')!.click(); await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ kind: 'delete', conversationId: 'rhino-chat-current', documentId: 7 });
    expect(elements.get('delete-conversation')!.disabled).toBe(true);
    elements.get('delete-conversation')!.click();
    elements.get('confirm-delete')!.click(); await settle();
    expect(requests).toHaveLength(1);
  });

  it.each([{ busy: true }, { connected: false }])('disables deletion for unavailable or busy Chat (%j)', async options => {
    const { elements, requests } = await setup(options);
    expect(elements.get('delete-conversation')!.disabled).toBe(true);
    elements.get('delete-conversation')!.click();
    elements.get('confirm-delete')!.click(); await settle();
    expect(requests).toEqual([]);
  });

  it('cancels a confirmation if the selected conversation changes before deletion', async () => {
    const { elements, requests, api, transport } = await setup();
    elements.get('delete-conversation')!.click();
    transport.state.conversationId = 'rhino-chat-new';
    transport.state.conversations = [{ id: 'rhino-chat-new', title: 'New chat' }];
    await api.poll();
    expect(elements.get('delete-confirmation')!.hidden).toBe(true);
    elements.get('confirm-delete')!.click(); await settle();
    expect(requests).toEqual([]);
  });
});

describe('Rhino image output controls', () => {
  it.each([['image-resolution', '4k'], ['image-aspect-ratio', '16:9'], ['image-quality', 'high']])('sends the selected %s setting to the host', async (id, value) => {
    const { elements, requests } = await setup();
    const select = elements.get(id)!;
    expect(select.disabled).toBe(false);
    select.value = value;
    select.listeners.get('change')!({ target: select });
    await settle();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ kind: id, value });
  });
  it.each([{ busy: true }, { connected: false }])('disables image settings while unavailable: %j', async options => {
    const { elements } = await setup(options);
    for (const id of ['image-resolution', 'image-aspect-ratio', 'image-quality']) expect(elements.get(id)!.disabled).toBe(true);
  });
  it('refreshes choices when model capability options change and hides unsupported quality', async () => {
    const { elements, transport, api } = await setup();
    transport.state.imageResolutionOptions = [{ value: '1k', label: '1K' }];
    transport.state.imageResolution = '1k';
    transport.state.imageQualityOptions = [];
    await api.poll();
    expect(elements.get('image-resolution')!.value).toBe('1k');
    expect(elements.get('image-resolution')!.children.map(child => child.value)).toEqual(['1k']);
    expect(elements.get('image-quality-field')!.hidden).toBe(true);
    expect(elements.get('image-quality')!.disabled).toBe(true);
  });
});

describe('Rhino instance and conversation identities in panel', () => {
 it('keeps identity in option values and displays opening user requirements without ID suffixes', async () => {
  const {elements,api,transport}=await setup();
  transport.state.conversations=[{id:'rhino-chat-one-abc123',title:'Build a perforated plate'},{id:'rhino-chat-two-def456',title:'Render the selected chair'}];
  await api.poll();
  expect(elements.get('document')!.textContent).toContain('12345');
  expect((elements.get('document') as any).title).toContain(transport.instanceId);
  const labels=elements.get('conversation')!.children.map(item=>item.textContent);
  expect(labels).toEqual(['Build a perforated plate','Render the selected chair']);
  expect(elements.get('conversation')!.children.map(item=>item.value)).toEqual(['rhino-chat-one-abc123','rhino-chat-two-def456']);
  expect(labels.join(' ')).not.toMatch(/abc123|def456|268435457/);
 });
});

it('renders readable geometry issues in the Rhino panel without exposing scripts or requiring approval', async()=>{
  const {elements,api,transport}=await setup();
  (transport.state as any).messages=[{id:'failed',role:'assistant',content:'建模预检失败',status:'error',tools:[{id:'safe',name:'rhino_native_safe_profile_solids',status:'error',diagnostic:'零件 A · 孔 3：孔间距不足；实际 1.500，要求至少 3'}]}];
  await api.poll();
  const article=elements.get('messages')!.children[0];
  const row=article.children.find(item=>(item as any).className==='tool')!;
  expect(row.children.some(item=>item.textContent.includes('实际 1.500'))).toBe(true);
  expect(row.children.some(item=>(item as any).className==='native-approval-actions')).toBe(false);
});

describe('Rhino model choices in an existing conversation', () => {
  it.each(['model', 'image-model'])('switches %s without New Chat and survives an old heartbeat', async id => {
    const { elements, requests, api, transport } = await setup();
    const control = elements.get(id)!; const desired = id === 'model' ? 'model-b' : 'image-b';
    expect(control.disabled).toBe(false); control.value = desired; control.listeners.get('change')!({ target: control }); await settle();
    expect(requests).toHaveLength(1); expect(requests[0]).toMatchObject({ kind:id, value:desired, conversationId:'rhino-chat-current' });
    await api.poll(); expect(control.value).toBe(desired);
    (transport.state as any)[id === 'model' ? 'model' : 'imageModel'] = desired;
    await api.poll(); expect(control.value).toBe(desired);
    expect(requests.some(item => item.kind === 'new')).toBe(false);
  });
  it.each(['model', 'image-model'])('re-enables the focused %s when a task finishes', async id => {
    const { elements, api, transport, document } = await setup({ busy:true });
    const control = elements.get(id)!; document.activeElement = control; expect(control.disabled).toBe(true);
    transport.state.busy = false; await api.poll(); expect(control.disabled).toBe(false);
  });
  it('populates a focused dropdown when supported models arrive after initial load', async () => {
    const { elements, api, transport, document } = await setup(); const control=elements.get('model')!;
    transport.state.modelOptions=[]; await api.poll(); expect(control.disabled).toBe(true);
    document.activeElement=control; transport.state.modelOptions=['model-a','model-b']; await api.poll();
    expect(control.children.map(item=>item.value)).toEqual(['model-a','model-b']); expect(control.disabled).toBe(false);
  });
  it('restores the server choice after an explicit failed model change', async () => {
    const {elements,requests,api,transport}=await setup(); const control=elements.get('model')!;
    control.value='model-b'; control.listeners.get('change')!({target:control}); await settle();
    (transport.commands as any[]).push({id:requests[0].id,status:'failed',error:'Not saved'});
    await api.poll(); expect(control.value).toBe('model-a'); expect(elements.get('notice')!.textContent).toContain('Not saved');
  });
});

describe('desktop-style Rhino composer layout', () => {
 it('keeps image settings and the LLM model inside the composer below text input', () => {
  const start=html.indexOf('<form id="composer"'), end=html.indexOf('</form>',start), input=html.indexOf('id="input"',start);
  const toolbar=html.indexOf('class="composer-toolbar"',input);
  expect(start).toBeGreaterThan(html.indexOf('<footer>'));
  for(const id of ['image-model','image-resolution','image-aspect-ratio','image-quality','viewport','canvas','mask','mask-layer','model','attach-local-image']) {
    const index=html.indexOf(`id="${id}"`); expect(index).toBeGreaterThan(input); expect(index).toBeLessThan(end);
  }
  expect(html.indexOf('id="image-model"')).toBeLessThan(toolbar);
  expect(html.indexOf('id="model"')).toBeGreaterThan(toolbar);
  expect(html.indexOf('id="send"')).toBeGreaterThan(toolbar);
 });
 it('retains conversation navigation at the top and compact narrow-window styles', () => {
  expect(html.indexOf('id="conversation"')).toBeLessThan(html.indexOf('<footer>'));
  const css=readFileSync(new URL('../../../integrations/rhino/InspirationDrawer.Rhino/Panel/panel.css', import.meta.url),'utf8');
  expect(css).toContain('@media (max-width: 340px)');
  expect(css).toContain('--picker-font-size:8px'); expect(css).toContain('--picker-height:27px');
  expect(css).toContain('.panel-picker-menu { position:fixed');
 });
 it('expands the original reference controls from the composer without sending a command', async () => {
  const { elements, requests }=await setup();
  elements.get('reference-settings')!.hidden=true;
  elements.get('reference-settings-toggle')!.click();
  expect(elements.get('reference-settings')!.hidden).toBe(false);
  elements.get('reference-settings-toggle')!.click();
  expect(elements.get('reference-settings')!.hidden).toBe(true);
  expect(requests).toEqual([]);
 });
 it('can collapse image settings without changing selected model or creating a task', async () => {
  const { elements, requests }=await setup();
  elements.get('image-settings')!.hidden=false;
  elements.get('image-settings-toggle')!.click();
  expect(elements.get('image-settings')!.hidden).toBe(true);
  expect(elements.get('image-model')!.value).toBe('image-a');
  expect(requests).toEqual([]);
 });
});


describe('Rhino panel local image controls', () => {
  it('opens a local file chooser and submits image data only as an explicit send attachment', async () => {
    const { elements, requests, api } = await setup();
    const choose = vi.spyOn(elements.get('local-image-input')!, 'click');
    elements.get('attach-local-image')!.click(); expect(choose).toHaveBeenCalledOnce();
    const image = { name: 'reference.png', dataUrl: 'data:image/png;base64,QUJD' };
    api.stageLocalImages([image]);
    expect(elements.get('local-image-list')!.hidden).toBe(false);
    expect(elements.get('local-image-status')!.textContent).toContain('1');
    elements.get('input')!.value = '根据参考图建模';
    elements.get('input')!.listeners.get('input')?.();
    elements.get('composer')!.listeners.get('submit')?.({ preventDefault: vi.fn() });
    await settle();
    expect(requests).toHaveLength(1); expect(requests[0]).toMatchObject({ kind: 'send', localImages: [image] });
    expect(elements.get('local-image-list')!.hidden).toBe(true);
  });
});


describe('Rhino panel CSP-safe icon and image assets', () => {
 it('embeds trusted icon paths for all static controls instead of external SVG use URLs', () => {
  expect(html).not.toMatch(/<use\b|icons\.svg/);
  for (const icon of ['paperclip','layers','sliders','image','arrow-up','square','chevron-down','check']) {
    expect(html).toContain(`id="panel-icon-${icon}"`);
    expect(html).toContain(`data-panel-icon="${icon}"`);
  }
  expect(html).toContain('viewBox="0 0 24 24"');
  expect(html).toContain('stroke="currentColor"');
 });
 it('clones inline geometry for dynamic menu chevrons/checkmarks without image fetches', () => {
  const pickers=readFileSync(new URL('../../../integrations/rhino/InspirationDrawer.Rhino/Panel/panel-pickers.js', import.meta.url),'utf8');
  expect(pickers).toContain('cloneNode(true)');
  expect(pickers).toContain("getElementById('panel-icon-' + name)");
  expect(pickers).not.toMatch(/icons\.svg|createElementNS[^\n]+['"]use['"]/);
 });
 it('reads local reference files through allowed data URLs rather than CSP-blocked blob images', () => {
  expect(source).toContain('reader.readAsDataURL(file)');
  expect(source).not.toContain('URL.createObjectURL(file)');
  expect(source).not.toContain('URL.revokeObjectURL(url)');
 });
});


describe('production CSP fixture parity', () => {
 it('tests the panel with the same resource restrictions as the real Rhino bridge', () => {
  const server=readFileSync(new URL('../../../integrations/rhino/InspirationDrawer.Rhino/BetaServer.cs',import.meta.url),'utf8');
  const fixture=readFileSync(new URL('../../../scripts/rhino-panel-layout-probe.html',import.meta.url),'utf8');
  const policy=server.match(/Content-Security-Policy: ([^\\]+)\\r\\n/)?.[1];
  const tested=fixture.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  expect(policy).toBeDefined(); expect(tested).toBeDefined();
  // frame-ancestors is only honored as an HTTP header, not a meta policy.
  expect(policy?.replace(/; frame-ancestors 'none'$/, '')).toBe(tested);
 });
});


describe('Rhino composer native input ownership and IME',()=>{
 it('signals the native bridge only from focus events, not the one-second heartbeat',()=>{
  expect(source).toContain("window.eto?.postMessage?.");expect(source).toContain("'focusin'");expect(source).toContain('idraw:keyboard-focus');
  const pollSource=source.slice(source.indexOf('async function poll'),source.indexOf('async function poll')+2000);
  expect(pollSource).not.toContain('notifyKeyboardOwner');
 });
 it('never sends Enter during IME composition or for keyCode 229, but submits once after composition',async()=>{
  const {elements}=await setup();const input=elements.get('input')!;const composer=elements.get('composer')! as ElementFixture & {requestSubmit:ReturnType<typeof vi.fn>};composer.requestSubmit=vi.fn();
  const key=input.listeners.get('keydown')!;const event={key:'Enter',shiftKey:false,isComposing:false,keyCode:13,preventDefault:vi.fn()};
  input.listeners.get('compositionstart')!();key(event);expect(composer.requestSubmit).not.toHaveBeenCalled();
  input.listeners.get('compositionend')!();key({...event,keyCode:229});expect(composer.requestSubmit).not.toHaveBeenCalled();
  key(event);expect(composer.requestSubmit).toHaveBeenCalledOnce();
 });
});


describe('native focus bridge compatibility',()=>{
 it('uses the Eto message bridge in Rhino 9 without sending text',async()=>{
  const {api,postMessage,document}=await setup({nativeBridge:true});api.notifyKeyboardOwner(true);api.notifyKeyboardOwner(false);
  expect(postMessage.mock.calls).toEqual([['idraw:keyboard-focus'],['idraw:keyboard-release']]);expect(document.title).toBe('');
 });
 it('uses a title signal rather than navigating or requiring new Eto APIs in Rhino 8',async()=>{
  const {api,postMessage,document}=await setup();api.notifyKeyboardOwner(true);expect(document.title).toBe('idraw:keyboard-focus:1');api.notifyKeyboardOwner(false);expect(document.title).toBe('idraw:keyboard-release:2');expect(postMessage).not.toHaveBeenCalled();
 });
});
