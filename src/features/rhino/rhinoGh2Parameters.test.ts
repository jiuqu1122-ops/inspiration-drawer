import { describe, expect, it } from 'vitest';
import { buildGh2ParameterInspectionScript, gh2ParametersTool } from './rhinoGh2Parameters';
import { RhinoNativeArgumentError } from './rhinoArgumentRecovery';
const id = 'a1111111-1111-4111-8111-111111111111';
describe('exact GH2 parameter inspection', () => {
  it('transports only known IDs to fixed read-only SDK inspection', () => {
    const script = buildGh2ParameterInspectionScript({ objectIds: [id], script: "print('untrusted')" });
    const payload = script.match(/b64decode\('([^']+)'\)/)![1];
    expect(JSON.parse(atob(payload))).toEqual({ objectIds: [id] });
    expect(script).toContain('runtimeParameterType');
    expect(script).toContain('solvedDataType');
    expect(script).toContain('RuntimeSerialNumber != __rhino_doc__.RuntimeSerialNumber');
    expect(script).not.toMatch(/Objects\.(Add|Remove|Clear)|\.Code\s*=|exec\(|Solution\.Start|untrusted/);
    expect(gh2ParametersTool()).toMatchObject({ readOnly: true, destructive: false, workflowPhase: 'verify' });
  });
  it.each([undefined, [], ["made-up"], [id, "');exec('oops"], Array(65).fill(id)])('rejects invalid or unbounded IDs', objectIds => {
    expect(() => buildGh2ParameterInspectionScript({ objectIds })).toThrow(RhinoNativeArgumentError);
  });
});
