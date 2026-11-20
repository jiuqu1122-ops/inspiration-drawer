import { describe, expect, it } from 'vitest';
import { GRASSHOPPER_WORKFLOW_KNOWLEDGE, GRASSHOPPER_WORKFLOW_SOURCES } from './grasshopperWorkflowKnowledge';
import { buildRhinoWorkflowInstruction, describeRhinoNativeTool } from './rhinoWorkflow';
import { rhinoArgumentRepairExhausted, RHINO_ARGUMENT_REJECTION } from './rhinoArgumentRecovery';
import type { RhinoNativeTool } from './rhinoProtocol';
import type { ChatToolCall } from '../chat/model/chatTypes';
const name='rhino_native_g1_search_components';
const tool:RhinoNativeTool={name,description:'search',readOnly:true,destructive:false,inputSchema:{required:['query'],properties:{query:{type:'string'}}}};
const rejected=(id:string,toolName=name)=>({id,toolName,status:'error',resultJson:JSON.stringify({kind:RHINO_ARGUMENT_REJECTION,dispatched:false})} as ChatToolCall);
const completed=(toolName=name,reused=false)=>({id:'completed',toolName,status:'completed',resultJson:JSON.stringify(reused?{reusedCompletedReceipt:true}:{hits:[]})} as ChatToolCall);
describe('grounded, general Grasshopper workflow rather than a pattern-specific template',()=>{
 it('uses a bounded original runbook and cites genuine primer, primary docs and source samples',()=>{
  expect(GRASSHOPPER_WORKFLOW_KNOWLEDGE.length).toBeLessThan(5000);
  expect(GRASSHOPPER_WORKFLOW_SOURCES).toHaveLength(4);
  expect(buildRhinoWorkflowInstruction()).toContain(GRASSHOPPER_WORKFLOW_KNOWLEDGE);
  for(const concept of ['opaque script','preserve','query STRING','item/list/tree','GH_Path','Flatten/Graft','missing external source','after solve','do not bake automatically'])expect(GRASSHOPPER_WORKFLOW_KNOWLEDGE.toLowerCase()).toContain(concept.toLowerCase());
 });
 it('adds exact query/port guidance to discovered search tools',()=>{
  const description=describeRhinoNativeTool(tool);expect(description).toContain('non-empty query string');expect(description).toContain('schema');expect(description).toContain('ports');
 });
 it('lets a later independent search repair once after the previous one actually succeeded',()=>{
  expect(rhinoArgumentRepairExhausted([],tool)).toBe(false);
  expect(rhinoArgumentRepairExhausted([rejected('one')],tool)).toBe(true);
  expect(rhinoArgumentRepairExhausted([rejected('one'),completed()],tool)).toBe(false);
  expect(rhinoArgumentRepairExhausted([rejected('one'),completed(),rejected('two')],tool)).toBe(true);
 });
 it('does not reset from an unrelated call or a reused receipt, and keeps a turn-total limit',()=>{
  expect(rhinoArgumentRepairExhausted([rejected('one'),completed('rhino_native_g1_get_canvas_graph')],tool)).toBe(true);
  expect(rhinoArgumentRepairExhausted([rejected('one'),completed(name,true)],tool)).toBe(true);
  expect(rhinoArgumentRepairExhausted(Array.from({length:4},(_,i)=>[rejected('r'+i),completed()]).flat(),tool)).toBe(true);
 });
 it('never grants writes a fresh repair budget after a completed write',()=>{
  const write={...tool,name:'rhino_native_run_python',readOnly:false};
  expect(rhinoArgumentRepairExhausted([rejected('write',write.name),completed(write.name)],write)).toBe(true);
 });
});
