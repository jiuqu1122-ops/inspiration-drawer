// This bundle is released independently. Keep this entry free of desktop IPC,
// React, credentials and UI state. The desktop owns transport and permissions.
export const apiVersion = 1;
export const productStageVersion = 1;
export { buildGh2ParameterInspectionScript } from '../rhinoGh2Parameters';
export { buildGh2ModelScript } from '../rhinoGh2Model';
export { inspectRhinoScript, rhinoScriptFailureExplanation } from '../rhinoScriptPreflight';
export { buildRhinoWorkflowInstruction } from '../rhinoWorkflow';
export { guardRhinoGeometryStageScript } from '../rhinoGeometryStage';
export { guardRhinoGhScript, buildGhVerificationScript } from '../rhinoGhSafety';
export { buildSafeProfileScript } from '../rhinoSafeModeling';
export { buildDocumentGeometrySnapshotScript } from '../rhinoDocumentGeometry';
export { readRhinoModelingSkillResource } from '../rhinoProductModelingKnowledge';
