import { callRhinoTool } from './rhinoClient';
import { STAGE_FAILURE_MARK, readableRhinoMcpFailure, rhinoGeometryFailureExplanation } from './rhinoErrorDiagnostic';
import { RhinoNativeMcpToolError, isConfirmedRhinoScriptFailure, rhinoScriptFailureExplanation } from './rhinoScriptPreflight';
import type { RhinoBinding } from './rhinoProtocol';
// @ts-expect-error The browser tsconfig omits Node types; this fixture runs only in Vitest.
import { spawnSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { guardRhinoGeometryStageScript, RHINO_GEOMETRY_STAGE_INSTRUCTION, RHINO_GH_BAKE_INSTRUCTION } from './rhinoGeometryStage';
import { hasExplicitRhinoGeometryMutation } from './rhinoDocumentGeometry';
import { buildRhinoWorkflowInstruction } from './rhinoWorkflow';

describe('general staged geometry for original and follow-up modeling', () => {
  it('keeps unrelated Python and GH workflows unmodified', () => {
    for(const script of ['print("hello")','doc.Objects.AddBrep(brep)','component.Code = "build()"'])expect(guardRhinoGeometryStageScript(script)).toBe(script);
  });
  it('provides the helper but compiles the original separately to preserve failure line numbers', () => {
    const script='stage = DrawerGeometryStage()\noriginal = stage.copy(target_id)\nstage.add("replacement",candidate,replace_id=target_id)\nprint(stage.commit())';
    const guarded=guardRhinoGeometryStageScript(script);
    expect(guarded).toContain('<drawer-geometry-stage>');expect(guarded).toContain('<drawer-user-script>');expect(guarded).toContain(JSON.stringify(script));
    expect(guarded).toContain('class DrawerGeometryStage');
    expect(hasExplicitRhinoGeometryMutation('rhino_native_run_python',{script})).toBe(true);
  });
  it('does not confuse a staging-only/no-commit operation with a write',()=>{
    for(const script of ['stage=DrawerGeometryStage()\npart=stage.copy(target_id)','# stage=DrawerGeometryStage()\n# stage.commit()','print("stage=DrawerGeometryStage();stage.commit()")'])expect(hasExplicitRhinoGeometryMutation('rhino_native_run_python',{script})).toBe(false);
  });
  it('requires role-aware validation and current document IDs without weakening design or replay rules',()=>{
    expect(buildRhinoWorkflowInstruction()).toContain(RHINO_GEOMETRY_STAGE_INSTRUCTION);
    for(const rule of ['solid','surface','curve','planar_faces','preserve object IDs','never demote','NOT a sandbox','never blindly replay','current document IDs'])expect(RHINO_GEOMETRY_STAGE_INSTRUCTION).toContain(rule);
  });
});


describe('GH bake uses native types and actual output inventory',()=>{
 it('loads the same staged helper for mesh/data-tree baking rather than replacing it with a model-specific template',()=>{
  const script='import Grasshopper as gh\noutput=target.Params.Output[output_index]\nstage=DrawerGeometryStage()\nprint(stage.add_tree("selected",output.VolatileData))\nprint(stage.preview())\nprint(stage.commit())';
  const wrapped=guardRhinoGeometryStageScript(script);expect(wrapped).toContain('def add_tree');expect(wrapped).toContain('ScriptVariable');expect(wrapped).toContain('"<drawer-user-script>"');
  expect(hasExplicitRhinoGeometryMutation('rhino_native_run_python',{script})).toBe(true);
 });
 it('instructs a full tree/type-aware bake without fixed counts, implicit truncation or automatic replay',()=>{
  for(const requirement of ['branch','actual output count','do not invent','do not silently skip','selected component/output','committedCount','2000','NOT a successful bake','cannot be retried blindly'])expect(RHINO_GH_BAKE_INSTRUCTION).toContain(requirement);
  expect(buildRhinoWorkflowInstruction()).toContain(RHINO_GH_BAKE_INSTRUCTION);
 });
});

// Only stub the four native imports; compile and execute the actual shipped wrapper AND
// helper in a fresh CPython interpreter. No geometry, filesystem model, or native IPC.
const bootstrap = `import sys, types
for name in ("System", "Rhino", "Rhino.Geometry", "Rhino.DocObjects", "scriptcontext"):
    module = sys.modules[name] = types.ModuleType(name)
    if "." in name:
        parent, attr = name.split(".")
        setattr(sys.modules[parent], attr, module)
sys.modules["scriptcontext"].doc = types.SimpleNamespace(ModelAbsoluteTolerance=0.01)
exec(compile(sys.stdin.read(), "<native-host>", "exec"), {})`;
const executePython = (wrapped: string) => {
  const run = spawnSync('python', ['-I', '-X', 'utf8', '-c', bootstrap], {input: wrapped, encoding: 'utf8', timeout: 8000});
  if (run.error) throw run.error;
  return run;
};
const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({invoke}));
const binding: RhinoBinding = {connection: {protocol: 1, url: 'http://127.0.0.1:19000/', token: 'a'.repeat(64), instanceId: 'd'.repeat(32)}, documentId: 5, canvasId: 'test'};

