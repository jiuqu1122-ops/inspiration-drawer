import { describe, expect, it } from 'vitest';
import { buildRhinoNativeFailureDiagnosisInstruction, hasRhinoFailureDiagnosis, hasRhinoFailureInspection, isFreshRhinoFailureInspection, isRhinoUnconfirmedWriteFailure, selectRhinoFailureInspectionTool, RHINO_FAILURE_DIAGNOSIS_MARKER, RHINO_FAILURE_INSPECTED_MARKER } from './rhinoFailureRecovery';

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
 it('requires a new GH2 graph observation after a failing GH2 script, not a Rhino context read', () => {
  const failed = {toolName:'rhino_native_run_python', argumentsJson: JSON.stringify({script:'from Grasshopper2.UI import Editor\nprint(Editor.Instance)'})};
  const graph = {toolName:'rhino_native_g2_get_canvas_graph', status:'completed' as const, resultJson:JSON.stringify({
    source: 'rhino', documentId: 7, content: '{"objects":[],"wires":[]}',
  })};
  expect(selectRhinoFailureInspectionTool(['rhino_get_context', graph.toolName], failed)).toBe(graph.toolName);
  expect(selectRhinoFailureInspectionTool(['rhino_get_context'], failed)).toBeUndefined();
  expect(isFreshRhinoFailureInspection({...graph, toolName:'rhino_get_context'}, failed)).toBe(false);
  expect(isFreshRhinoFailureInspection({...graph, resultJson:'{"reusedCompletedReceipt":true}'}, failed)).toBe(false);
  expect(isFreshRhinoFailureInspection({...graph, resultJson:'{"source":"rhino","documentId":7,"content":"Rhino is busy"}'}, failed)).toBe(false);
  expect(isFreshRhinoFailureInspection(graph, failed)).toBe(true);
 });
 it('distinguishes an unknown write outcome from ordinary component errors', () => {
  expect(isRhinoUnconfirmedWriteFailure({resultJson:JSON.stringify({error:'RhinoNativeMcpToolError: RHINO_NATIVE_OUTCOME_UNCONFIRMED: check state'})})).toBe(true);
  expect(isRhinoUnconfirmedWriteFailure(failedCall)).toBe(false);
 });
});
