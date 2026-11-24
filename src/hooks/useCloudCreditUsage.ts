import { invoke } from '@tauri-apps/api/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { selectRecentNonZeroCreditUsage } from '../features/cloudCreditUsage';
import type { CloudCreditUsageResult } from '../types/license';

type UsageView = { owner: string | null; result?: CloudCreditUsageResult; error?: string };

export function useCloudCreditUsage(open: boolean, owner: string | null, formatError: (error: unknown) => string) {
  const [view, setView] = useState<UsageView | null>(null);
  const sequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!open) return;
    const request = ++sequence.current;
    setView(null);
    try {
      const result = await invoke<CloudCreditUsageResult>('get_cloud_credit_usage');
      if (request === sequence.current) {
        setView({ owner, result: { ...result, items: selectRecentNonZeroCreditUsage(result.items) } });
      }
    } catch (error) {
      if (request === sequence.current) setView({ owner, error: formatError(error) });
    }
  }, [open, owner, formatError]);

  useEffect(() => {
    if (open) void refresh();
    else setView(null);
    return () => { sequence.current++; };
  }, [open, refresh]);

  const current = open && view?.owner === owner ? view : null;
  return {
    items: current?.result?.items ?? [],
    availableCredits: current?.result?.availableCredits ?? null,
    error: current?.error ?? '',
    loading: open && !current,
    refresh,
  };
}
