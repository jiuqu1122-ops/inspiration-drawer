import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CANVAS_AI_IMAGE_RESOLUTIONS,
  CANVAS_AI_PROVIDER_STORAGE_KEY,
  canvasAiGatewayKindForProvider,
  canvasAiGroupedModelChoiceValue,
  canvasAiProviderForCloudKind,
  canvasAiProviderForGateway,
  getCanvasAiDefaultModel,
  getCanvasAiEndpointForModels,
  getCanvasAiEndpointForRequest,
  getCanvasAiEndpointStorageKey,
  getCanvasAiRemoteStorageKey,
  getStoredCanvasAiCredentialSource,
  getStoredCanvasAiEndpoint,
  isCanvasAiEndpointVisible,
  isCanvasAiRemoteModelProvider,
  normalizeCanvasAiProvider,
  parseCanvasAiHeaders,
  parseCanvasAiModelChoiceValue,
  readStoredCanvasAiNewApiModels,
} from './canvasAiConfig';

const createMemoryStorage = (): Storage => {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: key => values.get(key) ?? null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  };
};

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('canvas AI config', () => {
  it('keeps active resolutions and provider-specific default models', () => {
    expect(CANVAS_AI_IMAGE_RESOLUTIONS).toEqual(['1k', '2k', '4k']);
    expect(getCanvasAiDefaultModel('xais-chat')).toBe('Xais Nano Pro_2K');
    expect(getCanvasAiDefaultModel('new-api')).toBe('gpt-image-1');
    expect(getCanvasAiDefaultModel('new-api', 'video')).toBe('veo-3.1');
    expect(getCanvasAiDefaultModel('custom', 'video')).toBe('');
    expect(getCanvasAiDefaultModel('mikoto')).toBe('');
  });

  it('keeps XAIS remote-model support without exposing its endpoint field', () => {
    expect(isCanvasAiEndpointVisible('xais-chat')).toBe(false);
    expect(isCanvasAiRemoteModelProvider('xais-chat')).toBe(true);
    expect(getCanvasAiEndpointForRequest('xais-chat', 'https://api.openai.com/v1')).toBe('https://xais.dchai.cn');
    expect(getCanvasAiEndpointForModels('xais-chat', 'https://xais.dchai.cn')).toBe('https://xais.dchai.cn/v1');
  });

  it('preserves provider and gateway mappings', () => {
    expect(normalizeCanvasAiProvider('unknown')).toBe('xais-chat');
    expect(canvasAiGatewayKindForProvider('custom')).toBe('custom');
    expect(canvasAiProviderForGateway('new_api')).toBe('new-api');
    expect(canvasAiProviderForGateway('custom', 'openai-compatible')).toBe('openai-compatible');
    expect(canvasAiProviderForCloudKind('XAIS')).toBe('xais-chat');
    expect(canvasAiProviderForCloudKind('MIKOTO')).toBe('mikoto');
    expect(getCanvasAiRemoteStorageKey('mikoto')).toBe('drawer_canvas_ai_mikoto_models');
  });

  it('round-trips grouped model choices and candidate channels', () => {
    const candidates = [
      {
        source: 'wallet' as const,
        provider: 'xais-chat' as const,
        model: 'Xais Nano Pro_2K',
        providerChannelId: 'xais-main',
      },
      {
        source: 'wallet' as const,
        provider: 'new-api' as const,
        model: 'gpt-image-1',
        providerChannelId: 'new-api-main',
      },
    ];
    const encoded = canvasAiGroupedModelChoiceValue('wallet', candidates[0], candidates);

    expect(parseCanvasAiModelChoiceValue(encoded)).toEqual({
      source: 'wallet',
      provider: 'xais-chat',
      model: 'Xais Nano Pro_2K',
      providerChannelId: 'xais-main',
      providerCandidates: candidates,
    });
  });

  it('keeps scoped and legacy endpoint storage precedence', () => {
    localStorage.setItem(CANVAS_AI_PROVIDER_STORAGE_KEY, 'xais-chat');
    localStorage.setItem('drawer_canvas_ai_endpoint', 'https://legacy.example.com/v1');
    expect(getStoredCanvasAiEndpoint('xais-chat')).toBe('https://legacy.example.com/v1');

    localStorage.setItem(getCanvasAiEndpointStorageKey('xais-chat'), 'https://scoped.example.com/v1');
    expect(getStoredCanvasAiEndpoint('xais-chat')).toBe('https://scoped.example.com/v1');

    localStorage.setItem('drawer_canvas_ai_credential_source', 'local');
    expect(getStoredCanvasAiCredentialSource()).toBe('local');
  });

  it('filters stored model lists and validates custom headers', () => {
    localStorage.setItem('drawer_canvas_ai_new_api_models', JSON.stringify(['model-b', '', 42, 'model-a']));
    expect(readStoredCanvasAiNewApiModels()).toEqual(['model-b', 'model-a']);
    expect(parseCanvasAiHeaders('{" Authorization ": " Bearer token ", "empty": ""}')).toEqual({
      Authorization: 'Bearer token',
    });
    expect(() => parseCanvasAiHeaders('[]')).toThrow('Canvas 自定义 Headers 必须是 JSON 对象');
  });
});
