import type { AgentCanvasContext } from '../../agentModel';
import type { LegacyAgentAction } from '../commands/commandTypes';

const STEP_NODE_REF_PATTERN = /^\$[A-Za-z0-9_-]+\.nodeId$/;

export interface PlanStepBindingState {
  bindings: Record<string, string>;
  plannedStepRefs: string[];
  resolvedStepRefs: Record<string, string>;
  createdNodeIds: string[];
  unresolvedInputIds: string[];
  fallbackUsed: boolean;
  fallbackReason?: string;
}

export interface ResolvePlanStepActionResult {
  action: LegacyAgentAction;
  unresolvedInputIds: string[];
  fallbackUsed: boolean;
  fallbackReason?: string;
}

const uniqueStrings = (values: string[]) => Array.from(new Set(values.map(String).filter(Boolean)));

export const isPlanStepNodeRef = (value: unknown): value is string => (
  typeof value === 'string' && STEP_NODE_REF_PATTERN.test(value.trim())
);

export function createPlanStepBindingState(actions: LegacyAgentAction[] = []): PlanStepBindingState {
  return {
    bindings: {},
    plannedStepRefs: uniqueStrings(actions.map(action => action.outputRef || '').filter(isPlanStepNodeRef)),
    resolvedStepRefs: {},
    createdNodeIds: [],
    unresolvedInputIds: [],
    fallbackUsed: false,
  };
}

export function extractCreatedNodeId(result: unknown): string {
  const record = result && typeof result === 'object' && !Array.isArray(result)
    ? result as Record<string, unknown>
    : {};
  return String(record.nodeId || record.createdNodeId || record.id || '').trim();
}

export function bindPlanStepResult(
  state: PlanStepBindingState,
  action: Pick<LegacyAgentAction, 'createsNode' | 'outputRef'>,
  result: unknown,
) {
  if (!action.createsNode || !isPlanStepNodeRef(action.outputRef)) return;
  const nodeId = extractCreatedNodeId(result);
  if (!nodeId) return;
  state.bindings[action.outputRef] = nodeId;
  state.resolvedStepRefs[action.outputRef] = nodeId;
  state.createdNodeIds = uniqueStrings([...state.createdNodeIds, nodeId]);
}

const resolveStringValue = (
  value: unknown,
  state: PlanStepBindingState,
  unresolved: string[],
) => {
  if (!isPlanStepNodeRef(value)) return typeof value === 'string' ? value : '';
  const resolved = state.bindings[value];
  if (resolved) {
    state.resolvedStepRefs[value] = resolved;
    return resolved;
  }
  unresolved.push(value);
  return '';
};

const resolveStringArray = (
  value: unknown,
  state: PlanStepBindingState,
  unresolved: string[],
) => {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.flatMap(item => {
    const resolved = resolveStringValue(item, state, unresolved);
    return resolved ? [resolved] : [];
  }));
};

const isStoryboardImageGenerator = (action: LegacyAgentAction) => {
  if (action.tool !== 'canvas_create_generator') return false;
  const args = action.arguments || {};
  const prompt = String(args.prompt || '');
  const meta = args.skillMeta && typeof args.skillMeta === 'object' && !Array.isArray(args.skillMeta)
    ? args.skillMeta as Record<string, unknown>
    : {};
  return args.mediaType !== 'video' && (
    meta.taskKind === 'storyboard'
    || /storyboard|分镜|故事板/i.test(prompt)
  );
};

export function getSelectedImageNodeIds(context?: AgentCanvasContext): string[] {
  const selectedIds = new Set((context?.selectedIds || []).map(String));
  const nodeById = new Map((context?.nodes || []).map(node => [node.id, node]));
  const fromVisualReferences = (context?.visualReferences || [])
    .filter(reference => reference.mediaType === 'image')
    .map(reference => reference.nodeId);
  const fromSelectedNodes = Array.from(selectedIds)
    .filter(id => {
      const node = nodeById.get(id);
      return !!node && /image|generated-image|image-generator/i.test(node.type || '');
    });
  return uniqueStrings([...fromSelectedNodes, ...fromVisualReferences]);
}

export function withCreatedNodesInContext(
  context: AgentCanvasContext | undefined,
  createdNodeIds: string[],
): AgentCanvasContext | undefined {
  if (!context || createdNodeIds.length === 0) return context;
  const existingIds = new Set(context.nodes.map(node => node.id));
  const createdNodes = uniqueStrings(createdNodeIds)
    .filter(id => !existingIds.has(id))
    .map(id => ({
      id,
      type: 'text',
      name: 'Created by plan step',
      inputs: [],
    }));
  if (createdNodes.length === 0) return context;
  return {
    ...context,
    nodes: [...context.nodes, ...createdNodes],
  };
}

export function resolvePlanStepActionInputs(
  action: LegacyAgentAction,
  state: PlanStepBindingState,
  options: { context?: AgentCanvasContext } = {},
): ResolvePlanStepActionResult {
  const args = { ...(action.arguments || {}) };
  const unresolved: string[] = [];

  if ('inputIds' in args) args.inputIds = resolveStringArray(args.inputIds, state, unresolved);
  if ('referenceImageNodeIds' in args) {
    args.referenceImageNodeIds = resolveStringArray(args.referenceImageNodeIds, state, unresolved);
  }
  if ('nodeIds' in args) args.nodeIds = resolveStringArray(args.nodeIds, state, unresolved);

  ['sourceImageNodeId', 'nodeId', 'sourceId', 'targetId'].forEach(key => {
    if (!(key in args)) return;
    const resolved = resolveStringValue(args[key], state, unresolved);
    args[key] = resolved || (key === 'sourceImageNodeId' ? null : '');
  });

  if (Array.isArray(args.referenceRoles)) {
    args.referenceRoles = args.referenceRoles.flatMap(role => {
      const record = role && typeof role === 'object' && !Array.isArray(role)
        ? role as Record<string, unknown>
        : {};
      const nodeId = resolveStringValue(record.nodeId, state, unresolved);
      return nodeId ? [{ ...record, nodeId }] : [];
    });
  }

  let fallbackUsed = false;
  let fallbackReason = '';
  if (isStoryboardImageGenerator({ ...action, arguments: args }) && unresolved.length > 0) {
    const selectedImageNodeIds = getSelectedImageNodeIds(options.context);
    if (selectedImageNodeIds.length > 0) {
      args.inputIds = uniqueStrings([
        ...(Array.isArray(args.inputIds) ? args.inputIds.map(String) : []),
        ...selectedImageNodeIds,
      ]);
      args.referenceImageNodeIds = uniqueStrings([
        ...(Array.isArray(args.referenceImageNodeIds) ? args.referenceImageNodeIds.map(String) : []),
        ...selectedImageNodeIds,
      ]);
      fallbackUsed = true;
      fallbackReason = 'storyboard generator used selected image nodeIds after unresolved plan step refs';
    }
  }

  state.unresolvedInputIds = uniqueStrings([...state.unresolvedInputIds, ...unresolved]);
  if (fallbackUsed) {
    state.fallbackUsed = true;
    state.fallbackReason = fallbackReason;
  }
  return {
    action: { ...action, arguments: args },
    unresolvedInputIds: uniqueStrings(unresolved),
    fallbackUsed,
    fallbackReason,
  };
}
