import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import type { CloudAccountSummary, CloudMembershipQuota } from '../../../types/license';
import { formatCreditAmount } from '../../cloudCreditUsage';

export type CanvasAccountStatusProps = {
  cloudAccount: CloudAccountSummary | null;
  loading?: boolean;
};

const quotaPeriodLabel = (period: CloudMembershipQuota['period']) => (
  period === 'DAILY' ? '今日' : '本月'
);

const safeQuotaInteger = (value: number) => (
  Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
);

export const formatCompactChineseTokens = (value: number) => {
  const normalized = safeQuotaInteger(value);
  if (normalized < 10_000) return normalized.toLocaleString('zh-CN');
  const tenThousands = Math.round((normalized / 10_000) * 10) / 10;
  return `${tenThousands.toLocaleString('zh-CN', { maximumFractionDigits: 1, useGrouping: false })}万`;
};

export const formatMembershipQuotaUsage = (quota: CloudMembershipQuota) => {
  const period = quotaPeriodLabel(quota.period);
  if (quota.type === 'IMAGE_COUNT') {
    return `${period}剩余 ${safeQuotaInteger(quota.remaining)} / ${safeQuotaInteger(quota.limit)} 张`;
  }
  return `${period}剩余 ${formatCompactChineseTokens(quota.remaining)} / ${formatCompactChineseTokens(quota.limit)} Token`;
};

export const getDisplayMembershipQuotas = (account: CloudAccountSummary | null) => {
  const quotas = account?.membership?.quotas;
  if (!Array.isArray(quotas)) return [];
  return quotas.filter((quota): quota is CloudMembershipQuota => (
    Boolean(quota)
    && (quota.type === 'IMAGE_COUNT' || quota.type === 'LLM_TOKENS')
    && (quota.period === 'DAILY' || quota.period === 'MONTHLY')
    && typeof quota.canonicalModelId === 'string'
    && typeof quota.modelName === 'string'
    && Number.isFinite(quota.limit)
    && Number.isFinite(quota.used)
    && Number.isFinite(quota.remaining)
  ));
};

function QuotaRow({ quota, compact = false }: { quota: CloudMembershipQuota; compact?: boolean }) {
  return (
    <div className={`min-w-0 ${compact ? 'py-1.5' : 'py-2'}`}>
      <span className="min-w-0">
        <span className="block truncate text-[10px] font-medium leading-4 tracking-[-0.01em] text-stone-700 dark:text-stone-200">
          {quota.modelName}
        </span>
        <span className="block whitespace-nowrap text-[9px] font-medium leading-3.5 tabular-nums text-stone-500 dark:text-stone-500">
          {formatMembershipQuotaUsage(quota)}
        </span>
      </span>
    </div>
  );
}

export function CanvasAccountStatus({ cloudAccount, loading = false }: CanvasAccountStatusProps) {
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const quotas = useMemo(() => getDisplayMembershipQuotas(cloudAccount), [cloudAccount]);
  const visibleQuotas = quotas.slice(0, 2);
  const hiddenCount = Math.max(0, quotas.length - visibleQuotas.length);
  const credits = cloudAccount ? formatCreditAmount(cloudAccount.wallet.availableCredits) : '—';

  useEffect(() => {
    if (!expanded) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [expanded]);

  useEffect(() => {
    if (quotas.length === 0) setExpanded(false);
  }, [quotas.length]);

  const stopCanvasInteraction = (event: SyntheticEvent) => event.stopPropagation();

  return (
    <div
      ref={rootRef}
      data-canvas-account-status="true"
      data-no-drag="true"
      data-canvas-floating-layer="true"
      className="absolute left-[14px] top-[14px] z-[100065] w-fit max-w-[238px] select-none bg-transparent shadow-none"
      onPointerDown={stopCanvasInteraction}
      onMouseDown={stopCanvasInteraction}
      onWheel={stopCanvasInteraction}
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={quotas.length > 0 ? '查看账户积分与全部会员权益' : '账户积分'}
        onClick={() => {
          if (quotas.length > 0) setExpanded(value => !value);
        }}
        className={`${visibleQuotas.length > 0 ? 'w-[218px] px-3 py-2.5' : 'min-w-[112px] px-3 py-2'} isolate overflow-hidden rounded-[12px] bg-white/95 text-left text-stone-700 shadow-[0_5px_16px_rgba(41,37,36,0.09)] ring-1 ring-stone-900/[0.06] transition-[background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:bg-stone-900/95 dark:text-stone-200 dark:shadow-[0_7px_20px_rgba(0,0,0,0.24)] dark:ring-white/[0.08] ${quotas.length > 0 ? 'cursor-pointer hover:bg-stone-50 hover:shadow-[0_7px_20px_rgba(41,37,36,0.12)] active:bg-stone-100 dark:hover:bg-stone-800 dark:active:bg-stone-800/80' : 'cursor-default'}`}
      >
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 text-[9px] font-medium leading-3 text-stone-500 dark:text-stone-500">积分</span>
          <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
            <span className="truncate text-[12px] font-semibold leading-4 tracking-[-0.01em] tabular-nums text-stone-800 dark:text-stone-100">
              {credits}
            </span>
            {quotas.length > 0 && (
              <span className="shrink-0 text-[9px] font-medium text-stone-400 dark:text-stone-600" aria-hidden="true">
                {expanded ? '收起' : '详情'}
              </span>
            )}
          </span>
        </span>

        {visibleQuotas.length > 0 && (
          <span className="mt-2 block border-t border-stone-200/70 pt-1 dark:border-stone-700/70">
            {visibleQuotas.map(quota => (
              <QuotaRow
                key={`${quota.type}:${quota.canonicalModelId}:${quota.period}`}
                quota={quota}
                compact
              />
            ))}
            {hiddenCount > 0 && (
              <span className="mt-0.5 block text-[9px] font-medium leading-4 text-stone-500 dark:text-stone-500">
                +{hiddenCount} 项权益
              </span>
            )}
          </span>
        )}
        {loading && !cloudAccount && <span className="sr-only">账户信息加载中</span>}
      </button>

      {expanded && quotas.length > 0 && (
        <div
          role="dialog"
          aria-label="全部会员免费额度"
          className="absolute left-0 top-[calc(100%+6px)] w-[258px] overflow-hidden rounded-[12px] bg-white/98 px-3 py-2.5 text-stone-700 shadow-[0_12px_32px_rgba(41,37,36,0.13)] ring-1 ring-stone-900/[0.07] dark:bg-stone-900/98 dark:text-stone-200 dark:shadow-[0_16px_36px_rgba(0,0,0,0.3)] dark:ring-white/[0.08]"
        >
          <div className="mb-0.5 text-[9px] font-medium text-stone-500 dark:text-stone-500">
            会员免费额度
          </div>
          <div className="divide-y divide-stone-200/70 dark:divide-stone-700/70">
            {quotas.map(quota => (
              <QuotaRow key={`${quota.type}:${quota.canonicalModelId}:${quota.period}`} quota={quota} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
