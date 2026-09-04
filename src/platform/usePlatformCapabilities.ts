import { useEffect, useState } from 'react';
import {
  getCachedPlatformCapabilities,
  loadPlatformCapabilities,
  type PlatformCapabilities,
} from './capabilities';

export const usePlatformCapabilities = () => {
  const [capabilities, setCapabilities] = useState<PlatformCapabilities | null>(
    getCachedPlatformCapabilities,
  );

  useEffect(() => {
    let disposed = false;
    void loadPlatformCapabilities().then(value => {
      if (!disposed) setCapabilities(value);
    });
    return () => {
      disposed = true;
    };
  }, []);

  return capabilities;
};
