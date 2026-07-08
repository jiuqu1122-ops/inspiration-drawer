import type { AppAgentCommand, AppAgentPlan, LegacyAgentAction } from './commandTypes';

const commandArgs = (command: AppAgentCommand) => ({
  action: command.action,
  ...command.args,
});

export function adaptCommandToLegacyAction(command: AppAgentCommand): LegacyAgentAction {
  if (command.domain === 'app') return { tool: 'app_navigate', arguments: commandArgs(command) };
  if (command.domain === 'drawer') return { tool: 'drawer_manage', arguments: commandArgs(command) };
  if (command.domain === 'calendar') return { tool: 'calendar_manage', arguments: commandArgs(command) };
  if (command.domain === 'ui') return { tool: 'app_ui_interact', arguments: commandArgs(command) };
  if (command.domain === 'media') return { tool: 'canvas_create_media_tool', arguments: command.args };
  if (command.domain === 'workflow') {
    if (command.action === 'apply') return { tool: 'canvas_apply_workflow', arguments: command.args };
    if (command.action === 'create') return { tool: 'canvas_create_workflow', arguments: command.args };
    if (command.action === 'run') return { tool: 'canvas_run_workflow', arguments: command.args };
  }
  if (command.domain === 'canvas') {
    if (command.action === 'create_generator') return { tool: 'canvas_create_generator', arguments: command.args };
    if (command.action === 'create_text_agent') return { tool: 'canvas_create_text_agent', arguments: command.args };
    if (command.action === 'add_text') return { tool: 'canvas_add_text', arguments: command.args };
    if (command.action === 'connect_nodes') return { tool: 'canvas_connect_nodes', arguments: command.args };
    if (command.action === 'organize') return { tool: 'canvas_organize', arguments: command.args };
    if (command.action === 'run_workflow') return { tool: 'canvas_run_workflow', arguments: command.args };
    return { tool: 'canvas_manage', arguments: commandArgs(command) };
  }
  if (command.domain === 'server') return { tool: 'app_navigate', arguments: commandArgs(command) };
  return { tool: command.action, arguments: command.args };
}

export function adaptPlanToLegacyActions(plan: AppAgentPlan): LegacyAgentAction[] {
  return plan.commands.map(adaptCommandToLegacyAction);
}
