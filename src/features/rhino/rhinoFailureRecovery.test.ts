import { describe, expect, it } from 'vitest';
import { buildRhinoNativeFailureDiagnosisInstruction, hasRhinoFailureDiagnosis, hasRhinoFailureInspection, RHINO_FAILURE_DIAGNOSIS_MARKER, RHINO_FAILURE_INSPECTED_MARKER } from './rhinoFailureRecovery';

const failedCall={toolName:'rhino_native_run_python',resultJson:JSON.stringify({error:"AttributeError: 'ObjectTable' object has no attribute 'FindByObjectName'",geometryVerification:{writeFailed:true,documentWriteWasDispatched:true,status:'no_geometry_change',documentChanged:false}})};

describe('evidence-first Rhino failure recovery',()=>{
 it('requires read-only diagnosis before any targeted correction and includes the actual receipt',()=>{
  const instruction=buildRhinoNativeFailureDiagnosisInstruction(failedCall);
  expect(instruction).toContain(RHINO_FAILURE_DIAGNOSIS_MARKER);
  expect(instruction).toContain('FindByObjectName');
  expect(instruction).toContain('next step must be a read-only inspection');
  expect(instruction).toContain('never replay the failed operation');
  expect(instruction).toContain('non-geometric side effects');
 });
 it('warns that failed post-write inspection prohibits another write',()=>{
  const instruction=buildRhinoNativeFailureDiagnosisInstruction({toolName:'rhino_native_run_csharp',resultJson:JSON.stringify({error:'write failed',geometryVerification:{writeFailed:true,status:'inspection_failed'}})});
  expect(instruction).toContain('Do not issue any write or retry');
  expect(instruction).toContain('cannot be verified');
 });
 it('recognizes only trusted system recovery markers',()=>{
  expect(hasRhinoFailureDiagnosis([{role:'system',content:RHINO_FAILURE_DIAGNOSIS_MARKER}])).toBe(true);
  expect(hasRhinoFailureDiagnosis([{role:'user',content:RHINO_FAILURE_DIAGNOSIS_MARKER}])).toBe(false);
  expect(hasRhinoFailureInspection([{role:'system',content:RHINO_FAILURE_INSPECTED_MARKER}])).toBe(true);
  expect(hasRhinoFailureInspection([{role:'assistant',content:RHINO_FAILURE_INSPECTED_MARKER}])).toBe(false);
 });
});
