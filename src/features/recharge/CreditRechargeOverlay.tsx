import { AlertCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { closeNativeRechargeWindow, startNativeRechargeSession } from './nativeRecharge';

const RECHARGE_URL = 'https://catfk.com/shop/JQMFPFJH';

export const CREDIT_RECHARGE_OPEN_EVENT = 'wallet-open-credit-recharge';

export function requestOpenCreditRecharge() {
  window.dispatchEvent(new Event(CREDIT_RECHARGE_OPEN_EVENT));
}

type CreditRechargeOverlayProps = {
  open: boolean;
  onClose: () => void;
  onInteract: () => void;
  onPointerLeave: (event: PointerEvent) => void;
};

export function CreditRechargeOverlay({
  open,
  onClose,
  onInteract,
  onPointerLeave,
}: CreditRechargeOverlayProps) {
  const [isPageLoading, setIsPageLoading] = useState(true);
  const [error, setError] = useState('');
  const [requestVersion, setRequestVersion] = useState(0);
  const [nativeWindowOpened, setNativeWindowOpened] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const native = isTauri();
  const closeRecharge = () => {
    if (native) void closeNativeRechargeWindow().catch(() => {});
    onCloseRef.current();
  };

  useEffect(() => {
    if (!open) return;
    setError('');
    setIsPageLoading(true);
    setNativeWindowOpened(false);
    if (native) {
      return startNativeRechargeSession({
        onReady: () => {
          setIsPageLoading(false);
          setNativeWindowOpened(true);
        },
        onClosed: () => onCloseRef.current(),
        onError: (message) => {
          setIsPageLoading(false);
          setNativeWindowOpened(false);
          setError(message);
        },
      });
    }
  }, [native, open, requestVersion]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (native) void closeNativeRechargeWindow().catch(() => {});
        onCloseRef.current();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [native, open]);

  if (!open || (native && nativeWindowOpened && !error)) return null;

  return (
    <div
      data-credit-recharge-overlay="true"
      className="pointer-events-auto absolute inset-0 z-[100210] flex items-center justify-center bg-stone-950/35 backdrop-blur-[2px]"
      onPointerEnter={onInteract}
      onPointerMove={onInteract}
      onPointerDownCapture={onInteract}
      onPointerLeave={onPointerLeave}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) closeRecharge();
      }}
    >
      <section
        aria-label="积分充值"
        aria-modal="true"
        role="dialog"
        className="relative h-[min(820px,calc(100vh-64px))] w-[min(1080px,calc(100vw-48px))] overflow-hidden rounded-[18px] border border-stone-200/90 bg-[#f7f7f4] shadow-[0_30px_100px_rgba(28,25,23,0.3)] dark:border-stone-700 dark:bg-stone-950"
      >
        <div className="flex h-12 items-center justify-between border-b border-stone-200/80 bg-white px-4 dark:border-stone-800 dark:bg-stone-900">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-blue-600 text-white">
              <ShieldCheck className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[12px] font-bold text-stone-800 dark:text-stone-100">积分充值</h2>
              <p className="truncate text-[9px] text-stone-400 dark:text-stone-500">由 catfk.com 提供</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="关闭充值页面"
            onClick={closeRecharge}
            className="grid h-8 w-8 place-items-center rounded-[9px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="relative h-[calc(100%-3rem)]">
          {!native && <iframe
            key={requestVersion}
            title="积分充值商店"
            src={RECHARGE_URL}
            className="h-full w-full border-0 bg-white"
            referrerPolicy="no-referrer"
            sandbox="allow-forms allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            onLoad={() => setIsPageLoading(false)}
            onError={() => {
              setIsPageLoading(false);
              setError('充值页面加载失败，请重试');
            }}
          />}

          {isPageLoading && !error && (
            <div className="absolute inset-0 bg-[#f7f7f4] p-5 dark:bg-stone-950 sm:p-8">
              <div className="mx-auto max-w-3xl animate-pulse">
                <div className="h-5 w-32 rounded bg-stone-200 dark:bg-stone-800" />
                <div className="mt-3 h-3 w-64 max-w-full rounded bg-stone-200/80 dark:bg-stone-800/80" />
                <div className="mt-8 grid gap-3 sm:grid-cols-3">
                  {[0, 1, 2].map((item) => (
                    <div key={item} className="h-32 rounded-[16px] bg-white shadow-sm dark:bg-stone-900" />
                  ))}
                </div>
                <div className="mt-5 h-12 rounded-[14px] bg-stone-200/80 dark:bg-stone-800/80" />
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 grid place-items-center bg-[#f7f7f4] p-6 text-center dark:bg-stone-950">
              <div className="max-w-sm">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-200">
                  <AlertCircle className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-sm font-bold text-stone-800 dark:text-stone-100">充值页面加载失败</h3>
                <p className="mt-2 text-[11px] leading-5 text-stone-500 dark:text-stone-400">{error}</p>
                <button
                  type="button"
                  onClick={() => setRequestVersion((value) => value + 1)}
                  className="mt-5 inline-flex h-9 items-center justify-center gap-2 rounded-[10px] bg-stone-900 px-4 text-[11px] font-bold text-white transition-colors hover:bg-stone-700 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  重新加载
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
