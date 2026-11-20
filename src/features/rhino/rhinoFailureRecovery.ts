import type { ChatToolCall } from '../chat/model/chatTypes';

export const RHINO_FAILURE_DIAGNOSIS_MARKER = 'RHINO_NATIVE_FAILURE_DIAGNOSIS_V1:';
export const RHINO_FAILURE_VERIFIED_MARKER = 'RHINO_NATIVE_FAILURE_VERIFIED_V1:';
export const RHINO_FAILURE_CORRECTED_MARKER = 'RHINO_NATIVE_FAILURE_CORRECTED_V1:';
export const RHINO_FAILURE_INSPECTED_MARKER = 'RHINO_NATIVE_FAILURE_INSPECTED_V1:';

export const hasRhinoFailureDiagnosis = (messages: Array<{ role?: string; content?: unknown }>) => (
  messages.some(message => message.role === 'system' && String(message.content || '').startsWith(RHINO_FAILURE_DIAGNOSIS_MARKER))
);

export const hasRhinoFailureInspection = (messages: Array<{ role?: string; content?: unknown }>) => (
  messages.some(message => message.role === 'system' && String(message.content || '').startsWith(RHINO_FAILURE_INSPECTED_MARKER))
);

const receiptOf = (call: Pick<ChatToolCall, 'resultJson'>) => {
  try {
    const parsed = JSON.parse(call.resultJson || '{}');
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : { error: String(parsed) };
  } catch {
    return { error: call.resultJson || 'No structured Rhino error receipt was returned.' };
  }
};

/** Starts one evidence-first continuation; it never authorizes replay by itself. */
export const buildRhinoNativeFailureDiagnosisInstruction = (call: Pick<ChatToolCall, 'toolName' | 'resultJson'>) => {
  const receipt = receiptOf(call);
  const verification = receipt.geometryVerification && typeof receipt.geometryVerification === 'object'
    ? receipt.geometryVerification as Record<string, unknown>
    : undefined;
  const receiptJson = JSON.stringify(receipt).slice(0, 12_000);
  const verificationWarning = verification?.status === 'inspection_failed'
    ? 'The automatic document inspection failed. Do not issue any write or retry while the current document state cannot be verified. Attempt the required live read-only inspection; if it fails, stop with the exact failure evidence.'
    : verification?.writeFailed
      ? `The failed write was dispatched. Geometry verification status is ${String(verification.status || 'unknown')}; this does not prove there were no non-geometric side effects. Preserve any changed objects and never replay the failed operation.`
      : 'A remote write failure may have partial effects even if no geometry delta is shown. Inspect the live document before proposing a correction.';
  return `${RHINO_FAILURE_DIAGNOSIS_MARKER}
The Rhino MCP call ${call.toolName} failed. Diagnose this specific failure before deciding what to do; do NOT repeat the failed arguments or make a blind retry.

Failure receipt:
${receiptJson}

Required bounded procedure:
1. The next step must be a read-only inspection of the bound Rhino document or GH canvas, chosen to match the failed operation. Read the exact failing object/component, current IDs/types/values and any partial changes. The runtime has temporarily removed all write tools until this inspection succeeds.
2. Compare the observed state and the exact error. Identify the likely root cause, distinguish a bad API/member/type/argument from missing input, unavailable capability, timeout or partial write, and state which evidence supports that diagnosis. Do not invent an API, object ID or expected value.
3. After inspection, only if the cause is clear and a safe targeted correction is possible, perform one minimal changed correction that preserves successful work and the user's design. Never clear/recreate the model, repeat the same script/arguments, or replay an uncertain write. Keep existing object IDs and inspect the result afterward.
4. If state cannot be inspected, the error is ambiguous, a dependency/capability is missing, or the targeted correction fails, stop and report the concrete cause, what was inspected, what remains and the safest next step. Do not enter another automatic recovery loop.

${verificationWarning}`;
};

// An explicit allowlist: discovery alone is not evidence of the live document state.
const INSPECTION_TOOLS = new Set([
  'rhino_get_context', 'rhino_list_objects', 'rhino_list_layers', 'rhino_list_parts',
  'rhino_native_get_context', 'rhino_native_get_selection', 'rhino_native_list_objects',
  'rhino_native_g1_get_canvas_graph', 'rhino_native_g2_get_canvas_graph', 'rhino_native_get_viewport_image',
  'rhino_native_snapshot_document_geometry', 'rhino_native_verify_document_geometry',
  'rhino_native_verify_gh_geometry',
]);
export const isRhinoFailureInspectionTool = (name: string) => INSPECTION_TOOLS.has(name);
export const hasRhinoFailureCorrection = (messages: Array<{ role?: string; content?: unknown }>) => (
  messages.some(message => message.role === 'system' && String(message.content || '').startsWith(RHINO_FAILURE_CORRECTED_MARKER))
);
export const selectRhinoFailureInspectionTool = (names: string[], failedTool = '') => {
  const preferred = failedTool.includes('_g2_') ? 'rhino_native_g2_get_canvas_graph'
    : failedTool.includes('_g1_') ? 'rhino_native_g1_get_canvas_graph'
      : 'rhino_native_snapshot_document_geometry';
  return names.includes(preferred) ? preferred : names.find(isRhinoFailureInspectionTool);
};
const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a],[b]) => a.localeCompare(b)).map(([key,v]) => JSON.stringify(key)+':'+canonical(v)).join(',') + '}';
  return JSON.stringify(value) ?? 'null';
};
export const isUnchangedRhinoFailureReplay = (failed: Pick<ChatToolCall, 'toolName' | 'argumentsJson'> | undefined, toolName: string, args: Record<string, unknown>) => {
  if (!failed || failed.toolName !== toolName) return false;
  try { return canonical(JSON.parse(failed.argumentsJson)) === canonical(args); } catch { return true; }
};

export const hasRhinoFailureVerification = (messages: Array<{ role?: string; content?: unknown }>) => (
  messages.some(message => message.role === 'system' && String(message.content || '').startsWith(RHINO_FAILURE_VERIFIED_MARKER))
);

export const isRhinoFailureReadOnlyTool = (name: string, nativeReadOnly?: boolean) => (
  isRhinoFailureInspectionTool(name) || name === 'web_search' || (name.startsWith('rhino_native_') && nativeReadOnly === true)
);
