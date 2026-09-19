import type { AiCatalogModel,CloudImageModelsResult } from '../types/license';
import {
  findAiCatalogModel,
  getAiCatalogModels,
  hasServerAiCatalog,
  reconcileStaleCanvasAiModels,
  resolveVideoModelCapabilities,
  type ResolvedVideoModelCapabilities,
} from './aiModelCapabilities';
import {
  getCanvasAiVideoModelCandidates,
  resolveCanvasAiVideoModelCapabilities,
} from './canvasAiImage';
import type {
  CanvasAiCredentialSource,
  CanvasAiItemData,
  CanvasAiModelCandidate,
  CanvasImageItem,
} from './canvasModel';

export type CanvasWalletVideoCapabilityStatus = 'legacy' | 'resolved' | 'unresolved';

export type CanvasWalletVideoModelContext = {
  serverDriven: boolean;
  capabilityStatus: CanvasWalletVideoCapabilityStatus;
  canonicalModelId?: string;
  catalogModel?: AiCatalogModel;
  capabilities: ResolvedVideoModelCapabilities;
  pricingModelId?: string;
  providerCandidates: CanvasAiModelCandidate[];
  selectedCandidate?: CanvasAiModelCandidate;
};

const hasCapabilities = (value: unknown) => Boolean(
  value && typeof value === 'object' && Object.keys(value).length > 0,
);

const unresolvedServerCapabilities = () => resolveVideoModelCapabilities({
  canonical: {
    resolutions: [],
    durations: [],
    aspectRatios: [],
    aspectRatioMode: 'unspecified',
    maxReferenceImages: 0,
    maxReferenceVideos: 0,
    maxReferenceAudios: 0,
    minReferenceImages: 0,
    minReferenceVideos: 0,
    minReferenceAudios: 0,
    supportsReferenceImages: false,
    supportsReferenceVideo: false,
    supportsReferenceAudio: false,
    supportsFirstFrame: false,
    supportsLastFrame: false,
    supportsFirstLastFrame: false,
    supportsTextPrompt: false,
    supportedInputModes: [],
    maxOutputs: 1,
  },
});

const resolveCanonicalCatalogModel = (
  catalog: readonly AiCatalogModel[],
  ai?: Partial<CanvasAiItemData> | null,
) => {
  const candidates = ai?.providerCandidates || [];

  // 1. A route snapshot with an explicit canonical id is the strongest
  // identity. Ignore stale ids and continue through the remaining exact rules.
  for (const candidate of candidates) {
    const match = catalog.find(model => model.id === String(candidate.canonicalModelId || '').trim());
    if (match) return match;
  }

  const storedModel = String(ai?.model || '').trim();

  // 2. The persisted model may already be the canonical public SKU.
  const exactCanonical = catalog.find(model => model.id === storedModel);
  if (exactCanonical) return exactCanonical;

  // 3. Old nodes may persist an explicit alias published by the catalog.
  const exactAlias = catalog.find(model => (model.aliases || []).includes(storedModel));
  if (exactAlias) return exactAlias;

  // 4. Finally use an exact saved upstream route/candidate mapping. There is
  // deliberately no fuzzy model-name or provider-name matching here.
  for (const candidate of candidates) {
    const match = findAiCatalogModel(catalog, candidate.model);
    if (match) return match;
  }

  return undefined;
};

const selectRouteCandidate = (
  candidates: readonly CanvasAiModelCandidate[],
  ai?: Partial<CanvasAiItemData> | null,
) => candidates.find(candidate => (
  candidate.provider === ai?.provider
  && (candidate.providerChannelId || '') === (ai?.providerChannelId || '')
)) || candidates.find(candidate => candidate.provider === ai?.provider)
  || candidates[0];

const warnedUnresolvedModels = new Set<string>();

const warnUnresolvedWalletVideoModel = (
  ai: Partial<CanvasAiItemData> | null | undefined,
  context: Pick<CanvasWalletVideoModelContext, 'canonicalModelId' | 'providerCandidates'>,
) => {
  if (!import.meta.env.DEV) return;
  const key = [
    ai?.model || '',
    context.canonicalModelId || '',
    ai?.provider || '',
    ai?.providerChannelId || '',
  ].join('\n');
  if (warnedUnresolvedModels.has(key)) return;
  warnedUnresolvedModels.add(key);
  console.warn('[wallet_video_capability_fallback]', {
    storedModel: ai?.model,
    canonicalModelId: context.canonicalModelId,
    provider: ai?.provider,
    providerChannelId: ai?.providerChannelId,
    candidateCanonicalIds: context.providerCandidates
      .map(candidate => candidate.canonicalModelId)
      .filter(Boolean),
  });
};

