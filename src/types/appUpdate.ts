export type AppUpdateProgress = {
  progressId?: string;
  stage?: string;
  message?: string;
  updaterKind?: string | null;
  manifestEndpoint?: string | null;
  statusCode?: number | null;
  version?: string | null;
  currentVersion?: string | null;
  available?: boolean | null;
  sourceName?: string | null;
  sourceUrl?: string | null;
  selectedUrl?: string | null;
  errorMessage?: string | null;
  loaded?: number;
  total?: number;
  progress?: number;
};

export type AppUpdateInstallResult = {
  available: boolean;
  version?: string | null;
  installed: boolean;
};
