import type { AgentCanvasContext } from '../../agentModel';
import type { AppAgentCommand, LegacyAgentAction } from './commandTypes';
import {
  applyCreativeGeneratorDefaults,
  isCreativeLikeRequest,
  parseCreativeDimensions,
  validateCreativeGeneratorAction,
} from '../skills/creativeProductDesignSkill';
import { resolveWorkflowInputsFromContext, type WorkflowLike } from './workflowInputResolver';

export interface CommandValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const asStringArray = (value: unknown): string[] => (
  Array.isArray(value) ? value.map(String).filter(Boolean) : []
);

const getNodeIds = (context?: AgentCanvasContext) => new Set((context?.nodes || []).map(node => node.id));
const getItemIds = (context?: AgentCanvasContext) => new Set((context?.drawer?.items || []).map(item => item.id));
const getFolderIds = (context?: AgentCanvasContext) => new Set((context?.drawer?.folders || []).map(folder => folder.id));
const getScheduleIds = (context?: AgentCanvasContext) => new Set((context?.calendar?.events || []).flatMap(event => [event.id, event.scheduleId, event.noteLabel].filter(Boolean)));

const validateIds = (
  ids: string[],
  validIds: Set<string>,
  label: string,
  errors: string[],
) => {
  if (validIds.size === 0 || ids.length === 0) return;
  ids.forEach(id => {
    if (!validIds.has(id)) errors.push(`${label} does not exist: ${id}`);
  });
};

export function repairLegacyAgentAction(
  action: LegacyAgentAction,
  userText = '',
): LegacyAgentAction {
  if (action.tool !== 'canvas_create_generator') return action;
  const repaired = applyCreativeGeneratorDefaults(action.arguments || {}, userText);
  return { ...action, arguments: repaired };
}

