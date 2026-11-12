import {describe,expect,it,vi} from 'vitest';
import {compareDocumentGeometrySnapshots,hasExplicitRhinoGeometryMutation,RhinoDocumentGeometryWriteError,isRhinoDocumentGeometryWrite,parseDocumentGeometrySnapshot,runWithDocumentGeometryVerification,type DocumentGeometrySnapshot,SNAPSHOT_DOCUMENT_GEOMETRY_TOOL} from './rhinoDocumentGeometry';
const object=(id:string,overrides:Record<string,unknown>={})=>({id,type:'Brep',valid:true,isValid:true,isBrep:true,isSolid:true,solidOrientation:'Outward',faceCount:6,loopCount:6,edgeCount:12,min:[0,0,0],max:[10,10,10],volume:600,fingerprint:'box-10',...overrides});
const snapshot=(objects:Record<string,unknown>[],documentId=1)=>({version:1,documentId,units:'Millimeters',tolerance:.01,objectCount:objects.length,objects,documentChanged:false,readOnly:true}) as DocumentGeometrySnapshot;
const block=(value:unknown)=>[{type:'text',text:JSON.stringify({stdout:'INSPIRATION_DOCUMENT_GEOMETRY_V1:'+JSON.stringify(value),stderr:''})}];
describe('ordinary Rhino document geometry inspection',()=>{
 it('parses exactly one bounded integrity-checked read-only snapshot',()=>{
  expect(parseDocumentGeometrySnapshot(block(snapshot([object('a')])))).toMatchObject({documentId:1,objectCount:1});
  expect(()=>parseDocumentGeometrySnapshot([])).toThrow('ambiguous');
  expect(()=>parseDocumentGeometrySnapshot(block({...snapshot([object('a')]),documentChanged:true}))).toThrow('ambiguous');
  expect(()=>parseDocumentGeometrySnapshot(block({...snapshot([object('a'),object('a')]),objectCount:2}))).toThrow('integrity');
 });
 it('distinguishes added/modified/deleted/unchanged and checks solid closure and orientation',()=>{
  const before=snapshot([object('same'),object('changed'),object('deleted')]);
  const after=snapshot([object('same'),object('changed',{fingerprint:'box-11',volume:700}),object('new')]);
  expect(compareDocumentGeometrySnapshots(before,after)).toMatchObject({status:'passed',added:[{id:'new'}],changed:[{id:'changed'}],deleted:[{id:'deleted'}],unchangedCount:1,closedSolidCount:2,structuralOnly:true,photoFidelityVerified:false});
  expect(compareDocumentGeometrySnapshots(snapshot([]),snapshot([object('bad',{valid:false})]))).toMatchObject({status:'needs_attention',invalid:[{id:'bad'}]});
  expect(compareDocumentGeometrySnapshots(snapshot([]),snapshot([object('inward',{solidOrientation:'Inward'})]))).toMatchObject({status:'needs_attention',inward:[{id:'inward'}]});
  expect(compareDocumentGeometrySnapshots(snapshot([]),snapshot([object('open',{isSolid:false})]))).toMatchObject({status:'passed',openBreps:[{id:'open'}],requireClosedSolids:false});
  expect(compareDocumentGeometrySnapshots(snapshot([]),snapshot([object('open',{isSolid:false})]),true)).toMatchObject({status:'needs_attention',openBreps:[{id:'open'}],requireClosedSolids:true});
  expect(compareDocumentGeometrySnapshots(snapshot([]),snapshot([object('surface',{isBrep:true,isSolid:false,isValid:true})]))).toMatchObject({status:'passed',openBrepCount:1});
  expect(compareDocumentGeometrySnapshots(snapshot([]),snapshot([])).status).toBe('no_geometry_change');
  expect(()=>compareDocumentGeometrySnapshots(snapshot([],1),snapshot([],2))).toThrow('document changed');
 });
 it.each(['rhino_native_run_python','rhino_native_run_csharp','rhino_native_run_command'])('selects ordinary entity-writing tool %s for checks, but leaves GH/profile/appearance tools alone',name=>{
  expect(isRhinoDocumentGeometryWrite({name,readOnly:false,workflowPhase:'write'},name.endsWith('run_command')?{command:'_Box 0,0,0 10,10,10'}:{script:'doc.Objects.AddBrep(solid)'})).toBe(true);
  expect(isRhinoDocumentGeometryWrite({name:'rhino_native_set_layer_material',readOnly:false,workflowPhase:'write'},{material:{}})).toBe(false);
  expect(isRhinoDocumentGeometryWrite({name:'rhino_native_run_python',readOnly:false,workflowPhase:'write'},{script:'Grasshopper.Instances.ActiveCanvas.Document'})).toBe(false);
  expect(isRhinoDocumentGeometryWrite({name:'rhino_native_run_python',readOnly:false,workflowPhase:'write'},{script:'ghComp.Code = source'})).toBe(false);
  expect(isRhinoDocumentGeometryWrite({name:'rhino_native_safe_profile_solids',readOnly:false,workflowPhase:'write'},{mode:'commit'})).toBe(false);
 });
 it('uses an internal read-only bound-document snapshot tool, not a new write route',()=>{
  expect(SNAPSHOT_DOCUMENT_GEOMETRY_TOOL).toBe('rhino_native_snapshot_document_geometry');
 });
 it('takes baseline before write and records a real added solid without rerunning',async()=>{
  const events:string[]=[];const before=snapshot([]);const after=snapshot([object('created')]);
  const result=await runWithDocumentGeometryVerification({snapshot:async()=>{events.push('snapshot');return events.length===1?before:after;},write:async()=>{events.push('write');return 'receipt';}});
  expect(events).toEqual(['snapshot','write','snapshot']);expect(result).toMatchObject({result:'receipt',verification:{status:'passed',added:[{id:'created'}]}});
 });
 it('never dispatches if baseline inspection fails',async()=>{
  const write=vi.fn();await expect(runWithDocumentGeometryVerification({snapshot:async()=>{throw new Error('No baseline')},write})).rejects.toThrow('No baseline');expect(write).not.toHaveBeenCalled();
 });
 it('retains a dispatched write receipt when post-write inspection fails and never replays',async()=>{
  let count=0;const write=vi.fn(async()=>{count++;return 'already-dispatched'});
  const result=await runWithDocumentGeometryVerification({snapshot:async()=>{if(count)throw new Error('read-back failed');return snapshot([])},write});
  expect(write).toHaveBeenCalledOnce();expect(result).toMatchObject({result:'already-dispatched',verification:{status:'inspection_failed',documentWriteWasDispatched:true}});
 });
});


