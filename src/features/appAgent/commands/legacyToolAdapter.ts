import type { AppAgentCommand, AppAgentPlan, LegacyAgentAction } from './commandTypes';

const commandArgs = (command: AppAgentCommand) => ({
  action: command.action,
  ...command.args,
});

const withCommandMeta = (
  action: LegacyAgentAction,
  command: AppAgentCommand,
): LegacyAgentAction => ({
  ...action,
  stepId: command.stepId,
  createsNode: command.createsNode,
  outputRef: command.outputRef,
  sourceCommandId: command.id,
});

export function adaptCommandToLegacyAction(command: AppAgentCommand): LegacyAgentAction {
  if (command.domain === 'app') return withCommandMeta({ tool: 'app_navigate', arguments: commandArgs(command) }, command);
  if (command.domain === 'drawer') return withCommandMeta({ tool: 'drawer_manage', arguments: commandArgs(command) }, command);
  if (command.domain === 'calendar') return withCommandMeta({ tool: 'calendar_manage', arguments: commandArgs(command) }, command);
  if (command.domain === 'ui') return withCommandMeta({ tool: 'app_ui_interact', arguments: commandArgs(command) }, command);
  if (command.domain === 'media') return withCommandMeta({ tool: 'canvas_create_media_tool', arguments: command.args }, command);
  if (command.domain === 'workflow') {
    if (command.action === 'apply') return withCommandMeta({ tool: 'canvas_apply_workflow', arguments: command.args }, command);
    if (command.action === 'create') return withCommandMeta({ tool: 'canvas_create_workflow', arguments: command.args }, command);
    if (command.action === 'run') return withCommandMeta({ tool: 'canvas_run_workflow', arguments: command.args }, command);
  }
  if (command.domain === 'canvas') {
    if (command.action === 'create_generator') return withCommandMeta({ tool: 'canvas_create_generator', arguments: command.args }, command);
    if (command.action === 'create_text_agent') return withCommandMeta({ tool: 'canvas_create_text_agent', arguments: command.args }, command);
    if (command.action === 'add_text') return withCommandMeta({ tool: 'canvas_add_text', arguments: command.args }, command);
    if (command.action === 'connect_nodes') return withCommandMeta({ tool: 'canvas_connect_nodes', arguments: command.args }, command);
    if (command.action === 'organize') return withCommandMeta({ tool: 'canvas_organize', arguments: command.args }, command);
    if (command.action === 'run_workflow') return withCommandMeta({ tool: 'canvas_run_workflow', arguments: command.args }, command);
    return withCommandMeta({ tool: 'canvas_manage', arguments: commandArgs(command) }, command);
  }
  if (command.domain === 'server') return withCommandMeta({ tool: 'app_navigate', arguments: commandArgs(command) }, command);
  return withCommandMeta({ tool: command.action, arguments: command.args }, command);
}

export function adaptPlanToLegacyActions(plan: AppAgentPlan): LegacyAgentAction[] {
  return plan.commands.map(adaptCommandToLegacyAction);
}
