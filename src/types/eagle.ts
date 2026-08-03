export type EagleImportStatus = {
  phase: 'idle' | 'checking' | 'reading' | 'importing' | 'caching' | 'done' | 'error';
  message: string;
  total: number;
  imported: number;
  cached: number;
  failed: number;
  startedAt?: number;
  updatedAt?: number;
  diagnostics?: EagleConnectionDiagnostics;
};

export type EagleApiVersion = 'v2' | 'v1';

export type EagleConnectionDiagnostics = {
  eagleOpen: boolean;
  portAccessible: boolean;
  libraryOpen: boolean | null;
  apiVersion?: EagleApiVersion;
  v2Error?: string;
  v1Error?: string;
  libraryError?: string;
};

export type EagleDetectionResult = EagleConnectionDiagnostics & {
  baseUrl?: string;
  libraryInfo?: any;
};

export type EagleOfflineLibraryPayload = {
  library?: { name?: string; path?: string };
  folders?: EagleFolderPayload[];
  items?: EagleItemPayload[];
};

export type EagleFolderPayload = {
  id?: string;
  name?: string;
  parent?: string;
  parentId?: string;
  children?: EagleFolderPayload[];
};

export type EagleItemPayload = Record<string, any>;
