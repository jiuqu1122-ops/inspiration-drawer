import { describe, expect, it } from 'vitest';
import { assertRhinoScriptPreflight, inspectRhinoScript, rhinoScriptFailureExplanation, RhinoNativeMcpToolError, isConfirmedRhinoScriptFailure } from './rhinoScriptPreflight';
import { RhinoNativeScriptPreflightError, rhinoArgumentRejection, rhinoArgumentRepairCount, rhinoGhReflectionRecoveryState, unresolvedRhinoArgumentRejection } from './rhinoArgumentRecovery';

const python = 'rhino_native_run_python';
const bad = 'face = regions[0].Faces[0]\nsolid = Rhino.Geometry.Surface.CreateExtrusion(face, direction)';
const native = { name: python, description: 'test', readOnly: false, destructive: false, inputSchema: { required: ['script'] } };

const ghReflectionProbe = `import System
for asm in System.AppDomain.CurrentDomain.GetAssemblies():
 if 'Grasshopper' in asm.GetName().Name:
  print(asm.GetName().Name)
  if '2' in asm.GetName().Name:
   for t in asm.GetTypes():
    if t.Name in ['Instances','DocumentServer','Editor'] or 'ScriptComponent' in t.Name:
     print(t.FullName)`;

// API-signature fixtures are fragments, not complete executable modules.
const inspectGeometryFragment = (name: string, script: string) => inspectRhinoScript(name,script).filter(issue => issue.code !== 'rhino_python_missing_import');

describe('Grasshopper reflection compatibility preflight', () => {
  it('rejects the known read-only Assembly.GetTypes probe before Rhino dispatch', () => {
    expect(inspectGeometryFragment(python, ghReflectionProbe)).toEqual([expect.objectContaining({
      code: 'rhino_gh_reflection_scan',
      api: 'System.Reflection Assembly.GetTypes',
    })]);
    expect(() => assertRhinoScriptPreflight(python, { script: ghReflectionProbe }))
      .toThrow(RhinoNativeScriptPreflightError);
    try { assertRhinoScriptPreflight(python, { script: ghReflectionProbe }); }
    catch (error) { expect((error as RhinoNativeScriptPreflightError).correctionTool).toBe('rhino_native_g2_get_canvas_graph'); }
  });

  it('does not intercept GH scripts that can write geometry or component code', () => {
    expect(inspectGeometryFragment(python, `${ghReflectionProbe}\n__rhino_doc__.Objects.AddPoint((0, 0, 0))`)).toEqual([]);
    expect(inspectGeometryFragment(python, `${ghReflectionProbe}\ncomponent.Code = 'x = 1'`)).toEqual([]);
    expect(inspectGeometryFragment('rhino_native_run_csharp', ghReflectionProbe)).toEqual([]);
  });
});

