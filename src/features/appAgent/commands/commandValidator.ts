import type { AgentCanvasContext } from '../../agentModel';
import type { AppAgentCommand, LegacyAgentAction } from './commandTypes';
import {
  applyCreativeGeneratorDefaults,
  applyCreativeWorkflowDefaults,
  isCreativeLikeRequest,
  isCreativeEditRequest,
  parseCreativeDimensions,
  validateCreativeGeneratorAction,
} from '../skills/creativeProductDesignSkill';
import { isCanvasImageNodeWithSourceAsset, resolveWorkflowInputsFromContext, type WorkflowLike } from './workflowInputResolver';

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

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const asWorkflowDefinition = (args: Record<string, unknown>) => {
  const definition = asRecord(args.workflowDefinition);
  if (definition) return definition;
  if (Array.isArray(args.inputs) || Array.isArray(args.steps) || typeof args.templateId === 'string') {
    return {
      templateId: args.templateId,
      inputs: args.inputs,
      steps: args.steps,
      metadata: args.metadata,
    };
  }
  return null;
};

const getWorkflowStepType = (step: Record<string, unknown>) => String(step.type || step.kind || '').toLowerCase();

const getWorkflowStepIds = (value: unknown): string[] => (
  Array.isArray(value) ? value.map(String).filter(Boolean) : []
);

const getBoundNodeIds = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [
    typeof record.nodeId === 'string' ? record.nodeId : '',
    ...(Array.isArray(record.nodeIds) ? record.nodeIds.map(String) : []),
  ].filter(Boolean);
};

const getVisualStepInputIds = (step: Record<string, unknown>) => {
  const visualInputStepIds = getWorkflowStepIds(step.visualInputStepIds);
  if (visualInputStepIds.length > 0) return visualInputStepIds;
  const roles = asRecord(step.inputRoles) || {};
  const roleVisualInputs = Object.entries(roles)
    .filter(([, role]) => String(role) === 'visual_reference')
    .map(([inputId]) => inputId);
  if (roleVisualInputs.length > 0) return roleVisualInputs;
  return getWorkflowStepIds(step.inputStepIds)
    .filter(inputId => /product_reference_image|product_refs|image|reference/i.test(inputId));
};

const getTextStrategyInputIds = (step: Record<string, unknown>) => {
  const textInputStepIds = getWorkflowStepIds(step.textInputStepIds);
  if (textInputStepIds.length > 0) return textInputStepIds;
  const roles = asRecord(step.inputRoles) || {};
  return Object.entries(roles)
    .filter(([, role]) => String(role) === 'text_strategy')
    .map(([inputId]) => inputId);
};

const validateWorkflowDefinition = (
  workflowDefinition: Record<string, unknown>,
  args: Record<string, unknown>,
  context: AgentCanvasContext | undefined,
  errors: string[],
) => {
  const templateId = String(workflowDefinition.templateId || args.templateId || '');
  const requiresProductReferenceTemplate = templateId === 'industrial-design-review' || templateId === 'ecommerce-detail-page' || templateId === 'product-detail-page';
  const inputs = Array.isArray(workflowDefinition.inputs) ? workflowDefinition.inputs : [];
  const steps = Array.isArray(workflowDefinition.steps) ? workflowDefinition.steps : [];
  if (steps.length === 0) errors.push('workflowDefinition steps cannot be empty.');
  const hasProductReferenceInput = inputs.some(input => {
    const record = asRecord(input);
    return record?.id === 'product_reference_image' && String(record.type || '').toLowerCase() === 'image';
  });
  if (requiresProductReferenceTemplate && !hasProductReferenceInput) {
    errors.push(`${templateId} workflowDefinition must include required image input product_reference_image.`);
  }
  steps
    .map(asRecord)
    .filter((step): step is Record<string, unknown> => !!step)
    .forEach(step => {
      const stepType = getWorkflowStepType(step);
      if (!/image[-_]?generator/.test(stepType)) return;
      const requiresReferenceImages = step.requiresReferenceImages === true || requiresProductReferenceTemplate;
      const visualInputIds = getVisualStepInputIds(step);
      const textInputIds = getTextStrategyInputIds(step);
      if (requiresReferenceImages && visualInputIds.length === 0) {
        errors.push(`workflow generator "${String(step.id || step.title || 'unknown')}" requires a visual reference input; text strategy cannot replace product_reference_image.`);
      }
      if (
        requiresReferenceImages
        && visualInputIds.length > 0
        && requiresProductReferenceTemplate
        && !visualInputIds.includes('product_reference_image')
      ) {
        errors.push(`workflow generator "${String(step.id || step.title || 'unknown')}" must directly include product_reference_image as a visual input; strategy text cannot replace it.`);
      }
      if (requiresReferenceImages && visualInputIds.length === 0 && textInputIds.some(inputId => /strategy/i.test(inputId))) {
        errors.push(`workflow generator "${String(step.id || step.title || 'unknown')}" only has text strategy input; text strategy cannot replace visual reference input.`);
      }
    });
  const selectedReferenceImageNodeIds = asStringArray(args.selectedReferenceImageNodeIds);
  const inputBindings = asRecord(args.inputBindings) || {};
  const boundProductReferenceIds = getBoundNodeIds(inputBindings.product_reference_image);
  const selectedInputIds = asStringArray(args.inputIds);
  const hasBoundProductReference = [
    ...selectedReferenceImageNodeIds,
    ...boundProductReferenceIds,
    ...selectedInputIds,
  ].length > 0;
  if (args.autoRun === true && hasProductReferenceInput && !hasBoundProductReference) {
    const workflowResolution = resolveWorkflowInputsFromContext({
      workflow: workflowDefinition as WorkflowLike,
      context,
    });
    if (workflowResolution.resolvedImageNodeIds.length === 0) {
      errors.push('workflow run requires a selected product_reference_image before autoRun.');
    }
  }
  const contextNodeById = new Map((context?.nodes || []).map(node => [node.id, node]));
  [
    ...selectedReferenceImageNodeIds,
    ...boundProductReferenceIds,
    ...selectedInputIds,
  ].forEach(nodeId => {
    const node = contextNodeById.get(nodeId);
    if (node && /image/i.test(String(node.type || '')) && !isCanvasImageNodeWithSourceAsset(node)) {
      errors.push(`workflow reference image "${nodeId}" is missing a real source asset; thumbnail placeholder cannot be used as product_reference_image.`);
    }
  });
};

