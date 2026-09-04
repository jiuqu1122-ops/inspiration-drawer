import { invoke } from '@tauri-apps/api/core';

export type DesktopPlatform = 'windows' | 'macos' | 'linux' | 'unknown';

export type PlatformCapabilities = {
  platform: DesktopPlatform;
  nativeFileDrag: boolean;
  nativeDrop: boolean;
  virtualDrop: boolean;
  browserExtensionAutoInstall: boolean;
  browserExtensionBridge: boolean;
  globalShortcut: boolean;
  autoStart: boolean;
  autoUpdater: boolean;
  managedCodex: boolean;
  cloudflaredTunnel: boolean;
  localMediaEngines: boolean;
};

export const FALLBACK_PLATFORM_CAPABILITIES: PlatformCapabilities = {
  platform: 'unknown',
  nativeFileDrag: false,
  nativeDrop: false,
  virtualDrop: false,
  browserExtensionAutoInstall: false,
  browserExtensionBridge: false,
  globalShortcut: false,
  autoStart: false,
  autoUpdater: false,
  managedCodex: false,
  cloudflaredTunnel: false,
  localMediaEngines: false,
};

let cachedCapabilities: PlatformCapabilities | null = null;
let capabilitiesRequest: Promise<PlatformCapabilities> | null = null;

const normalizeCapabilities = (value: Partial<PlatformCapabilities> | null | undefined): PlatformCapabilities => ({
  ...FALLBACK_PLATFORM_CAPABILITIES,
  ...value,
  platform: value?.platform || 'unknown',
});

export const loadPlatformCapabilities = async (): Promise<PlatformCapabilities> => {
  if (cachedCapabilities) return cachedCapabilities;
  if (!capabilitiesRequest) {
    capabilitiesRequest = invoke<PlatformCapabilities>('get_platform_capabilities')
      .then(normalizeCapabilities)
      .catch(error => {
        console.warn('platform capability detection failed:', error);
        return FALLBACK_PLATFORM_CAPABILITIES;
      })
      .then(value => {
        cachedCapabilities = value;
        return value;
      });
  }
  return capabilitiesRequest;
};

export const getCachedPlatformCapabilities = () => cachedCapabilities;

type ModifierEvent = { ctrlKey: boolean; metaKey: boolean };

export const isPrimaryModifier = (event: ModifierEvent) => {
  const platform = cachedCapabilities?.platform || 'unknown';
  if (platform === 'macos') return event.metaKey;
  if (platform === 'windows' || platform === 'linux') return event.ctrlKey;
  return event.ctrlKey || event.metaKey;
};

export const platformShortcutLabel = (shortcut: string) => {
  if (cachedCapabilities?.platform !== 'macos') return shortcut;

  return shortcut
    .replace(/\b(?:Ctrl|Control|Command|Cmd)\b\s*\+\s*/gi, '⌘')
    .replace(/\b(?:Alt|Option)\b\s*\+\s*/gi, '⌥')
    .replace(/\bShift\b\s*\+\s*/gi, '⇧')
    .replace(/\b(?:Backspace|Delete)\b/gi, '⌫');
};

export const unsupportedPlatformMessage = (feature: string) => {
  const platform = cachedCapabilities?.platform;
  if (platform === 'macos') return `此功能暂未支持 macOS：${feature}`;
  return `当前平台暂不支持此功能：${feature}`;
};

export const resetPlatformCapabilitiesForTest = () => {
  cachedCapabilities = null;
  capabilitiesRequest = null;
};
