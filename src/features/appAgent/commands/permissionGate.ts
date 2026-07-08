import type { RiskLevel } from '../skills/types';
import type { LegacyAgentAction } from './commandTypes';
import { isDirectCreativeExecutionRequest } from '../skills/creativeProductDesignSkill';

export interface PermissionDecision {
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  reasons: string[];
}

export function getLegacyActionRiskLevel(action: LegacyAgentAction): RiskLevel {
  const args = action.arguments || {};
  const tool = action.tool;
  const toolAction = String(args.action || '');
  if (['app_get_context', 'app_get_ui_snapshot', 'canvas_get_context'].includes(tool)) return 'read';
  if (tool === 'app_ui_interact') return 'safe_write';
  if (tool === 'drawer_manage' && ['delete_items', 'delete_folder'].includes(toolAction)) return 'destructive';
  if (tool === 'calendar_manage' && ['delete_schedule'].includes(toolAction)) return 'destructive';
  if (tool === 'canvas_manage' && ['delete_nodes', 'clear_canvas'].includes(toolAction)) return 'destructive';
  if (tool === 'canvas_manage' && ['run_nodes'].includes(toolAction)) return 'costly';
  if (tool === 'canvas_run_workflow' || tool === 'canvas_run_text_agent') return 'costly';
  if (tool === 'canvas_create_generator' && args.autoRun === true) return 'costly';
  if (tool === 'canvas_create_media_tool' && args.autoRun === true) return 'costly';
  if (tool === 'app_navigate' && ['start_service', 'stop_service', 'restart_service'].includes(toolAction)) return 'system_process';
  if (tool === 'app_navigate' && ['open_external_url', 'start_tunnel'].includes(toolAction)) return 'external_network';
  return 'safe_write';
}

export function evaluateLegacyActionPermission(
  action: LegacyAgentAction,
  options: { userText?: string; approvalMode?: 'ask' | 'auto' } = {},
): PermissionDecision {
  const riskLevel = getLegacyActionRiskLevel(action);
  const reasons: string[] = [`risk:${riskLevel}`];
  const alwaysConfirm = riskLevel === 'destructive'
    || riskLevel === 'system_process'
    || action.tool === 'app_ui_interact';
  const costlyNeedsConfirmation = riskLevel === 'costly'
    && !isDirectCreativeExecutionRequest(options.userText || '');
  const requiresConfirmation = riskLevel === 'read'
    ? false
    : alwaysConfirm
      || costlyNeedsConfirmation
      || (riskLevel === 'external_network' && options.approvalMode !== 'auto');
  if (alwaysConfirm) reasons.push('always-confirm');
  if (costlyNeedsConfirmation) reasons.push('costly-without-direct-run-request');
  return { riskLevel, requiresConfirmation, reasons };
}
