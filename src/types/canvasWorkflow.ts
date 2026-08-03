import type { CanvasImageItem } from '../features/canvasModel';

export type CanvasWorkflowValidationResult = {
  errors: string[];
  warnings: string[];
};

export type CanvasWorkflowRunStatus =
  | 'idle'
  | 'waiting'
  | 'ready'
  | 'running'
  | 'success'
  | 'failed'
  | 'skipped';

export type CanvasWorkflowExpandedGroup = {
  groupId: string;
  templateId: string;
  workflowId: string;
  workflowLabel: string;
  workflowHint: string;
  workflowBuiltin?: boolean;
  module: CanvasImageItem;
  expandedAt: number;
};

export type CanvasAiPromptPreset = {
  id: string;
  label: string;
  hint: string;
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  outputFormat?: string;
  count?: number;
};