const nestedAssert = [
  'def build():',
  '    stage = DrawerGeometryStage()',
  '    def validate(part_name):',
  '        stage_name = "fit check"',
  '        assert False',
  '    validate("扣环 02")',
  'build()',
].join('\n');

describe('native run_python → actual wrapper exception → failed receipt → chat explanation', () => {
  it.each(['isError with joined native blocks', 'false success with stdout only', 'stderr only'])('%s', async mode => {
    let calls = 0;
    invoke.mockImplementation(async (_command, {body}) => {
      if (body.method !== 'tools/call') return {result: {}};
      calls++;
      const result = executePython(body.params.arguments.arguments.script);
      expect(result.status).toBe(1);
      expect(result.stdout.trim().split('\n')).toHaveLength(1);
      expect(result.stdout).toContain(STAGE_FAILURE_MARK);
      const streams = JSON.stringify({stdout: mode === 'stderr only' ? '' : 'private progress '.repeat(5000) + result.stdout,
        stderr: mode === 'stderr only' ? result.stderr : ''});
      const isError = mode.startsWith('isError');
      return {result: {isError, content: [{type: 'text', text: isError ? '{"error":"Failed","message":""}\n' + streams : streams}]}};
    });
    const failure = await callRhinoTool(binding, 'rhino_native_run_python', {script: nestedAssert}).catch(e => e);
    expect(calls).toBe(1);
    expect(failure).toBeInstanceOf(RhinoNativeMcpToolError);
    expect(isConfirmedRhinoScriptFailure(failure)).toBe(true); // permits inspection only
    // The bridge/geometry verification may stringify or nest the error before chat sees it.
    const receipt = JSON.parse(JSON.stringify({error: 'RhinoDocumentGeometryWriteError: ' + String(failure)}));
    const displayed = rhinoGeometryFailureExplanation(receipt.error) || rhinoScriptFailureExplanation(receipt.error) || readableRhinoMcpFailure(receipt.error);
    for (const fact of ['AssertionError', '第 5 行', 'validate', 'fit check', '扣环 02', '不能自动重放']) expect(displayed).toContain(fact);
    expect(displayed).not.toMatch(/Traceback|<native-host>|private progress|exec\(compile/);
  });

  it('uses the helper phase/part but the innermost user callsite, and bounds both output channels', () => {
    const script = 'def create():\n    stage = DrawerGeometryStage()\n    stage.add("曲线 01", None)\ncreate()';
    const run = executePython(guardRhinoGeometryStageScript(script));
    expect(run.status).toBe(1);
    const displayed = readableRhinoMcpFailure({stdout: run.stdout, stderr: ''});
    for (const fact of ['ValueError', '第 3 行', 'create', '阶段：add', '零件：曲线 01', 'Missing staged geometry']) expect(displayed).toContain(fact);
    expect(run.stdout.length).toBeLessThan(1600);
    expect(run.stderr).not.toContain('stage.add(');
  });

  it('does not dump arbitrary exception arguments, local objects, source or credential-like labels', () => {
    const script = 'stage=DrawerGeometryStage()\npart_name="sk-private-value"\nprivate_source="do_not_echo_me" * 1000\nraise KeyError(private_source)';
    const run = executePython(guardRhinoGeometryStageScript(script));
    expect(run.status).toBe(1);
    expect(run.stdout + run.stderr).not.toMatch(/sk-private-value|do_not_echo_me|private_source|class DrawerGeometryStage/);
    const displayed = readableRhinoMcpFailure(run.stdout);
    expect(displayed).toContain('KeyError'); expect(displayed).toContain('第 4 行');
    expect(displayed).not.toMatch(/阶段：|零件：/);
  });

  it.each([
    {setup: 'class InvalidOperationException(Exception):\n    __module__ = "System"', fail: 'raise InvalidOperationException("Invalid U and V counts. (System.InvalidOperationException)")', type: 'System.InvalidOperationException', detail: 'Invalid U and V counts. (System.InvalidOperationException)'},
    {setup: 'class Surface: pass', fail: 'Surface().DuplicateSurface()', type: 'AttributeError', detail: "'Surface' object has no attribute 'DuplicateSurface'"},
    {setup: 'class UnmappedGeometryFault(Exception): pass', fail: 'raise UnmappedGeometryFault("private arbitrary diagnostic")', type: 'UnmappedGeometryFault', detail: '未保存自由文本'},
  ])('preserves $type and the original user line, even with no stderr', ({setup, fail, type, detail}) => {
    const script = `${setup}\nstage=DrawerGeometryStage()\ndef inner():\n    ${fail}\ninner()`;
    const run = executePython(guardRhinoGeometryStageScript(script));
    expect(run.status).toBe(1);
    const displayed = rhinoGeometryFailureExplanation({stdout: run.stdout, stderr: ''});
    expect(displayed).toContain(type + ':'); expect(displayed).toContain(detail);
    expect(displayed).toContain(`第 ${script.split('\n').indexOf('    ' + fail) + 1} 行（inner）`);
    expect(run.stdout + run.stderr + displayed).not.toContain('private arbitrary diagnostic');
  });

  it('records compile-time SyntaxError.lineno and does not echo the source', () => {
    const run = executePython(guardRhinoGeometryStageScript('stage=DrawerGeometryStage()\nif INVALID_PRIVATE_SOURCE: :\n    pass'));
    expect(run.status).toBe(1);
    expect(readableRhinoMcpFailure(run.stdout)).toMatch(/SyntaxError:[\s\S]*第 2 行/);
    expect(run.stdout + run.stderr).not.toContain('INVALID_PRIVATE_SOURCE');
  });

  it('prefers the observed user frame to user-supplied SyntaxError attributes', () => {
    const run = executePython(guardRhinoGeometryStageScript('stage=DrawerGeometryStage()\ne=SyntaxError()\ne.filename="<drawer-user-script>"\ne.lineno="PRIVATE_CONTENT" * 1000\nraise e'));
    expect(run.status).toBe(1);
    expect(readableRhinoMcpFailure(run.stdout)).toContain('第 5 行');
    expect(run.stdout + run.stderr).not.toContain('PRIVATE_CONTENT');
  });

  it('leaves successful stdout/stderr exactly as written', () => {
    const run = executePython(guardRhinoGeometryStageScript('stage=DrawerGeometryStage()\nprint("receipt", end="")'));
    expect([run.status, run.stdout, run.stderr]).toEqual([0, 'receipt', '']);
  });
});
