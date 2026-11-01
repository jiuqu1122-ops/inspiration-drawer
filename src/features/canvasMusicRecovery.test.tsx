import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { CanvasMusicNode, generateCanvasMusic } from './canvasMusic';
import type { CanvasAiItemData, CanvasImageItem } from './canvasModel';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
beforeEach(() => vi.mocked(invoke).mockReset());

const receipt = 'original-music-request';
const previousUrl = 'https://audio.example.test/previous.mp3';

function fixture() {
  const target: CanvasImageItem = {
    id: 'music-node', x: 0, y: 0, width: 400, height: 320,
    item: { id: 'music-asset', type: 'text', content: '', createdAt: 1 },
    ai: { type: 'music-generator', model: 'suno', prompt: 'Ambient piano', status: 'success', musicChargedCredits: '12.000000',
      outputs: [{ id: 'previous-track', assetType: 'audio', status: 'success', url: previousUrl }] },
  };
  const update = vi.fn((patch: Partial<CanvasAiItemData>) => { target.ai = { ...target.ai!, ...patch }; });
  const run = () => generateCanvasMusic(target, { updateAi: update, clientRequestId: receipt });
  const render = () => renderToStaticMarkup(<CanvasMusicNode item={target}
    catalog={[{ id: 'suno', displayName: 'Suno', modality: 'audio' }]} update={update}
    onRun={() => { void run(); }} onDrag={vi.fn()} />);
  return { target, update, run, render };
}

function expectRecovery(state: ReturnType<typeof fixture>) {
  expect(state.target.ai).toMatchObject({ status: 'recovery', musicClientRequestId: receipt, musicChargedCredits: '12.000000' });
  expect(state.target.ai?.outputs).toEqual([{ id: 'previous-track', assetType: 'audio', status: 'success', url: previousUrl }]);
  const html = state.render();
  expect(html).toContain('结果待确认');
  expect(html).toContain('恢复结果');
  expect(html).toContain(previousUrl);
  expect(html).not.toContain('生成失败');
  expect(html).not.toContain('凭证和请求地址已隐藏');
  expect(html).not.toContain('扣费 12');
}

