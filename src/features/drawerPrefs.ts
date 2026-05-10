import { clamp } from './common';

export const DEFAULT_DRAWER_WIDTH = 560;
export const DEFAULT_DRAWER_HEIGHT = 800;
export const MIN_DRAWER_WIDTH = 360;
export const MAX_DRAWER_WIDTH = Math.max(420, window.screen.availWidth - 120);
export const MIN_DRAWER_HEIGHT = 220;
export const MAX_DRAWER_HEIGHT = Math.max(500, window.screen.availHeight);
export const DRAWER_ANIM_MS = 350;
export const DRAWER_SIZE_DEFAULT_VERSION = '2026-05-default-width-560';
export const DRAWER_SIDE_RAIL_WIDTH = 64;
export const DRAWER_CONTENT_X_PADDING = 32;
export const CALENDAR_COMPACT_DRAWER_WIDTH = 480;
export const CALENDAR_COMPACT_CANVAS_WIDTH = CALENDAR_COMPACT_DRAWER_WIDTH - DRAWER_SIDE_RAIL_WIDTH - DRAWER_CONTENT_X_PADDING;

export const migrateDrawerSizeDefaults = () => {
  if (localStorage.getItem('drawer_size_default_version') === DRAWER_SIZE_DEFAULT_VERSION) return;

  const savedWidth = Number(localStorage.getItem('drawer_width'));
  if (!savedWidth || Number.isNaN(savedWidth) || Math.abs(savedWidth - 400) <= 2) {
    localStorage.removeItem('drawer_width');
  }
  localStorage.setItem('drawer_size_default_version', DRAWER_SIZE_DEFAULT_VERSION);
};

export const getStoredDrawerSize = () => {
  migrateDrawerSizeDefaults();
  return {
    width: clamp(Number(localStorage.getItem('drawer_width')) || DEFAULT_DRAWER_WIDTH, MIN_DRAWER_WIDTH, MAX_DRAWER_WIDTH),
    height: clamp(Number(localStorage.getItem('drawer_height')) || DEFAULT_DRAWER_HEIGHT, MIN_DRAWER_HEIGHT, MAX_DRAWER_HEIGHT),
  };
};
