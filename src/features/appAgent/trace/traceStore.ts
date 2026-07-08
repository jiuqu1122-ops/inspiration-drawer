import type { AppAgentTraceRecord } from './appAgentTrace';

export const APP_AGENT_TRACE_STORAGE_KEY = 'drawer_app_agent_execution_traces';
const TRACE_LIMIT = 80;

const canUseLocalStorage = () => typeof window !== 'undefined' && !!window.localStorage;

export function readAppAgentTraces(): AppAgentTraceRecord[] {
  if (!canUseLocalStorage()) return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(APP_AGENT_TRACE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed as AppAgentTraceRecord[] : [];
  } catch (_) {
    return [];
  }
}

export function writeAppAgentTraces(traces: AppAgentTraceRecord[]) {
  if (!canUseLocalStorage()) return;
  window.localStorage.setItem(APP_AGENT_TRACE_STORAGE_KEY, JSON.stringify(traces.slice(-TRACE_LIMIT)));
}

export function appendAppAgentTrace(trace: AppAgentTraceRecord) {
  writeAppAgentTraces([...readAppAgentTraces(), trace]);
}

export function upsertAppAgentTrace(trace: AppAgentTraceRecord) {
  const current = readAppAgentTraces();
  const index = current.findIndex(item => item.id === trace.id);
  if (index < 0) {
    writeAppAgentTraces([...current, trace]);
    return;
  }
  const next = [...current];
  next[index] = { ...next[index], ...trace };
  writeAppAgentTraces(next);
}
