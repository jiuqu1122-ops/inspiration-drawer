import { useSyncExternalStore } from 'react';

type Request = { sequence: number; conversationId: string; variant: 'canvas' | 'drawer' };
let request: Request | null = null;
let sequence = 0;
const listeners = new Set<() => void>();
export const requestDesignMemoryConversation = (conversationId: string, variant: Request['variant']) => {
  request = { sequence: ++sequence, conversationId, variant };
  listeners.forEach(listener => listener());
};
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const useDesignMemoryConversationRequest = () => useSyncExternalStore(subscribe, () => request, () => null);
