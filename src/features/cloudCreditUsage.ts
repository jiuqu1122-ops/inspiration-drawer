import type { CloudCreditUsageEntry } from '../types/license';

export const selectRecentNonZeroCreditUsage = (
  entries: CloudCreditUsageEntry[],
  limit = 50,
) => entries
  .filter((entry) => !/^[+-]?0+$/.test(entry.amount.trim()))
  .slice(0, Math.max(0, limit));

export const formatCreditUsageAmount = (amount: string) => {
  const absolute = amount.trim().replace(/^[+-]/, '') || '0';
  return `-${absolute}`;
};

export const formatCreditUsageDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(parsed);
};
