import { describe, expect, it } from 'vitest';
import {
  createKeyedSerialTaskQueue,
  normalizeSupportedChatModel,
  resolveAvailableChatModels,
  resolveChatRequestModel,
} from './chatModelSelection';

describe('chat model selection', () => {
  it('exposes every model returned by the active provider', () => {
    expect(resolveAvailableChatModels([
      'gpt-5.7',
      'gpt-5.6-luna',
      'provider/new-model-preview',
    ])).toEqual([
      'gpt-5.7',
      'gpt-5.6-luna',
      'provider/new-model-preview',
    ]);
  });

  it('trims dynamic model names without rewriting provider casing', () => {
    expect(normalizeSupportedChatModel(' new-model-2026 ')).toBe('new-model-2026');
    expect(normalizeSupportedChatModel(' GPT-5.7-PREVIEW ')).toBe('GPT-5.7-PREVIEW');
    expect(normalizeSupportedChatModel('   ')).toBe('');
  });

  it('removes blank and duplicate models while preserving provider order', () => {
    expect(resolveAvailableChatModels([
      ' model-b ',
      '',
      'model-a',
      'MODEL-B',
      'model-c',
    ])).toEqual(['model-b', 'model-a', 'model-c']);
  });

  it('keeps the current conversation model when it is absent from the remote list', () => {
    expect(resolveAvailableChatModels(['model-b', 'model-c'], ' model-a '))
      .toEqual(['model-a', 'model-b', 'model-c']);
    expect(resolveAvailableChatModels([], 'model-a')).toEqual(['model-a']);
    expect(resolveAvailableChatModels([], '')).toEqual([]);
  });

  it('uses the model selected by the composer for the request snapshot', () => {
    expect(resolveChatRequestModel(' gpt-5.6-terra ', 'gpt-5.6-sol', 'gpt-5.6-luna'))
      .toBe('gpt-5.6-terra');
    expect(resolveChatRequestModel('', ' gpt-5.6-luna ', 'gpt-5.6-sol'))
      .toBe('gpt-5.6-luna');
  });

  it('persists rapid model changes for one conversation in selection order', async () => {
    const enqueue = createKeyedSerialTaskQueue();
    const events: string[] = [];
    let releaseFirst = () => {};
    const firstGate = new Promise<void>(resolve => { releaseFirst = resolve; });

    const first = enqueue('conversation-a', async () => {
      events.push('sol:start');
      await firstGate;
      events.push('sol:end');
    });
    const second = enqueue('conversation-a', async () => {
      events.push('terra:start');
      events.push('terra:end');
    });

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(events).toEqual(['sol:start']);
    releaseFirst();
    await Promise.all([first, second]);
    expect(events).toEqual(['sol:start', 'sol:end', 'terra:start', 'terra:end']);
  });

  it('keeps a later model save running after an earlier save fails', async () => {
    const enqueue = createKeyedSerialTaskQueue();
    const events: string[] = [];
    const failed = enqueue('conversation-a', async () => {
      events.push('sol');
      throw new Error('save failed');
    });
    const succeeded = enqueue('conversation-a', async () => {
      events.push('luna');
    });

    await expect(failed).rejects.toThrow('save failed');
    await succeeded;
    expect(events).toEqual(['sol', 'luna']);
  });
});
