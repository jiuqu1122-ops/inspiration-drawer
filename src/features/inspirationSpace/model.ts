export const INSPIRATION_SPACE_API_BASE_URL = 'https://api.unmind.art';

export type InspirationShareKind = 'NODE_PRESET' | 'WORKFLOW' | 'PROMPT';

export type InspirationSharePreview = {
  id: string;
  url: string;
  width: number;
  height: number;
};

export type InspirationShare = {
  id: string;
  kind: InspirationShareKind;
  title: string;
  description: string | null;
  prompt?: string | null;
  authorName: string;
  tags: string[];
  fileName: string;
  downloadCount: number;
  createdAt: string;
  previews: InspirationSharePreview[];
};

export type InspirationSpaceTemplateKind = Extract<InspirationShareKind, 'NODE_PRESET' | 'WORKFLOW'>;

export type InspirationSpaceTemplateOption = {
  id: string;
  label: string;
  hint: string;
  kind: InspirationSpaceTemplateKind;
  builtin?: boolean;
};

export type InspirationSpacePreparedTemplate = {
  label: string;
  kind: InspirationSpaceTemplateKind;
  payload: unknown;
};

export type InspirationSpaceDrawerImageOption = {
  id: string;
  name: string;
  source: string;
  preview: string;
  origin: 'DRAWER' | 'GENERATED';
  createdAt: number;
  width?: number;
  height?: number;
};

export type PromptSharePayload = {
  type: 'inspiration-drawer-prompt-share';
  version: number;
  title?: string;
  prompt: string;
};

export const isPromptSharePayload = (value: unknown): value is PromptSharePayload => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return record.type === 'inspiration-drawer-prompt-share'
    && typeof record.prompt === 'string'
    && record.prompt.trim().length > 0;
};
