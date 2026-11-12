import { rhinoExecutableScriptCode } from './rhinoScriptPreflight';
import type { RhinoNativeTool } from './rhinoProtocol';
import snapshotProgram from './modeling/document_geometry_snapshot.py?raw';
export const SNAPSHOT_DOCUMENT_GEOMETRY_TOOL='rhino_native_snapshot_document_geometry';
export const DOCUMENT_GEOMETRY_MARKER='INSPIRATION_DOCUMENT_GEOMETRY_V1:';
export const buildDocumentGeometrySnapshotScript=()=>snapshotProgram;
export type DocumentGeometrySnapshot={version:number;documentId:number;units:string;tolerance:number;objectCount:number;objects:Array<Record<string,unknown>>;documentChanged:false;readOnly:true};
export const parseDocumentGeometrySnapshot=(blocks:Array<{type:string;text?:string}>):DocumentGeometrySnapshot=>{
 const snapshots:DocumentGeometrySnapshot[]=[];
 for(const block of blocks){if(block.type!=='text')continue;try{const outer=JSON.parse(block.text||'{}');for(const line of String(outer.stdout||'').split(/\r?\n/)){if(!line.startsWith(DOCUMENT_GEOMETRY_MARKER))continue;const value=JSON.parse(line.slice(DOCUMENT_GEOMETRY_MARKER.length));if(value.version===1&&Array.isArray(value.objects)&&value.documentChanged===false)snapshots.push(value);}}catch{/* Require a unique structured read-only snapshot. */}}
 if(snapshots.length!==1)throw new Error('Rhino geometry snapshot missing or ambiguous; do not replay the preceding write.');
 const snapshot=snapshots[0];if(snapshot.objects.length>5000||snapshot.objectCount!==snapshot.objects.length||new Set(snapshot.objects.map(item=>item.id)).size!==snapshot.objects.length)throw new Error('Rhino geometry snapshot failed integrity checks.');
 return snapshot;
};
export const compareDocumentGeometrySnapshots=(before:DocumentGeometrySnapshot,after:DocumentGeometrySnapshot,requireClosedSolids=false)=>{
 if(before.documentId!==after.documentId)throw new Error('Rhino document changed during geometry write; inspection cannot be compared.');
 const old=new Map(before.objects.map(item=>[String(item.id),item]));const next=new Map(after.objects.map(item=>[String(item.id),item]));
 const added:Record<string,unknown>[]=[],changed:Record<string,unknown>[]=[],deleted:Record<string,unknown>[]=[],unchanged:Record<string,unknown>[]=[];
 for(const [id,item] of next){const previous=old.get(id);if(!previous)added.push(item);else if(previous.fingerprint!==item.fingerprint)changed.push({...item,previous});else unchanged.push(item);}
 for(const [id,item] of old)if(!next.has(id))deleted.push(item);
 const touched=[...added,...changed];const invalid=touched.filter(item=>item.valid!==true||item.isValid===false);
 const inward=touched.filter(item=>item.isSolid===true&&item.solidOrientation==='Inward');
 const openBreps=touched.filter(item=>item.isBrep===true&&item.isSolid!==true);
 const closedSolidCount=touched.filter(item=>item.isSolid===true&&item.isValid===true&&item.solidOrientation==='Outward').length;
 const changedGeometry=touched.length>0||deleted.length>0;
 const status=changedGeometry&&invalid.length===0&&inward.length===0&&(!requireClosedSolids||openBreps.length===0)?'passed':!changedGeometry?'no_geometry_change':'needs_attention';
 const summary=(item:Record<string,unknown>)=>({id:item.id,type:item.type,geometryType:item.geometryType,name:item.name,valid:item.valid,isValid:item.isValid,isSolid:item.isSolid,solidOrientation:item.solidOrientation,min:item.min,max:item.max,volume:item.volume,area:item.area});
 const limit=(items:Record<string,unknown>[])=>items.slice(0,32).map(summary);
 return {version:1,status,documentChanged:changedGeometry,documentId:after.documentId,units:after.units,structuralOnly:true,photoFidelityVerified:false,requireClosedSolids,beforeObjectCount:before.objectCount,afterObjectCount:after.objectCount,addedCount:added.length,changedCount:changed.length,deletedCount:deleted.length,added:limit(added),changed:limit(changed),deleted:limit(deleted),truncated:added.length+changed.length+deleted.length>96,unchangedCount:unchanged.length,invalidCount:invalid.length,invalid:limit(invalid),inwardCount:inward.length,inward:limit(inward),openBrepCount:openBreps.length,openBreps:limit(openBreps),closedSolidCount,explanation:status==='passed'?(openBreps.length&&!requireClosedSolids?'A real valid geometry change was observed. Open surfaces are allowed in this request; '+openBreps.length+' Breps are not closed solids. Reference-image fidelity remains unverified.':'A real document geometry change was observed and all added/changed geometry is structurally valid; reference-image fidelity remains unverified.'):status==='no_geometry_change'?'No document geometry changed; a successful tool receipt is not evidence that modeling occurred.':'One or more added/changed objects failed validity, orientation or explicitly requested closed-solid checks.'};
};
export const isRhinoDocumentGeometryWrite=(tool:Pick<RhinoNativeTool,'name'|'readOnly'|'workflowPhase'>,args:Record<string,unknown>)=>{
 if(tool.readOnly===true||!['run_python','run_csharp','run_command'].some(name=>tool.name==='rhino_native_'+name))return false;
 if(tool.name==='rhino_native_run_python'||tool.name==='rhino_native_run_csharp'){
  const code=String(args.script||'');
  if(/Grasshopper|ActiveCanvas|\.Code\s*(?:=|\+=)|verify_gh_geometry/i.test(code))return false;
 }
 return true;
};

