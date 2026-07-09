import type { AgentCanvasContext, AgentCanvasVisualReference } from '../../agentModel';

export interface WorkflowNodeLike {
  id: string;
  type?: string;
  kind?: string;
  title?: string;
  label?: string;
  prompt?: string;
  inputs?: string[];
  inputStepIds?: string[];
  visualInputStepIds?: string[];
  textInputStepIds?: string[];
  inputRoles?: Record<string, string>;
  requiresReferenceImages?: boolean;
  acceptsExternalInputs?: boolean;
  externalInputTypes?: string[];
  outputType?: string;
  bridgeType?: string;
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
  name?: string;
  hint?: string;
  templateId?: string;
  inputs?: Array<{ id?: string; type?: string; required?: boolean; label?: string }>;
  steps?: WorkflowNodeLike[];
  workflowDefinition?: WorkflowLike;
  nodes?: WorkflowNodeLike[];
}

export interface CanvasNodeLike {
  id: string;
  type?: string;
  sourceItemId?: string;
  name?: string;
  path?: string;
  url?: string;
  thumbnail?: string;
  sourceUrl?: string;
  originalUrl?: string;
  hasSourceAsset?: boolean;
  thumbnailPending?: boolean;
  inputs?: string[];
  createdAt?: number;
  item?: {
    type?: string;
    sourceItemId?: string;
    createdAt?: number;
    path?: string;
    url?: string;
    thumbnail?: string;
    sourceUrl?: string;
    originalUrl?: string;
    hasSourceAsset?: boolean;
    thumbnailPending?: boolean;
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
  nodesToCreateFromAttachments: string[];
  autoConnections: Array<{ sourceId: string; targetId: string }>;
  missingRequiredInputs: string[];
  requiresImageTargetNodeIds: string[];
  workflowInputBindings: Record<string, string[]>;
  workflowVisualFanout: Array<{ inputId: string; targetStepId: string; sourceNodeIds: string[] }>;
  workflowTextDependencies: Array<{ sourceStepId: string; targetStepId: string }>;
  workflowInputResolution: {
    selectedCanvasImageNodeIds: string[];
    reusedExistingImageNodes: string[];
    createdImageNodes: string[];
    duplicateImageNodesPrevented: number;
    thumbnailPlaceholdersCreated: number;
    unresolvedThumbnailNodes: string[];
  };
}

const uniqueStrings = (values: string[]) => Array.from(new Set(values.map(String).filter(Boolean)));

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
);

const getWorkflowDefinition = (workflow?: WorkflowLike | null): WorkflowLike | null => {
  if (!workflow) return null;
  const nested = asRecord(workflow.workflowDefinition);
  return nested ? nested as WorkflowLike : workflow;
};

const asNodes = (workflow?: WorkflowLike | null) => {
  const definition = getWorkflowDefinition(workflow);
  if (Array.isArray(definition?.nodes)) return definition.nodes || [];
  if (Array.isArray(definition?.steps)) return definition.steps || [];
  return [];
};

const getWorkflowImageInputIds = (workflow?: WorkflowLike | null) => {
  const definition = getWorkflowDefinition(workflow);
  const inputs = Array.isArray(definition?.inputs) ? definition.inputs || [] : [];
  return uniqueStrings(inputs
    .filter(input => String(input?.type || '').toLowerCase() === 'image' && input.required !== false)
    .map(input => String(input.id || '')));
};

const nodeText = (node: WorkflowNodeLike) => [
  node.id,
  node.title,
  node.label,
  node.prompt,
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
    String(node.type || '').toLowerCase() === 'reference_image_bridge'
    || String(node.kind || '').toLowerCase() === 'reference-image-bridge'
    || node.bridgeType === 'reference_image'
    || node.item?.type === 'image'
    || node.outputType === 'image'
    || node.outputType === 'image[]'
    || (node.acceptsExternalInputs === true && (node.externalInputTypes || []).includes('image'))
  )
);

export const workflowNodeRequiresImageInput = (node: WorkflowNodeLike) => {
  const nodeType = String(node.type || node.kind || node.ai?.type || '').toLowerCase();
  if (!/image[-_]?generator/.test(nodeType)) return false;
  if (node.requiresReferenceImages === true || node.ai?.requiresProductImages === true || node.ai?.requiresReferenceImages === true) return true;
  const text = nodeText(node);
  return /commerce-hero|product-shot|detail-page|product-details|product_refs|product_reference_image|hero_main|产品参考|参考图|商品图|产品图|详情页|主图|subject_ref|product_ref|reference image|product image|based on connected/i
    .test(text);
};

