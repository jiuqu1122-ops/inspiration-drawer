export type EagleImportStatus = {
  phase: 'idle' | 'checking' | 'reading' | 'importing' | 'caching' | 'done' | 'error';
  message: string;
  total: number;
  imported: number;
  processed: number;
  skipped: number;
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
  libraryInfo?: {
    name?: string;
    path?: string;
    [key: string]: unknown;
  };
};

export type EagleImportMode = 'reference' | 'copy';

export type EagleOfflineLibraryStart = {
  sessionId: string;
  library: { name?: string; path?: string };
  folders?: EagleFolderPayload[];
  total: number;
};

export type EagleOfflineLibraryPage = {
  items: EagleItemPayload[];
  failures: Array<{ filePath: string; reason: string }>;
  scanned: number;
  total: number;
  done: boolean;
};

export type EagleFolderPayload = {
  id?: string;
  name?: string;
  parent?: string;
  parentId?: string;
  children?: EagleFolderPayload[];
};

export type EagleItemPayload = {
  id?: string | number;
  _id?: string | number;
  name?: string;
  ext?: string;
  extension?: string;
  filePath?: string;
  path?: string;
  url?: string;
  metadataFilePath?: string;
  thumbnailPath?: string;
  thumbPath?: string;
  previewPath?: string;
  folders?: unknown;
  folderIds?: unknown;
  folderId?: unknown;
  folder?: unknown;
  tags?: unknown[];
  annotation?: string;
  importedAt?: string | number;
  createdAt?: string | number;
  modificationTime?: string | number;
  modifiedAt?: string | number;
  sourceAvailability?: string;
  [key: string]: unknown;
};
