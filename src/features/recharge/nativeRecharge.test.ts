import { beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke, listen } = vi.hoisted(() => ({ invoke: vi.fn(), listen: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
vi.mock('@tauri-apps/api/event', () => ({ listen }));
import { startNativeRechargeSession } from './nativeRecharge';

const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

describe('native recharge window lifecycle', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    invoke.mockResolvedValue(undefined);
    listen.mockImplementation(async () => vi.fn());
  });

  it('subscribes before opening and reports the recharge window closing', async () => {
    const handlers = new Map<string, (event: { payload: unknown }) => void>();
    const unsubscribe = vi.fn();
    listen.mockImplementation(async (event, handler) => {
      handlers.set(event, handler);
      return unsubscribe;
    });
    const callbacks = { onReady: vi.fn(), onClosed: vi.fn(), onError: vi.fn() };
    const dispose = startNativeRechargeSession(callbacks);
    await flush();
    expect(listen.mock.invocationCallOrder[1]).toBeLessThan(invoke.mock.invocationCallOrder[0]);
    expect(invoke).toHaveBeenCalledWith('open_credit_recharge_window');
    expect(callbacks.onReady).toHaveBeenCalledOnce();
    handlers.get('credit-recharge-closed')?.({ payload: null });
    expect(callbacks.onClosed).toHaveBeenCalledOnce();
    dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(2);
    handlers.get('credit-recharge-closed')?.({ payload: null });
    expect(callbacks.onClosed).toHaveBeenCalledOnce();
  });

  it('surfaces payment-popup failures so the user can retry the redirect', async () => {
    let onErrorEvent: ((event: { payload: string }) => void) | undefined;
    listen.mockImplementation(async (event, handler) => {
      if (event === 'credit-recharge-error') onErrorEvent = handler;
      return vi.fn();
    });
    const callbacks = { onReady: vi.fn(), onClosed: vi.fn(), onError: vi.fn() };
    const dispose = startNativeRechargeSession(callbacks);
    await flush();
    onErrorEvent?.({ payload: '支付窗口打开失败' });
    expect(callbacks.onError).toHaveBeenCalledWith('支付窗口打开失败');
    dispose();
  });

  it('does not open an untracked window when listener registration fails', async () => {
    const unsubscribe = vi.fn();
    listen.mockResolvedValueOnce(unsubscribe).mockRejectedValueOnce(new Error('listen failed'));
    const callbacks = { onReady: vi.fn(), onClosed: vi.fn(), onError: vi.fn() };
    startNativeRechargeSession(callbacks);
    await flush();
    expect(invoke).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(callbacks.onError).toHaveBeenCalledWith('Error: listen failed');
  });

  it('cleans up a late subscription when closed during setup', async () => {
    let resolveListen!: (unlisten: () => void) => void;
    listen.mockReturnValue(new Promise((resolve) => { resolveListen = resolve; }));
    const callbacks = { onReady: vi.fn(), onClosed: vi.fn(), onError: vi.fn() };
    const dispose = startNativeRechargeSession(callbacks);
    dispose();
    const unsubscribe = vi.fn();
    resolveListen(unsubscribe);
    await flush();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('closes a window whose creation completes after the user cancels', async () => {
    let resolveOpen!: () => void;
    invoke.mockImplementation((command) => command === 'open_credit_recharge_window'
      ? new Promise<void>((resolve) => { resolveOpen = resolve; })
      : Promise.resolve());
    const callbacks = { onReady: vi.fn(), onClosed: vi.fn(), onError: vi.fn() };
    const dispose = startNativeRechargeSession(callbacks);
    await flush();
    dispose();
    resolveOpen();
    await flush();
    expect(invoke).toHaveBeenCalledWith('close_credit_recharge_window');
    expect(callbacks.onReady).not.toHaveBeenCalled();
  });
});
