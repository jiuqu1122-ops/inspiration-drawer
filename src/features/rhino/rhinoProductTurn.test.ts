import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '../chat/model/chatTypes';
import { productRequest, productCompletionIssue, requiresSampledRecess } from './rhinoProductTurn';
const obj=(id:string,geometryType='Brep')=>({id,geometryType,valid:true});
const tool=(name:string,result:unknown,args={})=>({toolName:name,status:'completed',argumentsJson:JSON.stringify(args),resultJson:JSON.stringify(result)} as ChatToolCall);
const delta=(added:ReturnType<typeof obj>[],changed:ReturnType<typeof obj>[]=[],deleted:ReturnType<typeof obj>[]=[] ,content='')=>tool('rhino_native_run_python',{source:'rhino',content,geometryVerification:{documentChanged:true,added,changed,deleted,addedCount:added.length,changedCount:changed.length,deletedCount:deleted.length,truncated:false}});
const evidence=(id:string)=>JSON.stringify({stdout:'IDRAW_FEATURE_COMMIT_V1:'+JSON.stringify({partIds:[id],checks:[{type:'sampledGroove',passed:true,id}]})});
describe('Rhino product target evidence',()=>{
 it('inherits a representation constraint on retry but not unrelated new work',()=>{
  const h=[{role:'user' as const,content:'不要网格，我要 NURBS 曲面'},{role:'user' as const,content:'重试'}];
  expect(productRequest('继续',h)).toBe(h[0].content);expect(productRequest('创建灯光',h)).toBe('创建灯光');
 });
 it('does not let a later valid panel hide an earlier mesh housing; deliberate replacement resolves it',()=>{
  const t='不要网格，我要 NURBS 曲面', ops=[delta([obj('shell','Mesh')]),delta([obj('switch')])];
  expect(productCompletionIssue(t,ops)).toContain('Mesh'); expect(productCompletionIssue(t,[...ops,delta([],[obj('shell')])])).toBeUndefined();
 });
 it('requires a checked changed parent, not an unrelated marker, volume change or text claim',()=>{
  const t='在壳体上切出凹槽';expect(requiresSampledRecess(t)).toBe(true);expect(requiresSampledRecess('不要切出凹槽')).toBe(false);
  expect(productCompletionIssue(t,[delta([obj('trim')],[],[],evidence('shell'))])).toContain('去料');
  const passed=delta([],[obj('shell')],[],evidence('shell'));expect(productCompletionIssue(t,[passed,delta([obj('switch')])])).toBeUndefined();
  expect(productCompletionIssue(t,[passed,delta([],[obj('shell')])])).toContain('去料');
 });
 it('draft Boolean without host proof does not pass even if witnesses were requested',()=>{
  const t='成品要求真实凹槽', result={committed:true,objects:[obj('body'),obj('button')]};
  expect(productCompletionIssue(t,[tool('rhino_native_headless_build',result,{removedMaterialPoints:[[0,0,1]]})])).toContain('去料');
  expect(productCompletionIssue(t,[tool('rhino_native_headless_build',{...result,materialRemoval:{status:'passed',witnessCount:1,resultIds:['body']}})])).toBeUndefined();
 });
});
it('requires the separate existing component to have an identity-preservation witness independent of the recess',()=>{
 const request='请切出真实凹槽，保留已有独立零件', shell=obj('shell');
 expect(productCompletionIssue(request,[delta([],[shell],[],evidence('shell'))])).toContain('独立件');
 const content=JSON.stringify({stdout:'IDRAW_FEATURE_COMMIT_V1:'+JSON.stringify({partIds:['shell'],checks:[{type:'sampledGroove',id:'shell',passed:true},{type:'preservedObject',id:'cap',passed:true}]})});
 expect(productCompletionIssue(request,[delta([],[shell],[],content)])).toBeUndefined();
 expect(productCompletionIssue(request,[delta([],[shell],[],content),delta([],[],[obj('cap')])])).toContain('独立件');
});