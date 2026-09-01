import { invoke } from '@tauri-apps/api/core';
import type {
  BrowserExtensionInstallResult,
  BrowserExtensionStatusSnapshot,
  BrowserKind,
} from './types';

export const getBrowserExtensionStatus = () => (
  invoke<BrowserExtensionStatusSnapshot>('browser_extension_get_status')
);

export const beginBrowserExtensionInstall = (browser: BrowserKind) => (
  invoke<BrowserExtensionInstallResult>('browser_extension_begin_install', { browser })
);

export const retryBrowserExtensionPairing = (browser: BrowserKind) => (
  invoke<BrowserExtensionStatusSnapshot>('browser_extension_retry_pairing', { browser })
);

export const openBrowserExtensionPage = (browser: BrowserKind) => (
  invoke<void>('browser_extension_open_extension_page', { browser })
);

export const openPreparedBrowserExtensionFolder = () => (
  invoke<string>('browser_extension_open_prepared_folder')
);
