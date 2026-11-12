import { describe, expect, it } from 'vitest';
import {
  TRIGGER_RESHOW_HOVER_GUARD_MS,
  floatingTriggerAppearance,
  shouldAllowTriggerHoverOpen,
} from './triggerModel';

describe('trigger hover reopen guard', () => {
  it('blocks synthetic hover immediately after the trigger reappears', () => {
    const shownAt = 10_000;
    expect(shouldAllowTriggerHoverOpen(
      shownAt,
      shownAt + TRIGGER_RESHOW_HOVER_GUARD_MS - 1,
    )).toBe(false);
  });

  it('allows a deliberate hover after the reshow guard expires', () => {
    const shownAt = 10_000;
    expect(shouldAllowTriggerHoverOpen(
      shownAt,
      shownAt + TRIGGER_RESHOW_HOVER_GUARD_MS,
    )).toBe(true);
  });
});

describe('yellow floating drawer trigger', () => {
  it.each(['idle','saving'] as const)('uses a yellow tile with a white bulb in %s', state => {
    const appearance = floatingTriggerAppearance(state);
    expect(appearance.surface).toContain('bg-yellow-400');
    expect(appearance.surface).toContain('dark:bg-yellow-400');
    expect(appearance.surface).not.toContain('bg-blue');
    expect(appearance.foreground).toBe('text-white');
  });
  it('preserves distinct image drag feedback colors', () => {
    expect(floatingTriggerAppearance('ready').surface).toContain('bg-amber');
    expect(floatingTriggerAppearance('success').surface).toContain('bg-emerald');
    expect(floatingTriggerAppearance('error').surface).toContain('bg-red');
  });
});
