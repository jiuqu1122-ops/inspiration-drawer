import { describe, expect, it } from 'vitest';
import { hasInvalidGhLoopFailure, repeatedGhLoopFailureAfterCorrection } from './rhinoGhFailureGuard';

const result = (error: string) => JSON.stringify({ source: 'rhino', content: JSON.stringify({ result: { content: [{ type: 'text', text: JSON.stringify({ message: error }) }] } }) });
const ghCall = (id: string, error: string, toolName = 'rhino_native_g1_get_canvas_graph') => ({ id, toolName, status: 'completed' as const, resultJson: result(error) });

describe('Grasshopper invalid-loop retry guard', () => {
  it('recognizes Rhino and localized invalid-loop errors in nested MCP tool text', () => {
    expect(hasInvalidGhLoopFailure(ghCall('a', 'Exception: Invalid hole loop'))).toBe(true);
    expect(hasInvalidGhLoopFailure(ghCall('b', 'Inner loop is not closed'))).toBe(true);
    expect(hasInvalidGhLoopFailure(ghCall('c', '\u5b54\u73af\u672a\u95ed\u5408'))).toBe(true);
    const pythonGh = { ...ghCall('d', 'Outer loop is invalid', 'rhino_native_run_python'), resultJson: JSON.stringify({ ghVerification: { grasshopperCodeChanged: true, components: [{ errors: ['Invalid hole loop'] }] } }) };
    expect(hasInvalidGhLoopFailure(pythonGh)).toBe(true);
  });
  it('does not stop on the first failure or duplicate solve/inspect failures from one model batch', () => {
    const first = ghCall('first', 'Invalid hole loop');
    const sameBatchInspect = ghCall('inspect', 'Invalid hole loop');
    expect(repeatedGhLoopFailureAfterCorrection([first, sameBatchInspect], [first, sameBatchInspect])).toBe(false);
    expect(repeatedGhLoopFailureAfterCorrection([first], [ghCall('corrected', 'Graph updated')])).toBe(false);
  });
  it('stops after a later GH tool batch still reports an invalid loop', () => {
    const first = ghCall('first', 'Invalid hole loop');
    const correction = { id: 'fix', toolName: 'rhino_native_g1_apply_graph', status: 'completed' as const, resultJson: result('Graph updated') };
    const verifyAgain = ghCall('verify-again', 'Invalid hole loop');
    expect(repeatedGhLoopFailureAfterCorrection([first, correction, verifyAgain], [verifyAgain])).toBe(true);
  });
  it('ignores non-GH, successful, and cancelled tool results', () => {
    expect(hasInvalidGhLoopFailure(ghCall('python', 'Invalid hole loop', 'rhino_native_run_python'))).toBe(false);
    expect(hasInvalidGhLoopFailure({ ...ghCall('cancelled', 'Invalid hole loop'), status: 'cancelled' })).toBe(false);
    expect(hasInvalidGhLoopFailure(ghCall('ok', 'All loops are valid'))).toBe(false);
  });
});
