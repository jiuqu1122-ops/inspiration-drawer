import type { AgentCanvasContext } from '../../agentModel';
import type { AppAgentContextRequest } from './contextTypes';
import type { ContextScope } from '../skills/types';
import { compactAgentCanvasContext } from './compactContext';

export function buildAppAgentContext(
  context: AgentCanvasContext,
  request: AppAgentContextRequest = { scopes: ['minimal'], detail: 'compact' },
) {
  const fallbackScopes: ContextScope[] = ['minimal'];
  const scopes: ContextScope[] = request.scopes.length > 0 ? request.scopes : fallbackScopes;
  if (request.detail === 'full') return compactAgentCanvasContext(context, scopes);
  return compactAgentCanvasContext(context, scopes);
}
