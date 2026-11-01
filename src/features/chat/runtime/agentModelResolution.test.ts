import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cacheAvailableAgentModels,
  clearAvailableAgentModels,
  getAvailableAgentModels,
  isUnavailableChatModelError,
  resolveValidAgentModel,
  runInternalAgentModelRequest,
} from './agentModelResolution';

describe('agent model resolution', () => {
  beforeEach(() => clearAvailableAgentModels());

  it.each(['', 'default', 'unmind-agent', 'auto', 'recommended'])(
    'routes automatic selection %j without a concrete model',
    savedModel => {
      expect(resolveValidAgentModel({
        savedModel,
        availableModels: ['gpt-5.6-sol'],
        usageContext: 'workflow',
      })).toMatchObject({
        requestedModel: undefined,
        resolvedModel: 'default',
        fallbackUsed: false,
      });
    },
  );

  it('keeps an exact available model and adopts its canonical casing', () => {
    expect(resolveValidAgentModel({
      savedModel: 'GPT-5.6-SOL',
      availableModels: ['gpt-5.6-sol'],
      usageContext: 'workflow',
    })).toEqual({
      requestedModel: 'gpt-5.6-sol',
      resolvedModel: 'gpt-5.6-sol',
      fallbackUsed: false,
    });
  });

  it('keeps an explicit stale model so the server can reject it authoritatively', () => {
    expect(resolveValidAgentModel({
      savedModel: 'old-gpt-model',
      availableModels: ['gpt-5.6-sol'],
      usageContext: 'workflow',
    })).toEqual({
      requestedModel: 'old-gpt-model',
      resolvedModel: 'old-gpt-model',
      fallbackUsed: false,
    });
  });

  it('uses only an explicit alias mapping and never guesses by prefix', () => {
    expect(resolveValidAgentModel({
      savedModel: 'old-sol-name',
      availableModels: ['gpt-5.6-sol'],
      aliases: { 'old-sol-name': 'gpt-5.6-sol' },
      usageContext: 'workflow',
    }).requestedModel).toBe('gpt-5.6-sol');
    expect(resolveValidAgentModel({
      savedModel: 'gpt-5.6',
      availableModels: ['gpt-5.6-sol'],
      usageContext: 'workflow',
    }).requestedModel).toBe('gpt-5.6');
  });

  it('does not clear a concrete model while the catalog is unavailable or empty', () => {
    expect(resolveValidAgentModel({
      savedModel: 'old-gpt-model',
      availableModels: [],
      usageContext: 'workflow',
    }).requestedModel).toBe('old-gpt-model');
    expect(resolveValidAgentModel({
      savedModel: 'old-gpt-model',
      availableModels: null,
      usageContext: 'workflow',
    }).requestedModel).toBe('old-gpt-model');
  });

  it('retains the last non-empty catalog across a failed or empty refresh', () => {
    cacheAvailableAgentModels(['gpt-5.6-sol']);
    cacheAvailableAgentModels([]);
    expect(getAvailableAgentModels()).toEqual(['gpt-5.6-sol']);
  });

  it.each([
    'MODEL_NOT_AVAILABLE',
    'MODEL_DISABLED',
    'TASK FAILED: Unknown chat model',
    'model not found',
    'unsupported model',
  ])('recognizes model availability error %j', error => {
    expect(isUnavailableChatModelError(new Error(error))).toBe(true);
  });

  it('prefers a structured model error code over a generic forbidden message', () => {
    expect(isUnavailableChatModelError({
      code: 'MODEL_DISABLED',
      message: 'forbidden for this channel',
    })).toBe(true);
  });

  it.each([
    'HTTP 401 unauthorized',
    'insufficient balance',
    'quota exceeded',
    'request timeout',
    'Agent API HTTP 500: internal server error',
  ])('does not misclassify non-model error %j', error => {
    expect(isUnavailableChatModelError(new Error(error))).toBe(false);
  });

  it('does not retry an explicit model rejection with automatic routing', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Unknown chat model'));
    await expect(runInternalAgentModelRequest({
      savedModel: 'gpt-5.6-sol',
      availableModels: [],
      usageContext: 'workflow',
      requestId: 'request-1',
      createRequestId: () => 'request-2',
      request,
      log: () => {},
    })).rejects.toThrow('Unknown chat model');
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({
      requestId: 'request-1',
      model: 'gpt-5.6-sol',
      usageContext: 'workflow',
    });
  });

  it('propagates a model error without wrapping it as fallback exhaustion', async () => {
    const request = vi.fn().mockRejectedValue(new Error('Unknown chat model'));
    await expect(runInternalAgentModelRequest({
      savedModel: 'old-model',
      availableModels: [],
      usageContext: 'workflow',
      requestId: 'request-1',
      createRequestId: () => 'request-2',
      request,
      log: () => {},
    })).rejects.toThrow('Unknown chat model');
    expect(request).toHaveBeenCalledOnce();
  });

  it('does not retry authentication, balance, timeout, or HTTP 500 errors', async () => {
    for (const message of [
      'HTTP 401 unauthorized',
      'insufficient balance',
      'request timeout',
      'HTTP 500 internal server error',
    ]) {
      const request = vi.fn().mockRejectedValue(new Error(message));
      await expect(runInternalAgentModelRequest({
        savedModel: 'gpt-5.6-sol',
        availableModels: [],
        usageContext: 'system_internal',
        requestId: 'request-1',
        createRequestId: () => 'request-2',
        request,
        log: () => {},
      })).rejects.toThrow(message);
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it('submits a stale historical workflow model unchanged', async () => {
    const request = vi.fn().mockResolvedValue('ok');
    await runInternalAgentModelRequest({
      savedModel: 'old-workflow-model',
      availableModels: ['gpt-5.6-sol'],
      usageContext: 'workflow',
      requestId: 'request-1',
      createRequestId: () => 'request-2',
      request,
      log: () => {},
    });
    expect(request).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledWith({
      requestId: 'request-1',
      model: 'old-workflow-model',
      usageContext: 'workflow',
    });
  });
});
