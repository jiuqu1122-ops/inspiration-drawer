export type BrowserKind = 'chrome' | 'edge';

export type BrowserExtensionStatusKind =
  | 'not_detected'
  | 'browser_not_installed'
  | 'extension_not_installed'
  | 'installing'
  | 'waiting_for_browser_confirmation'
  | 'waiting_for_pairing'
  | 'connected'
  | 'temporarily_disconnected'
  | 'outdated'
  | 'error';

export type BrowserDetection = {
  browser: BrowserKind;
  installed: boolean;
  executablePath?: string | null;
  version?: string | null;
  extensionSupported: boolean;
};

export type BrowserExtensionConnectionStatus = {
  browser: BrowserKind;
  status: BrowserExtensionStatusKind;
  extensionId?: string | null;
  extensionVersion?: string | null;
  lastSeen?: number | null;
  message?: string | null;
};

export type BrowserExtensionStatusSnapshot = {
  browsers: BrowserDetection[];
  extensions: BrowserExtensionConnectionStatus[];
  bridgePort?: number | null;
  protocolVersion: number;
  desktopVersion: string;
  preparedExtensionPath?: string | null;
};

export type BrowserExtensionInstallResult = {
  browser: BrowserKind;
  mode: 'store' | 'development';
  status: BrowserExtensionStatusKind;
  preparedExtensionPath: string;
  openedUrl: string;
  instruction: string;
};

export type BrowserExtensionDragPayload = {
  dragId: string;
  browser: BrowserKind;
  extensionId: string;
  kind: 'url' | 'blob' | 'data';
  imageUrl?: string | null;
  dataUrl?: string | null;
  localPath?: string | null;
  pageUrl?: string | null;
  pageTitle?: string | null;
  imageTitle?: string | null;
  alt?: string | null;
  width?: number | null;
  height?: number | null;
  sourceType: 'img' | 'picture' | 'srcset' | 'background' | 'lazy' | 'blob' | 'data';
};

export type BrowserExtensionDropContext = {
  target: 'drawer' | 'canvas';
  clientX?: number;
  clientY?: number;
  folderId?: string;
};