describe('failed geometry write inspection, never replay', () => {
 it.each([true,false])('records whether a settled script failure changed geometry: %s', async changed => {
  const snapshots=vi.fn().mockResolvedValueOnce(snapshot([])).mockResolvedValueOnce(snapshot(changed?[object('partial')]:[]));
  const write=vi.fn(async()=>{throw new Error('confirmed synthetic TypeError')});
  const error=await runWithDocumentGeometryVerification({snapshot:snapshots,write,inspectFailure:()=>true}).catch(error=>error);
  expect(error).toBeInstanceOf(RhinoDocumentGeometryWriteError);
  expect(error.geometryVerification).toMatchObject({writeFailed:true,documentWriteWasDispatched:true,documentChanged:changed,addedCount:changed?1:0});
  expect(error.geometryVerification.instruction).toContain('not proof of zero side effects');
  expect(write).toHaveBeenCalledOnce();expect(snapshots).toHaveBeenCalledTimes(2);
 });
 it('does not queue readback for timeout/unknown completion and preserves the original error',async()=>{
  const failure=new Error('Timeout: outcome unknown');const snapshots=vi.fn(async()=>snapshot([]));const write=vi.fn(async()=>{throw failure});
  await expect(runWithDocumentGeometryVerification({snapshot:snapshots,write})).rejects.toBe(failure);
  expect(write).toHaveBeenCalledOnce();expect(snapshots).toHaveBeenCalledOnce();
 });
 it('preserves the original script error when readback fails or targets a different document',async()=>{
  for(const readback of [()=>Promise.reject(new Error('readback failed')),()=>Promise.resolve(snapshot([],2))]){
   const snapshots=vi.fn().mockResolvedValueOnce(snapshot([],1)).mockImplementationOnce(readback);
   const failure=new Error('confirmed synthetic TypeError');const write=vi.fn(async()=>{throw failure});
   const error=await runWithDocumentGeometryVerification({snapshot:snapshots,write,inspectFailure:()=>true}).catch(error=>error);
   expect(error.originalError).toBe(failure);expect(error.geometryVerification).toMatchObject({status:'inspection_failed',writeFailed:true});
   expect(error.geometryVerification).not.toHaveProperty('documentChanged',false);expect(write).toHaveBeenCalledOnce();
  }
 });
});

describe('geometry checks selected by dispatched script, not product nouns',()=>{
 it.each(['__rhino_doc__.Objects.AddBrep(solid)','doc.Objects.AddMesh(mesh)','doc.Objects.Transform(id,xform,True)','rs.AddSphere((0,0,0),2)'])('recognizes actual geometry mutation: %s',script=>expect(hasExplicitRhinoGeometryMutation('rhino_native_run_python',{script})).toBe(true));
 it.each(['# doc.Objects.AddBrep(solid)','print("doc.Objects.AddBrep(solid)")','doc.Views.Redraw()','attrs.ObjectColor = System.Drawing.Color.Red','doc.Objects.Select(id)'])('does not apply a geometry-delta requirement to nongeometry code: %s',script=>expect(hasExplicitRhinoGeometryMutation('rhino_native_run_python',{script})).toBe(false));
});
