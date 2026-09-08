import {
  CHAT_AUTOMATIC_MODEL,
  isAutomaticChatModel,
  normalizeChatModelSelection,
} from './chatModelSelection';

export type AgentModelUsageContext =
  | 'chat'
  | 'workflow'
  | 'canvas_text_agent'
  | 'inspiration_analysis'
  | 'three_scene_analysis'
  | 'prompt_optimization'
  | 'system_internal';

export type AgentModelResolution = {
  requestedModel?: string;
  resolvedModel: string;
  fallbackUsed: boolean;
  fallbackReason?: 'not_in_available_models';
};

type AgentModelAliases = Readonly<Record<string, string>>;

let cachedAvailableAgentModels: string[] | null = null;

const normalizeAvailableModels = (models?: readonly string[] | null) => {
  if (!models || models.length === 0) return [];
  const seen = new Set<string>();
  return models.flatMap(value => {
    const model = normalizeChatModelSelection(value);
    const key = model.toLowerCase();
    if (!model || seen.has(key)) return [];
    seen.add(key);
    return [model];
  });
};

export const cacheAvailableAgentModels = (models?: readonly string[] | null) => {
  const available = normalizeAvailableModels(models);
  if (available.length > 0) cachedAvailableAgentModels = available;
  return available;
};

export const clearAvailableAgentModels = () => {
  cachedAvailableAgentModels = null;
};

export const getAvailableAgentModels = () => (
  cachedAvailableAgentModels ? [...cachedAvailableAgentModels] : null
);

export const resolveValidAgentModel = (input: {
  savedModel?: string | null;
  availableModels?: readonly string[] | null;
  usageContext: AgentModelUsageContext;
  fallbackModel?: string | null;
  aliases?: AgentModelAliases;
}): AgentModelResolution => {
  const savedModel = normalizeChatModelSelection(input.savedModel);
  const fallbackModel = normalizeChatModelSelection(input.fallbackModel) || CHAT_AUTOMATIC_MODEL;
  if (!savedModel || isAutomaticChatModel(savedModel)) {
    return {
      requestedModel: undefined,
      resolvedModel: fallbackModel,
      fallbackUsed: false,
    };
  }

  const availableModels = normalizeAvailableModels(
    input.availableModels === undefined ? cachedAvailableAgentModels : input.availableModels,
  );
  // An empty catalog means that availability has not been established. Keep
  // the concrete selection until a successful, non-empty refresh proves stale.
  if (availableModels.length === 0) {
    return {
      requestedModel: savedModel,
      resolvedModel: savedModel,
      fallbackUsed: false,
    };
  }

  const exact = availableModels.find(model => model.toLowerCase() === savedModel.toLowerCase());
  if (exact) {
    return {
      requestedModel: exact,
      resolvedModel: exact,
      fallbackUsed: false,
    };
  }

  const alias = Object.entries(input.aliases || {})
    .find(([value]) => value.toLowerCase() === savedModel.toLowerCase())?.[1];
  const canonicalAlias = alias
    ? availableModels.find(model => model.toLowerCase() === alias.trim().toLowerCase())
    : undefined;
  if (canonicalAlias) {
    return {
      requestedModel: canonicalAlias,
      resolvedModel: canonicalAlias,
      fallbackUsed: false,
    };
  }

  return {
    requestedModel: undefined,
    resolvedModel: fallbackModel,
    fallbackUsed: true,
    fallbackReason: 'not_in_available_models',
  };
};

const errorText = (error: unknown) => {
  const values: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 3 || value === null || value === undefined) return;
    if (typeof value === 'string' || typeof value === 'number') {
      values.push(String(value));
      return;
    }
    if (value instanceof Error) {
      values.push(value.name, value.message);
      visit((value as Error & { cause?: unknown }).cause, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    ['code', 'message', 'error', 'detail', 'details', 'status'].forEach(key => {
      if (key in record) visit(record[key], depth + 1);
    });
  };
  visit(error, 0);
  return values.join(' ');
};

const structuredErrorCodes = (error: unknown) => {
  const codes: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 3 || value === null || value === undefined) return;
    if (value instanceof Error) {
      visit((value as Error & { cause?: unknown }).cause, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.code === 'string') codes.push(record.code.trim());
    visit(record.error, depth + 1);
    visit(record.details, depth + 1);
  };
  visit(error, 0);
  return codes;
};

