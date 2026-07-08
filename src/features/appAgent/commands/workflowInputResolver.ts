import type { AgentCanvasContext, AgentCanvasVisualReference } from '../../agentModel';

export interface WorkflowNodeLike {
  id: string;
  inputs?: string[];
  acceptsExternalInputs?: boolean;
  externalInputTypes?: string[];
  outputType?: string;
  item?: {
    type?: string;
    name?: string;
    content?: string;
    remark?: string;
    sourceItemId?: string;
    createdAt?: number;
  };
  ai?: {
    type?: string;
    presetId?: string;
    presetLabel?: string;
    presetPrompt?: string;
    prompt?: string;
    requiresProductImages?: boolean;
    requiresReferenceImages?: boolean;
  };
}

export interface WorkflowLike {
  id?: string;
  label?: string;
  hint?: string;
  nodes?: WorkflowNodeLike[];
}

export interface CanvasNodeLike {
  id: string;
  type?: string;
  sourceItemId?: string;
  name?: string;
  inputs?: string[];
  createdAt?: number;
  item?: {
    type?: string;
    sourceItemId?: string;
    createdAt?: number;
  };
  ai?: {
    type?: string;
  };
}

export interface DrawerItemLike {
  id: string;
  type?: string;
  name?: string;
  path?: string;
  url?: string;
  thumbnail?: string;
}

export interface WorkflowInputResolution {
  resolvedImageNodeIds: string[];
  resolvedProductImageNodeIds: string[];
  resolvedReferenceImageNodeIds: string[];
  nodesToCreateFromDrawerItems: string[];
  autoConnections: Array<{ sourceId: string; targetId: string }>;
  missingRequiredInputs: string[];
  requiresImageTargetNodeIds: string[];
}

const uniqueStrings = (values: string[]) => Array.from(new Set(values.map(String).filter(Boolean)));

const asNodes = (workflow?: WorkflowLike | null) => Array.isArray(workflow?.nodes) ? workflow.nodes || [] : [];

const nodeText = (node: WorkflowNodeLike) => [
  node.id,
  node.item?.name,
  node.item?.content,
  node.item?.remark,
  node.ai?.presetId,
  node.ai?.presetLabel,
  node.ai?.presetPrompt,
  node.ai?.prompt,
].filter(Boolean).join('\n').toLowerCase();

export const isImageCanvasNode = (node?: CanvasNodeLike | null) => {
  const type = String(node?.type || node?.item?.type || node?.ai?.type || '').toLowerCase();
  return type === 'image'
    || type === 'generated-image'
    || type === 'image-generator'
    || type.includes('image');
};

export const isWorkflowNodeImageInput = (node?: WorkflowNodeLike | null) => (
  !!node && (
    node.item?.type === 'image'
    || node.outputType === 'image'
    || node.outputType === 'image[]'
    || (node.acceptsExternalInputs === true && (node.externalInputTypes || []).includes('image'))
  )
);

export const workflowNodeRequiresImageInput = (node: WorkflowNodeLike) => {
  if (node.ai?.type !== 'image-generator') return false;
  if (node.ai.requiresProductImages === true || node.ai.requiresReferenceImages === true) return true;
  const text = nodeText(node);
  return /commerce-hero|product-shot|detail-page|product-details|product_refs|hero_main|产品参考|参考图|商品图|产品图|详情页|主图|subject_ref|product_ref|reference image|product image|based on connected/i
    .test(text);
};

export const getWorkflowImageInputTargetNodeIds = (workflow?: WorkflowLike | null) => {
  const nodes = asNodes(workflow);
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const requiredGenerators = nodes.filter(workflowNodeRequiresImageInput);
  const explicitExternalTargets = nodes
    .filter(node => node.acceptsExternalInputs === true && (
      (node.externalInputTypes || []).includes('image')
      || node.item?.type === 'image'
      || node.outputType === 'image'
      || node.outputType === 'image[]'
    ));
  const findUpstreamImageInputTargets = (node: WorkflowNodeLike) => {
    const seen = new Set<string>();
    const walk = (sourceId: string): string[] => {
      if (seen.has(sourceId)) return [];
      seen.add(sourceId);
      const source = nodesById.get(sourceId);
      if (!source) return [];
      if (isWorkflowNodeImageInput(source)) return [source.id];
      return (source.inputs || []).flatMap(walk);
    };
    return uniqueStrings((node.inputs || []).flatMap(walk));
  };
  const generatorExternalTargets = requiredGenerators.flatMap(node => {
    const upstreamTargets = findUpstreamImageInputTargets(node);
    return upstreamTargets.length > 0 ? upstreamTargets : (!node.inputs?.length ? [node.id] : []);
  });
  return uniqueStrings([
    ...explicitExternalTargets.map(node => node.id),
    ...generatorExternalTargets,
  ]);
};

