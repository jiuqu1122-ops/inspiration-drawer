import { describe, expect, it, vi } from 'vitest';
import * as bundled from './runtime/entry';
import { assertRhinoScriptPreflight, buildRhinoWorkflowInstruction, guardRhinoGeometryStageScript, validateRhinoRuntimeModule } from './rhinoRuntime';
import { RhinoNativeScriptPreflightError } from './rhinoArgumentRecovery';

describe('independent Rhino runtime contract and bundled fallback', () => {
  it('rejects incompatible/incomplete modules before exposing their functions', () => {
    expect(() => validateRhinoRuntimeModule(bundled)).not.toThrow();
    expect(() => validateRhinoRuntimeModule({ ...bundled, apiVersion: 2 })).toThrow('incompatible');
    expect(() => validateRhinoRuntimeModule({ ...bundled, guardRhinoGhScript: undefined })).toThrow('incompatible');
    expect(() => validateRhinoRuntimeModule({ ...bundled, inspectRhinoScript: vi.fn(() => null) })).toThrow('self-check');
  });
  it('retains host error identities and the corrected enum preflight', () => {
    expect(() => assertRhinoScriptPreflight('rhino_native_run_python', { script: 'import Rhino.Geometry as rg\ncap=rg.PipeCapMode.None' })).toThrow(RhinoNativeScriptPreflightError);
    expect(() => assertRhinoScriptPreflight('rhino_native_run_python', { script: 'import Rhino.Geometry as rg\ncap=rg.PipeCapMode.NONE' })).not.toThrow();
    expect(buildRhinoWorkflowInstruction()).toContain('PipeCapMode.NONE');
    expect(guardRhinoGeometryStageScript('stage=DrawerGeometryStage()')).toContain('<drawer-geometry-stage>');
  });
});
