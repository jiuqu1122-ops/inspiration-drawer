import type { CloudCreditUsageEntry } from '../types/license';

export const selectRecentNonZeroCreditUsage = (
  entries: CloudCreditUsageEntry[],
  limit = 50,
) => entries
  .filter((entry) => !/^[+-]?0+(?:\.0+)?$/.test(entry.amount.trim()))
  .slice(0, Math.max(0, limit));

export const formatCreditAmount = (value?: string | null) => {
  const normalized = value?.trim() || '0';
  const match = normalized.match(/^([+-]?)(\d+)(?:\.(\d+))?$/);
  if (!match) return normalized;
  const negative = match[1] === '-';
  const fraction = (match[3] || '').padEnd(3, '0');
  let hundredths = BigInt(match[2] || '0') * 100n + BigInt(fraction.slice(0, 2));
  if (Number(fraction[2]) >= 5) hundredths += 1n;
  const whole = hundredths / 100n;
  const cents = (hundredths % 100n).toString().padStart(2, '0');
  const sign = negative && hundredths !== 0n ? '-' : '';
  return `${sign}${whole.toLocaleString('zh-CN')}.${cents}`;
};

export const formatCreditUsageAmount = (amount: string) => {
  const absolute = amount.trim().replace(/^[+-]/, '') || '0';
  return `-${formatCreditAmount(absolute)}`;
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

export type CreditUsageDescription = {
  title: string;
  model?: string;
  details: string[];
};

export const formatCreditUsageDescription = (
  description?: string | null,
): CreditUsageDescription => {
  const text = description?.trim() || 'AI 积分结算';
  const segments = text.split(/\s*·\s*/).filter(Boolean);

  if (segments[0] !== 'Chat Token 结算' || segments.length < 2) {
    return { title: text, details: [] };
  }

  return {
    title: segments[0],
    model: segments[1],
    details: segments.slice(2),
  };
};
