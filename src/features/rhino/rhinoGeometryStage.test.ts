import { describe, expect, it } from 'vitest';
import { guardRhinoGeometryStageScript, RHINO_GEOMETRY_STAGE_INSTRUCTION } from './rhinoGeometryStage';
import { hasExplicitRhinoGeometryMutation } from './rhinoDocumentGeometry';
import { buildRhinoWorkflowInstruction } from './rhinoWorkflow';

describe('general staged geometry for original and follow-up modeling', () => {
  it('keeps unrelated Python and GH workflows unmodified', () => {
    for(const script of ['print("hello")','doc.Objects.AddBrep(brep)','component.Code = "build()"'])expect(guardRhinoGeometryStageScript(script)).toBe(script);
  });
  it('provides the helper but compiles the original separately to preserve failure line numbers', () => {
    const script='stage = DrawerGeometryStage()\noriginal = stage.copy(target_id)\nstage.add("replacement",candidate,replace_id=target_id)\nprint(stage.commit())';
    const guarded=guardRhinoGeometryStageScript(script);
    expect(guarded).toContain('<drawer-geometry-stage>');expect(guarded).toContain('<drawer-user-script>');expect(guarded).toContain(JSON.stringify(script));
    expect(guarded).toContain('class DrawerGeometryStage');
    expect(hasExplicitRhinoGeometryMutation('rhino_native_run_python',{script})).toBe(true);
  });
  it('does not confuse a staging-only/no-commit operation with a write',()=>{
    for(const script of ['stage=DrawerGeometryStage()\npart=stage.copy(target_id)','# stage=DrawerGeometryStage()\n# stage.commit()','print("stage=DrawerGeometryStage();stage.commit()")'])expect(hasExplicitRhinoGeometryMutation('rhino_native_run_python',{script})).toBe(false);
  });
  it('requires role-aware validation and current document IDs without weakening design or replay rules',()=>{
    expect(buildRhinoWorkflowInstruction()).toContain(RHINO_GEOMETRY_STAGE_INSTRUCTION);
    for(const rule of ['solid','surface','curve','planar_faces','preserve object IDs','never demote','NOT a sandbox','never blindly replay','current document IDs'])expect(RHINO_GEOMETRY_STAGE_INSTRUCTION).toContain(rule);
  });
});
