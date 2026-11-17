import { createRoot } from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DesignMemorySettingsPanel } from '../src/features/designMemory/DesignMemorySettingsPanel';
import { connectDesignMemoryEvents, designMemory } from '../src/features/designMemory/storage';
import type {
  DesignMemoryDraft, DesignMemoryKind, DesignMemoryLease, DesignMemoryPage,
  DesignMemoryRecall, DesignMemorySettings,
} from '../src/features/designMemory/types';
import '../src/index.css';

type Check = { name: string; passed: boolean; elapsedMs: number; detail?: unknown };
type ProbeInfo = {
  probe: string; runId: string; syntheticOnly: boolean; noProductionSetup: boolean;
  appIdentifier: string; database: string; profile: string; freshRecordCount: number; jsonCompatibilityMode: boolean;
};
type WriteResult = { accepted: boolean; written: number };
const checks: Check[] = [];
const actions: { type: string; target: string; trusted: false; timeMs: number }[] = [];
const runtimeErrors: string[] = [];
const eventKinds: string[] = [];
const importerCalls: DesignMemoryKind[] = [];
const openedSources: string[] = [];
const started = performance.now();
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const frame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
window.addEventListener('error', event => runtimeErrors.push(event.message));
window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)));

const panel = () => {
  const element = document.querySelector<HTMLElement>('[data-probe-panel]');
  if (!element) throw new Error('Real settings panel host missing');
  return element;
};
const rows = () => Array.from(panel().querySelectorAll<HTMLLIElement>('ul[aria-label="已保存的设计记忆"] > li'));
const row = (title: string) => {
  const element = rows().find(element => element.querySelector('h4')?.textContent === title);
  if (!element) throw new Error(`Missing synthetic management row: ${title}`);
  return element;
};
const button = (text: string, within: ParentNode = panel()) => {
  const element = Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find(element => element.textContent?.trim() === text);
  if (!element) throw new Error(`Missing real panel button: ${text}`);
  return element;
};
const memoryToggle = (kind: DesignMemoryKind) => {
  const label = kind === 'drawer-image' ? '抽屉图片记忆' : 'Chat 设计记忆';
  const element = panel().querySelector<HTMLInputElement>(`input[role="switch"][aria-label="${label}"]`);
  if (!element) throw new Error(`Missing real panel switch: ${kind}`);
  return element;
};
const dialog = () => panel().querySelector<HTMLElement>('[role="alertdialog"]');
const recordAction = (type: string, target: string) => actions.push({ type, target, trusted: false, timeMs: Math.round(performance.now() - started) });
const click = async (element: HTMLButtonElement | HTMLInputElement) => {
  if (element.disabled) throw new Error(`Refusing to click disabled control: ${element.textContent || element.getAttribute('aria-label')}`);
  if (!element.getClientRects().length) throw new Error('Control is not laid out in the visible document');
  element.scrollIntoView({ block: 'nearest' });
  recordAction('HTMLElement.click', element.getAttribute('aria-label') || element.textContent?.trim() || element.tagName);
  // Genuine panel event handlers, deliberately untrusted DOM automation: not
  // SendInput, Playwright/native computer input, or human visual verification.
  element.click();
  await frame();
};
const until = async (label: string, predicate: () => boolean | Promise<boolean>, timeoutMs = 10000) => {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const alert = panel().querySelector('[role="alert"]');
    if (alert) throw new Error(`Panel error during ${label}: ${alert.textContent}`);
    if (await predicate()) { await frame(); return; }
    await sleep(35);
  }
  throw new Error(`Timed out: ${label}`);
};
const list = (kind?: DesignMemoryKind) => invoke<DesignMemoryPage>('design_memory_list', { kind: kind ?? null, offset: 0, limit: 50 });
const settings = () => invoke<DesignMemorySettings>('design_memory_get_settings');
const recall = (query: string) => invoke<DesignMemoryRecall>('design_memory_recall', {
  query: { query, projectId: null, excludeSourceId: null, includeRelatedSummaries: false, limit: 8 },
});
const draft = (kind: DesignMemoryKind, suffix: string): DesignMemoryDraft => ({
  id: `synthetic-${kind}-${suffix}`, kind, sourceId: `synthetic-source-${kind}-${suffix}`,
  scope: 'long-term', projectId: null, title: `Synthetic ${kind} ${suffix}`,
  content: kind === 'drawer-image'
    ? 'Synthetic ceramic matte shell, warm white CMF. Image features only, not user preference.'
    : 'Synthetic explicit design preference: accessible contrast and tactile navigation.',
  tags: kind === 'drawer-image' ? ['ceramic', 'matte', 'synthetic'] : ['accessible', 'navigation', 'synthetic'],
  evidence: kind === 'drawer-image' ? 'analyzed-image' : 'explicit-user-statement',
  attribution: { label: 'SYNTHETIC FIXTURE ONLY', ...(kind === 'drawer-image'
    ? { analyzedAt: '2026-10-30T00:00:00Z' } : { messageIds: [`synthetic-message-${suffix}`] }) },
});
const imageA = draft('drawer-image', 'a');
const imageB = draft('drawer-image', 'b');
const chatA = draft('chat-design', 'a');
const sourceDelete = draft('drawer-image', 'source-delete');
const seedViaNative = async (record: DesignMemoryDraft) => {
  const lease = await invoke<DesignMemoryLease | null>('design_memory_acquire_lease', { kind: record.kind, sourceId: record.sourceId });
  if (!lease) throw new Error(`Synthetic lease rejected: ${record.id}`);
  const result = await invoke<WriteResult>('design_memory_upsert', { lease, records: [record] });
  if (!result.accepted || result.written !== 1) throw new Error(`Synthetic upsert rejected: ${record.id}`);
  return lease;
};
const refresh = async () => {
  await until('refresh available', () => !button('刷新').disabled);
  await click(button('刷新'));
  await until('refresh complete', () => !button('刷新').disabled);
};
const changeKind = async (kind: DesignMemoryKind) => {
  const element = panel().querySelector<HTMLSelectElement>('#design-memory-kind');
  if (!element || element.disabled) throw new Error('Memory type selector missing/disabled');
  recordAction('change', kind);
  element.value = kind;
  element.dispatchEvent(new Event('change', { bubbles: true }));
  await frame();
  await until('kind selector changed', () => element.value === kind);
};
const setToggle = async (kind: DesignMemoryKind, enabled: boolean) => {
  await until(`${kind} switch idle`, () => !memoryToggle(kind).disabled);
  if (memoryToggle(kind).checked === enabled) throw new Error(`Expected an actual toggle transition for ${kind}`);
  await click(memoryToggle(kind));
  await until(`${kind} persisted ${enabled}`, async () => {
    const state = await settings();
    return memoryToggle(kind).checked === enabled && !memoryToggle(kind).disabled
      && (kind === 'drawer-image' ? state.drawerImage : state.chatDesign).enabled === enabled;
  });
};
let currentPhase = 'startup';
const display = (status: string) => {
  const statusElement = document.querySelector('[data-probe-status]');
  if (statusElement) statusElement.textContent = status;
  const log = document.querySelector('[data-probe-checks]');
  if (log) log.replaceChildren(...checks.map(check => {
    const element = document.createElement('li');
    element.className = check.passed ? 'probe-pass' : 'probe-fail';
    element.textContent = `${check.passed ? 'PASS' : 'FAIL'} ${check.name} (${check.elapsedMs}ms)`;
    return element;
  }));
};
const check = async (name: string, test: () => Promise<unknown>) => {
  currentPhase = name; display(`RUNNING: ${name}`);
  const time = performance.now();
  try {
    const detail = await test();
    checks.push({ name, passed: true, elapsedMs: Math.round(performance.now() - time), detail });
  } catch (error) {
    checks.push({ name, passed: false, elapsedMs: Math.round(performance.now() - time), detail: String(error) });
    display(`FAIL: ${name}`); throw error;
  }
  display(`RUNNING: ${name}`);
};
function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
let host: ProbeInfo | null = null;
let stopEvents: (() => void) | undefined;
let importerBatchCount = 0;
const importSynthetic = async (kind: DesignMemoryKind) => {
  importerCalls.push(kind);
  const batch = await designMemory.beginBatch(kind);
  if (!batch || !(await designMemory.checkBatch(batch))) throw new Error('Synthetic import batch invalid');
  importerBatchCount++;
  const fixture = draft(kind, 'imported');
  const ticket = await designMemory.acquire(kind, fixture.sourceId, batch);
  const result = await designMemory.put(ticket, [fixture]);
  if (!result.accepted || result.written !== 1) throw new Error('Synthetic importer write failed');
  return { processed: 1, written: result.written };
};

