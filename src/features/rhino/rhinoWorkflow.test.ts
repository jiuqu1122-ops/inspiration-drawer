import { describe, expect, it } from 'vitest';
import {
  buildRhinoWorkflowInstruction,
  describeRhinoNativeTool,
  getRhinoNativeWorkflowPhase,
  isRhinoNativeRecoverableError,
  validateRhinoNativeArguments,
} from './rhinoWorkflow';

describe('Rhino native workflow policy', () => {
  it('classifies the full MVP tool lifecycle', () => {
    expect(getRhinoNativeWorkflowPhase('rhino_native_g1_start')).toBe('lifecycle');
    expect(getRhinoNativeWorkflowPhase('rhino_native_g1_search_components')).toBe('discover');
    expect(getRhinoNativeWorkflowPhase('rhino_native_g1_apply_graph')).toBe('build');
    expect(getRhinoNativeWorkflowPhase('rhino_native_g1_connect_many')).toBe('connect');
    expect(getRhinoNativeWorkflowPhase('rhino_native_g1_solve_graph')).toBe('solve');
    expect(getRhinoNativeWorkflowPhase('rhino_native_g1_get_canvas_graph')).toBe('verify');
    expect(getRhinoNativeWorkflowPhase('rhino_native_run_command')).toBe('write');
  });

  it('validates required arguments and basic MCP schema types before dispatch', () => {
    const tool = { name: 'rhino_native_g1_search_components', inputSchema: {
      type: 'object', required: ['query'], properties: { query: { type: 'string' }, limit: { type: 'integer' } },
    }, readOnly: true };
    expect(validateRhinoNativeArguments(tool, {})).toMatchObject({ valid: false, missing: ['query'] });
    expect(validateRhinoNativeArguments(tool, { query: 'Sphere', limit: '5' })).toMatchObject({ valid: false, invalid: ['limit (integer)'] });
    expect(validateRhinoNativeArguments(tool, { query: 'Sphere', limit: 5 })).toEqual({ valid: true });
  });

  it('treats discovery errors as recoverable and writes as terminal', () => {
    expect(isRhinoNativeRecoverableError({ name: 'rhino_native_g1_describe_component', readOnly: true })).toBe(true);
    expect(isRhinoNativeRecoverableError({ name: 'rhino_native_run_command', readOnly: false })).toBe(false);
    expect(isRhinoNativeRecoverableError({ name: 'rhino_native_get_context', readOnly: true })).toBe(true);
  });

  it('describes intermediate steps and explicit no-replay behavior to the model', () => {
    const description = describeRhinoNativeTool({ name: 'rhino_native_g1_start', description: 'Starts Grasshopper', readOnly: false });
    expect(description).toContain('lifecycle');
    expect(description).toContain('preparation');
    const instruction = buildRhinoWorkflowInstruction();
    expect(instruction).toContain('step receipt');
    expect(instruction).toContain('Never repeat a successful write');
    expect(instruction).toContain('verify');
    expect(instruction).toContain('Invalid hole loop');
    expect(instruction).toContain('Do not hand-write BooleanDifference cutter loops');
  });
});

it('does not override an explicit mutation annotation with a familiar read-like name', () => { expect(isRhinoNativeRecoverableError({name:'rhino_native_get_viewport_image',readOnly:false})).toBe(false); expect(describeRhinoNativeTool({name:'rhino_native_get_context',readOnly:false})).toContain('write step'); });
