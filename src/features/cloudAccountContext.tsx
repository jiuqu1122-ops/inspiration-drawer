import { createContext, useContext, type ReactNode } from 'react';
import type { CloudAccountSummary } from '../types/license';

type CloudAccountContextValue = {
  account: CloudAccountSummary | null;
  loading: boolean;
  scheduleQuotaRefresh: () => void;
};

const CloudAccountContext = createContext<CloudAccountContextValue>({
  account: null,
  loading: false,
  scheduleQuotaRefresh: () => {},
});

export function CloudAccountProvider({
  value,
  children,
}: {
  value: CloudAccountContextValue;
  children: ReactNode;
}) {
  return <CloudAccountContext.Provider value={value}>{children}</CloudAccountContext.Provider>;
}

export const useCloudAccount = () => useContext(CloudAccountContext);
