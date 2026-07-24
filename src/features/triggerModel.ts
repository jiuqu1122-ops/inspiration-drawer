import { clamp } from './common';

export const EDGE_WIDTH = 20;
export const EDGE_STRIP_HEIGHT = 96;
export const EDGE_HOVER_OPEN_DELAY = 140;
export const FLOAT_TRIGGER_SIZE = 56;
export const FLOAT_TRIGGER_MARGIN = 24;
export const FLOAT_HOVER_OPEN_DELAY = 800;
export const TRIGGER_RESHOW_HOVER_GUARD_MS = 1200;
export const TRIGGER_POSITION_DEFAULT_VERSION = '2026-05-right-bottom-float-center-edge';
export type TriggerMode = 'edge' | 'float';

export const shouldAllowTriggerHoverOpen = (
  shownAt: number,
  now = Date.now(),
) => shownAt <= 0 || now - shownAt >= TRIGGER_RESHOW_HOVER_GUARD_MS;

export const getStoredTriggerMode = (): TriggerMode => (
  localStorage.getItem('drawer_trigger_mode') === 'float' ? 'float' : 'edge'
);

export const readStoredFiniteNumber = (key: string) => {
  const raw = localStorage.getItem(key);
  if (raw === null || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
};

export const migrateTriggerPositionDefaults = () => {
  if (localStorage.getItem('drawer_trigger_position_default_version') === TRIGGER_POSITION_DEFAULT_VERSION) return;

  const top = (window.screen as any).availTop || 0;
  const left = (window.screen as any).availLeft || 0;
  const floatX = readStoredFiniteNumber('drawer_float_x');
  const floatY = readStoredFiniteNumber('drawer_float_y');
  const edgeY = readStoredFiniteNumber('drawer_edge_strip_y');
  const oldDefaultFloatX = left + FLOAT_TRIGGER_MARGIN;
  const oldDefaultFloatY = top + Math.max(
    FLOAT_TRIGGER_MARGIN,
    window.screen.availHeight - FLOAT_TRIGGER_SIZE - FLOAT_TRIGGER_MARGIN,
  );

  if (
    (floatX === 0 && floatY === 0) ||
    (
      floatX !== null &&
      floatY !== null &&
      Math.abs(floatX - oldDefaultFloatX) <= 2 &&
      Math.abs(floatY - oldDefaultFloatY) <= 2
    )
  ) {
    localStorage.removeItem('drawer_float_x');
    localStorage.removeItem('drawer_float_y');
  }
  if (edgeY === top) {
    localStorage.removeItem('drawer_edge_strip_y');
  }

  localStorage.setItem('drawer_trigger_position_default_version', TRIGGER_POSITION_DEFAULT_VERSION);
};

export const getStoredFloatPosition = () => {
  migrateTriggerPositionDefaults();
  const left = (window.screen as any).availLeft || 0;
  const top = (window.screen as any).availTop || 0;
  const defaultX = left + Math.max(
    FLOAT_TRIGGER_MARGIN,
    window.screen.availWidth - FLOAT_TRIGGER_SIZE - FLOAT_TRIGGER_MARGIN,
  );
  const defaultY = top + Math.max(
    FLOAT_TRIGGER_MARGIN,
    window.screen.availHeight - FLOAT_TRIGGER_SIZE - FLOAT_TRIGGER_MARGIN,
  );
  const x = readStoredFiniteNumber('drawer_float_x');
  const y = readStoredFiniteNumber('drawer_float_y');
  return {
    x: x ?? defaultX,
    y: y ?? defaultY,
  };
};

export const saveFloatPosition = (x: number, y: number) => {
  localStorage.setItem('drawer_float_x', String(Math.round(x)));
  localStorage.setItem('drawer_float_y', String(Math.round(y)));
};

export const getStoredEdgeStripY = () => {
  migrateTriggerPositionDefaults();
  const top = (window.screen as any).availTop || 0;
  const maxY = top + window.screen.availHeight - EDGE_STRIP_HEIGHT;
  const defaultY = top + Math.max(0, Math.round((window.screen.availHeight - EDGE_STRIP_HEIGHT) / 2));
  const y = readStoredFiniteNumber('drawer_edge_strip_y');
  return clamp(y ?? defaultY, top, Math.max(top, maxY));
};

export const saveEdgeStripY = (y: number) => {
  localStorage.setItem('drawer_edge_strip_y', String(Math.round(y)));
};
