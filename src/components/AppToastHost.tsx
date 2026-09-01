import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

type AppToastSnapshot = {
  id: number;
  message: string;
  visible: boolean;
};

let toastSnapshot: AppToastSnapshot = { id: 0, message: '', visible: false };
let toastTimer: ReturnType<typeof setTimeout> | null = null;
const toastListeners = new Set<() => void>();

const emitToastChange = () => {
  toastListeners.forEach(listener => listener());
};

const subscribeToToast = (listener: () => void) => {
  toastListeners.add(listener);
  return () => toastListeners.delete(listener);
};

const getToastSnapshot = () => toastSnapshot;

export const showAppToast = (message: string) => {
  if (toastTimer !== null) clearTimeout(toastTimer);
  toastSnapshot = {
    id: toastSnapshot.id + 1,
    message,
    visible: true,
  };
  emitToastChange();
  toastTimer = setTimeout(() => {
    toastTimer = null;
    toastSnapshot = { ...toastSnapshot, visible: false };
    emitToastChange();
  }, 2500);
};

export function AppToastHost() {
  const toast = useSyncExternalStore(subscribeToToast, getToastSnapshot, getToastSnapshot);

  return (
    <AnimatePresence>
      {toast.visible && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: -20, scale: 0.9 }}
          animate={{ opacity: 1, y: 16, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.9 }}
          className="pointer-events-none absolute right-1/2 top-0 z-[999999] flex translate-x-1/2 items-center gap-2 rounded-full border border-white/10 bg-stone-800/90 px-4 py-2 text-[11px] font-bold text-white shadow-2xl backdrop-blur-md will-change-transform dark:border-stone-800/10 dark:bg-white/90 dark:text-stone-800"
        >
          {toast.message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
