export const APP_FONT_SIZE_STORAGE_KEY = 'drawer_app_font_size';

/**
 * Keep the UI typography within a deliberately small range. The smallest
 * option is the current UI size and remains the default for existing users.
 */
export const APP_FONT_SIZE_OPTIONS = [
  { value: 'small', label: '小号', scale: 1 },
  { value: 'medium', label: '标准', scale: 1.1 },
  { value: 'large', label: '大号', scale: 1.2 },
] as const;

export type AppFontSize = (typeof APP_FONT_SIZE_OPTIONS)[number]['value'];

export const DEFAULT_APP_FONT_SIZE: AppFontSize = 'small';

export function normalizeAppFontSize(value: unknown): AppFontSize {
  return APP_FONT_SIZE_OPTIONS.some(option => option.value === value)
    ? value as AppFontSize
    : DEFAULT_APP_FONT_SIZE;
}

export function getAppFontScale(value: unknown): number {
  const normalized = normalizeAppFontSize(value);
  return APP_FONT_SIZE_OPTIONS.find(option => option.value === normalized)?.scale ?? 1;
}
