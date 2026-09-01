import type { CanvasAiGeneratedOutput, CanvasImageItem } from '../../canvasModel';
import { parseCanvasAiModelChoiceValue } from '../../../utils/canvasAiConfig';
import { createChatId } from '../model/chatTypes';

type ChatMediaToolName = 'generate_image' | 'edit_image' | 'generate_video';

type GeneratorRunOptions = {
  sourceItems: () => CanvasImageItem[];
  updateAi: (patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => void;
  forceUpdateAi: (patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => void;
  getLatestTarget: () => CanvasImageItem;
  showResultToast: boolean;
  clientRequestId: string;
  requireLocalImageOutputs: boolean;
};

export const runChatMediaGeneration = async (input: {
  toolName: ChatMediaToolName;
  args: Record<string, unknown>;
  sourceItems: () => CanvasImageItem[];
  buildGeneratorNode: (
    position: { x: number; y: number },
    inputIds: string[],
    mediaType: 'image' | 'video',
  ) => CanvasImageItem;
  runGenerator: (
    target: CanvasImageItem,
    options: GeneratorRunOptions,
  ) => Promise<CanvasAiGeneratedOutput[]>;
}) => {
  const mediaType = input.toolName === 'generate_video' ? 'video' : 'image';
  const referenceSources = Array.isArray(input.args.referenceImages)
    ? input.args.referenceImages.map(String).map(value => value.trim()).filter(Boolean).slice(0, 9)
    : [];
  const referenceItems: CanvasImageItem[] = referenceSources.map((source, index) => {
    const itemId = createChatId('chat-reference-item');
    const remote = /^(?:https?:|data:|asset:)/i.test(source);
    return {
      id: createChatId('chat-reference-node'),
      item: {
        id: itemId,
        type: 'image',
        content: `Chat reference ${index + 1}`,
        name: `Chat reference ${index + 1}`,
        ...(remote ? { url: source, sourceUrl: source } : { path: source }),
        createdAt: Date.now() + index,
        isQuickAccess: false,
      },
      x: 0,
      y: 0,
      width: 320,
      height: 240,
      inputs: [],
    };
  });
  let latestTarget = input.buildGeneratorNode(
    { x: 24, y: 24 },
    referenceItems.map(item => item.id),
    mediaType,
  );
  const selectedModel = parseCanvasAiModelChoiceValue(String(input.args.model || '').trim());
  latestTarget = {
    ...latestTarget,
    item: { ...latestTarget.item, name: mediaType === 'video' ? 'Chat AI 视频' : 'Chat AI 图片' },
    ai: latestTarget.ai ? {
      ...latestTarget.ai,
      prompt: String(input.args.prompt || '').trim(),
      ...(selectedModel ? {
        provider: selectedModel.provider,
        model: selectedModel.model,
        credentialSource: selectedModel.source,
        providerChannelId: selectedModel.providerChannelId,
        providerCandidates: selectedModel.providerCandidates,
      } : String(input.args.model || '').trim() ? { model: String(input.args.model).trim() } : {}),
      ...(String(input.args.aspectRatio || '').trim() ? { aspectRatio: String(input.args.aspectRatio).trim() } : {}),
      ...(String(input.args.resolution || '').trim() ? { resolution: String(input.args.resolution).trim() } : {}),
      ...(Number(input.args.count) > 0 ? { count: Math.min(4, Math.max(1, Math.round(Number(input.args.count)))) } : {}),
      ...(mediaType === 'video' && Number(input.args.duration) > 0 ? { duration: Number(input.args.duration) } : {}),
    } : latestTarget.ai,
  };
  const patchTarget = (patch: Partial<NonNullable<CanvasImageItem['ai']>>, content?: string) => {
    latestTarget = {
      ...latestTarget,
      item: content === undefined ? latestTarget.item : { ...latestTarget.item, content },
      ai: latestTarget.ai ? { ...latestTarget.ai, ...patch } : latestTarget.ai,
    };
  };
  const outputs = await input.runGenerator(latestTarget, {
    sourceItems: () => [...input.sourceItems(), ...referenceItems],
    updateAi: patchTarget,
    forceUpdateAi: patchTarget,
    getLatestTarget: () => latestTarget,
    showResultToast: false,
    clientRequestId: createChatId(`chat-${mediaType}`),
    requireLocalImageOutputs: mediaType === 'image',
  });
  if (outputs.length === 0) {
    throw new Error(mediaType === 'video' ? '视频生成没有返回可用结果' : '图片生成没有返回可用结果');
  }
  return {
    prompt: String(input.args.prompt || '').trim(),
    media: outputs.map(output => ({
      id: output.id,
      type: mediaType,
      path: output.path,
      url: output.url || output.sourceUrl,
      thumbnail: output.thumbnail,
      assetId: output.id,
      prompt: output.prompt || String(input.args.prompt || '').trim(),
      name: output.name,
    })),
  };
};