describe('music submission and recovery state', () => {
  it('preserves existing tracks during a failed submission, then restores two tracks with only same-ID GET requests', async () => {
    const state = fixture();
    let reject!: (reason: Error) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    const submitting = state.run();
    expect(state.target.ai).toMatchObject({ status: 'working', musicClientRequestId: receipt, musicChargedCredits: '12.000000' });
    expect(state.target.ai?.outputs?.[0].url).toBe(previousUrl);
    reject(new Error('cloud_unavailable: POST 无法建立连接；凭证和请求地址已隐藏'));
    expect(await submitting).toEqual([]);
    expectRecovery(state);

    vi.mocked(invoke).mockResolvedValueOnce({ status: 'processing', clientRequestId: receipt });
    expect(await state.run()).toEqual([]);
    expectRecovery(state);

    const urls = ['https://audio.example.test/new-1.mp3', 'https://audio.example.test/new-2.wav'];
    let finish!: (value: unknown) => void;
    vi.mocked(invoke).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const recovering = state.run();
    expect(state.target.ai?.outputs?.[0].url).toBe(previousUrl);
    expect(state.target.ai?.musicChargedCredits).toBe('12.000000');
    finish({ audioUrls: urls, assets: [{ name: '第一首.mp3' }, { name: '第二首.wav' }], chargedCredits: '50.000000' });
    expect((await recovering).map(output => output.url)).toEqual(urls);
    expect(state.target.ai).toMatchObject({ status: 'success', musicChargedCredits: '50.000000', error: undefined, musicClientRequestId: undefined });
    expect(state.target.ai?.outputs?.map(output => output.clientRequestId)).toEqual([receipt, receipt]);
    expect(state.render()).toContain('2 首已完成 · 扣费 50 积分');
    expect(state.render()).not.toContain(previousUrl);
    expect(vi.mocked(invoke).mock.calls).toEqual([
      ['generate_cloud_music', { request: { clientRequestId: receipt, model: 'suno', prompt: 'Ambient piano' } }],
      ['get_cloud_music_generation_by_request', { clientRequestId: receipt }],
      ['get_cloud_music_generation_by_request', { clientRequestId: receipt }],
    ]);
  });

  it.each([
    'cloud_unavailable: POST 请求超时',
    'TimeoutError: request timed out',
    'music_submission_uncertain: upstream outcome unknown',
    'music_storage_pending: save pending',
    'music_settlement_pending: settlement pending',
    'not_found: Route not found',
    'provider_request_failed: request failed',
    'Unclassified failure mentioning invalid_request or not_found',
    'constructor: unrecognized error code',
  ])('keeps an uncertain submission recoverable after %s', async message => {
    const state = fixture();
    vi.mocked(invoke).mockRejectedValueOnce(new Error(message));
    await state.run();
    expectRecovery(state);
    vi.mocked(invoke).mockResolvedValueOnce({ status: 'processing' });
    await state.run();
    expectRecovery(state);
    expect(vi.mocked(invoke).mock.calls.map(([command]) => command)).toEqual(['generate_cloud_music', 'get_cloud_music_generation_by_request']);
  });

  it.each(['not_found: Music request not found', 'cloud_unavailable: GET 无法建立连接', 'invalid_request: status lookup failed', 'music_not_submitted: GET 无法建立连接'])('retains the original ID and tracks when recovery returns %s', async message => {
    const state = fixture();
    state.target.ai = { ...state.target.ai!, status: 'recovery', musicClientRequestId: receipt };
    vi.mocked(invoke).mockRejectedValueOnce(new Error(message));
    await state.run();
    expectRecovery(state);
    expect(invoke).toHaveBeenCalledExactlyOnceWith('get_cloud_music_generation_by_request', { clientRequestId: receipt });
  });

  it.each([
    'music_not_submitted: POST 无法建立连接；凭证和请求地址已隐藏',
    'music_not_submitted: 音乐请求尚未发送（account_disabled），请检查网络或账号状态后重试',
  ])('permits a user retry only when native confirms this new submission was never sent: %s', async message => {
    const state = fixture();
    state.target.ai = { ...state.target.ai!, status: 'idle', outputs: [], musicChargedCredits: undefined };
    vi.mocked(invoke).mockRejectedValueOnce(new Error(message));
    expect(await state.run()).toEqual([]);
    expect(state.target.ai).toMatchObject({ status: 'error', musicClientRequestId: undefined, outputs: [], musicChargedCredits: undefined });
    const html = state.render();
    expect(html).toContain('未提交 · 可重试');
    expect(html).toContain('音乐请求尚未提交，请检查网络或登录状态后重试。');
    expect(html).toContain('生成音乐');
    expect(html).not.toContain('生成失败');
    expect(html).not.toContain('恢复结果');
    expect(html).not.toContain('积分不足');
    expect(invoke).toHaveBeenCalledExactlyOnceWith('generate_cloud_music', { request: { clientRequestId: receipt, model: 'suno', prompt: 'Ambient piano' } });

    vi.mocked(invoke).mockResolvedValueOnce({ audioUrls: ['https://audio.example.test/retry.mp3'], chargedCredits: '50' });
    await generateCanvasMusic(state.target, { updateAi: state.update, clientRequestId: 'user-retried-request' });
    expect(state.target.ai?.status).toBe('success');
    expect(vi.mocked(invoke).mock.calls).toEqual([
      ['generate_cloud_music', { request: { clientRequestId: receipt, model: 'suno', prompt: 'Ambient piano' } }],
      ['generate_cloud_music', { request: { clientRequestId: 'user-retried-request', model: 'suno', prompt: 'Ambient piano' } }],
    ]);
  });

  it.each(['pending', 'reserved', 'processing', 'unknown', 'succeeded'])('does not mistake an assetless %s response for a confirmed failure', async status => {
    const state = fixture();
    state.target.ai = { ...state.target.ai!, musicClientRequestId: receipt };
    vi.mocked(invoke).mockResolvedValueOnce({ status });
    await state.run();
    expectRecovery(state);
    expect(invoke).toHaveBeenCalledExactlyOnceWith('get_cloud_music_generation_by_request', { clientRequestId: receipt });
  });

  it.each(['failed', 'refunded', 'cancelled', 'canceled'])('permits a new request only after the original lookup confirms %s', async status => {
    const state = fixture();
    state.target.ai = { ...state.target.ai!, status: 'recovery', musicClientRequestId: receipt };
    vi.mocked(invoke).mockResolvedValueOnce({ status });
    await state.run();
    expect(state.target.ai).toMatchObject({ status: 'error', musicClientRequestId: undefined, musicChargedCredits: '12.000000' });
    expect(state.target.ai?.outputs?.[0].url).toBe(previousUrl);
    expect(state.render()).toContain('生成失败');
    expect(state.render()).not.toContain('恢复结果');
    expect(invoke).toHaveBeenCalledExactlyOnceWith('get_cloud_music_generation_by_request', { clientRequestId: receipt });

    vi.mocked(invoke).mockResolvedValueOnce({ audioUrls: ['https://audio.example.test/retry.mp3'], chargedCredits: '50' });
    await generateCanvasMusic(state.target, { updateAi: state.update, clientRequestId: 'explicit-new-request' });
    expect(vi.mocked(invoke).mock.calls[1]).toEqual(['generate_cloud_music', { request: { clientRequestId: 'explicit-new-request', model: 'suno', prompt: 'Ambient piano' } }]);
  });

  it.each(['music_provider_rejected', 'insufficient_credits', 'MODEL_ROUTE_NOT_AVAILABLE', 'invalid_request', 'cloud_invalid_request', 'audio_storage_unavailable'])('clears the receipt after a definitive submission rejection: %s', async code => {
    const state = fixture();
    vi.mocked(invoke).mockRejectedValueOnce(new Error(`${code}: rejected`));
    await state.run();
    expect(state.target.ai).toMatchObject({ status: 'error', musicClientRequestId: undefined, musicChargedCredits: '12.000000' });
    expect(state.target.ai?.outputs?.[0].url).toBe(previousUrl);
    expect(state.render()).toContain('生成失败');
    expect(state.render()).not.toContain('恢复结果');
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('renders an existing saved error with a pending receipt as awaiting confirmation', () => {
    const state = fixture();
    state.target.ai = { ...state.target.ai!, status: 'error', musicClientRequestId: receipt };
    expect(state.render()).toContain('结果待确认');
    expect(state.render()).toContain('恢复结果');
    expect(state.render()).not.toContain('生成失败');
  });
});
