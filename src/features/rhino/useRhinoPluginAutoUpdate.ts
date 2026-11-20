import { useEffect, useRef } from 'react';
import { syncRhinoPluginsAfterClientUpdate } from './rhinoPluginAutoUpdate';
import { checkRhinoComponentUpdates, rhinoComponentUpdateMessage } from './rhinoIndependentUpdates';
import { ensureRhinoRuntimeLoaded } from './rhinoRuntime';

export function useRhinoPluginAutoUpdate(options: {
  isMainDrawerWindow: boolean;
  showToast: (message: string) => void;
}) {
  const showToastRef = useRef(options.showToast);
  showToastRef.current = options.showToast;
  useEffect(() => {
    if (!options.isMainDrawerWindow) return;
    let disposed = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        await ensureRhinoRuntimeLoaded();
        // Resolve the independent channel first. Post-desktop-upgrade sync then
        // compares against the selected newest payload, and skips matching bytes.
        // A failed network check retains the verified cached/embedded fallback.
        try {
          const result = await checkRhinoComponentUpdates();
          if (!disposed && (result.updated.length || result.pluginRestartRequired || result.installationError)) showToastRef.current(rhinoComponentUpdateMessage(result));
          // Keep the desktop-version sync marker unset after a failed install;
          // retry on a later launch instead of repeating the installer now.
          if (result.installationError) return;
        } catch (error) { console.warn('Rhino independent channel is unavailable; retaining verified local components:', error); }
        const sync = await syncRhinoPluginsAfterClientUpdate();
        if (!disposed && sync && sync.status !== 'current') showToastRef.current(sync.message);
      })().catch(error => console.warn('Rhino independent update check did not finish; installed components are retained:', error));
    }, 3000);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [options.isMainDrawerWindow]);
}