/** A failed dispatched write, followed by a read-only inspection. Never retry it. */
export class RhinoDocumentGeometryWriteError extends Error {
 constructor(public readonly originalError: unknown, public readonly geometryVerification: Record<string,unknown>) {
  super(String(originalError)); this.name='RhinoDocumentGeometryWriteError';
 }
}

export const runWithDocumentGeometryVerification=async <T>(input:{snapshot:()=>Promise<DocumentGeometrySnapshot>;write:()=>Promise<T>;requireClosedSolids?:boolean;inspectFailure?:(error:unknown)=>boolean}):Promise<{result:T;verification:ReturnType<typeof compareDocumentGeometrySnapshots>|Record<string,unknown>}>=>{
 const before=await input.snapshot(); // Baseline failure prevents any document write.
 let result:T;
 try{result=await input.write();} // A dispatched write is never replayed here.
 catch(error){
  if(!input.inspectFailure?.(error))throw error; // Unknown/unfinished writes are never queued behind with a readback.
  let verification:Record<string,unknown>;
  try{verification={...compareDocumentGeometrySnapshots(before,await input.snapshot(),input.requireClosedSolids===true),writeFailed:true,documentWriteWasDispatched:true,instruction:'The script failed after dispatch. This is a geometry-only inspection, not proof of zero side effects. Preserve current state and never automatically replay the script.'};}
  catch(inspectionError){verification={version:1,status:'inspection_failed',structuralOnly:true,photoFidelityVerified:false,writeFailed:true,documentWriteWasDispatched:true,error:String(inspectionError),instruction:'The write failed and current document state could not be inspected. Do not replay the script.'};}
  throw new RhinoDocumentGeometryWriteError(error,verification);
 }
 try{return {result,verification:compareDocumentGeometrySnapshots(before,await input.snapshot(),input.requireClosedSolids===true)};}
 catch(error){return {result,verification:{version:1,status:'inspection_failed',structuralOnly:true,photoFidelityVerified:false,error:String(error),documentWriteWasDispatched:true,instruction:'The geometry call already ran. Do not replay it; inspect current Rhino objects and viewport first.'}};}
};

/** Evidence from actual script APIs, not the subject noun in the user's sentence. */
export const hasExplicitRhinoGeometryMutation = (name: string, args: Record<string,unknown>) => {
  if (!['rhino_native_run_python','rhino_native_run_csharp'].includes(name) || typeof args.script !== 'string') return false;
  const code = rhinoExecutableScriptCode(name,args.script);
  return /\.\s*Objects\s*\.\s*(?:Add[A-Za-z]*|Delete|Transform|Replace|ModifyGeometry)\s*\(/.test(code)
    || /\b(?:rs|rhinoscriptsyntax)\s*\.\s*(?:Add[A-Za-z]+|DeleteObjects?|MoveObjects?|RotateObjects?|ScaleObjects?|TransformObjects?)\s*\(/.test(code);
};