export function repairLegacyAgentAction(
  action: LegacyAgentAction,
  userText = '',
): LegacyAgentAction {
  if (action.tool !== 'canvas_create_generator' && action.tool !== 'canvas_create_workflow') return action;
  const repaired = action.tool === 'canvas_create_generator'
    ? applyCreativeGeneratorDefaults(action.arguments || {}, userText)
    : applyCreativeWorkflowDefaults(action.arguments || {}, userText);
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

  if (action.tool === 'drawer_search_inspirations') {
    if (!String(args.query || '').trim()) errors.push('drawer inspiration query is required.');
    if (!args.projectBrief || (typeof args.projectBrief !== 'string' && typeof args.projectBrief !== 'object')) {
      errors.push('drawer inspiration projectBrief is required.');
    }
    validateIds(asStringArray(args.folderIds), folderIds, 'folderId', errors);
  }

  if (action.tool === 'analyze_inspiration') {
    if (!String(args.itemId || '').trim()) errors.push('inspiration itemId is required.');
  }

  if (action.tool === 'analyze_inspirations_batch') {
    if (asStringArray(args.itemIds).length === 0) errors.push('inspiration batch itemIds are required.');
  }

  if (action.tool === 'get_inspiration_analysis_job' && !String(args.jobId || '').trim()) {
    errors.push('inspiration analysis jobId is required.');
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
    const workflowDefinition = asWorkflowDefinition(args);
    if (!workflowDefinition) {
      const steps = Array.isArray(args.steps) ? args.steps : [];
      if (steps.length === 0) errors.push('workflow steps cannot be empty.');
    } else {
      validateWorkflowDefinition(workflowDefinition, args, context, errors);
    }
  }

  if (['canvas_create_workflow', 'canvas_apply_workflow', 'canvas_run_workflow'].includes(action.tool)) {
    const workflowArg = args.workflowDefinition || args.workflow || args.workflowTemplate;
    if (workflowArg && typeof workflowArg === 'object' && !Array.isArray(workflowArg)) {
      const workflowResolution = resolveWorkflowInputsFromContext({
        workflow: workflowArg as WorkflowLike,
        context,
      });
      if (action.tool !== 'canvas_create_workflow' || args.autoRun === true) {
        errors.push(...workflowResolution.missingRequiredInputs);
      }
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
    if (isCreativeLikeRequest(userText) || isCreativeEditRequest(userText)) errors.push(...creativeErrors);
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
    const workflowDefinition = asWorkflowDefinition(command.args);
    if (workflowDefinition) validateWorkflowDefinition(workflowDefinition, command.args, context, errors);
    else {
      const steps = Array.isArray(command.args.steps) ? command.args.steps : [];
      if (steps.length === 0) errors.push('workflow steps cannot be empty.');
    }
  }
  if (command.domain === 'canvas') {
    validateIds(asStringArray(command.args.targetIds), getNodeIds(context), 'nodeId', errors);
  }
  return { valid: errors.length === 0, errors, warnings };
}
