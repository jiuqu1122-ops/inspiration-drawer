import type { AiGatewayKind } from '../features/agentModel';
import type { CanvasAiCreditPricing } from '../features/canvasGenerationCredits';

export type LicenseState = 'unlicensed' | 'trial' | 'pro' | 'enterprise' | 'expired';

export type LicenseEdition = 'trial' | 'pro' | 'enterprise';

export type LicenseErrorCode =
  | 'not_licensed'
  | 'malformed_license'
  | 'invalid_signature'
  | 'machine_mismatch'
  | 'product_mismatch'
  | 'expired'
  | 'feature_not_licensed'
  | 'io_error'
  | 'invalid_public_key';

export type LicenseStatus = {
  state: LicenseState;
  valid: boolean;
  machine_id: string;
  customer?: string | null;
  edition?: LicenseEdition | null;
  expire_at?: string | null;
  features: string[];
  needs_email_registration: boolean;
  ai_access?: {
    mode: 'byok' | 'license_managed';
    allow_user_api: boolean;
    managed_gateway_kind?: AiGatewayKind | null;
    managed_provider?: string | null;
    managed_base_url?: string | null;
    managed_model?: string | null;
    api_key_last4?: string | null;
    canvas_gateway_kind?: AiGatewayKind | null;
    canvas_provider?: string | null;
    canvas_base_url?: string | null;
    canvas_model?: string | null;
    canvas_api_key_last4?: string | null;
  } | null;
  message?: string | null;
  error_code?: LicenseErrorCode | null;
};

export type CloudWalletSummary = {
  availableCredits: string;
  reservedCredits: string;
  lifetimeGranted: string;
  lifetimeConsumed: string;
};

export type CloudMembershipQuota = {
  type: 'IMAGE_COUNT' | 'LLM_TOKENS';
  canonicalModelId: string;
  modelName: string;
  period: 'DAILY' | 'MONTHLY';
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
};

export type CloudAccountSummary = {
  email?: string | null;
  displayName?: string | null;
  wallet: CloudWalletSummary;
  membership?: {
    id: string;
    status: string;
    startsAt: string;
    expiresAt: string;
    source?: string | null;
    plan: { id: string; code: string; name: string; description?: string | null };
    /** Older account servers and locally cached snapshots may omit this field. */
    quotas?: CloudMembershipQuota[];
  } | null;
  referral?: {
    inviteCode: string;
    bound?: boolean;
    canBind?: boolean;
    bindBlockedReason?: string | null;
  } | null;
};

export type CloudCreditUsageEntry = {
  id: string;
  requestId?: string | null;
  type: string;
  amount: string;
  balanceAfter: string;
  description?: string | null;
  createdAt: string;
};

export type CloudCreditUsageResult = {
  items: CloudCreditUsageEntry[];
  nextCursor?: string | null;
};

export type AiModelModality = 'chat' | 'image' | 'video';

/**
 * Public, server-owned model behaviour. This intentionally contains no
 * provider credentials or private upstream route identifiers.
 */
export type AiModelCapabilities = {
  resolutions?: string[];
  defaultResolution?: string;
  aspectRatios?: string[];
  aspectRatioMode?: 'list' | 'any' | 'unspecified';
  defaultAspectRatio?: string;
  aspectRatiosByResolution?: Record<string, string[]>;
  durations?: number[];
  durationMode?: 'list' | 'range' | 'fixed';
  durationRange?: { min: number; max: number; step?: number };
  defaultDurationSeconds?: number;
  maxReferenceImages?: number;
  maxReferenceVideos?: number;
  maxReferenceAudios?: number;
  minReferenceImages?: number;
  minReferenceVideos?: number;
  minReferenceAudios?: number;
  supportsReferenceImages?: boolean;
  supportsReferenceVideo?: boolean;
  supportsReferenceAudio?: boolean;
  supportsAudioReference?: boolean;
  supportsFirstFrame?: boolean;
  supportsLastFrame?: boolean;
  supportsFirstLastFrame?: boolean;
  supportedInputModes?: string[];
  supportedOutputFormats?: string[];
  supportsTransparentBackground?: boolean;
  maxOutputs?: number;
};

export type AiCatalogModel = {
  id: string;
  displayName: string;
  modality: AiModelModality;
  /** Exact aliases are server-owned; the client never fuzzy-matches them. */
  aliases?: string[];
  capabilities?: AiModelCapabilities;
  enabled?: boolean;
  visible?: boolean;
  isDefault?: boolean;
};

export type AiModelCapabilitiesById = Record<string, AiModelCapabilities>;

export type CloudModelChannel = {
  id: string;
  name: string;
  provider: string;
  defaultModel?: string | null;
  models?: string[];
  /** Legacy channel feature flags. */
  capabilities?: string[];
  /** Optional safe, route-specific structured overrides keyed by exact model id. */
  modelCapabilities?: AiModelCapabilitiesById;
  error?: string | null;
};

export type CloudImageModelsResult = {
  provider: string;
  defaultModel?: string | null;
  defaultImageModel?: string | null;
  defaultVideoModel?: string | null;
  models: string[];
  /** New servers return a public canonical catalog. Older servers omit it. */
  catalog?: AiCatalogModel[];
  /** Transitional response shape for servers extending the existing endpoint. */
  capabilities?: AiModelCapabilitiesById;
  channels?: Array<CloudModelChannel & { models: string[] }>;
  videoChannels?: CloudModelChannel[];
  pricing?: CanvasAiCreditPricing | null;
};

export type CreditRedemptionResult = {
  redeemedCredits: string;
  account: CloudAccountSummary;
};

export type EmailCodeChallenge = {
  challengeId: string;
  expiresIn: number;
  resendAfter: number;
};
