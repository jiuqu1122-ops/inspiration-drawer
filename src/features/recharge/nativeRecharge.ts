import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

type RechargeCallbacks = {
  onReady: () => void;
  onClosed: () => void;
  onError: (error: string) => void;
};

let latestSession = 0;

export function startNativeRechargeSession(callbacks: RechargeCallbacks): () => void {
  const session = ++latestSession;
  let disposed = false;
  const unlisteners: UnlistenFn[] = [];
  const unlistenAll = () => {
    for (const unlisten of unlisteners.splice(0)) unlisten();
  };
  const subscribe = async (event: string, handler: (payload: unknown) => void) => {
    const unlisten = await listen(event, ({ payload }) => {
      if (!disposed) handler(payload);
    });
    if (disposed) unlisten();
    else unlisteners.push(unlisten);
  };

  void (async () => {
    // Subscribe before creating the window, including a fast manual close.
    await subscribe('credit-recharge-closed', callbacks.onClosed);
    if (disposed) return;
    await subscribe('credit-recharge-error', (payload) => callbacks.onError(String(payload)));
    if (disposed) return;
    await invoke('open_credit_recharge_window');
    if (!disposed) callbacks.onReady();
    else if (session === latestSession) await invoke('close_credit_recharge_window');
  })().catch((error: unknown) => {
    unlistenAll();
    if (!disposed) callbacks.onError(String(error));
  });

  return () => {
    disposed = true;
    unlistenAll();
  };
}

export async function closeNativeRechargeWindow(): Promise<void> {
  await invoke('close_credit_recharge_window');
}