export const isAgentModelFallbackExhaustedError = (error: unknown) => (
  /MODEL_FALLBACK_EXHAUSTED/i.test(errorText(error))
);

export const isUnavailableChatModelError = (error: unknown) => {
  const text = errorText(error);
  if (!text || isAgentModelFallbackExhaustedError(error)) return false;
  if (/\b(?:500|501|502|503|504|524)\b|timed?\s*out|timeout|network|connection|internal server|\u8d85\u65f6/i.test(text)) {
    return false;
  }
  if (structuredErrorCodes(error).some(code => (
    /^(?:MODEL_NOT_AVAILABLE|MODEL_NOT_FOUND|MODEL_DISABLED|UNSUPPORTED_MODEL|STALE_MODEL)$/i.test(code)
  ))) {
    return true;
  }
  if (
    /unauthori[sz]ed|forbidden|invalid api|authentication|insufficient.{0,16}(?:balance|credit)|quota|rate.?limit|\u8ba4\u8bc1|\u9274\u6743|\u4f59\u989d|\u914d\u989d/i.test(text)
  ) {
    return false;
  }
  return /\b(?:MODEL_NOT_AVAILABLE|MODEL_NOT_FOUND|MODEL_DISABLED|UNSUPPORTED_MODEL|STALE_MODEL)\b|unknown chat model|model not found|unsupported model|disabled model|stale chat model|model (?:is |was )?disabled/i.test(text);
};

const isInternalAgentModelContext = (context: AgentModelUsageContext) => context !== 'chat';

const createFallbackExhaustedError = (error: unknown) => {
  const text = errorText(error).trim() || 'chat model fallback failed';
  return new Error(`MODEL_FALLBACK_EXHAUSTED: ${text}`);
};

export const runInternalAgentModelRequest = async <T>(input: {
  savedModel?: string | null;
  availableModels?: readonly string[] | null;
  usageContext: Exclude<AgentModelUsageContext, 'chat'>;
  fallbackModel?: string | null;
  aliases?: AgentModelAliases;
  requestId: string;
  createRequestId: () => string;
  request: (request: {
    requestId: string;
    model?: string;
    usageContext: Exclude<AgentModelUsageContext, 'chat'>;
  }) => Promise<T>;
  onFallback?: (resolution: AgentModelResolution) => void;
  log?: (message: string, detail: Record<string, string>) => void;
}): Promise<T> => {
  const resolution = resolveValidAgentModel(input);
  const log = input.log || ((message: string, detail: Record<string, string>) => console.warn(message, detail));
  const logFallback = (reason: string, requestId: string, fallbackTarget: string) => {
    log('[agent-model-fallback]', {
      context: input.usageContext,
      savedModel: normalizeChatModelSelection(input.savedModel) || '(empty)',
      reason,
      fallbackTarget,
      requestId,
    });
  };

  if (resolution.fallbackUsed) {
    logFallback(
      resolution.fallbackReason || 'not_in_available_models',
      input.requestId,
      resolution.resolvedModel,
    );
    input.onFallback?.(resolution);
  }

  // `default` remains an automatic routing alias, not a concrete model. It is
  // sent for compatibility with older Rust builds that otherwise substitute a
  // stale configured model when the field is omitted.
  const initialTransportModel = resolution.requestedModel || CHAT_AUTOMATIC_MODEL;
  try {
    return await input.request({
      requestId: input.requestId,
      model: initialTransportModel,
      usageContext: input.usageContext,
    });
  } catch (error) {
    if (
      !resolution.requestedModel
      || !isInternalAgentModelContext(input.usageContext)
      || !isUnavailableChatModelError(error)
    ) {
      throw error;
    }
    const fallbackRequestId = input.createRequestId();
    const fallbackResolution: AgentModelResolution = {
      requestedModel: undefined,
      resolvedModel: normalizeChatModelSelection(input.fallbackModel) || CHAT_AUTOMATIC_MODEL,
      fallbackUsed: true,
      fallbackReason: 'not_in_available_models',
    };
    logFallback('provider_rejected_model', fallbackRequestId, fallbackResolution.resolvedModel);
    input.onFallback?.(fallbackResolution);
    try {
      return await input.request({
        requestId: fallbackRequestId,
        model: CHAT_AUTOMATIC_MODEL,
        usageContext: input.usageContext,
      });
    } catch (fallbackError) {
      throw createFallbackExhaustedError(fallbackError);
    }
  }
};
