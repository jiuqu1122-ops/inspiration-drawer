import { describe, expect, it } from 'vitest';
import { buildGhSolveRecoveryInstruction, hasGhSolveRecoveryContinuation, isStructuredGhSolveFailure, RHINO_GH_SOLVE_RECOVERY_MARKER, summarizeGhSolveFailure } from './rhinoGhSolveRecovery';
const failure = (result: unknown) => ({ toolName: 'rhino_native_g1_solve_graph', status: 'error' as const, resultJson: JSON.stringify(result) });
describe('bounded GH solve self-recovery', () => {
  it('recognizes only structured component solve failures', () => {
    expect(isStructuredGhSolveFailure(failure({ error: 'The solution reported component errors', message: 'component errors', statuses: [{ messages: [{ level: 'Error', text: "'Guid' object has no attribute 'X'" }] }] }))).toBe(true);
    expect(isStructuredGhSolveFailure(failure({ error: 'No Active Objects' }))).toBe(false);
    expect(isStructuredGhSolveFailure({ ...failure({ solved: false, statuses: [{ name: 'Construct Point', messages: [{ level: 'Error', text: 'Invalid input' }] }] }), status: 'completed' })).toBe(true);
    expect(isStructuredGhSolveFailure({ ...failure({ solved: true, statuses: [{ name: 'Construct Point', messages: [{ level: 'Remark', text: 'Using default' }] }] }), status: 'completed' })).toBe(false);
    expect(isStructuredGhSolveFailure({ ...failure({ statuses: [] }), status: 'completed' })).toBe(false);
    expect(isStructuredGhSolveFailure({ toolName: 'rhino_native_run_python', status: 'error', resultJson: JSON.stringify({ statuses: [{ messages: [{ text: 'component errors' }] }] }) })).toBe(false);
  });
  it('builds a one-shot diagnostic correction plan with the Guid/Point3d diagnosis', () => {
    const instruction = buildGhSolveRecoveryInstruction(failure({ error: 'The solution reported component errors', message: 'component errors', statuses: [{ name: 'IronPython 2 Script', messages: [{ level: 'Error', text: "'Guid' object has no attribute 'X' [64:1]" }] }] }));
    expect(instruction).toContain(RHINO_GH_SOLVE_RECOVERY_MARKER);
    expect(instruction).toContain('g1_get_canvas_graph'); expect(instruction).toContain('exactly once');
    expect(instruction).toContain('Guid is never a Point3d'); expect(instruction).toContain('do not repeat g1_solve_graph unchanged');
    expect(instruction).toContain('Do not clear/recreate');
  });
  it('reports nested component name and source error after the bounded repair fails', () => {
    const call = failure({ error: `Error: ${JSON.stringify({ error: 'The solution reported component errors', message: 'component errors', statuses: [{ name: 'IronPython 2 Script', messages: [{ text: "'Guid' object has no attribute 'X' [64:1]" }] }] })}` });
    expect(summarizeGhSolveFailure(call)).toContain('IronPython 2 Script');
    expect(summarizeGhSolveFailure(call)).toContain("'Guid' object has no attribute 'X' [64:1]");
  });
  it('prevents a second automatic recovery continuation', () => {
    expect(hasGhSolveRecoveryContinuation([])).toBe(false);
    expect(hasGhSolveRecoveryContinuation([{ role: 'system', content: `${RHINO_GH_SOLVE_RECOVERY_MARKER}\n...` }])).toBe(true);
    expect(hasGhSolveRecoveryContinuation([{ role: 'user', content: 'GH_SOLVE_RECOVERY_V1:' }])).toBe(false);
  });
});
