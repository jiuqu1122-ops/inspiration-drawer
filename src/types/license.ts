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

export type CloudAccountSummary = {
  email?: string | null;
  displayName?: string | null;
  wallet: CloudWalletSummary;
};

export type CloudImageModelsResult = {
  provider: string;
  defaultModel?: string | null;
  models: string[];
  channels?: Array<{
    id: string;
    name: string;
    provider: string;
    defaultModel?: string | null;
    models: string[];
    capabilities?: string[];
    error?: string | null;
  }>;
  videoChannels?: Array<{
    id: string;
    name: string;
    provider: string;
    defaultModel?: string | null;
    models?: string[];
    capabilities?: string[];
    error?: string | null;
  }>;
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