/**
 * Resolves one stable identity for wallet video capabilities, UI, persistence,
 * requests and pricing. Legacy model-name inference is only used when the
 * server catalog is absent or the node explicitly uses local credentials.
 */
export const resolveCanvasWalletVideoModelContext = (
  ai: Partial<CanvasAiItemData> | null | undefined,
  snapshot: CloudImageModelsResult | null | undefined,
  credentialSource: CanvasAiCredentialSource,
): CanvasWalletVideoModelContext => {
  const persistedCandidates = ai?.providerCandidates || [];
  const persistedCandidate = selectRouteCandidate(persistedCandidates, ai);
  const serverDriven = credentialSource === 'wallet'
    && ai?.credentialSource !== 'local'
    && hasServerAiCatalog(snapshot);

  if (!serverDriven) {
    return {
      serverDriven: false,
      capabilityStatus: 'legacy',
      capabilities: resolveCanvasAiVideoModelCapabilities({
        provider: persistedCandidate?.provider || ai?.provider,
        model: persistedCandidate?.model || ai?.model,
        route: persistedCandidate?.modelCapabilities,
      }),
      providerCandidates: persistedCandidates,
      selectedCandidate: persistedCandidate,
    };
  }

  const catalog = getAiCatalogModels(snapshot, 'video');
  const catalogModel = resolveCanonicalCatalogModel(catalog, ai);
  const providerCandidates = catalogModel
    ? getCanvasAiVideoModelCandidates(
      catalogModel.id,
      'wallet',
      ai?.provider,
      snapshot?.videoChannels,
      catalog,
    )
    : persistedCandidates;
  const selectedCandidate = selectRouteCandidate(providerCandidates, ai);
  const canonicalCapabilities = catalogModel?.capabilities;
  const routeCapabilities = selectedCandidate?.modelCapabilities;
  const capabilityStatus = catalogModel
    && (hasCapabilities(canonicalCapabilities) || hasCapabilities(routeCapabilities))
    ? 'resolved'
    : 'unresolved';
  const capabilities = capabilityStatus === 'resolved'
    ? resolveVideoModelCapabilities({
      canonical: canonicalCapabilities,
      route: routeCapabilities,
    })
    : unresolvedServerCapabilities();
  const context: CanvasWalletVideoModelContext = {
    serverDriven: true,
    capabilityStatus,
    canonicalModelId: catalogModel?.id,
    catalogModel,
    capabilities,
    pricingModelId: catalogModel?.id,
    providerCandidates,
    selectedCandidate,
  };
  if (capabilityStatus === 'unresolved') warnUnresolvedWalletVideoModel(ai, context);
  return context;
};

const candidatesEqual = (
  left: readonly CanvasAiModelCandidate[] | undefined,
  right: readonly CanvasAiModelCandidate[],
) => JSON.stringify(left || []) === JSON.stringify(right);

/** Applies successful catalog refreshes without touching node connections. */
export const reconcileCanvasWalletVideoModels = (
  items: CanvasImageItem[],
  snapshot: CloudImageModelsResult,
) => {
  let changed = false;
  const next = items.map(item => {
    if (item.ai?.type !== 'video-generator' || item.ai.credentialSource === 'local') return item;
    const context = resolveCanvasWalletVideoModelContext(item.ai, snapshot, 'wallet');
    if (context.capabilityStatus !== 'resolved' || !context.canonicalModelId) return item;
    const selectedCandidate = context.selectedCandidate;
    const alreadySynchronized = item.ai.model === context.canonicalModelId
      && item.ai.credentialSource === 'wallet'
      && item.ai.provider === (selectedCandidate?.provider || item.ai.provider)
      && (item.ai.providerChannelId || '') === (selectedCandidate?.providerChannelId || '')
      && candidatesEqual(item.ai.providerCandidates, context.providerCandidates);
    if (alreadySynchronized) return item;
    changed = true;
    return {
      ...item,
      ai: {
        ...item.ai,
        model: context.canonicalModelId,
        credentialSource: 'wallet' as const,
        provider: selectedCandidate?.provider || item.ai.provider,
        providerChannelId: selectedCandidate?.providerChannelId,
        providerCandidates: context.providerCandidates,
      },
    };
  });
  return changed ? next : items;
};

export const reconcileCanvasAiModelsWithCatalog = (
  items: CanvasImageItem[],
  snapshot: CloudImageModelsResult,
) => reconcileCanvasWalletVideoModels(
  reconcileStaleCanvasAiModels(items, snapshot),
  snapshot,
);
