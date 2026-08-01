export const acquireTimedLocalLock = (key: string, ttlMs: number) => {
  const now = Date.now();
  const owner = `${now}_${Math.random().toString(36).slice(2, 10)}`;
  try {
    const raw = localStorage.getItem(key);
    const existing = raw ? JSON.parse(raw) : null;
    const existingTime = Number(existing?.time || 0);
    if (existingTime && now - existingTime < ttlMs) return null;
    localStorage.setItem(key, JSON.stringify({ owner, time: now }));
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    return current?.owner === owner ? owner : null;
  } catch (_) {
    return owner;
  }
};

export const releaseTimedLocalLock = (key: string, owner: string | null) => {
  if (!owner) return;
  try {
    const current = JSON.parse(localStorage.getItem(key) || '{}');
    if (current?.owner === owner) localStorage.removeItem(key);
  } catch (_) {}
};

export const localLockKeyPart = (value: string) => (
  value.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 120)
);
