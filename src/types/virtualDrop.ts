export type VirtualDropStatus =
  | 'queued'
  | 'inspecting'
  | 'reading'
  | 'writing'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type VirtualDropPayload = {
  job_id?: string;
  jobId?: string;
  status?: VirtualDropStatus;
  file_name?: string | null;
  fileName?: string | null;
  loaded?: number;
  total?: number | null;
  progress?: number | null;
  message?: string | null;
  path?: string | null;
  paths?: string[];
};

export type VirtualDropUiJob = {
  id: string;
  status: VirtualDropStatus;
  fileName: string;
  loaded: number;
  total?: number;
  progress?: number;
  message?: string;
  createdAt: number;
};
