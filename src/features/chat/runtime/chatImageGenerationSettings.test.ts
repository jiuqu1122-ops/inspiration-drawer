import { describe, expect, it } from 'vitest';
import { applyChatImageGenerationSettings } from './chatImageGenerationSettings';

describe('applyChatImageGenerationSettings', () => {
  it('uses image settings as defaults but keeps an explicit conversational override', () => {
    expect(applyChatImageGenerationSettings(
      { prompt: '一座山', aspectRatio: '1:1' },
      { imageModel: ' model-a ', imageAspectRatio: ' 16:9 ', imageResolution: ' 4k ' },
    )).toEqual({
      prompt: '一座山',
      model: 'model-a',
      aspectRatio: '1:1',
      resolution: '4k',
    });
  });

  it('injects all selected image settings when the model does not request overrides', () => {
    expect(applyChatImageGenerationSettings(
      { prompt: '一座山' },
      { imageModel: 'model-a', imageAspectRatio: '16:9', imageResolution: '4k' },
    )).toEqual({
      prompt: '一座山',
      model: 'model-a',
      aspectRatio: '16:9',
      resolution: '4k',
    });
  });

  it('keeps tool arguments when a setting is unavailable', () => {
    expect(applyChatImageGenerationSettings(
      { prompt: '一座山', resolution: '2k' },
      { imageModel: ' ', imageAspectRatio: '', imageResolution: undefined },
    )).toEqual({ prompt: '一座山', resolution: '2k' });
  });
});