describe('Rhino extrusion API preflight (local, no script execution)', () => {
  it.each([
    bad,
    'Rhino.Geometry.Surface.CreateExtrusion(regions[0].Faces[0], direction)',
    'from Rhino.Geometry import Surface\nSurface.CreateExtrusion(brep.Faces[0], direction)',
    'from Rhino.Geometry import Surface as S\nS.CreateExtrusion(brep.Faces[0], direction)',
    'import Rhino.Geometry as rg\nrg.Surface.CreateExtrusion(brep.Faces[0], direction)',
    'from Rhino import Geometry as g\ng.Surface.CreateExtrusion(brep.Faces[0], direction)',
    'import Rhino as R\nR.Geometry.Surface.CreateExtrusion(brep.Faces[0], direction)',
    'face = regions[0].Faces[0]\nalias = face\nRhino.Geometry.Surface.CreateExtrusion(alias, direction)',
    'Rhino.Geometry.Surface.CreateExtrusion(\n  regions[0].Faces[0],\n  Rhino.Geometry.Vector3d(0, 5, 0)\n)',
    'face = brep.Faces[0] # retain inner loops\nRhino.Geometry.Surface.CreateExtrusion(face, direction)',
  ])('rejects a face-to-curve mismatch before dispatch: %s', script => {
    const issues = inspectGeometryFragment(python, script);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: 'rhino_surface_extrusion_argument_type', actualType: 'BrepFace supplied where Curve is required' });
    expect(issues[0].instruction).toContain('preserve all inner loops');
    expect(() => assertRhinoScriptPreflight(python, { script })).toThrow(RhinoNativeScriptPreflightError);
  });
  it.each([
    'Surface.CreateExtrusion(region.ToBrep(), direction)',
    'Surface.CreateExtrusion(Brep.CreatePlanarBreps(loops, tol)[0], direction)',
    'Surface.CreateExtrusion(Brep.CreatePlanarBreps(loops, tol), direction)',
    'Surface.CreateExtrusion(Vector3d(0,0,5), direction)',
    'Surface.CreateExtrusion(profile, True)',
    'Surface.CreateExtrusion(profile, LineCurve(start, end))',
  ])('rejects other known incorrect overload types: %s', script => expect(inspectGeometryFragment(python, script)).toHaveLength(1));
  it.each([
    'Surface.CreateExtrusion(profile, Vector3d(0,0,5))',
    'profile = PolylineCurve(points)\nSurface.CreateExtrusion(profile, direction)',
    'face.CreateExtrusion(pathCurve, True)',
    'regions[0].Faces[0].CreateExtrusion(LineCurve(start, end), True)',
    'Surface.CreateExtrusion(region.Faces[0].OuterLoop.To3dCurve(), direction)',
    'face = brep.Faces[0]\nface = curve\nSurface.CreateExtrusion(face, direction)',
    'face = brep.Faces[0]\ndef unrelated(face):\n return Surface.CreateExtrusion(face, direction)',
    '# Surface.CreateExtrusion(region.Faces[0], direction)\nprint("done")',
    'source = "Surface.CreateExtrusion(region.Faces[0], direction)"',
    "component.Code = '''Surface.CreateExtrusion(region.Faces[0], direction)'''",
    'def dynamic(face, direction):\n return Surface.CreateExtrusion(face, direction)',
    'Surface = custom_api\nSurface.CreateExtrusion(region.Faces[0], direction)',
  ])('does not guess dynamic types or reject valid calls/embedded GH code: %s', script => expect(inspectGeometryFragment(python, script)).toEqual([]));
  it('also catches direct and alias-assigned C# BrepFace arguments', () => {
    expect(inspectGeometryFragment('rhino_native_run_csharp', 'using RG=Rhino.Geometry;\nvar face=brep.Faces[0];\nvar solid=RG.Surface.CreateExtrusion(face, direction);')).toHaveLength(1);
    expect(inspectGeometryFragment('rhino_native_run_csharp', '// Surface.CreateExtrusion(brep.Faces[0], direction)')).toEqual([]);
  });
  it('provides exact source line, typed receipt and bounded-repair accounting', () => {
    try { assertRhinoScriptPreflight(python, { script: bad }); throw new Error('expected rejection'); }
    catch (error) {
      expect(error).toBeInstanceOf(RhinoNativeScriptPreflightError);
      const receipt = rhinoArgumentRejection(native, error as Error);
      expect(receipt).toMatchObject({ kind: 'rhino_native_script_preflight', dispatched: false, scriptExecuted: false, documentChanged: false, correctionTool: python, issues: expect.arrayContaining([expect.objectContaining({ line: 2, code:'rhino_surface_extrusion_argument_type' })]) });
      expect(rhinoArgumentRepairCount([{ toolName: python, resultJson: JSON.stringify(receipt) } as any])).toBe(1);
      expect(rhinoArgumentRepairCount([{ toolName: python, resultJson: JSON.stringify({ ...receipt, dispatched: true }) } as any])).toBe(0);
    }
  });
  it('keeps recovery open through GH2 discovery and requires a build receipt', () => {
    let receipt: any;
    try { assertRhinoScriptPreflight(python, { script: ghReflectionProbe }); }
    catch (error) { receipt = rhinoArgumentRejection(native, error as Error); }
    const rejected: any = { toolName: python, status: 'error', resultJson: JSON.stringify(receipt) };
    const inspected: any = { toolName: 'rhino_native_g2_get_canvas_graph', status: 'completed', resultJson: JSON.stringify({ source: 'rhino', content: '{}' }) };
    const searched: any = { toolName: 'rhino_native_g2_search_components', status: 'completed', resultJson: JSON.stringify({ source: 'rhino', content: '[]' }) };
    expect(rhinoGhReflectionRecoveryState([rejected])).toBe('inspect');
    expect(rhinoGhReflectionRecoveryState([rejected, inspected])).toBe('continue');
    expect(rhinoGhReflectionRecoveryState([rejected, inspected, searched])).toBe('continue');
    expect(rhinoGhReflectionRecoveryState([rejected, inspected, searched], true)).toBe('failed');
    expect(rhinoGhReflectionRecoveryState([rejected, inspected, searched, { toolName: 'rhino_native_g2_apply_graph', status: 'completed', resultJson: JSON.stringify({ source: 'rhino', content: 'graph built' }) }], true)).toBe('complete');
    expect(rhinoGhReflectionRecoveryState([rejected, inspected, searched, { toolName: 'rhino_native_g2_apply_graph', status: 'error', resultJson: JSON.stringify({ error: 'component placement failed' }) }], true)).toBe('failed');
  });

  it('considers the read-only GH canvas correction a valid recovery step', () => {
    let receipt: any;
    try { assertRhinoScriptPreflight(python, { script: ghReflectionProbe }); }
    catch (error) { receipt = rhinoArgumentRejection(native, error as Error); }
    const calls: any[] = [
      { toolName: python, status: 'error', resultJson: JSON.stringify(receipt) },
      { toolName: 'rhino_native_g2_get_canvas_graph', status: 'completed', resultJson: JSON.stringify({ source: 'rhino', content: '{}' }) },
    ];
    expect(unresolvedRhinoArgumentRejection(calls)).toMatchObject({ toolName: 'rhino_native_g2_get_canvas_graph' });
    calls.push({ toolName: 'rhino_native_g2_apply_graph', status: 'completed', resultJson: JSON.stringify({ source: 'rhino', content: 'graph built' }) });
    expect(unresolvedRhinoArgumentRejection(calls)).toBeUndefined();
  });
  it('does not inspect unrelated native tools or malformed schema arguments', () => {
    expect(inspectGeometryFragment('rhino_native_get_context', bad)).toEqual([]);
    expect(() => assertRhinoScriptPreflight(python, {})).not.toThrow();
  });
  it('explains the exact remote error without classifying it as recoverable', () => {
    const remote = 'Rhino.Geometry.BrepFace value cannot be converted to Rhino.Geometry.Curve in method Rhino.Geometry.Surface CreateExtrusion(Rhino.Geometry.Curve, Rhino.Geometry.Vector3d)';
    expect(rhinoScriptFailureExplanation(remote)).toContain('BrepFace.CreateExtrusion');
    expect(rhinoScriptFailureExplanation('Timeout: outcome unknown')).toBeUndefined();
    expect(rhinoScriptFailureExplanation('Boolean operation failed')).toBeUndefined();
  });
});


