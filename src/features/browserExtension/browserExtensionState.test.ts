import { describe, expect, it } from 'vitest';
import {
  browserExtensionPrimaryAction,
  browserExtensionStatusLabel,
  browserExtensionStatusTone,
} from './browserExtensionState';

describe('browser extension status presentation', () => {
  it('keeps missing browsers non-actionable', () => {
    expect(browserExtensionStatusLabel('browser_not_installed')).toBe('未检测到浏览器');
    expect(browserExtensionPrimaryAction('browser_not_installed')).toBe('none');
  });

  it('offers install for a detected browser without a handshake', () => {
    expect(browserExtensionPrimaryAction('extension_not_installed')).toBe('install');
  });

  it('shows a real connected state only after handshake', () => {
    expect(browserExtensionStatusTone('connected')).toBe('connected');
    expect(browserExtensionPrimaryAction('connected')).toBe('open');
  });

  it('routes stale and outdated states to recovery actions', () => {
    expect(browserExtensionPrimaryAction('temporarily_disconnected')).toBe('reconnect');
    expect(browserExtensionPrimaryAction('outdated')).toBe('install');
    expect(browserExtensionStatusLabel('outdated')).toBe('需要更新');
  });
});
