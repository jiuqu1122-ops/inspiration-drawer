export const CHAT_AUTO_IMAGE_SETTING = '__auto__';

export type ChatImageModelSettingOption = {
  value: string;
  label?: string;
  hint?: string;
  aspectRatios?: string[];
  aspectRatiosByResolution?: Record<string, string[]>;
  resolutions?: string[];
};

export type ChatImageGenerationSettings = {
  imageModel?: string;
  imageAspectRatio?: string;
  imageResolution?: string;
  imageQuality?: string;
  imageModelOptions?: ChatImageModelSettingOption[];
  imageAspectRatioOptions?: string[];
  imageResolutionOptions?: string[];
};

const normalized = (value: unknown) => String(value || '').trim();
const isAuto = (value: unknown) => normalized(value).toLowerCase() === CHAT_AUTO_IMAGE_SETTING;

const resolutionRank = (value: string) => {
  const match = value.toLowerCase().match(/(\d+(?:\.\d+)?)k/);
  return match ? Number(match[1]) : 0;
};

const inferAspectRatio = (prompt: string, options: string[]) => {
  const available = options.filter(value => !isAuto(value));
  if (available.length === 0) return undefined;
  const wanted = /(?:竖版|纵向|海报|人像|portrait|vertical|poster|phone|手机)/i.test(prompt)
    ? ['3:4', '9:16', '4:3']
    : /(?:方形|正方形|square|icon|头像|图标)/i.test(prompt)
      ? ['1:1']
      : /(?:横版|宽幅|幻灯片|演示文稿|ppt|powerpoint|排版|拼版|方案板|背景|banner|hero|slide|deck|landscape|wide)/i.test(prompt)
        ? ['16:9', '21:9', '4:3']
        : [];
  return wanted.find(value => available.some(option => option.toLowerCase() === value.toLowerCase()))
    || available.find(value => value.toLowerCase() === '16:9')
    || available[0];
};

const inferResolution = (prompt: string, options: string[]) => {
  const available = options.filter(value => !isAuto(value));
  if (available.length === 0) return undefined;
  const sorted = [...available].sort((a, b) => resolutionRank(a) - resolutionRank(b));
  const highDetail = /(?:排版|文字|海报|幻灯片|方案板|高清|清晰|印刷|超清|细节|presentation|layout|typography|poster|text|detail|high.?res|print)/i.test(prompt);
  if (highDetail) return sorted[sorted.length - 1];
  return sorted.find(value => resolutionRank(value) === 2) || sorted[0];
};

const chooseModel = (prompt: string, options: ChatImageModelSettingOption[]) => {
  const available = options.filter(option => option.value && !isAuto(option.value));
  if (available.length === 0) return undefined;
  const highDetail = /(?:排版|文字|海报|幻灯片|方案板|细节|高清|清晰|印刷|presentation|layout|typography|poster|text|detail|high.?res|print)/i.test(prompt);
  const fast = /(?:草图|快速|草案|预览|draft|sketch|quick|fast|preview)/i.test(prompt);
  const score = (option: ChatImageModelSettingOption) => {
    const haystack = `${option.label || ''} ${option.hint || ''} ${option.value}`.toLowerCase();
    let score = 0;
    if (highDetail && /(?:pro|quality|detail|高清|高质|gpt.?image)/i.test(haystack)) score += 5;
    if (fast && /(?:fast|turbo|lite|mini|快速|高速)/i.test(haystack)) score += 5;
    if (highDetail && /(?:fast|turbo|lite|mini|快速|高速)/i.test(haystack)) score -= 3;
    if (!highDetail && !fast && /(?:pro|quality|detail|gpt.?image)/i.test(haystack)) score += 1;
    return score;
  };
  return [...available].sort((left, right) => score(right) - score(left))[0]?.value;
};

/** Apply explicit values, or select a supported profile when the UI is in automatic mode. */
export const applyChatImageGenerationSettings = (
  args: Record<string, unknown>,
  settings: ChatImageGenerationSettings,
) => {
  const prompt = normalized(args.prompt);
  const options = settings.imageModelOptions || [];
  const requestedModel = normalized(args.model);
  const configuredModel = normalized(settings.imageModel);
  const requestedOption = options.find(option => option.value === requestedModel || option.label?.toLowerCase() === requestedModel.toLowerCase());
  const selectedModel = requestedModel && !isAuto(requestedModel)
    ? requestedOption?.value || requestedModel
    : isAuto(requestedModel) || isAuto(configuredModel)
      ? chooseModel(prompt, options)
      : configuredModel || undefined;
  const selectedOption = options.find(option => option.value === selectedModel);
  const configuredRatio = normalized(settings.imageAspectRatio);
  const configuredResolution = normalized(settings.imageResolution);
  const modelResolutions = selectedOption?.resolutions?.length ? selectedOption.resolutions : settings.imageResolutionOptions || [];
  const resolution = normalized(args.resolution) && !isAuto(args.resolution)
    ? normalized(args.resolution)
    : isAuto(args.resolution) || isAuto(configuredResolution)
      ? inferResolution(prompt, modelResolutions)
      : configuredResolution || undefined;
  const resolutionKey = normalized(resolution).toLowerCase();
  const resolutionRatios = resolutionKey ? selectedOption?.aspectRatiosByResolution?.[resolutionKey] : undefined;
  const modelRatios = resolutionRatios?.length
    ? resolutionRatios
    : selectedOption?.aspectRatios?.length
      ? selectedOption.aspectRatios
      : settings.imageAspectRatioOptions || [];
  const aspectRatio = normalized(args.aspectRatio) && !isAuto(args.aspectRatio)
    ? normalized(args.aspectRatio)
    : isAuto(args.aspectRatio) || isAuto(configuredRatio)
      ? inferAspectRatio(prompt, modelRatios)
      : configuredRatio || undefined;
  const quality = normalized(args.quality) || (isAuto(settings.imageQuality) ? '' : normalized(settings.imageQuality));
  const result = { ...args } as Record<string, unknown>;
  const patch: Record<string, string | undefined> = { model: selectedModel, aspectRatio, resolution, quality };
  for (const [key, value] of Object.entries(patch)) {
    if (value) result[key] = value;
    else delete result[key];
  }
  return result;
};
