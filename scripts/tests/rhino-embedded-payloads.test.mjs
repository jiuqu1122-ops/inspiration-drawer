import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
describe('current paired Rhino payloads', () => {
  it.each([8, 9])('ships current CSP-safe panel and local-image reader for Rhino %s', major => {
    const folder = new URL(`src-tauri/resources/rhino/${major}/`, root);
    const bytes = readFileSync(new URL('InspirationDrawer.Rhino.rhp', folder));
    const deps = JSON.parse(readFileSync(new URL('InspirationDrawer.Rhino.deps.json', folder), 'utf8'));
    expect(deps.libraries).toHaveProperty('InspirationDrawer.Rhino/0.1.0-beta.33');
    for (const marker of ['BETA.33', 'data-panel-icon="arrow-up"', 'id="panel-icon-paperclip"',
      'window.rhinoPickers', 'cloneNode(true)', 'reader.readAsDataURL(file)', 'id="reference-settings-toggle"']) {
      expect(bytes.includes(Buffer.from(marker)), `Rhino ${major} missing embedded marker ${marker}`).toBe(true);
    }
    expect(bytes.includes(Buffer.from('icons.svg#'))).toBe(false);
    expect(bytes.includes(Buffer.from('URL.createObjectURL(file)'))).toBe(false);
  });
});
