export type CollectedWebImage = {
  title: string;
  imageUrl: string;
  pageUrl?: string;
  path: string;
};

export type WebImageCollectorReference = {
  source: string;
  name: string;
  preview?: string;
  itemId?: string;
  pageUrl?: string;
  pageTitle?: string;
};

export type WebImageSearchDescription = {
  query: string;
  source: 'ollama' | 'siliconflow';
  tags?: string[];
  subject?: string;
  style?: string;
};

export type LocalVisionModelProgressPayload = {
  stage?: string;
  message?: string;
  file?: string | null;
  loaded?: number;
  total?: number;
  progress?: number;
};

export type LocalVisionModelDownloadState = {
  visible: boolean;
  message: string;
  progress: number;
  phase: 'idle' | 'downloading' | 'loading' | 'ready' | 'error';
  startedAt?: number;
  updatedAt?: number;
};

export type LocalVisionModelStatusPayload = {
  ready?: boolean;
  model?: string;
  progress?: number;
};
