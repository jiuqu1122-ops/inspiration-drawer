export const clearLegacyStartupFlags = () => {
  try {
    sessionStorage.removeItem('drawer_launch_intro_done');
    sessionStorage.removeItem('drawer_startup_preview_done');
    localStorage.removeItem('drawer_startup_preview_pending_at');
  } catch (_) {}
};

export const isLaunchIntroDoneThisPage = () => (window as any).__drawerLaunchIntroDone === true;

export const markLaunchIntroDoneThisPage = () => {
  (window as any).__drawerLaunchIntroDone = true;
};

export const shouldInvokeLicenseGateDrawerOpen = (options: {
  isLicenseGateActive: boolean;
  isStartupOverlayActive: boolean;
  isDrawerAlreadyOpen: boolean;
}) => (
  options.isLicenseGateActive
  && !options.isStartupOverlayActive
  && !options.isDrawerAlreadyOpen
);

export const shouldReuseStartupDrawerAfterOverlay = (options: {
  wasStartupOverlayActive: boolean;
  isStartupOverlayActive: boolean;
  isDrawerActive: boolean;
}) => (
  options.wasStartupOverlayActive
  && !options.isStartupOverlayActive
  && options.isDrawerActive
);
