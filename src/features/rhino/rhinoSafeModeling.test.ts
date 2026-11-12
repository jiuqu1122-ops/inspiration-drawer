import { guardRhinoGhScript } from './rhinoGhSafety';
import { describe, expect, it } from 'vitest';
import { assertSafePlanarRoute, buildSafeProfileScript, canUseSafeProfileTool, parseSafeProfileResult, PROFILE_RECEIPT_MARKER, RhinoGeometryPreflightError, SAFE_PROFILE_TOOL, safeProfileTool } from './rhinoSafeModeling';
import { RhinoNativeArgumentError } from './rhinoArgumentRecovery';
import fixture from './modeling/profile_failure_fixture.json';

const textResult = (receipt: Record<string, unknown>) => [{ type: 'text', text: JSON.stringify({ stdout: PROFILE_RECEIPT_MARKER + JSON.stringify(receipt) + '\n', stderr: '' }) }];
const validated = {version:1,status:'validated',stage:'preflight',documentChanged:false,valid:true,solid:true,partCount:3};
describe('controlled profile modeling contract', () => {
  it('publishes a discoverable bounded declarative geometry schema, never arbitrary Python', () => {
    const tool = safeProfileTool();
    expect(tool.name).toBe(SAFE_PROFILE_TOOL);
    expect(tool.inputSchema.required).toEqual(['mode','units','parts']);
    expect(tool.readOnly).toBe(false);
    expect(tool.destructive).toBe(false);
    expect(tool.description).toContain('NOT a guaranteed boolean-unioned');
  });
  it('only enables the builder when native Python accepts the required script argument', () => {
    const native = {name:'rhino_native_run_python',description:'test',readOnly:false,destructive:false,inputSchema:{required:['script']}};
    expect(canUseSafeProfileTool([native])).toBe(true);
    expect(canUseSafeProfileTool([])).toBe(false);
    expect(canUseSafeProfileTool([{...native,inputSchema:{required:['script','unknownRequired']}}])).toBe(false);
  });
  it('encodes user content as data rather than executable Python', () => {
    const malicious="quote'); raise Exception('must_not_execute') # \u4e2d\u6587";
    const script=buildSafeProfileScript({mode:'validate',units:'millimeters',parts:[{name:malicious}]});
    expect(script).not.toContain(malicious);
    const encoded=/b64decode\('([A-Za-z0-9+/=]+)'\)/.exec(script)![1];
    const decoded=new TextDecoder().decode(Uint8Array.from(atob(encoded),value=>value.charCodeAt(0)));
    expect(JSON.parse(decoded).parts[0].name).toBe(malicious);
    expect(script.indexOf('if mode == "validate"')).toBeLessThan(script.indexOf('gid = doc.Objects.AddBrep'));
    expect(script).not.toContain('Layers.Add'); expect(script).not.toContain('Materials.Add');
    expect(guardRhinoGhScript(script)).toBe(script);
  });
  it('retains the exact offending circles and explicit polygon fillets as a regression fixture', () => {
    expect(fixture.parts[0].holes[12]).toMatchObject({kind:'circle',center:[-18,36],radius:1.8});
    expect(fixture.parts[0].holes[13]).toMatchObject({kind:'circle',center:[18,36],radius:1.8});
    expect(fixture.parts[0].outer.filletRadius).toBe(2.6);
  });
  it('accepts an explicit validation-only receipt', () => {
    expect(parseSafeProfileResult(textResult(validated))).toEqual(validated);
  });
  it('only marks typed zero-write preflight rejections recoverable', () => {
    const receipt={version:1,status:'rejected',stage:'preflight',documentChanged:false,issues:[{code:'hole_outside_or_crossing',holeIndex:12}]};
    expect(()=>parseSafeProfileResult(textResult(receipt))).toThrow(RhinoGeometryPreflightError);
    expect(()=>parseSafeProfileResult(textResult({...receipt,documentChanged:true}))).not.toThrow(RhinoGeometryPreflightError);
  });
  it('never retries a commit failure or an unreadable/missing receipt', () => {
    expect(()=>parseSafeProfileResult(textResult({version:1,status:'commit_failed',stage:'commit',documentChanged:true}))).toThrow('do not replay');
    expect(()=>parseSafeProfileResult([])).toThrow('no unique');
    expect(()=>parseSafeProfileResult([{type:'text',text:JSON.stringify({stdout:'',stderr:'Traceback'})}])).toThrow('error receipt');
    expect(()=>parseSafeProfileResult([...textResult(validated),...textResult(validated)])).toThrow('no unique');
  });
  it('requires real unique committed IDs with matching part count before showing success', () => {
    const receipt={...validated,status:'committed',stage:'commit',documentChanged:true,partCount:1,objectIds:['12345678-1234-1234-1234-123456789abc']};
    expect(parseSafeProfileResult(textResult(receipt))).toEqual(receipt);
    expect(()=>parseSafeProfileResult(textResult({...receipt,objectIds:[]}))).toThrow('Incomplete commit');
    expect(()=>parseSafeProfileResult(textResult({...receipt,partCount:2}))).toThrow('Incomplete commit');
  });
  it('reroutes risky planar-write scripts locally before native dispatch while allowing other scripts', () => {
    try { assertSafePlanarRoute('rhino_native_run_python',{script:'faces=Brep.CreatePlanarBreps(curves,tol)\ngid=D.Objects.AddBrep(solid,attr)'},true); throw new Error('expected rejection'); }
    catch(error) { expect(error).toBeInstanceOf(RhinoNativeArgumentError); expect((error as RhinoNativeArgumentError).correctionTool).toBe(SAFE_PROFILE_TOOL); }
    expect(()=>assertSafePlanarRoute('rhino_native_run_csharp',{script:'var faces=Brep.CreatePlanarBreps(curves,tol); doc.Objects.AddBrep(solid);'},true)).toThrow(RhinoNativeArgumentError);
    expect(()=>assertSafePlanarRoute('rhino_native_run_python',{script:'print("context")'},true)).not.toThrow();
    expect(()=>assertSafePlanarRoute('rhino_native_run_python',{script:'CreatePlanarBreps(curves,tol);AddBrep(solid)'},false)).not.toThrow();
  });
  it('reroutes a hand-built cutter that caused Invalid hole loop for a planar bracket request', () => {
    const script='def cutter(loop):\n return Brep.CreateBooleanDifference(body, cutters, tol)\nD.Objects.AddBrep(result)';
    const userText='\u6309\u53c2\u8003\u56fe\u5efa\u6a21\u5de6\u53f3\u652f\u67b6\uff0c\u4fdd\u7559\u9552\u7a7a\u4e3b\u4f53\u548c\u5b89\u88c5\u8033';
    try { assertSafePlanarRoute('rhino_native_run_python',{script},true,userText); throw new Error('expected safe reroute'); }
    catch(error) { expect(error).toBeInstanceOf(RhinoNativeArgumentError); expect((error as RhinoNativeArgumentError).correctionTool).toBe(SAFE_PROFILE_TOOL); expect(String(error)).toContain('Invalid hole loop'); }
  });
  it('recognizes loop-built cutters even when the user prompt only says to model a reference image', () => {
    const script='def cutter(curve):\n return Brep.CreateFromExtrusion(curve, direction, True)\nresult=Brep.CreateBooleanDifference(body, cutters, tol)\nD.Objects.AddBrep(result)';
    expect(()=>assertSafePlanarRoute('rhino_native_run_python',{script},true,'model the selected reference image')).toThrow(RhinoNativeArgumentError);
  });
  it('does not replace explicit GH or freeform Boolean modeling with a planar profile builder', () => {
    const script='def cutter(surface):\n return Brep.CreateBooleanDifference(body, cutters, tol)\nD.Objects.AddBrep(result)';
    expect(()=>assertSafePlanarRoute('rhino_native_run_python',{script},true,'make a GH parametric freeform bracket')).not.toThrow();
    expect(()=>assertSafePlanarRoute('rhino_native_run_python',{script},true,'create a freeform sculpture')).not.toThrow();
    const planar='faces=Brep.CreatePlanarBreps(curves,tol)\nD.Objects.AddBrep(solid,attr)';
    expect(()=>assertSafePlanarRoute('rhino_native_run_python',{script:planar},true,'make a GH parameterized perforated plate')).not.toThrow();
  });
});

it('preserves nonplanar and mixed 3D native construction rather than forcing all models into a planar tool',()=>{
  const mixed='regions=Brep.CreatePlanarBreps(loops,tol)\nbody=Brep.CreateFromLoft(rails,p0,p1,loftType,False)\ndoc.Objects.AddBrep(body[0])';
  expect(()=>assertSafePlanarRoute('rhino_native_run_python',{script:mixed},true,'Build the object from the reference image')).not.toThrow();
  const branched='faces=Brep.CreatePlanarBreps(curves,tol)\ndoc.Objects.AddBrep(solid)';
  expect(()=>assertSafePlanarRoute('rhino_native_run_python',{script:branched},true,'Build an organic branched model')).not.toThrow();
});