export function validateLegacyAgentAction(
  action: LegacyAgentAction,
  context?: AgentCanvasContext,
  userText = '',
): CommandValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const args = action.arguments || {};
  const nodeIds = getNodeIds(context);
  const itemIds = getItemIds(context);
  const folderIds = getFolderIds(context);
  const scheduleIds = getScheduleIds(context);

  if (action.tool === 'app_get_context') {
    const scopes = asStringArray(args.scopes);
    const validScopes = new Set(['minimal', 'app', 'drawer', 'canvas', 'calendar', 'settings', 'server', 'ui', 'full']);
    scopes.forEach(scope => {
      if (!validScopes.has(scope)) errors.push(`invalid context scope: ${scope}`);
    });
  }

  if (action.tool === 'drawer_manage') {
    validateIds(asStringArray(args.targetIds), itemIds, 'drawer itemId', errors);
    if (typeof args.folderId === 'string' && args.folderId && folderIds.size > 0 && !folderIds.has(args.folderId)) {
      errors.push(`folderId does not exist: ${args.folderId}`);
    }
  }

  if (action.tool === 'calendar_manage') {
    validateIds(asStringArray(args.targetIds), itemIds, 'drawer itemId', errors);
    const scheduleId = String(args.scheduleId || args.noteLabel || '');
    if (scheduleId && scheduleIds.size > 0 && !scheduleIds.has(scheduleId)) {
      errors.push(`scheduleId/noteLabel does not exist: ${scheduleId}`);
    }
  }

  if (action.tool === 'canvas_manage') {
    validateIds(asStringArray(args.targetIds), nodeIds, 'nodeId', errors);
    ['sourceId', 'targetId'].forEach(key => {
      const id = String(args[key] || '');
      if (id && nodeIds.size > 0 && !nodeIds.has(id)) errors.push(`${key} does not exist: ${id}`);
    });
  }

  if (['canvas_connect_nodes', 'canvas_update_prompt'].includes(action.tool)) {
    ['sourceId', 'targetId', 'nodeId'].forEach(key => {
      const id = String(args[key] || '');
      if (id && nodeIds.size > 0 && !nodeIds.has(id)) errors.push(`${key} does not exist: ${id}`);
    });
  }

  if (['canvas_run_workflow', 'canvas_organize', 'canvas_run_text_agent'].includes(action.tool)) {
    validateIds(asStringArray(args.nodeIds), nodeIds, 'nodeId', errors);
    const nodeId = String(args.nodeId || '');
    if (nodeId && nodeIds.size > 0 && !nodeIds.has(nodeId)) errors.push(`nodeId does not exist: ${nodeId}`);
  }

  if (action.tool === 'canvas_create_workflow') {
    const steps = Array.isArray(args.steps) ? args.steps : [];
    if (steps.length === 0) errors.push('workflow steps cannot be empty.');
  }

  if (['canvas_create_workflow', 'canvas_apply_workflow', 'canvas_run_workflow'].includes(action.tool)) {
    const workflowArg = args.workflow || args.workflowTemplate;
    if (workflowArg && typeof workflowArg === 'object' && !Array.isArray(workflowArg)) {
      const workflowResolution = resolveWorkflowInputsFromContext({
        workflow: workflowArg as WorkflowLike,
        context,
      });
      errors.push(...workflowResolution.missingRequiredInputs);
    }
  }

  if (action.tool === 'canvas_create_generator') {
    const hasReferenceImages = !!context?.visualReferences?.length || !!context?.selectedItems?.some(item => item.referenceCount || item.references?.length);
    const repaired = repairLegacyAgentAction(action, userText);
    const creativeErrors = validateCreativeGeneratorAction({
      args: repaired.arguments,
      userText,
      hasReferenceImages,
    });
    if (isCreativeLikeRequest(userText)) errors.push(...creativeErrors);
    validateIds(asStringArray(args.inputIds), nodeIds, 'input nodeId', errors);
    validateIds(asStringArray(args.referenceImageNodeIds), nodeIds, 'referenceImageNodeId', errors);
    const referenceRoleNodeIds = Array.isArray(args.referenceRoles)
      ? args.referenceRoles
        .map(role => role && typeof role === 'object' && !Array.isArray(role) ? String((role as Record<string, unknown>).nodeId || '') : '')
        .filter(Boolean)
      : [];
    validateIds(referenceRoleNodeIds, nodeIds, 'referenceRoles nodeId', errors);
    const sourceImageNodeId = String(args.sourceImageNodeId || '');
    if (sourceImageNodeId && nodeIds.size > 0 && !nodeIds.has(sourceImageNodeId)) {
      errors.push(`sourceImageNodeId does not exist: ${sourceImageNodeId}`);
    }
    const dimensions = parseCreativeDimensions(userText);
    if (dimensions.aspectRatio && args.aspectRatio !== dimensions.aspectRatio) warnings.push('generator aspectRatio was repaired from user request.');
    if (dimensions.targetSize && args.targetSize !== dimensions.targetSize) warnings.push('generator targetSize was repaired from user request.');
    if (dimensions.resolution && args.resolution !== dimensions.resolution) warnings.push('generator resolution was repaired from user request.');
  }

  if (action.tool === 'app_ui_interact') warnings.push('app_ui_interact always requires confirmation.');
  return { valid: errors.length === 0, errors, warnings };
}

export function validateAppAgentCommand(
  command: AppAgentCommand,
  context?: AgentCanvasContext,
): CommandValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!command.id.trim()) errors.push('command id is required.');
  if (!command.action.trim()) errors.push('command action is required.');
  if (command.domain === 'workflow' && command.action === 'create') {
    const steps = Array.isArray(command.args.steps) ? command.args.steps : [];
    if (steps.length === 0) errors.push('workflow steps cannot be empty.');
  }
  if (command.domain === 'canvas') {
    validateIds(asStringArray(command.args.targetIds), getNodeIds(context), 'nodeId', errors);
  }
  return { valid: errors.length === 0, errors, warnings };
}
