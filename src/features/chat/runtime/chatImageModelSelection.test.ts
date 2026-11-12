import { describe, expect, it } from 'vitest';
import { canvasAiGroupedModelChoiceValue, canvasAiModelChoiceValue } from '../../../utils/canvasAiConfig';
import { resolveChatImageModelValue } from './chatImageModelSelection';
import type { CanvasAiModelCandidate } from '../../canvasModel';
import { CHAT_AUTO_IMAGE_SETTING as AUTO } from './chatImageGenerationSettings';
const route = (channel: string): CanvasAiModelCandidate => ({ source: 'wallet', provider: 'new-api', model: 'upstream-image', canonicalModelId: 'canonical-image', providerChannelId: channel });
const oldValue = canvasAiGroupedModelChoiceValue('wallet', route('a'), [route('a'), route('b')]);
const newValue = canvasAiGroupedModelChoiceValue('wallet', route('b'), [route('b'), route('a')]);
const options = [{ value: AUTO, label: 'Auto' }, { value: newValue, label: 'Image model' }];
describe('Chat and Rhino image model identity', () => {
  it('migrates old UI-label preferences into executable model choices', () => {
    expect(resolveChatImageModelValue('Image model', options)).toBe(newValue);
  });
  it('preserves selection when catalog routing order and capability snapshots change', () => {
    expect(resolveChatImageModelValue(oldValue, options)).toBe(newValue);
  });
  it('recovers a saved selection after an empty/loading catalog without mutating it', () => {
    const stored = oldValue;
    expect(resolveChatImageModelValue(stored, [])).toBe(AUTO);
    expect(resolveChatImageModelValue(stored, options)).toBe(newValue);
    expect(stored).toBe(oldValue);
  });
  it('never treats a local route as the wallet route with the same model name', () => {
    const local = canvasAiModelChoiceValue('local', 'new-api', 'upstream-image', 'a');
    expect(resolveChatImageModelValue(local, options)).toBe(AUTO);
  });
  it('does not choose between ambiguous display labels', () => {
    expect(resolveChatImageModelValue('duplicate', [{ value: 'a', label: 'duplicate' }, { value: 'b', label: 'duplicate' }])).toBe(AUTO);
  });
});