const getStepVisualInputIds = (node: WorkflowNodeLike) => {
  if (Array.isArray(node.visualInputStepIds) && node.visualInputStepIds.length > 0) {
    return uniqueStrings(node.visualInputStepIds.map(String));
  }
  const roles = asRecord(node.inputRoles) || {};
  const roleVisualInputs = Object.entries(roles)
    .filter(([, role]) => String(role) === 'visual_reference')
    .map(([inputId]) => inputId);
  if (roleVisualInputs.length > 0) return uniqueStrings(roleVisualInputs);
  return uniqueStrings((node.inputStepIds || node.inputs || [])
    .map(String)
    .filter(inputId => /image|product_reference|product_refs|reference/i.test(inputId)));
};

const getStepTextInputIds = (node: WorkflowNodeLike) => {
  if (Array.isArray(node.textInputStepIds) && node.textInputStepIds.length > 0) {
    return uniqueStrings(node.textInputStepIds.map(String));
  }
  const roles = asRecord(node.inputRoles) || {};
  return uniqueStrings(Object.entries(roles)
    .filter(([, role]) => String(role) === 'text_strategy')
    .map(([inputId]) => inputId));
};

export const getWorkflowImageInputTargetNodeIds = (workflow?: WorkflowLike | null) => {
  const nodes = asNodes(workflow);
  const nodesById = new Map(nodes.map(node => [node.id, node]));
  const definitionImageInputIds = getWorkflowImageInputIds(workflow);
  const requiredGenerators = nodes.filter(workflowNodeRequiresImageInput);
  if (definitionImageInputIds.length > 0) {
    return uniqueStrings([
      ...definitionImageInputIds,
      ...requiredGenerators.flatMap(getStepVisualInputIds),
    ]);
  }
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

export const getWorkflowVisualFanoutTargets = (workflow?: WorkflowLike | null) => {
  const nodes = asNodes(workflow);
  const imageInputIds = getWorkflowImageInputIds(workflow);
  if (imageInputIds.length === 0) return [];
  return nodes
    .filter(workflowNodeRequiresImageInput)
    .flatMap(node => {
      const visualInputs = getStepVisualInputIds(node);
      const inputIds = visualInputs.length > 0 ? visualInputs : imageInputIds;
      return inputIds.map(inputId => ({ inputId, targetStepId: node.id }));
    });
};

export const getWorkflowTextDependencies = (workflow?: WorkflowLike | null) => (
  asNodes(workflow).flatMap(node => (
    getStepTextInputIds(node).map(sourceStepId => ({ sourceStepId, targetStepId: node.id }))
  ))
);

const getNodeSourceItemId = (node: CanvasNodeLike) => String(node.sourceItemId || node.item?.sourceItemId || '');

const getCanvasNodeSourceValues = (node?: CanvasNodeLike | null) => [
  node?.url,
  node?.path,
  node?.thumbnail,
  node?.sourceUrl,
  node?.originalUrl,
  node?.item?.url,
  node?.item?.path,
  node?.item?.thumbnail,
  node?.item?.sourceUrl,
  node?.item?.originalUrl,
].map(value => String(value || '').trim()).filter(Boolean);

export const isCanvasImageNodeWithSourceAsset = (node?: CanvasNodeLike | null) => {
  if (!isImageCanvasNode(node)) return false;
  if (node?.hasSourceAsset === true || node?.item?.hasSourceAsset === true) return true;
  if (node?.hasSourceAsset === false || node?.item?.hasSourceAsset === false) {
    return getCanvasNodeSourceValues(node).length > 0;
  }
  return getCanvasNodeSourceValues(node).length > 0 || node?.ai?.type === 'generated-image' || node?.type === 'image';
};

const isUnresolvedThumbnailCanvasNode = (node?: CanvasNodeLike | null) => (
  !!node
  && isImageCanvasNode(node)
  && (node.thumbnailPending === true || node.item?.thumbnailPending === true || node.hasSourceAsset === false || node.item?.hasSourceAsset === false)
  && getCanvasNodeSourceValues(node).length === 0
);

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
  allowRecentCanvasFallback?: boolean;
}): WorkflowInputResolution {
  const canvasNodes = input.canvasNodes || [];
  const canvasNodeById = new Map(canvasNodes.map(node => [node.id, node]));
  const canvasNodeBySourceItemId = new Map(canvasNodes
    .map(node => [getNodeSourceItemId(node), node] as const)
    .filter(([sourceItemId]) => !!sourceItemId));
  const selectedCanvasImageNodeIds = (input.selectedNodeIds || [])
    .filter(id => isCanvasImageNodeWithSourceAsset(canvasNodeById.get(id)));
  const selectedCanvasImageNodeSet = new Set(selectedCanvasImageNodeIds);
  const unresolvedThumbnailNodes = uniqueStrings(canvasNodes
    .filter(isUnresolvedThumbnailCanvasNode)
    .map(node => node.id));
  const visualNodeIds = visualReferenceNodeIds(input.visualReferences)
    .filter(id => !selectedCanvasImageNodeSet.has(id))
    .filter(id => canvasNodeById.has(id) && isCanvasImageNodeWithSourceAsset(canvasNodeById.get(id)));
  const attachmentNodeIds = visualReferenceNodeIds(input.currentMessageAttachments)
    .filter(id => canvasNodeById.has(id) && isCanvasImageNodeWithSourceAsset(canvasNodeById.get(id)));
  const attachmentIdsToCreate = (input.currentMessageAttachments || [])
    .filter(reference => reference.mediaType === 'image')
    .filter(reference => !canvasNodeById.has(reference.nodeId))
    .filter(reference => !!(reference.source || reference.path || reference.thumbnail))
    .map(reference => reference.id || reference.nodeId);
  const selectedDrawerImageItems = (input.selectedDrawerItems || [])
    .filter(item => item.type === 'image');
  const drawerResolvedNodeIds = selectedDrawerImageItems
    .map(item => canvasNodeBySourceItemId.get(item.id)?.id || '')
    .filter(Boolean);
  const shouldCreateNewImageNodes = selectedCanvasImageNodeIds.length === 0;
  const nodesToCreateFromDrawerItems = shouldCreateNewImageNodes
    ? selectedDrawerImageItems
      .filter(item => !canvasNodeBySourceItemId.has(item.id))
      .filter(item => !!(item.url || item.path || item.thumbnail))
      .map(item => item.id)
    : [];
  const nodesToCreateFromAttachments = shouldCreateNewImageNodes ? uniqueStrings(attachmentIdsToCreate) : [];
  const recentCanvasImageNodeIds = canvasNodes
    .filter(isCanvasImageNodeWithSourceAsset)
    .sort((a, b) => Number(b.createdAt || b.item?.createdAt || 0) - Number(a.createdAt || a.item?.createdAt || 0))
    .slice(0, 3)
    .map(node => node.id);
  const resolvedImageNodeIds = selectedCanvasImageNodeIds.length > 0
    ? selectedCanvasImageNodeIds
    : uniqueStrings([
      ...visualNodeIds,
      ...attachmentNodeIds,
      ...drawerResolvedNodeIds,
      ...(input.allowRecentCanvasFallback !== false && nodesToCreateFromAttachments.length === 0 && nodesToCreateFromDrawerItems.length === 0 ? recentCanvasImageNodeIds : []),
    ]);
  const requiresImageTargetNodeIds = getWorkflowImageInputTargetNodeIds(input.workflow);
  const visualFanoutTargets = getWorkflowVisualFanoutTargets(input.workflow);
  const autoConnections = requiresImageTargetNodeIds.flatMap(targetId => (
    resolvedImageNodeIds.map(sourceId => ({ sourceId, targetId }))
  ));
  const workflowInputBindings = Object.fromEntries(
    getWorkflowImageInputIds(input.workflow).map(inputId => [inputId, resolvedImageNodeIds]),
  );
  const workflowVisualFanout = visualFanoutTargets.map(target => ({
    ...target,
    sourceNodeIds: resolvedImageNodeIds,
  }));
  const workflowTextDependencies = getWorkflowTextDependencies(input.workflow);
  const missingRequiredInputs = requiresImageTargetNodeIds.length > 0
    && resolvedImageNodeIds.length === 0
    && nodesToCreateFromDrawerItems.length === 0
    && nodesToCreateFromAttachments.length === 0
    ? ['这个工作流需要产品/参考图，请先选择或拖入一张图片。']
    : [];
  const duplicateImageNodesPrevented = selectedCanvasImageNodeIds.length > 0
    ? selectedDrawerImageItems.filter(item => !canvasNodeBySourceItemId.has(item.id)).length + attachmentIdsToCreate.length
    : 0;
  return {
    resolvedImageNodeIds,
    resolvedProductImageNodeIds: resolvedImageNodeIds,
    resolvedReferenceImageNodeIds: resolvedImageNodeIds,
    nodesToCreateFromDrawerItems,
    nodesToCreateFromAttachments,
    autoConnections,
    missingRequiredInputs,
    requiresImageTargetNodeIds,
    workflowInputBindings,
    workflowVisualFanout,
    workflowTextDependencies,
    workflowInputResolution: {
      selectedCanvasImageNodeIds,
      reusedExistingImageNodes: resolvedImageNodeIds,
      createdImageNodes: [],
      duplicateImageNodesPrevented,
      thumbnailPlaceholdersCreated: 0,
      unresolvedThumbnailNodes,
    },
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
