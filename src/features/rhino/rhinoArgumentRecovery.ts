import type { ChatToolCall } from '../chat/model/chatTypes';
import type { RhinoNativeTool } from './rhinoProtocol';
import { getRhinoNativeWorkflowPhase, isRhinoNativeReadOnlyPhase } from './rhinoWorkflow';

export const RHINO_ARGUMENT_REJECTION = 'rhino_native_argument_validation';
export const RHINO_RUNTIME_COMPATIBILITY_REJECTION = 'rhino_native_runtime_compatibility';
export const RHINO_SCRIPT_PREFLIGHT_REJECTION = 'rhino_native_script_preflight';
export type RhinoGhReflectionRecoveryState = 'none' | 'inspect' | 'continue' | 'complete' | 'failed';

/** Tracks the narrowly-scoped GH reflection fallback without inferring success from text. */
export const rhinoGhReflectionRecoveryState = (calls: ChatToolCall[], continuationIssued = false): RhinoGhReflectionRecoveryState => {
  let rejectionIndex = -1;
  calls.forEach((call, index) => {
    try {
      const receipt = JSON.parse(call.resultJson || '{}');
      if (receipt.kind === RHINO_SCRIPT_PREFLIGHT_REJECTION && receipt.dispatched === false
        && Array.isArray(receipt.issues)
        && receipt.issues.some((issue: { code?: unknown }) => issue?.code === 'rhino_gh_reflection_scan')) rejectionIndex = index;
    } catch { /* Unknown receipts do not enter this recovery path. */ }
  });
  if (rejectionIndex < 0) return 'none';

  const later = calls.slice(rejectionIndex + 1);
  const inspection = later.find(call => call.toolName === 'rhino_native_g2_get_canvas_graph');
  if (!inspection) return 'inspect';
  if (inspection.status !== 'completed') return inspection.status === 'pending' || inspection.status === 'running' ? 'inspect' : 'failed';
  try { if (JSON.parse(inspection.resultJson || '{}').reusedCompletedReceipt) return 'failed'; } catch { /* Native read receipts may be plain text. */ }

  const following = later.slice(later.indexOf(inspection) + 1);
  const buildCalls = following.filter(call => {
    if (!call.toolName.startsWith('rhino_native_')) return false;
    const phase = getRhinoNativeWorkflowPhase(call.toolName);
    return ['build', 'connect', 'solve', 'write'].includes(phase);
  });
  if (buildCalls.some(call => call.status === 'completed')) return 'complete';
  if (buildCalls.some(call => call.status === 'error' || call.status === 'cancelled')) return 'failed';
  return continuationIssued ? 'failed' : 'continue';
};

/** Only local pre-dispatch failures may be repaired; never infer this from an error string. */
export class RhinoNativeArgumentError extends Error {
  constructor(message: string, public readonly correctionTool?: string) {
    super(message);
    this.name = 'RhinoNativeArgumentError';
  }
}

export type RhinoScriptIssue = { code: string; line: number; api: string; actualType: string; instruction: string };

/** Created only by the local static checker, before the original script is sent. */
export class RhinoNativeScriptPreflightError extends RhinoNativeArgumentError {
  constructor(public readonly issues: RhinoScriptIssue[], correctionTool: string) {
    super(issues.map(issue => `Line ${issue.line}: ${issue.api}: ${issue.actualType}. ${issue.instruction}`).join('\n'), correctionTool);
    this.name = 'RhinoNativeScriptPreflightError';
  }
}

/** Retry is permitted only for a known pre-execution host failure with a verified zero geometry delta. */
export class RhinoNativeRuntimeCompatibilityError extends Error {
  readonly correctionTool = 'rhino_native_run_python';
  constructor(message: string, public readonly geometryVerification: Record<string, unknown>) {
    super(message);
    this.name = 'RhinoNativeRuntimeCompatibilityError';
  }
}

