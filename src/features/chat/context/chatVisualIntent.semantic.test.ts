import { describe, expect, it, vi } from 'vitest';
import { getChatToolDefinitions } from '../tools/chatToolDefinitions';
import { isImagePromptTextRequest, isVisualCreationIntent } from './chatVisualIntent';
import { routeChatToolCall } from '../tools/chatToolRouter';

const IMAGE_TOOLS = ['generate_image', 'generate_image_variants', 'edit_image'];
const imageToolNames = (text: string) => getChatToolDefinitions(text)
  .map(tool => tool.function.name)
  .filter(name => IMAGE_TOOLS.includes(name));

describe('image prompt writing is distinct from image generation', () => {
  it.each([
    '\u5e2e\u6211\u751f\u6210\u4e00\u4e2a\u7528\u4e8e Midjourney \u7684\u56fe\u7247\u63d0\u793a\u8bcd',
    '\u5199\u4e00\u4e2a\u751f\u6210\u56fe\u7247\u7684\u63d0\u793a\u8bcd',
    '\u5e2e\u6211\u751f\u6210\u4e00\u6bb5\u56fe\u7247\u63d0\u793a\u8bcd',
    '\u4f18\u5316\u8fd9\u6bb5\u751f\u56fe\u63d0\u793a\u8bcd',
    'Write an image-generation prompt for a futuristic car',
    'Improve this prompt for image generation',
  ])('treats prompt authoring as text even when it describes image generation: %s', text => {
    expect(isImagePromptTextRequest(text)).toBe(true);
    expect(isVisualCreationIntent(text)).toBe(false);
    expect(imageToolNames(text)).toEqual([]);
  });

  it.each([
    '\u5e2e\u6211\u5199\u4e00\u4e2a\u751f\u56fe\u63d0\u793a\u8bcd\uff0c\u7136\u540e\u6309\u5b83\u751f\u6210\u56fe\u7247',
    '\u5148\u5199\u63d0\u793a\u8bcd\uff0c\u518d\u751f\u6210\u4e00\u5f20\u56fe',
    'Write an image prompt, then generate the image',
  ])('restores image intent when a separate render is requested: %s', text => {
    expect(isImagePromptTextRequest(text)).toBe(false);
    expect(imageToolNames(text)).toEqual(IMAGE_TOOLS);
  });
});

describe('image intent is judged by the chat model', () => {
  it.each([
    'Show me a calmer direction for this idea',
    'Make it feel more refined and cinematic',
    'Explore a lighter and more balanced visual option',
    'Give this concept a more restrained character',
  ])('makes image capabilities available without fixed output keywords: %s', text => {
    expect(imageToolNames(text)).toEqual(IMAGE_TOOLS);
  });

  it.each(['hello', 'Explain the history of cameras', 'Write a meeting summary'])('keeps capability exposure separate from execution for ordinary text: %s', text => {
    expect(imageToolNames(text)).toEqual(IMAGE_TOOLS);
    // A normal text response remains valid; tool visibility never executes it.
  });

  it.each([
    'Only give me advice, do not generate an image',
    'Analyze only; do not create anything yet',
    'Please wait for the reference',
  ])('keeps image tools available for the model to respect defer requests: %s', text => {
    expect(imageToolNames(text)).toEqual(IMAGE_TOOLS);
  });

  it('routes a model-selected image tool without reclassifying user text with local keywords', async () => {
    const executor = vi.fn(async () => ({ media: [{ id: 'model-selected-image', type: 'image' }] }));
    const result = await routeChatToolCall({
      name: 'generate_image',
      args: { prompt: 'A visual change based on the complete conversation context' },
      context: {
        userText: 'Make the scene feel calmer without using fixed image-generation keywords',
        conversationId: 'semantic-intent',
        messageId: 'm',
        recentMessages: [],
      },
      executor,
    });
    expect(result.requiresApproval).toBe(false);
    expect(executor).toHaveBeenCalledOnce();
  });
});