const getNodeSourceItemId = (node: CanvasNodeLike) => String(node.sourceItemId || node.item?.sourceItemId || '');

const visualReferenceNodeIds = (references?: AgentCanvasVisualReference[]) => (
  references
    ?.filter(reference => reference.mediaType === 'image')
    .map(reference => reference.nodeId)
    .filter(Boolean) || []
);

export function resolveWorkflowInputs(input: {
  workflow?: WorkflowLike | null;
  selectedNodeIds?: string[];
  visualReferences?: AgentCanvasVisualReference[];
  selectedDrawerItems?: DrawerItemLike[];
  currentMessageAttachments?: AgentCanvasVisualReference[];
  canvasNodes?: CanvasNodeLike[];
  drawerItems?: DrawerItemLike[];
}): WorkflowInputResolution {
  const canvasNodes = input.canvasNodes || [];
  const canvasNodeById = new Map(canvasNodes.map(node => [node.id, node]));
  const canvasNodeBySourceItemId = new Map(canvasNodes
    .map(node => [getNodeSourceItemId(node), node] as const)
    .filter(([sourceItemId]) => !!sourceItemId));
  const selectedCanvasImageNodeIds = (input.selectedNodeIds || [])
    .filter(id => isImageCanvasNode(canvasNodeById.get(id)));
  const visualNodeIds = visualReferenceNodeIds(input.visualReferences)
    .filter(id => !canvasNodeById.size || isImageCanvasNode(canvasNodeById.get(id)));
  const attachmentNodeIds = visualReferenceNodeIds(input.currentMessageAttachments)
    .filter(id => !canvasNodeById.size || isImageCanvasNode(canvasNodeById.get(id)));
  const selectedDrawerImageItems = (input.selectedDrawerItems || [])
    .filter(item => item.type === 'image');
  const drawerResolvedNodeIds = selectedDrawerImageItems
    .map(item => canvasNodeBySourceItemId.get(item.id)?.id || '')
    .filter(Boolean);
  const nodesToCreateFromDrawerItems = selectedDrawerImageItems
    .filter(item => !canvasNodeBySourceItemId.has(item.id))
    .map(item => item.id);
  const recentCanvasImageNodeIds = canvasNodes
    .filter(isImageCanvasNode)
    .sort((a, b) => Number(b.createdAt || b.item?.createdAt || 0) - Number(a.createdAt || a.item?.createdAt || 0))
    .slice(0, 3)
    .map(node => node.id);
  const resolvedImageNodeIds = uniqueStrings([
    ...selectedCanvasImageNodeIds,
    ...visualNodeIds,
    ...attachmentNodeIds,
    ...drawerResolvedNodeIds,
    ...recentCanvasImageNodeIds,
  ]);
  const requiresImageTargetNodeIds = getWorkflowImageInputTargetNodeIds(input.workflow);
  const autoConnections = requiresImageTargetNodeIds.flatMap(targetId => (
    resolvedImageNodeIds.map(sourceId => ({ sourceId, targetId }))
  ));
  const missingRequiredInputs = requiresImageTargetNodeIds.length > 0
    && resolvedImageNodeIds.length === 0
    && nodesToCreateFromDrawerItems.length === 0
    ? ['这个工作流需要产品/参考图，请先选择或拖入一张图片。']
    : [];
  return {
    resolvedImageNodeIds,
    resolvedProductImageNodeIds: resolvedImageNodeIds,
    resolvedReferenceImageNodeIds: resolvedImageNodeIds,
    nodesToCreateFromDrawerItems,
    autoConnections,
    missingRequiredInputs,
    requiresImageTargetNodeIds,
  };
}

export function resolveWorkflowInputsFromContext(input: {
  workflow?: WorkflowLike | null;
  context?: AgentCanvasContext;
}) {
  const context = input.context;
  return resolveWorkflowInputs({
    workflow: input.workflow,
    selectedNodeIds: context?.selectedIds || [],
    visualReferences: context?.visualReferences || [],
    selectedDrawerItems: context?.drawer?.items || [],
    currentMessageAttachments: context?.visualReferences || [],
    canvasNodes: context?.nodes || [],
    drawerItems: context?.drawer?.items || [],
  });
}
