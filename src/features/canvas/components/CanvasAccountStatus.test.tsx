import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { CloudAccountSummary, CloudMembershipQuota } from '../../../types/license';
import {
  CanvasAccountStatus,
  formatCompactChineseTokens,
  formatMembershipQuotaUsage,
  getDisplayMembershipQuotas,
  membershipQuotaBadgeSummary,
} from './CanvasAccountStatus';

const quota = (patch: Partial<CloudMembershipQuota> = {}): CloudMembershipQuota => ({
  type: 'IMAGE_COUNT',
  canonicalModelId: 'seedream-5-pro',
  modelName: 'Seedream 5 Pro',
  period: 'DAILY',
  limit: 20,
  used: 7,
  remaining: 13,
  resetAt: '2026-09-16T16:00:00.000Z',
  ...patch,
});

const account = (
  membership: CloudAccountSummary['membership'] = null,
  availableCredits = '123.000000',
): CloudAccountSummary => ({
  wallet: {
    availableCredits,
    reservedCredits: '0',
    lifetimeGranted: availableCredits,
    lifetimeConsumed: '0',
  },
  membership,
});

const membership = (quotas?: CloudMembershipQuota[]): NonNullable<CloudAccountSummary['membership']> => ({
  id: 'membership-1',
  status: 'ACTIVE',
  startsAt: '2026-09-01T00:00:00.000Z',
  expiresAt: '2026-10-01T00:00:00.000Z',
  plan: { id: 'plan-1', code: 'pro', name: 'Pro' },
  ...(quotas === undefined ? {} : { quotas }),
});

describe('CanvasAccountStatus', () => {
  it('shows only credits without membership or without quotas', () => {
    const withoutMembership = renderToStaticMarkup(<CanvasAccountStatus cloudAccount={account()} />);
    const withoutQuotas = renderToStaticMarkup(
      <CanvasAccountStatus cloudAccount={account(membership([]))} />,
    );
    expect(withoutMembership).toContain('积分');
    expect(withoutMembership).toContain('123.00');
    expect(withoutMembership).not.toContain('免费额度');
    expect(withoutQuotas).toContain('123.00');
    expect(withoutQuotas).not.toContain('Seedream');
  });

  it('formats daily and monthly image quotas with integer counts', () => {
    expect(formatMembershipQuotaUsage(quota())).toBe('今日剩余 13 / 20 张');
    expect(formatMembershipQuotaUsage(quota({
      period: 'MONTHLY',
      limit: 300,
      used: 180,
      remaining: 120,
    }))).toBe('本月剩余 120 / 300 张');
  });

  it('uses compact Chinese token counts without long numbers', () => {
    expect([
      999,
      1_200,
      12_000,
      573_000,
      1_000_000,
      12_000_000,
    ].map(formatCompactChineseTokens)).toEqual([
      '999',
      '1,200',
      '1.2万',
      '57.3万',
      '100万',
      '1200万',
    ]);
    expect(formatMembershipQuotaUsage(quota({
      type: 'LLM_TOKENS',
      modelName: 'GPT-5.6 Sol',
      period: 'MONTHLY',
      remaining: 573_000,
      limit: 1_000_000,
    }))).toBe('本月剩余 57.3万 / 100万 Token');
  });

  it('shows a compact free-quota badge and expands into the full quota list', () => {
    const quotas = [
      quota(),
      quota({ canonicalModelId: 'gpt-image', modelName: 'GPT Image 2.5', period: 'MONTHLY' }),
      quota({ type: 'LLM_TOKENS', canonicalModelId: 'gpt-5', modelName: 'GPT-5.6 Sol', limit: 1_000, remaining: 573 }),
      quota({ type: 'LLM_TOKENS', canonicalModelId: 'gpt-6', modelName: 'GPT-6' }),
    ];
    const collapsed = renderToStaticMarkup(
      <CanvasAccountStatus cloudAccount={account(membership(quotas))} />,
    );
    const expanded = renderToStaticMarkup(
      <CanvasAccountStatus cloudAccount={account(membership(quotas))} initiallyExpanded />,
    );
    expect(collapsed).toContain('免费');
    expect(collapsed).toContain('13');
    expect(collapsed).toContain('张');
    expect(collapsed).toContain('57');
    expect(collapsed).toContain('%');
    expect(collapsed).not.toContain('详情');
    expect(collapsed).not.toContain('Seedream 5 Pro');
    expect(expanded).toContain('免费额度');
    expect(expanded).toContain('Seedream 5 Pro');
    expect(expanded).toContain('GPT Image 2.5');
    expect(expanded).toContain('GPT-5.6 Sol');
    expect(expanded).toContain('GPT-6');
    expect(membershipQuotaBadgeSummary(quotas)).toEqual({ imageRemaining: 13, tokenPercent: 57 });
  });

  it('accepts old account responses that omit quotas', () => {
    const oldAccount = account(membership());
    expect(getDisplayMembershipQuotas(oldAccount)).toEqual([]);
    expect(() => renderToStaticMarkup(
      <CanvasAccountStatus cloudAccount={oldAccount} />,
    )).not.toThrow();
  });

  it('renders an updated quota value without changing the stable component root', () => {
    const before = renderToStaticMarkup(<CanvasAccountStatus initiallyExpanded cloudAccount={account(membership([
      quota({ used: 6, remaining: 14 }),
    ]))} />);
    const after = renderToStaticMarkup(<CanvasAccountStatus initiallyExpanded cloudAccount={account(membership([
      quota({ used: 7, remaining: 13 }),
    ]))} />);
    expect(before).toContain('今日剩余 14 / 20 张');
    expect(after).toContain('今日剩余 13 / 20 张');
    expect(before).toContain('data-canvas-account-status="true"');
    expect(after).toContain('data-canvas-account-status="true"');
  });

  it('marks itself as a canvas floating interaction layer with light and dark styles', () => {
    const html = renderToStaticMarkup(<CanvasAccountStatus cloudAccount={account()} />);
    expect(html).toContain('data-no-drag="true"');
    expect(html).toContain('data-canvas-floating-layer="true"');
    expect(html).toContain('max-w-[238px]');
    expect(html).not.toContain('inset-0');
    expect(html).toContain('bg-white/95');
    expect(html).toContain('dark:bg-stone-900/95');
    expect(html).not.toContain('backdrop-blur-2xl');
    expect(html).toContain('dark:text-stone-100');
    expect(html).not.toContain('text-amber');
    expect(html).not.toContain('text-emerald');
  });
});
