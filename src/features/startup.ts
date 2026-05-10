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
