import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CANVAS_SNAPSHOT_MODE_KEY, getCanvasSnapshotMode, setCanvasSnapshotMode, useCanvasSnapshotMode } from './snapshotMode';

afterEach(() => vi.unstubAllGlobals());

function SnapshotModeProbe() {
  return createElement('span', null, String(useCanvasSnapshotMode()));
}

function expectSnapshotsEnabled() {
  expect(getCanvasSnapshotMode()).toBe(true);
  expect(renderToStaticMarkup(createElement(SnapshotModeProbe))).toBe('<span>true</span>');
}

function stubPreference(value: string | null) {
  const values = new Map<string, string>();
  if (value !== null) values.set(CANVAS_SNAPSHOT_MODE_KEY, value);
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, next: string) => { values.set(key, next); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
  vi.stubGlobal('localStorage', storage);
  return { values, storage };
}

describe('always-on canvas snapshot mode', () => {
  it.each([null, 'false', 'true'])('ignores the stored preference %s for both getter and hook', value => {
    const { storage } = stubPreference(value);

    expectSnapshotsEnabled();

    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('keeps the legacy setter as a no-op without persisting an OFF choice', () => {
    const { values, storage } = stubPreference(null);

    for (const enabled of [false, true, false]) {
      setCanvasSnapshotMode(enabled);
      expectSnapshotsEnabled();
    }

    expect(values.has(CANVAS_SNAPSHOT_MODE_KEY)).toBe(false);
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
  });

  it('cannot restore a legacy OFF preference through the compatibility setter', () => {
    const { values, storage } = stubPreference('false');

    setCanvasSnapshotMode(false);
    expectSnapshotsEnabled();
    setCanvasSnapshotMode(true);
    expectSnapshotsEnabled();

    expect(values.get(CANVAS_SNAPSHOT_MODE_KEY)).toBe('false');
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('stays enabled when preference storage is blocked', () => {
    const blocked = vi.fn(() => { throw new Error('blocked'); });
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked, removeItem: blocked });

    setCanvasSnapshotMode(false);
    expectSnapshotsEnabled();

    expect(blocked).not.toHaveBeenCalled();
  });

  it('stays enabled without browser globals, including server rendering', () => {
    vi.stubGlobal('window', undefined);
    vi.stubGlobal('localStorage', undefined);

    setCanvasSnapshotMode(false);
    expectSnapshotsEnabled();
  });
});
