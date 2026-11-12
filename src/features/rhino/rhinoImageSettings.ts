import { formatCanvasAiAspectRatioOptionLabel } from '../../utils/canvasAiAspectRatio';
import { getImageAspectRatioOptionsForResolution, normalizeCapabilityOption } from '../aiModelCapabilities';
import type { ChatImageModelOption } from '../chat/model/chatTypes';
import { CHAT_AUTO_IMAGE_SETTING, type ChatImageModelSettingOption } from '../chat/runtime/chatImageGenerationSettings';
import { resolveChatImageModelValue } from '../chat/runtime/chatImageModelSelection';

export const RHINO_IMAGE_SETTINGS_KEY = 'drawer_rhino_image_settings_v1';
export type RhinoImageSettings = { model: string; resolution: string; aspectRatio: string; quality: string };
export const defaultRhinoImageSettings: RhinoImageSettings = {
  model: CHAT_AUTO_IMAGE_SETTING, resolution: CHAT_AUTO_IMAGE_SETTING, aspectRatio: CHAT_AUTO_IMAGE_SETTING, quality: '',
};
export function readRhinoImageSettings(): RhinoImageSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(RHINO_IMAGE_SETTINGS_KEY) || '{}');
    return Object.fromEntries(Object.entries(defaultRhinoImageSettings).map(([key, fallback]) =>
      [key, typeof parsed?.[key] === 'string' ? parsed[key] : fallback])) as RhinoImageSettings;
  } catch { return { ...defaultRhinoImageSettings }; }
}
const unique = (values: string[]) => [...new Set(values.filter(Boolean))];
const autoOption = { value: CHAT_AUTO_IMAGE_SETTING, label: '\u81ea\u52a8\u5339\u914d' };
const settingValue = (stored: string, allowed: string[]) => stored === CHAT_AUTO_IMAGE_SETTING
  ? CHAT_AUTO_IMAGE_SETTING
  : normalizeCapabilityOption(allowed, stored, '') || CHAT_AUTO_IMAGE_SETTING;

/** Independent Rhino preferences; only the capability directory is shared with desktop Chat. */
export function resolveRhinoImageSettings(
  saved: RhinoImageSettings,
  choices: ChatImageModelOption[],
  profiles: ChatImageModelSettingOption[],
) {
  const model = resolveChatImageModelValue(saved.model, choices);
  const selected = profiles.find(profile => profile.value === model);
  const resolutions = selected?.resolutions || unique(profiles.flatMap(profile => profile.resolutions || []));
  const resolution = settingValue(saved.resolution, resolutions);
  const dimensionsFor = (profile: ChatImageModelSettingOption) => getImageAspectRatioOptionsForResolution({
    aspectRatios: profile.aspectRatios || [], aspectRatiosByResolution: profile.aspectRatiosByResolution || {},
  }, resolution === CHAT_AUTO_IMAGE_SETTING ? undefined : resolution);
  const ratios = selected ? dimensionsFor(selected) : unique(profiles.flatMap(dimensionsFor));
  const qualities = selected?.supportedQualities || [];
  return {
    model, resolution,
    aspectRatio: settingValue(saved.aspectRatio, ratios),
    quality: qualities.includes(saved.quality) ? saved.quality : qualities[0] || '',
    resolutionOptions: [autoOption, ...resolutions.map(value => ({ value, label: value.toUpperCase() }))],
    aspectRatioOptions: [autoOption, ...ratios.map(value => ({ value, label: formatCanvasAiAspectRatioOptionLabel(value) }))],
    qualityOptions: qualities.map(value => ({ value, label: value })),
  };
}
