import { describe, expect, it } from 'vitest';
import {
  TRIGGER_RESHOW_HOVER_GUARD_MS,
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
