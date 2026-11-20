import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import * as bundled from './runtime/entry';
import { RhinoNativeArgumentError, RhinoNativeScriptPreflightError } from './rhinoArgumentRecovery';

export type RhinoRuntimeModule = typeof bundled;
type RuntimeLocation = { path: string; version: string; sha256: string } | null;
const requiredExports = [
  'inspectRhinoScript', 'rhinoScriptFailureExplanation', 'buildRhinoWorkflowInstruction',
  'guardRhinoGeometryStageScript', 'guardRhinoGhScript', 'buildGhVerificationScript',
  'buildSafeProfileScript', 'buildDocumentGeometrySnapshotScript', 'readRhinoModelingSkillResource',
] as const;
let active: RhinoRuntimeModule = bundled;
let loading: Promise<void> | undefined;
let activeVersion = 'bundled';
let loadError = '';

export function validateRhinoRuntimeModule(value: unknown): asserts value is RhinoRuntimeModule {
  if (!value || typeof value !== 'object') throw new Error('Rhino runtime module is missing');
  const module = value as Record<string, unknown>;
  if (module.apiVersion !== 1 || requiredExports.some(name => typeof module[name] !== 'function')) {
    throw new Error('Rhino runtime module is incompatible with host API 1');
  }
  // A deterministic, zero-IPC smoke check also catches a damaged/wrong bundle.
  if (!Array.isArray((module as RhinoRuntimeModule).inspectRhinoScript('rhino_native_get_context', ''))) {
    throw new Error('Rhino runtime module failed its self-check');
  }
}

/** One immutable module per desktop process. Downloaded updates activate after
 * restart; an in-flight task can never change implementation half way through. */
export async function ensureRhinoRuntimeLoaded(): Promise<void> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
  if (!loading) loading = (async () => {
    try {
      // Native code verifies the pinned signature, artifact hash AND extracted
      // file bytes on every load. No model/tool can supply this path or source.
      const location = await invoke<RuntimeLocation>('rhino_runtime_location');
      if (!location) return;
      const module: unknown = await import(/* @vite-ignore */ convertFileSrc(location.path));
      validateRhinoRuntimeModule(module);
      active = module;
      activeVersion = location.version;
    } catch (error) {
      loadError = String(error);
      console.warn('Rhino runtime update could not load; using bundled runtime:', error);
    }
  })();
  await loading;
}

export const rhinoRuntimeStatus = () => ({ version: activeVersion, error: loadError });
export const inspectRhinoScript: RhinoRuntimeModule['inspectRhinoScript'] = (...args) => active.inspectRhinoScript(...args);
export const rhinoScriptFailureExplanation: RhinoRuntimeModule['rhinoScriptFailureExplanation'] = (...args) => active.rhinoScriptFailureExplanation(...args);
export const buildRhinoWorkflowInstruction: RhinoRuntimeModule['buildRhinoWorkflowInstruction'] = (...args) => active.buildRhinoWorkflowInstruction(...args);
export const guardRhinoGeometryStageScript: RhinoRuntimeModule['guardRhinoGeometryStageScript'] = (...args) => active.guardRhinoGeometryStageScript(...args);
export const guardRhinoGhScript: RhinoRuntimeModule['guardRhinoGhScript'] = (...args) => active.guardRhinoGhScript(...args);
export const buildGhVerificationScript: RhinoRuntimeModule['buildGhVerificationScript'] = (...args) => active.buildGhVerificationScript(...args);
export const buildDocumentGeometrySnapshotScript: RhinoRuntimeModule['buildDocumentGeometrySnapshotScript'] = (...args) => active.buildDocumentGeometrySnapshotScript(...args);
export const readRhinoModelingSkillResource: RhinoRuntimeModule['readRhinoModelingSkillResource'] = (...args) => active.readRhinoModelingSkillResource(...args);
export const buildGh2ParameterInspectionScript: RhinoRuntimeModule['buildGh2ParameterInspectionScript'] = (...args) => {
  try { return (active.buildGh2ParameterInspectionScript || bundled.buildGh2ParameterInspectionScript)(...args); }
  catch (error) {
    if (error instanceof Error && error.name === 'RhinoNativeArgumentError') throw new RhinoNativeArgumentError(error.message);
    throw error;
  }
};
export const buildGh2ModelScript: RhinoRuntimeModule['buildGh2ModelScript'] = (...args) => {
  try { return (active.buildGh2ModelScript || bundled.buildGh2ModelScript)(...args); }
  catch (error) {
    if (error instanceof Error && error.name === 'RhinoNativeArgumentError') throw new RhinoNativeArgumentError(error.message);
    throw error;
  }
};
export const buildSafeProfileScript: RhinoRuntimeModule['buildSafeProfileScript'] = (...args) => {
  try { return active.buildSafeProfileScript(...args); }
  catch (error) {
    // Class identities do not cross independent ESM bundles. Recreate only the
    // typed local validation error; remote/unknown failures stay terminal.
    if (error instanceof Error && error.name === 'RhinoNativeArgumentError') throw new RhinoNativeArgumentError(error.message);
    throw error;
  }
};
export function assertRhinoScriptPreflight(name: string, args: Record<string, unknown>): void {
  if (typeof args.script !== 'string') return;
  const issues = inspectRhinoScript(name, args.script);
  if (issues.length) throw new RhinoNativeScriptPreflightError(issues,
    issues.some(issue => issue.code === 'rhino_gh_reflection_scan') ? 'rhino_native_g2_get_canvas_graph' : name);
}
