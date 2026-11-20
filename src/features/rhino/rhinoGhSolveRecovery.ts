import type { ChatToolCall } from '../chat/model/chatTypes';

export const RHINO_GH_SOLVE_RECOVERY_MARKER = 'GH_SOLVE_RECOVERY_V1:';

const decodeResult = (call: Pick<ChatToolCall, 'resultJson'>): Record<string, unknown> => {
  try {
    const value = JSON.parse(call.resultJson || '{}');
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
  } catch {
    return {};
  }
};

const textOf = (value: unknown) => {
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
};

const failureReceipt = (call: Pick<ChatToolCall, 'resultJson'>) => {
  const outer = decodeResult(call);
  if (typeof outer.error === 'string') {
    const start = outer.error.indexOf('{');
    if (start >= 0) {
      try {
        const nested = JSON.parse(outer.error.slice(start));
        if (nested && typeof nested === 'object' && !Array.isArray(nested)) return nested as Record<string, unknown>;
      } catch { /* Keep the outer MCP receipt. */ }
    }
  }
  return outer;
};

/** A solve failure is recoverable only when Rhino returned structured component statuses. */
export const isStructuredGhSolveFailure = (call: Pick<ChatToolCall, 'toolName' | 'status' | 'resultJson'>) => {
  if (call.toolName !== 'rhino_native_g1_solve_graph' || !['error', 'completed'].includes(call.status)) return false;
  const receipt = failureReceipt(call);
  if (!Array.isArray(receipt.statuses)) return false;
  if (call.status === 'error' || receipt.solved === false) return true;
  const statusText = textOf(receipt);
  return /component errors|solution reported errors|solve(?:r|ing)? failed/i.test(statusText)
    || receipt.statuses.some(value => {
      if (!value || typeof value !== 'object') return false;
      const status = value as Record<string, unknown>;
      if (/^(?:error|failed)$/i.test(String(status.level || status.status || ''))) return true;
      return Array.isArray(status.messages) && status.messages.some(message => {
        if (!message || typeof message !== 'object') return /^(?:error|failed)\b/i.test(String(message));
        const item = message as Record<string, unknown>;
        return /^(?:error|failed)$/i.test(String(item.level || item.type || ''));
      });
    });
};

/** Never start a second repair chain after a completed recovery continuation. */
export const hasGhSolveRecoveryContinuation = (messages: Array<{ role?: string; content?: unknown }>) => (
  messages.some(message => message.role === 'system' && String(message.content || '').startsWith(RHINO_GH_SOLVE_RECOVERY_MARKER))
);

export const buildGhSolveRecoveryInstruction = (call: Pick<ChatToolCall, 'resultJson'>) => {
  const receipt = textOf(failureReceipt(call)).slice(0, 12_000);
  const pointTypeHint = /Guid['"]? object has no attribute ['"]?X|attribute ['"]?X['"]|Guid.*(?:\.X|\.Y|\.Z)/i.test(receipt)
    ? '\nThis failure specifically indicates a Guid/object ID was used as a point. A component Guid is never a Point3d. Inspect the actual source component output and port types; connect a Construct Point/Point output or change the GH Python input conversion, but do not read .X/.Y/.Z from a Guid.'
    : '';
  return `${RHINO_GH_SOLVE_RECOVERY_MARKER}
The last Grasshopper solve returned structured component errors. Do one bounded self-recovery before telling the user it failed.

Failure receipt (authoritative, possibly partial):
${receipt}

Recovery procedure:
1. Call the read-only current-canvas inspection tool first (g1_get_canvas_graph) and inspect the failed component/status; do not repeat g1_solve_graph unchanged.
2. Use the exact existing component GUID and live port metadata. If a component is ambiguous, describe the returned component and use its GUID; do not invent IDs or install plugins.
3. Correct only the concrete type/connection/input problem. Preserve the existing graph, sliders, wires, user parameters and completed work. For a Python component, make the input conversion explicit and self-contained; never rely on variables from a previous script call.
4. Re-solve exactly once with g1_solve_graph, then inspect the returned statuses and final output. Do not clear/recreate the whole canvas, loop through guessed component names, or bake automatically unless the user explicitly requested baking.
5. If the corrected solve still reports component errors, stop and explain the exact component, source line, expected type and remaining issue. Do not start another recovery loop.
${pointTypeHint}`;
};


/** Extracts the concrete component diagnostics from the MCP's commonly nested error receipt. */
export const summarizeGhSolveFailure = (call: Pick<ChatToolCall, 'toolName' | 'status' | 'resultJson'>) => {
  const outer = decodeResult(call);
  const receipt = failureReceipt(call);
  const statuses = Array.isArray(receipt.statuses) ? receipt.statuses : [];
  const lines = statuses.flatMap(value => {
    if (!value || typeof value !== 'object') return [];
    const status = value as Record<string, unknown>;
    const component = String(status.name || status.component || status.title || '').trim();
    const messages = Array.isArray(status.messages) ? status.messages : [];
    const details = messages.flatMap(message => {
      if (typeof message === 'string') return [message.trim()];
      if (!message || typeof message !== 'object') return [];
      const item = message as Record<string, unknown>;
      return [String(item.text || item.message || '').trim()].filter(Boolean);
    });
    return details.length ? [`${component || 'Grasshopper component'}: ${details.join('; ')}`] : [];
  });
  const message = String(receipt.message || receipt.error || outer.error || 'Grasshopper solution failed').trim();
  return `${message}${lines.length ? `\n${lines.join('\n')}` : ''}`.slice(0, 4_000);
};
