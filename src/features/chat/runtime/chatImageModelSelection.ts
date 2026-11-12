import { parseCanvasAiModelChoiceValue } from '../../../utils/canvasAiConfig';
import { CHAT_AUTO_IMAGE_SETTING } from './chatImageGenerationSettings';

type ImageChoice = { value: string; label?: string; disabled?: boolean };

/** Catalog refreshes may change route order/capabilities inside a serialized value.
 * Keep selection by canonical SKU, not by display label or a stale route snapshot. */
export const chatImageModelIdentity = (value: string) => {
  const config = parseCanvasAiModelChoiceValue(value);
  if (!config) return undefined;
  const canonical = config.providerCandidates?.find(item => item.canonicalModelId)?.canonicalModelId;
  return canonical
    ? JSON.stringify([config.source, 'canonical', canonical])
    : JSON.stringify([config.source, config.provider, config.model, config.providerChannelId || '']);
};

export const resolveChatImageModelValue = (stored: string, options: readonly ImageChoice[]) => {
  if (!stored || stored === CHAT_AUTO_IMAGE_SETTING) return CHAT_AUTO_IMAGE_SETTING;
  const available = options.filter(option => !option.disabled);
  const exact = available.find(option => option.value === stored);
  if (exact) return exact.value;
  // Migrate the old label-based preference without ever writing a UI label into
  // a runtime/provider model value.
  const labels = available.filter(option => option.label === stored);
  if (labels.length === 1) return labels[0].value;
  const identity = chatImageModelIdentity(stored);
  const stable = identity ? available.find(option => chatImageModelIdentity(option.value) === identity) : undefined;
  return stable?.value || CHAT_AUTO_IMAGE_SETTING;
};