createRoot(document.getElementById('root')!).render(
  <main className="probe-shell">
    <header>
      <h1>ISOLATED · 设计记忆原生冒烟测试</h1>
      <p>仅使用每次运行新建的合成 SQLite 与独立 WebView2 profile，不启动用户主程序。</p>
      <p className="probe-caution">页面 DOM 事件自动化（isTrusted=false），不是人工、系统鼠标键盘或视觉验收；无 AI / 付费调用。</p>
    </header>
    <div className="probe-panel" data-probe-panel><DesignMemorySettingsPanel
      onIndexExisting={importSynthetic} onOpenSource={record => openedSources.push(record.sourceId)}
    /></div>
    <aside className="probe-evidence">
      <h2>Live structured evidence</h2><p data-probe-status>Verifying isolated host…</p>
      <ol data-probe-checks />
      <details><summary>Result JSON</summary><pre data-probe-result>Pending</pre></details>
    </aside>
  </main>,
);

try {
  assert(isTauri(), 'Must run in the isolated native host; no browser mock transport is permitted');
  host = await invoke<ProbeInfo>('design_memory_probe_info');
  assert(host.probe === 'design-memory-isolated' && host.syntheticOnly && host.noProductionSetup
    && !host.jsonCompatibilityMode && host.appIdentifier === 'com.inspirationdrawer.design-memory-probe', 'Isolated native handshake failed');
  await until('panel mount', () => panel().querySelectorAll('[role="switch"]').length === 2);
  await connectDesignMemoryEvents();
  stopEvents = await listen<{ kinds: string[] }>('design-memory-invalidated', event => eventKinds.push(...event.payload.kinds));
  await check('default OFF: two independent switches, empty synthetic SQLite, importer disabled', async () => {
    const state = await settings();
    assert(!state.drawerImage.enabled && !state.chatDesign.enabled && !memoryToggle('drawer-image').checked
      && !memoryToggle('chat-design').checked, 'Fresh switches are not both OFF');
    assert((await list()).records.length === 0 && host?.freshRecordCount === 0 && rows().length === 0, 'Fresh fixture is not empty');
    assert(button('整理已有图片资料').disabled && importerCalls.length === 0, 'Importer ran/was enabled without consent');
    return state;
  });
  await check('enable drawer through real DOM click without enabling Chat or auto-import', async () => {
    await setToggle('drawer-image', true);
    const state = await settings();
    assert(state.drawerImage.enabled && !state.chatDesign.enabled && !memoryToggle('chat-design').checked, 'Switches are coupled');
    assert(importerCalls.length === 0 && (await list()).records.length === 0, 'Enabling scanned/imported data');
    assert(!button('整理已有图片资料').disabled, 'Opt-in fixture importer not enabled');
    return state;
  });
  await check('real native acquire/upsert and visible attributed management rows', async () => {
    await seedViaNative(imageA); await seedViaNative(imageB); await refresh();
    await until('two visible synthetic images', () => rows().length === 2);
    assert(row(imageA.title).textContent?.includes('图片特征（非用户偏好）')
      && row(imageA.title).textContent?.includes(imageA.sourceId), 'Missing evidence/provenance in real row');
    assert((await recall('ceramic')).records.length === 2, 'Enabled synthetic images not recalled');
    return { saved: (await list('drawer-image')).records.length, visible: rows().length };
  });
  await check('view source callback uses fixture provenance only', async () => {
    await click(button('查看来源', row(imageA.title)));
    assert(openedSources.length === 1 && openedSources[0] === imageA.sourceId, 'Source attribution callback mismatch');
    return { openedSources };
  });
  await check('disable retains rows, revokes lease/writes and makes native recall empty', async () => {
    const oldLease = await invoke<DesignMemoryLease>('design_memory_acquire_lease', { kind: 'drawer-image', sourceId: imageA.sourceId });
    await setToggle('drawer-image', false);
    await until('disabled rows remain manageable', () => rows().length === 2);
    assert((await list('drawer-image')).records.length === 2 && (await recall('ceramic')).records.length === 0,
      'Disabled memory was deleted or recalled');
    assert(await invoke('design_memory_acquire_lease', { kind: 'drawer-image', sourceId: 'synthetic-disabled-source' }) === null,
      'Disabled kind granted a new lease');
    const result = await invoke<WriteResult>('design_memory_upsert', { lease: oldLease, records: [imageA] });
    assert(!result.accepted && result.written === 0, 'Disabled memory accepted stale write');
    assert(button('整理已有图片资料').disabled, 'Disabled importer remains available');
    return { retainedRows: rows().length, recallCount: 0, staleAccepted: result.accepted };
  });
  await check('reenable restores recall, but old generation remains rejected', async () => {
    // Acquire a valid lease now; toggling twice must invalidate even this lease.
    await setToggle('drawer-image', true);
    assert((await recall('ceramic')).records.length === 2, 'Reenable failed to reuse retained records');
    const lease = await invoke<DesignMemoryLease>('design_memory_acquire_lease', { kind: 'drawer-image', sourceId: imageA.sourceId });
    await setToggle('drawer-image', false); await setToggle('drawer-image', true);
    const result = await invoke<WriteResult>('design_memory_upsert', { lease, records: [imageA] });
    assert(!result.accepted, 'Disable/reenable revived a stale generation');
    return { recalled: 2, staleGenerationRejected: true };
  });
  await check('correct via real textarea input and save; resist automatic overwrite', async () => {
    await click(button('纠正', row(imageA.title)));
    const input = row(imageA.title).querySelector<HTMLTextAreaElement>('textarea[aria-label="纠正记忆内容"]');
    assert(input, 'Correction textarea did not mount');
    const corrected = 'Synthetic corrected ceramic shell: warm white, brushed metal. 用户纠正：保留触感。';
    recordAction('textarea input', '纠正记忆内容');
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, corrected);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await frame(); await click(button('保存纠正', row(imageA.title)));
    await until('correction saved and visible', () => !row(imageA.title).querySelector('textarea')
      && Boolean(row(imageA.title).textContent?.includes(corrected)));
    const saved = (await list('drawer-image')).records.find(record => record.id === imageA.id);
    assert(saved?.userCorrected && saved.content === corrected && saved.revision > 1, 'Native correction not persisted');
    const lease = await invoke<DesignMemoryLease>('design_memory_acquire_lease', { kind: 'drawer-image', sourceId: imageA.sourceId });
    const result = await invoke<WriteResult>('design_memory_upsert', { lease, records: [imageA] });
    assert(result.written === 0 && (await list('drawer-image')).records.find(record => record.id === imageA.id)?.content === corrected,
      'Automatic upsert overwrote user correction');
    assert(row(imageA.title).textContent?.includes('已手动纠正'), 'Correction marker missing');
    return { revision: saved.revision, userCorrected: saved.userCorrected, content: saved.content };
  });
  await check('delete confirmation cancel leaves synthetic record unchanged', async () => {
    await click(button('删除', row(imageB.title)));
    assert(dialog() && (await list('drawer-image')).records.length === 2, 'Delete occurred before confirmation');
    assert(dialog()?.textContent?.includes('原素材和聊天记录不会删除'), 'Confirmation lacks preservation notice');
    await click(button('取消', dialog()!));
    await until('delete cancelled', () => !dialog());
    assert((await list('drawer-image')).records.length === 2 && rows().length === 2, 'Cancel deleted a record');
  });
  await check('confirmed delete and tombstone prevent synthetic record resurrection', async () => {
    const lease = await invoke<DesignMemoryLease>('design_memory_acquire_lease', { kind: 'drawer-image', sourceId: imageB.sourceId });
    await click(button('删除', row(imageB.title))); await click(button('确认删除', dialog()!));
    await until('confirmed delete completes', () => !dialog() && rows().length === 1);
    assert((await list('drawer-image')).records.length === 1, 'Confirmed delete not persisted');
    const result = await invoke<WriteResult>('design_memory_upsert', { lease, records: [imageB] });
    assert(result.written === 0 && (await list('drawer-image')).records.length === 1, 'Deleted row was resurrected');
    return result;
  });
  await check('explicit existing-data callback imports synthetic fixture only', async () => {
    assert(importerCalls.length === 0, 'Fixture importer called before explicit click');
    await click(button('整理已有图片资料'));
    await until('synthetic fixture import complete', () => !button('刷新').disabled && rows().length === 2
      && Boolean(panel().querySelector('[role="status"]')?.textContent?.includes('已检查 1 项')));
    assert(importerCalls.join() === 'drawer-image' && importerBatchCount === 1, 'Unexpected importer calls');
    const saved = (await list('drawer-image')).records;
    assert(saved.some(record => record.id === 'synthetic-drawer-image-imported'), 'Fixture batch import missing');
    return { importerCalls: [...importerCalls], processed: 1, written: 1, readsRealHistory: false };
  });
  await check('enable Chat independently and show Chat management rows', async () => {
    await setToggle('chat-design', true); await seedViaNative(chatA);
    assert((await settings()).drawerImage.enabled, 'Enabling Chat changed drawer switch');
    await changeKind('chat-design');
    await until('Chat synthetic row loaded', () => rows().length === 1 && rows()[0].querySelector('h4')?.textContent === chatA.title);
    assert(row(chatA.title).textContent?.includes('用户明确陈述') && row(chatA.title).textContent?.includes('synthetic-message-a'),
      'Chat evidence/source message missing');
    assert((await recall('accessible')).records.some(record => record.id === chatA.id), 'Enabled Chat not recalled');
    return { chatRows: 1, drawerEnabled: true };
  });
  await check('Chat disabled retains management row and is excluded while drawer stays enabled', async () => {
    await setToggle('chat-design', false);
    assert((await settings()).drawerImage.enabled && memoryToggle('drawer-image').checked, 'Disabling Chat changed drawer');
    assert((await list('chat-design')).records.length === 1 && rows().length === 1, 'Disabled Chat management lost saved row');
    assert((await recall('accessible')).records.length === 0 && (await recall('ceramic')).records.length > 0, 'Independent recall filtering failed');
    await setToggle('chat-design', true);
    assert((await recall('accessible')).records.some(record => record.id === chatA.id), 'Reenabled Chat recall failed');
  });
  await check('clear confirmation cancel changes neither kind', async () => {
    await changeKind('drawer-image'); await until('drawer rows restored', () => rows().length === 2);
    await click(button('清空此类记忆'));
    assert(dialog() && (await list('drawer-image')).records.length === 2, 'Clear ran before confirmation');
    await click(button('取消', dialog()!)); await until('clear cancel', () => !dialog());
    assert((await list('drawer-image')).records.length === 2 && (await list('chat-design')).records.length === 1, 'Clear cancel changed data');
  });
  await check('confirmed clear affects selected kind only and invalidates pending work', async () => {
    const lease = await invoke<DesignMemoryLease>('design_memory_acquire_lease', { kind: 'drawer-image', sourceId: imageA.sourceId });
    await click(button('清空此类记忆')); await click(button('确认清空', dialog()!));
    await until('clear complete', () => !dialog() && rows().length === 0 && !button('刷新').disabled);
    assert((await list('drawer-image')).records.length === 0 && (await list('chat-design')).records.length === 1, 'Clear crossed kind boundary');
    const result = await invoke<WriteResult>('design_memory_upsert', { lease, records: [imageA] });
    assert(!result.accepted, 'Clear accepted pending old-generation work');
    return { drawerRows: 0, chatRows: 1, pendingRejected: true };
  });
  await check('registered source-deletion command remains synthetic-only', async () => {
    await seedViaNative(sourceDelete);
    const deleted = await invoke<number>('design_memory_delete_source', { kind: 'drawer-image', sourceId: sourceDelete.sourceId });
    assert(deleted === 1 && (await list('drawer-image')).records.length === 0, 'Synthetic source invalidation failed');
    assert(await invoke('design_memory_acquire_lease', { kind: 'drawer-image', sourceId: sourceDelete.sourceId }) === null,
      'Deleted synthetic source acquired a lease');
    return { deleted };
  });
  await check('native invalidation events reached real panel and errors remained empty', async () => {
    await until('both kinds invalidated', () => eventKinds.includes('drawer-image') && eventKinds.includes('chat-design'));
    assert(runtimeErrors.length === 0 && !panel().querySelector('[role="alert"]'), 'Runtime/panel errors detected');
    return { receivedEvents: eventKinds.length, kinds: [...new Set(eventKinds)], runtimeErrors };
  });
  await changeKind('chat-design');
  await until('final retained Chat row visible', () => rows().length === 1 && rows()[0].querySelector('h4')?.textContent === chatA.title);
} catch (error) {
  if (!checks.some(check => !check.passed)) checks.push({ name: currentPhase, passed: false, elapsedMs: 0, detail: String(error) });
  runtimeErrors.push(String(error));
}
const result = {
  schemaVersion: 1, probe: 'design-memory-isolated', runId: host?.runId ?? null,
  checksPassed: checks.length === 16 && checks.every(check => check.passed) && runtimeErrors.length === 0,
  evidenceType: 'visible-native-WebView2 + real-panel-untrusted-DOM-events + real-native-commands + synthetic-SQLite',
  humanVisualVerification: false, nativeInputAutomation: false, domEventsTrusted: false,
  isolation: host, checks, actions, runtimeErrors,
  importer: { calls: importerCalls, batches: importerBatchCount, realHistoryRead: false, paidCalls: 0 },
  elapsedMs: Math.round(performance.now() - started),
  viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, visibility: document.visibilityState },
  limits: ['Does not exercise production settings host or history importer.',
    'DOM events are untrusted; no human/native pointer/keyboard or visual QA is claimed.',
    'No live Chat/provider request, cloud sync, actual user material or paid call is used.'],
};
stopEvents?.();
display(result.checksPassed ? `PASS: ${checks.length} checks` : `FAIL: ${checks.filter(check => !check.passed).length} checks`);
const output = document.querySelector('[data-probe-result]');
if (output) output.textContent = JSON.stringify(result, null, 2);
await frame();
await invoke('design_memory_probe_result', { result });
