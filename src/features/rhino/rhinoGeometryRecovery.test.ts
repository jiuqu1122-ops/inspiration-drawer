import { describe, expect, it } from 'vitest';
import { assertGeometryCorrection, geometryFailureReceipt, geometryFailureSummary } from './rhinoGeometryRecovery';
import { RhinoGeometryPreflightError, SAFE_PROFILE_TOOL } from './rhinoSafeModeling';
import type { ChatToolCall } from '../chat/model/chatTypes';
const part={name:'arbitrary-part',outer:{kind:'polygon',points:[[0,0],[20,0],[20,20],[0,20]]},holes:[{kind:'circle',center:[19,10],radius:2}],thickness:3,minWall:2};
const plan={mode:'commit',units:'millimeters',parts:[part]};
const failed=(issues:unknown[],args:unknown=plan):ChatToolCall=>({id:'prior',messageId:'turn',toolName:SAFE_PROFILE_TOOL,argumentsJson:JSON.stringify(args),resultJson:JSON.stringify({kind:'rhino_geometry_preflight',stage:'preflight',documentChanged:false,issues}),status:'error',createdAt:1});
const crossing={code:'hole_outside_or_crossing',part:part.name,holeIndex:0};

describe('general geometry correction checks (no model-specific coordinates in production)',()=>{
 it('rejects lowering minWall while the crossing hole/outer boundary are unchanged',()=>{
  const revised={...plan,parts:[{...part,minWall:.1}]};
  try{assertGeometryCorrection(revised,[failed([crossing])]);throw new Error('expected rejection');}
  catch(error){expect(error).toBeInstanceOf(RhinoGeometryPreflightError);expect((error as RhinoGeometryPreflightError).receipt).toMatchObject({documentChanged:false,dispatched:false,issues:[{code:'ineffective_geometry_correction',originalCode:'hole_outside_or_crossing'}]});}
 });
 it('permits a real boundary/position edit for any object type represented by the helper',()=>{
  expect(()=>assertGeometryCorrection({...plan,parts:[{...part,holes:[{kind:'circle',center:[10,10],radius:2}]}]},[failed([crossing])])).not.toThrow();
  expect(()=>assertGeometryCorrection({...plan,parts:[{...part,outer:{kind:'circle',center:[10,10],radius:30}}]},[failed([crossing])])).not.toThrow();
 });
 it('does not allow deleting holes as a way to make a failed plan pass',()=>{
  expect(()=>assertGeometryCorrection({...plan,parts:[{...part,holes:[]}]},[failed([crossing])])).toThrow(RhinoGeometryPreflightError);
 });
 it('allows initial plans and never turns an uncertain commit error into a zero-write preflight',()=>{
  expect(()=>assertGeometryCorrection(plan,[])).not.toThrow();
  const uncertain={...failed([crossing]),resultJson:JSON.stringify({kind:'rhino_geometry_preflight',documentChanged:true})};
  expect(()=>assertGeometryCorrection(plan,[uncertain])).not.toThrow();
 });
 it('adds relevant input paths and displays measured shortfalls instead of hiding all errors',()=>{
  const receipt=geometryFailureReceipt({issues:[crossing,{code:'hole_web_too_thin',part:part.name,holeIndex:0,actualClearance:1.5,requiredClearance:3}]},plan);
  expect(receipt).toMatchObject({issues:[{partIndex:0,inputPaths:['parts[0].outer','parts[0].holes[0]']},{}],repairPolicy:{maxCorrections:2}});
  expect(geometryFailureSummary(receipt)).toContain('孔 1');expect(geometryFailureSummary(receipt)).toContain('1.500');expect(geometryFailureSummary(receipt)).toContain('要求至少 3');
 });
 it('preserves constraints in the guidance and never mutates the proposed plan',()=>{
  const original=JSON.stringify(plan);geometryFailureReceipt({issues:[crossing]},plan);
  expect(JSON.stringify(plan)).toBe(original);
 });
});
