import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '../chat/model/chatTypes';
import { rhinoPostprocessFailure } from './rhinoPostprocessFailure';
const call=(id:string,toolName:string,status:ChatToolCall['status']='completed',result:unknown={}):ChatToolCall=>({id,messageId:'same-turn',toolName,status,argumentsJson:'{}',resultJson:JSON.stringify(result),createdAt:1});
const geometry=()=>call('build','rhino_native_run_python','completed',{geometryVerification:{status:'passed',structuralOnly:true,documentChanged:true,addedCount:20,changedCount:0}});
describe('native post-processing failure presentation',()=>{
 it.each(['rhino_native_zoom_to_layer','rhino_native_zoom_to_object','rhino_native_set_camera','rhino_native_get_viewport_image'])('preserves verified geometry and exact remaining failure for %s',name=>{
  const build=geometry();const view=call('view',name,'error',{error:'document mismatch'});
  const result=rhinoPostprocessFailure([build,view],view);expect(result).toMatchObject({geometryCallId:'build'});expect(result?.summary).toContain('后续');expect(result?.summary).toContain('未完成');expect(result?.summary).toContain('不会重新建模');
 });
 it.each(['rhino_native_run_python','rhino_native_set_layer_material','rhino_native_save_doc','rhino_native_g1_solve_graph'])('does not disguise a failure of %s as view-only',name=>{
  const failed=call('bad',name,'error');expect(rhinoPostprocessFailure([geometry(),failed],failed)).toBeUndefined();
 });
 it('does not invent verified geometry from a tool completed status or stdout',()=>{
  const zoom=call('zoom','rhino_native_zoom_to_layer','error');expect(rhinoPostprocessFailure([call('build','rhino_native_run_python','completed',{stdout:'Created geometry'}),zoom],zoom)).toBeUndefined();
 });
 it.each([{status:'no_geometry_change',documentChanged:false},{status:'inspection_failed'},{status:'needs_attention'},{status:'passed',documentChanged:true,addedCount:20,writeFailed:true}])('does not promote uncertain or invalid geometry: %j',report=>{
  const zoom=call('zoom','rhino_native_zoom_to_layer','error');expect(rhinoPostprocessFailure([call('build','rhino_native_run_python','completed',{geometryVerification:report}),zoom],zoom)).toBeUndefined();
 });
 it('does not use an older success after a later unverified geometry mutation',()=>{
  const zoom=call('zoom','rhino_native_zoom_to_layer','error');expect(rhinoPostprocessFailure([geometry(),call('later-edit','rhino_native_run_python'),zoom],zoom)).toBeUndefined();
 });
 it('does not use a successful build after the failed step',()=>{
  const zoom=call('zoom','rhino_native_zoom_to_layer','error');expect(rhinoPostprocessFailure([zoom,geometry()],zoom)).toBeUndefined();
 });
 it('accepts a validated real safe-profile commit but never validation-only',()=>{
  const zoom=call('zoom','rhino_native_zoom_to_layer','error');const profile=call('profile','rhino_native_safe_profile_solids','completed',{status:'committed',stage:'commit',valid:true,solid:true,documentChanged:true,objectIds:['real-id']});expect(rhinoPostprocessFailure([profile,zoom],zoom)).toMatchObject({geometryCallId:'profile'});
  profile.resultJson=JSON.stringify({status:'validated',documentChanged:false});expect(rhinoPostprocessFailure([profile,zoom],zoom)).toBeUndefined();
 });
});