describe('structured settled error detection (inspection only)',()=>{
 it('does not infer completion from arbitrary error text or a local exception',()=>{
  const traceback='Traceback (most recent call last):\n line 58\nTypeError: invalid argument';
  expect(isConfirmedRhinoScriptFailure(new Error(traceback))).toBe(false);
  expect(isConfirmedRhinoScriptFailure(new RhinoNativeMcpToolError(traceback))).toBe(true);
  expect(isConfirmedRhinoScriptFailure(new RhinoNativeMcpToolError('TimeoutException: '+traceback))).toBe(false);
  expect(isConfirmedRhinoScriptFailure(new RhinoNativeMcpToolError('Rhino is busy or showing a dialog'))).toBe(false);
 });
});


describe('extrusion argument counts and multiline syntax',()=>{
 it('recognizes a trailing comma without losing the face type',()=>{
  expect(inspectGeometryFragment('rhino_native_run_python','Surface.CreateExtrusion(\n brep.Faces[0],\n Vector3d(0,0,1),\n)')).toHaveLength(1);
 });
 it.each(['Surface.CreateExtrusion(profile)','Surface.CreateExtrusion(profile,direction,True)'])('rejects an invalid API overload before execution: %s',script=>{
  expect(inspectGeometryFragment('rhino_native_run_python',script)[0]).toMatchObject({code:'rhino_surface_extrusion_arity'});
 });
});

