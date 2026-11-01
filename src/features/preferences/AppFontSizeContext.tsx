import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  APP_FONT_SIZE_STORAGE_KEY,
  getAppFontScale,
  normalizeAppFontSize,
  type AppFontSize,
} from '../../utils/appFontScale';

type AppFontSizeContextValue = {
  appFontSize: AppFontSize;
  appFontScale: number;
  setAppFontSize: (value: AppFontSize) => void;
};

const AppFontSizeContext = createContext<AppFontSizeContextValue | null>(null);

export function AppFontSizeProvider({ children }: { children: ReactNode }) {
  const [appFontSize, setAppFontSize] = useState<AppFontSize>(() => (
    normalizeAppFontSize(localStorage.getItem(APP_FONT_SIZE_STORAGE_KEY))
  ));

  useEffect(() => {
    localStorage.setItem(APP_FONT_SIZE_STORAGE_KEY, appFontSize);
  }, [appFontSize]);

  const value = useMemo(() => ({
    appFontSize,
    appFontScale: getAppFontScale(appFontSize),
    setAppFontSize,
  }), [appFontSize]);

  return <AppFontSizeContext.Provider value={value}>{children}</AppFontSizeContext.Provider>;
}

export function useAppFontSize() {
  const value = useContext(AppFontSizeContext);
  if (!value) throw new Error('useAppFontSize must be used inside AppFontSizeProvider');
  return value;
}
