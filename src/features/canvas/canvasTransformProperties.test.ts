import { describe, expect, it } from 'vitest';
// @ts-expect-error Node types are intentionally absent from the browser tsconfig.
import { readFileSync } from 'node:fs';
const rules: string = readFileSync(new URL('./canvasTransformProperties.css', import.meta.url), 'utf8');

describe('non-inheriting live transform values', () => {
  it('keeps every per-frame transform property local to the layer', () => {
    for (const name of ['--canvas-live-scale', '--canvas-render-scale', '--canvas-offset-x', '--canvas-offset-y']) {
      const block = rules.split(`@property ${name} {`)[1]?.split('}')[0];
      expect(block).toBeDefined(); expect(block).toContain('inherits: false');
    }
  });
  it('leaves first-render live scale unset so the rendered scale fallback works', () => {
    const live = rules.split('@property --canvas-live-scale {')[1].split('}')[0];
    expect(live).toContain('syntax: "*"'); expect(live).not.toContain('initial-value');
  });
});
