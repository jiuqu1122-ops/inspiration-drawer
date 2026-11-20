import { describe, expect, it } from 'vitest';
import type { ChatToolCall } from '../chat/model/chatTypes';
import { buildGh2ModelScript, gh2CompletionState, gh2ModelTools, parseGh2ModelReport, GH2_MODEL_MARKER, GH2_VERIFY_MODEL_TOOL, GH2_REPAIR_OUTPUTS_TOOL } from './rhinoGh2Model';
const id = 'a1111111-1111-4111-8111-111111111111';
const output = 'b1111111-1111-4111-8111-111111111111';
const plan = {componentIds:[id],geometryOutputIds:[output]};
const passed = {version:1,status:'passed',graphChanged:false,previewAvailable:true,issues:[],outputs:[{id:output,items:1,validGeometryItems:1,invalidGeometryItems:0,rawItemTypes:{'Rhino.Geometry.Brep':1}}]};
const write = (name='rhino_native_g2_apply_graph') => ({id:'write',toolName:name,status:'completed'} as ChatToolCall);
const audit = (report:unknown=passed) => ({id:'audit',toolName:GH2_VERIFY_MODEL_TOOL,status:'completed',resultJson:JSON.stringify({gh2Verification:report})} as ChatToolCall);
const isWrite=(name:string)=>[GH2_REPAIR_OUTPUTS_TOOL,'rhino_native_g2_apply_graph','rhino_native_g2_solve_canvas','rhino_native_run_python'].includes(name);
describe('general GH2 model output acceptance',()=>{
 it('requires real native geometry after the last mutation, independently of the product requested',()=>{
  expect(gh2CompletionState([],isWrite)).toBeUndefined();
  expect(gh2CompletionState([write()],isWrite)?.passed).toBe(false);
  expect(gh2CompletionState([write(),audit()],isWrite)?.passed).toBe(true);
  expect(gh2CompletionState([write(),audit(),write('rhino_native_run_python')],isWrite)?.passed).toBe(false);
  expect(gh2CompletionState([write(),audit(),write('rhino_native_g2_solve_canvas')],isWrite)?.passed).toBe(false);
 });
 it.each([
  {...passed,previewAvailable:false}, {...passed,graphChanged:true}, {...passed,status:'needs_attention'}, {...passed,issues:[{code:'preview_cache_empty'}]},
  {...passed,outputs:[]}, {...passed,outputs:[{...passed.outputs[0],validGeometryItems:0}]},
  {...passed,outputs:[{...passed.outputs[0],rawItemTypes:{'Python.Runtime.PyObject':1}}]},
  {...passed,outputs:[{...passed.outputs[0],invalidGeometryItems:1}]},
 ])('does not accept a success label with incomplete/opaque/invalid outputs', report=>{
  expect(gh2CompletionState([write(),audit(report)],isWrite)?.passed).toBe(false);
 });
 it('treats conversion repair as a write requiring a new solve and acceptance receipt',()=>{
  expect(gh2CompletionState([write(),audit(),write(GH2_REPAIR_OUTPUTS_TOOL)],isWrite)?.passed).toBe(false);
  expect(gh2ModelTools().find(tool=>tool.name===GH2_REPAIR_OUTPUTS_TOOL)?.readOnly).toBe(false);
  expect(gh2ModelTools().find(tool=>tool.name===GH2_VERIFY_MODEL_TOOL)?.readOnly).toBe(true);
 });
 it('only admits bounded exact IDs and compiles data into fixed SDK code',()=>{
  const script=buildGh2ModelScript({...plan,script:'untrusted()'});
  const encoded=script.match(/b64decode\('([^']+)'\)/)![1];
  expect(JSON.parse(atob(encoded))).toEqual(plan);
  expect(script).not.toContain('untrusted()');
  expect(script).toContain('_g2v_audit(_g2v_plan)');
  expect(buildGh2ModelScript({...plan,expectedDocumentId:id},true)).toContain('_g2v_repair_outputs(_g2v_plan)');
  for(const bad of [{...plan,componentIds:[]},{...plan,geometryOutputIds:['fake']},{...plan,componentIds:[id,id]}])expect(()=>buildGh2ModelScript(bad)).toThrow();
  expect(()=>buildGh2ModelScript(plan,true)).toThrow();
 });
 it('accepts only marked fixed-helper native receipts, never model-authored prose',()=>{
  expect(parseGh2ModelReport([{type:'text',text:JSON.stringify({stdout:GH2_MODEL_MARKER+JSON.stringify(passed)})}])).toEqual(passed);
  expect(parseGh2ModelReport([{type:'text',text:JSON.stringify(passed)}])).toBeUndefined();
  expect(parseGh2ModelReport([{type:'text',text:JSON.stringify({stdout:GH2_MODEL_MARKER+JSON.stringify({version:1,status:'settings_changed'})})}])).toBeUndefined();
 });
});