describe('self-contained native Python imports before dispatch',()=>{
 it.each([
  ['System.Guid.Empty','System',1],
  ['from System import Guid\nattrs.ObjectColor = System.Drawing.Color.Red','System',2],
  ['import Rhino.Geometry as rg\nids = System.Collections.Generic.List[System.Guid]()','System',2],
  ['doc.Objects.AddBrep(solid)\nattrs.ObjectColor = System.Drawing.Color.Red','System',2],
  ['color = Rhino.ApplicationSettings.AppearanceSettings.DefaultLayerColor','Rhino',1],
  ['angle = math.pi','math',1],
  ['pt = rg.Point3d(0,0,0)','rg',1],
  ['sc.doc.Views.Redraw()','sc',1],
 ])('rejects missing %s import before any native request', (script,name,line)=>{
   expect(inspectRhinoScript(python,script)).toContainEqual(expect.objectContaining({code:'rhino_python_missing_import',api:name,line}));
   try{assertRhinoScriptPreflight(python,{script});throw new Error('expected rejection');}catch(error){
    expect(error).toBeInstanceOf(RhinoNativeScriptPreflightError);const receipt=rhinoArgumentRejection(native,error as Error);
    expect(receipt).toMatchObject({dispatched:false,scriptExecuted:false,documentChanged:false,correctionTool:python});
   }
 });
 it.each([
  'import System\nx=System.Guid.Empty',
  'import System.Drawing\nx=System.Drawing.Color.Red',
  'import System as S\nx=S.Guid.Empty',
  'from System import Guid\nx=Guid.Empty',
  'from System import (\n Guid,\n String\n)\nx=Guid.Empty',
  'from System.Drawing import Color\nx=Color.Red',
  'import Rhino.Geometry as rg\nx=rg.Point3d(0,0,0)',
  'import Rhino, System, math\nx=System.Guid.Empty',
  '# System.Guid.Empty\ntext="System.Drawing.Color.Red"',
  'code="""x=System.Guid.Empty"""',
  'def operate(System):\n return System.Guid.Empty',
  'System = get_dynamic_namespace()\nx=System.Guid.Empty',
  'from library import System\nx=System.Guid.Empty',
  'from library import *\nx=System.Guid.Empty',
  'globals().update(dynamic_bindings)\nx=System.Guid.Empty',
  'from __future__ import annotations\ndef f(x: System.Guid): pass',
  'obj.System.Guid.Empty',
 ])('does not reject valid bindings, strings/comments, or unknown dynamic code: %s',script=>{
  expect(inspectRhinoScript(python,script).filter(issue=>issue.code==='rhino_python_missing_import')).toEqual([]);
 });
 it('never rewrites code or treats a remote NameError as a zero-write retry',()=>{
  const script='attrs.ObjectColor=System.Drawing.Color.Red';expect(()=>assertRhinoScriptPreflight(python,{script})).toThrow();expect(script).toBe('attrs.ObjectColor=System.Drawing.Color.Red');
  const remote=new RhinoNativeMcpToolError('Traceback (most recent call last):\n line 65\nNameError: name \'System\' is not defined');
  expect(isConfirmedRhinoScriptFailure(remote)).toBe(true);expect(remote).not.toBeInstanceOf(RhinoNativeScriptPreflightError);
 });
});
