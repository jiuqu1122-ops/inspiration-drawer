export const INSPIRATION_REFERENCE_ROLES = [
  'FORM_REF',
  'CMF_REF',
  'STRUCTURE_REF',
  'INTERACTION_REF',
  'MOOD_REF',
  'SUBJECT_REF',
] as const;

export type InspirationReferenceRole = typeof INSPIRATION_REFERENCE_ROLES[number];

export interface InspirationProfile {
  itemId: string;
  summary: string;
  objects: string[];
  category: string;
  form: {
    silhouette: string[];
    geometry: string[];
    proportion: string[];
  };
  cmf: {
    colors: string[];
    materials: string[];
    finishes: string[];
  };
  style: string[];
  interaction: string[];
  scene: string[];
  mood: string[];
  userTags: string[];
  userNotes: string[];
}

export interface DrawerSearchInspirationsInput {
  query: string;
  projectBrief: string | Record<string, unknown>;
  referenceRole?: InspirationReferenceRole;
  folderIds?: string[];
  folderNames?: Record<string, string>;
  topK?: number;
}

export type InspirationCandidateState = 'candidate' | 'selected' | 'rejected';

export interface InspirationCandidate {
  itemId: string;
  summary: string;
  reason: string;
  matchedFeatures: string[];
  recommendedRole: InspirationReferenceRole;
  confidence: number;
  state: InspirationCandidateState;
  folderId?: string;
  folderName?: string;
  llmRanked?: boolean;
  llmRecommended?: boolean;
}

export type DrawerInspirationMatch = InspirationCandidate;

export interface DesignReferencePlanItem {
  itemId: string;
  role: InspirationReferenceRole;
  reason: string;
  matchedFeatures?: string[];
  confidence?: number;
}

export interface DesignReferencePlan {
  references: DesignReferencePlanItem[];
}

export type InspirationAnalysisJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface InspirationAnalysisError {
  itemId: string;
  error: string;
}

export interface InspirationAnalysisJob {
  jobId: string;
  status: InspirationAnalysisJobStatus;
  completed: number;
  total: number;
  errors: InspirationAnalysisError[];
  currentItemId?: string;
  createdAt: number;
  updatedAt: number;
}
