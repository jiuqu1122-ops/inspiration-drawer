import { describe, expect, it } from 'vitest';
import {
  shouldDeferLicenseGateForPostInstall,
  shouldInvokeLicenseGateDrawerOpen,
  shouldReuseStartupDrawerAfterOverlay,
} from './startup';

describe('startup drawer ownership', () => {
  it('lets the startup overlay own the initial drawer open', () => {
    expect(shouldInvokeLicenseGateDrawerOpen({
      isLicenseGateActive: true,
      isStartupOverlayActive: true,
      isDrawerAlreadyOpen: true,
    })).toBe(false);
  });

  it('opens the drawer for the license gate when no startup window is active', () => {
    expect(shouldInvokeLicenseGateDrawerOpen({
      isLicenseGateActive: true,
      isStartupOverlayActive: false,
      isDrawerAlreadyOpen: false,
    })).toBe(true);
  });

  it('does not reopen the drawer when the license gate takes over an open startup window', () => {
    expect(shouldInvokeLicenseGateDrawerOpen({
      isLicenseGateActive: true,
      isStartupOverlayActive: false,
      isDrawerAlreadyOpen: true,
    })).toBe(false);
  });

  it('reuses the already opened window when the startup overlay finishes', () => {
    expect(shouldReuseStartupDrawerAfterOverlay({
      wasStartupOverlayActive: true,
      isStartupOverlayActive: false,
      isDrawerActive: true,
    })).toBe(true);
    expect(shouldReuseStartupDrawerAfterOverlay({
      wasStartupOverlayActive: false,
      isStartupOverlayActive: false,
      isDrawerActive: true,
    })).toBe(false);
  });

  it('keeps the license gate from reopening while post-install startup is resolving', () => {
    expect(shouldDeferLicenseGateForPostInstall({
      isPostInstallLaunch: true,
      isLicenseLoaded: false,
    })).toBe(true);
    expect(shouldDeferLicenseGateForPostInstall({
      isPostInstallLaunch: true,
      isLicenseLoaded: true,
    })).toBe(false);
    expect(shouldDeferLicenseGateForPostInstall({
      isPostInstallLaunch: false,
      isLicenseLoaded: false,
    })).toBe(false);
  });
});
