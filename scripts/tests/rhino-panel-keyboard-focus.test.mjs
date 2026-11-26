import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { runInNewContext } from 'node:vm';

const panel = readFileSync(new URL('../../integrations/rhino/InspirationDrawer.Rhino/Panel/panel.js', import.meta.url), 'utf8');

for (const major of [8, 9]) {
  test(`Rhino ${major}: clicking the still-focused composer reasserts native focus without another focusin`, () => {
    const elements = new Map(), messages = [], titles = [];
    const document = new EventTarget(), host = new EventTarget();
    document.getElementById = id => {
      if (!elements.has(id)) elements.set(id, new EventTarget());
      return elements.get(id);
    };
    Object.defineProperty(document, 'title', { set: title => titles.push(title) });
    const input = document.getElementById('input');
    input.value = 'draft';
    document.activeElement = input;
    runInNewContext(panel, {
      document, window: { eto: major === 9 ? { postMessage: m => messages.push(m) } : undefined, rhinoImagePreview: { configure() {} } },
      addEventListener: host.addEventListener.bind(host), location: { hash: '', search: '', pathname: '/' },
      history: { replaceState() {} }, URLSearchParams, AbortSignal, fetch: () => new Promise(() => {}),
    });
    // Native focus can leave the WebView without changing its DOM activeElement.
    input.dispatchEvent(new Event('pointerdown'));
    host.dispatchEvent(new Event('blur'));
    input.dispatchEvent(new Event('pointerdown'));
    assert.equal(document.activeElement, input);
    assert.equal(input.value, 'draft');
    const signals = ['idraw:keyboard-focus', 'idraw:keyboard-release', 'idraw:keyboard-focus'];
    assert.deepEqual(messages, major === 9 ? signals : []);
    assert.deepEqual(titles, major === 8 ? signals.map((s, i) => s + ':' + (i + 1)) : []);
  });
}
