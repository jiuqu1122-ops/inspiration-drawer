import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import type { CloudAccountSummary, CloudMembershipQuota } from '../../../types/license';
import { formatCreditAmount } from '../../cloudCreditUsage';

export type CanvasAccountStatusProps = {
  cloudAccount: CloudAccountSummary | null;
  loading?: boolean;
  initiallyExpanded?: boolean;
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

export const membershipQuotaBadgeSummary = (quotas: CloudMembershipQuota[]) => {
  const imageQuota = quotas.find(quota => quota.type === 'IMAGE_COUNT');
  const tokenQuota = quotas.find(quota => quota.type === 'LLM_TOKENS');
  const tokenPercent = tokenQuota && tokenQuota.limit > 0
    ? Math.max(0, Math.min(100, Math.round((tokenQuota.remaining / tokenQuota.limit) * 100)))
    : null;
  return {
    imageRemaining: imageQuota ? safeQuotaInteger(imageQuota.remaining) : null,
    tokenPercent,
  };
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

export function CanvasAccountStatus({
  cloudAccount,
  loading = false,
  initiallyExpanded = false,
}: CanvasAccountStatusProps) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const rootRef = useRef<HTMLDivElement>(null);
  const quotas = useMemo(() => getDisplayMembershipQuotas(cloudAccount), [cloudAccount]);
  const visibleQuotas = quotas.slice(0, 2);
  const quotaBadge = useMemo(() => membershipQuotaBadgeSummary(quotas), [quotas]);
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
        className={`${expanded && visibleQuotas.length > 0 ? 'w-[218px] px-3 py-2.5' : 'min-w-[112px] px-3 py-2'} isolate overflow-hidden rounded-[12px] bg-white/95 text-left text-stone-700 shadow-[0_5px_16px_rgba(41,37,36,0.09)] ring-1 ring-stone-900/[0.06] transition-[width,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:bg-stone-900/95 dark:text-stone-200 dark:shadow-[0_7px_20px_rgba(0,0,0,0.24)] dark:ring-white/[0.08] ${quotas.length > 0 ? 'cursor-pointer hover:bg-stone-50 hover:shadow-[0_7px_20px_rgba(41,37,36,0.12)] active:bg-stone-100 dark:hover:bg-stone-800 dark:active:bg-stone-800/80' : 'cursor-default'}`}
      >
        <span className="flex items-baseline gap-2 whitespace-nowrap">
          <span className="shrink-0 text-[9px] font-medium leading-3 text-stone-500 dark:text-stone-500">积分</span>
          <span className="text-[12px] font-semibold leading-4 tracking-[-0.01em] tabular-nums text-stone-800 dark:text-stone-100">
            {credits}
          </span>
          {!expanded && quotas.length > 0 && (
            <span className="ml-0.5 flex items-baseline gap-1.5 border-l border-stone-200/80 pl-2 text-[9px] font-medium text-stone-500 dark:border-stone-700/80 dark:text-stone-400">
              <span>免费</span>
              {quotaBadge.imageRemaining !== null && (
                <span className="tabular-nums text-stone-700 dark:text-stone-200">
                  {quotaBadge.imageRemaining}<span className="ml-px text-stone-400 dark:text-stone-500">张</span>
                </span>
              )}
              {quotaBadge.tokenPercent !== null && (
                <span className="tabular-nums text-stone-700 dark:text-stone-200">
                  {quotaBadge.tokenPercent}<span className="ml-px text-stone-400 dark:text-stone-500">%</span>
                </span>
              )}
            </span>
          )}
        </span>

        {expanded && visibleQuotas.length > 0 && (
          <span className="mt-2 block border-t border-stone-200/70 pt-2 dark:border-stone-700/70">
            <span className="mb-0.5 block text-[9px] font-medium leading-3 text-stone-400 dark:text-stone-500">
              免费额度
            </span>
            {quotas.map(quota => (
              <QuotaRow
                key={`${quota.type}:${quota.canonicalModelId}:${quota.period}`}
                quota={quota}
                compact
              />
            ))}
          </span>
        )}
        {loading && !cloudAccount && <span className="sr-only">账户信息加载中</span>}
      </button>
    </div>
  );
}
