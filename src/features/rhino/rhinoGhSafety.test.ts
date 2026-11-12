// @ts-expect-error Node base64 helper is only used by this unit fixture.
import { Buffer } from 'node:buffer';
import { describe, expect, it } from 'vitest';
import { SAFE_PROFILE_PROGRAM_MARKER, buildSafeProfileScript } from './rhinoSafeModeling';
import { buildGhVerificationScript, containsGhCodeAssignment, guardRhinoGhScript, parseGhObservation, rhinoToolObservation, splitRhinoVisionObservation } from './rhinoGhSafety';

describe('Grasshopper Boolean guard and evidence safety',()=>{
 it('protects direct, aliased and setter assignments without matching comments or ordinary strings',()=>{
  expect(containsGhCodeAssignment('c.Code = source')).toBe(true);
  expect(containsGhCodeAssignment('setattr(c, "Code", source)')).toBe(true);
  expect(containsGhCodeAssignment('c.Code += more')).toBe(true);
  expect(containsGhCodeAssignment("text='c.Code = not an assignment'")).toBe(true); // lexical candidate; AST gate decides.
  expect(guardRhinoGhScript('print("hello")')).toBe('print("hello")');
  const script='c.Code = "import Rhino.Geometry as rg\na=rg.Brep.CreateBooleanUnion(parts,tol)"';
  const guarded=guardRhinoGhScript(script);
  expect(guarded).toContain('INSPIRATION_GH_GUARD_V1_BEGIN');
  expect(guarded).toContain('_id_gh_guarded_union');
  expect(guardRhinoGhScript(guarded)).toBe(guarded);
 });
 it('does not double-wrap the trusted closed-profile program containing its own CreatePlanarBreps/AddBrep',()=>{
  const controlled=buildSafeProfileScript({mode:'validate',units:'millimeters',parts:[]});
  expect(controlled).toContain(SAFE_PROFILE_PROGRAM_MARKER);
  expect(guardRhinoGhScript(controlled)).toBe(controlled);
 });
 it('builds a strictly read-only GH geometry inspection call',()=>{
  const script=buildGhVerificationScript({componentIds:['12345678-1234-1234-1234-123456789abc']});
  expect(script).toContain('_id_gh_observe'); expect(script).not.toMatch(/\.Code\s*=|\.AddBrep\s*\(/);
  expect(buildGhVerificationScript({})).toContain('[]');
  expect(()=>buildGhVerificationScript({componentIds:['../../bad']})).toThrow();
 });
 it('accepts the structured guard report but keeps geometry and photo accuracy claims separate',()=>{
  const report={version:1,status:'passed',components:[{componentId:'12345678-1234-1234-1234-123456789abc',status:'passed',photoFidelityVerified:false}]};
  expect(parseGhObservation([{type:'text',text:JSON.stringify({stdout:'INSPIRATION_GH_OBSERVATION_V1:'+JSON.stringify(report)})}])).toEqual(report);
  expect(parseGhObservation([{type:'text',text:'{"stdout":"plain text"}'}])).toBeUndefined();
 });
 it('preserves only a bounded trusted actual viewport image as a transient next-turn observation',()=>{
  const base64=Buffer.from([1,2,3,4]).toString('base64');
  const result=rhinoToolObservation('rhino_native_get_viewport_image',[{type:'text',text:'Bounds'},{type:'image',mimeType:'image/png',data:base64},{type:'image',mimeType:'image/png',data:'@@bad@@'}],7);
  expect(result).toMatchObject({documentId:7,viewportImageCount:1,transientRhinoImages:[{mimeType:'image/png',data:base64}]});
  expect(result.content).toBe('Bounds');
  expect(rhinoToolObservation('rhino_native_future_render_capture',[{type:'image',mimeType:'image/png',data:base64}],7)).toHaveProperty('transientRhinoImages');
 });
 it('keeps viewport base64 out of stored tool result but attaches it to the next model request',()=>{
  const base64=Buffer.from([5,6,7]).toString('base64');
  const observed=rhinoToolObservation('rhino_native_get_viewport_image',[{type:'image',mimeType:'image/jpeg',data:base64}],7);
  const split=splitRhinoVisionObservation('rhino_native_get_viewport_image',observed);
  expect(JSON.stringify(split.result)).not.toContain(base64);
  expect(split.observation?.content).toContainEqual({type:'image_url',image_url:{url:`data:image/jpeg;base64,${base64}`,detail:'high'}});
  expect(split.observation?.role).toBe('user');
  expect(splitRhinoVisionObservation('rhino_native_run_python',observed).observation).toBeDefined();
  expect(splitRhinoVisionObservation('generate_image',observed).observation).toBeUndefined();
 });
 it('accepts image bytes only below inline payload safety bound',()=>{
  const tooLarge='A'.repeat(3_300_004);
  const result=rhinoToolObservation('rhino_native_get_viewport_image',[{type:'image',mimeType:'image/png',data:tooLarge}],7);
  expect(result).not.toHaveProperty('transientRhinoImages');
  expect(result.viewportImageCount).toBe(0);
 });
});
