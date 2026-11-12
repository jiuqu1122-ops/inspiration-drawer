import { describe, expect, it } from 'vitest';
import { canvasAiGroupedModelChoiceValue, canvasAiModelChoiceValue } from '../../../utils/canvasAiConfig';
import { resolveChatImageModelCapabilities } from './chatImageModelCapabilities';
import type { CloudImageModelsResult } from '../../../types/license';
const snapshot: CloudImageModelsResult = {
  provider: 'NEW_API', models: ['new-sku'],
  catalog: [{ id: 'new-sku', displayName: 'Unfamiliar model', modality: 'image', capabilities: {
    resolutions: ['2K', '4K'], aspectRatios: ['1:1', '16:9'], supportedQualities: ['high', 'max'],
    aspectRatiosByResolution: { '2K': ['2048x1152', '1536x1536'], '4K': ['4096x2304'] }, supportsMask: true,
  } }],
};
describe('shared canvas/Chat image capability catalog', () => {
  it('reads server dimensions and quality for new model names without local heuristics', () => {
    const resolved = resolveChatImageModelCapabilities(canvasAiModelChoiceValue('wallet','new-api','new-sku'),snapshot);
    expect(resolved).toMatchObject({ source: 'server', resolutions: ['2K','4K'], supportedQualities: ['high','max'], supportsMask: true });
    expect(resolved.aspectRatiosByResolution['2k']).toEqual(['2048x1152','1536x1536']);
  });
  it('does not merge legacy 1K/2K/4K guesses into a server-declared restricted resolution list', () => {
    const value = canvasAiGroupedModelChoiceValue('wallet', { source: 'wallet', provider: 'new-api', model: 'gpt-image-2' }, [{ source: 'wallet', provider: 'new-api', model: 'gpt-image-2', modelCapabilities: { resolutions: ['2K'], aspectRatios: ['16:9'] } }]);
    expect(resolveChatImageModelCapabilities(value).resolutions).toEqual(['2K']);
  });
  it('reads channel capability maps for non-grouped route choices', () => {
    const data: CloudImageModelsResult = { provider: 'NEW_API', models: ['custom-route'], channels: [{ id: 'a',name:'Route A',provider:'NEW_API',models:['custom-route'],modelCapabilities:{ 'custom-route':{resolutions:['8K'],aspectRatios:['3:2'],supportedQualities:['max']} } }] };
    const caps = resolveChatImageModelCapabilities(canvasAiModelChoiceValue('wallet','new-api','custom-route','a'),data);
    expect(caps).toMatchObject({ source:'server',resolutions:['8K'],aspectRatios:['3:2'],supportedQualities:['max'] });
  });
});