export const rhinoArgumentRepairCount = (calls: ChatToolCall[], toolName?: string) => calls.filter(call => {
  if (toolName && call.toolName !== toolName) return false;
  try {
    const result = JSON.parse(call.resultJson || '{}');
    return ([RHINO_ARGUMENT_REJECTION, RHINO_SCRIPT_PREFLIGHT_REJECTION].includes(result.kind) && result.dispatched === false)
      || (result.kind === RHINO_RUNTIME_COMPATIBILITY_REJECTION && result.documentChanged === false && result.scriptExecuted === false)
      || (result.kind === 'rhino_geometry_preflight' && result.documentChanged === false);
  } catch { return false; }
}).length;

export const rhinoArgumentRejection = (tool: RhinoNativeTool, error: Error) => ({
  correctionTool: error instanceof RhinoNativeArgumentError ? error.correctionTool : undefined,
  kind: error instanceof RhinoNativeScriptPreflightError ? RHINO_SCRIPT_PREFLIGHT_REJECTION : RHINO_ARGUMENT_REJECTION,
  ...(error instanceof RhinoNativeScriptPreflightError ? { scriptExecuted: false, documentChanged: false, issues: error.issues } : {}),
  toolName: tool.name,
  error: error.message,
  dispatched: false,
  required: tool.inputSchema.required || [],
  inputSchema: tool.inputSchema,
  instruction: 'This call was rejected locally before dispatch; Rhino has not executed it. Correct the arguments using inputSchema and submit a new call once. For run_python/run_csharp supply the complete non-empty script string, not {}. Never repeat completed writes or retry an uncertain dispatched write. Do not ask the user to supply the script or approve it again.',
});

export const rhinoArgumentRepairInstruction = (toolName: string) => (
  `A typed Rhino preflight/runtime compatibility check rejected ${toolName}. Read its exact receipt to distinguish local script/type validation from a host startup failure. Follow correctionTool in the exact tool receipt once; do not repeat the rejected arguments unchanged or any previously completed write. Continue from successful receipts and verify the final document before reporting completion.`
);

const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};

/** Within an argument-repair continuation, reuse identical completed writes instead of replaying them. */
export const completedRhinoWriteReceipt = (calls: ChatToolCall[], tool: RhinoNativeTool, args: Record<string, unknown>): ChatToolCall | undefined => {
  if (tool.readOnly || isRhinoNativeReadOnlyPhase(getRhinoNativeWorkflowPhase(tool.name)) || !rhinoArgumentRepairCount(calls)) return undefined;
  return calls.find(call => {
    if (call.toolName !== tool.name || call.status !== 'completed' || !call.resultJson) return false;
    try { return canonical(JSON.parse(call.argumentsJson)) === canonical(args); } catch { return false; }
  });
};

/** A text-only reply cannot turn an unexecuted rejected command into a success. */
export const unresolvedRhinoArgumentRejection = (calls: ChatToolCall[]) => {
  let lastIndex = -1;
  calls.forEach((call, index) => { if (rhinoArgumentRepairCount([call]) > 0) lastIndex = index; });
  if (lastIndex < 0) return undefined;
  const rejected = calls[lastIndex];
  let correctionTool: string | undefined;
  try {
    const value = JSON.parse(rejected.resultJson || '{}').correctionTool;
    if (typeof value === 'string') correctionTool = value;
  } catch { /* Keep the original tool name when the receipt is unstructured. */ }
  const laterCalls = calls.slice(lastIndex + 1);
  const repaired = laterCalls.some(call => {
    if (call.status !== 'completed') return false;
    try { if (JSON.parse(call.resultJson || '{}').reusedCompletedReceipt) return false; } catch { /* Unstructured native receipts remain valid. */ }
    const phase = getRhinoNativeWorkflowPhase(call.toolName);
    return call.toolName === rejected.toolName || (call.toolName.startsWith('rhino_native_')
      && phase !== 'lifecycle' && !isRhinoNativeReadOnlyPhase(phase));
  });
  if (repaired) return undefined;
  if (correctionTool) return { ...rejected, toolName: correctionTool };
  return rejected;
};
