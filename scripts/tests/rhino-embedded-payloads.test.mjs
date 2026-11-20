import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const project = readFileSync(new URL('integrations/rhino/InspirationDrawer.Rhino/InspirationDrawer.Rhino.csproj', root), 'utf8');
const pluginVersion = project.match(/<Version>([^<]+)<\/Version>/)?.[1];
describe('current paired Rhino payloads', () => {
  it.each([8, 9])('ships current CSP-safe panel and local-image reader for Rhino %s', major => {
    const folder = new URL(`src-tauri/resources/rhino/${major}/`, root);
    const bytes = readFileSync(new URL('InspirationDrawer.Rhino.rhp', folder));
    const deps = JSON.parse(readFileSync(new URL('InspirationDrawer.Rhino.deps.json', folder), 'utf8'));
    expect(pluginVersion).toBeTruthy();
    expect(deps.libraries).toHaveProperty(`InspirationDrawer.Rhino/${pluginVersion}`);
    expect(bytes.includes(Buffer.from(pluginVersion))).toBe(true);
    for (const marker of ['__RHINO_PLUGIN_VERSION_LABEL__', 'tool-history', 'history.open=active', 'reference-image-grid', 'data-panel-icon="arrow-up"', 'id="panel-icon-paperclip"',
      'window.rhinoPickers', 'cloneNode(true)', 'reader.readAsDataURL(file)', 'id="reference-settings-toggle"', 'idraw:keyboard-focus', 'compositionstart']) {
      expect(bytes.includes(Buffer.from(marker)), `Rhino ${major} missing embedded marker ${marker}`).toBe(true);
    }
    expect(bytes.includes(Buffer.from('icons.svg#'))).toBe(false);
    expect(bytes.includes(Buffer.from('URL.createObjectURL(file)'))).toBe(false);
  });
});
