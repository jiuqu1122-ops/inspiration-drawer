import type { DetailPageRenderMode, DetailPageSpec, DetailPageStatus } from '../pageLayout/detailPageLayoutTypes';
import type { ImagePolicy } from '../imageQuality/imageRuleCapsules';

export type WorkflowLanguage = 'follow_user' | 'zh-CN' | 'en' | 'bilingual';

export interface WorkflowTextPolicy {
  promptLanguage: WorkflowLanguage;
  visibleTextLanguage: WorkflowLanguage;
  imageTextLanguage: WorkflowLanguage;
  allowEnglishTechnicalTerms: boolean;
}

export interface WorkflowOutputSpec {
  id: string;
  title: string;
  type: 'image_generator' | 'video_generator' | 'text_agent';
  enabled: boolean;
  order: number;
  aspectRatio?: string | null;
  targetSize?: string | null;
  resolution?: string | null;
  provider?: string | null;
  model?: string | null;
  prompt: string;
  inputRoles: string[];
  requiresReferenceImages?: boolean;
  editable: boolean;
  uniqueSellingPoint?: string;
  pageSpec?: DetailPageSpec;
  status?: DetailPageStatus;
  imageTextLanguage?: WorkflowLanguage;
  renderMode?: DetailPageRenderMode;
  imagePolicy?: ImagePolicy;
}

export interface WorkflowRecipeDraft {
  id: string;
  name: string;
  description: string;
  templateId?: string;
  languagePolicy: WorkflowTextPolicy;
  inputs: Array<{
    id: string;
    label: string;
    type: 'image' | 'text' | 'file';
    required: boolean;
  }>;
  strategy?: {
    enabled: boolean;
    mode: 'enabled' | 'disabled';
    title: string;
    prompt: string;
  };
  outputs: WorkflowOutputSpec[];
  metadata: {
    originalRequest: string;
    createdBy: 'app-agent';
    editable: true;
    [key: string]: unknown;
  };
}
