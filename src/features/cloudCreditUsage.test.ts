import { describe, expect, it } from 'vitest';
import type { CloudCreditUsageEntry } from '../types/license';
import {
  formatCreditAmount,
  formatCreditUsageAmount,
  selectRecentNonZeroCreditUsage,
} from './cloudCreditUsage';

const entry = (id: string, amount: string): CloudCreditUsageEntry => ({
  id,
  requestId: `request-${id}`,
  type: 'CHARGE',
  amount,
  balanceAfter: '100',
  description: '生图结算 1 张',
  createdAt: '2026-08-27T10:00:00.000Z',
});

describe('cloud credit usage helpers', () => {
  it('filters zero-cost entries and keeps at most the requested number', () => {
    const items = [entry('zero', '0.000000'), entry('one', '8'), entry('two', '16')];
    expect(selectRecentNonZeroCreditUsage(items, 1).map((item) => item.id)).toEqual(['one']);
  });

  it('formats a settled charge as a deduction', () => {
    expect(formatCreditUsageAmount('16')).toBe('-16.00');
    expect(formatCreditUsageAmount('-1.284735')).toBe('-1.28');
  });

  it('rounds balances to two decimals without losing six-decimal backend precision', () => {
    expect(formatCreditAmount('1.284735')).toBe('1.28');
    expect(formatCreditAmount('1.285000')).toBe('1.29');
    expect(formatCreditAmount('1234567.000000')).toBe('1,234,567.00');
  });
});
