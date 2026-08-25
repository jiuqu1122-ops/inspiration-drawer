import type {
  CanvasAiGeneratedOutput,
  CanvasImageItem,
  CanvasWorkflowRuntime,
  CanvasWorkflowRuntimeNodeSnapshot,
} from '../features/canvasModel';
import type {
  CanvasWorkflowNodeTemplate,
  CanvasWorkflowTemplate,
} from '../features/canvasTemplates';
import { clamp } from '../features/common';
import {
  CANVAS_AI_MAX_OUTPUT_COUNT,
  CANVAS_WORKFLOW_MAX_OUTPUT_SLOTS,
} from '../features/canvasAiNodeLayout';
import {
  getCanvasAiMediaType,
  isCanvasAiGeneratorType,
} from '../features/canvasAiRuntime';
import { recoverCanvasAiOutputWithUsableResult } from '../features/canvasAiOutputs';
import {
  collectCanvasWorkflowInternalSlotBindings,
  getCanvasWorkflowRuntimeSnapshots,
  isReplaceableInternalImageSlot,
  normalizeCanvasWorkflowRuntime,
} from '../features/canvasWorkflowInternalSlots';
import { normalizeCanvasWorkflowUserInput } from '../features/canvasWorkflowUserInput';
import type { CanvasWorkflowExpandedGroup } from '../types/canvasWorkflow';
import { CANVAS_AI_DEFAULT_ASPECT_RATIO } from './canvasAiAspectRatio';
import { CANVAS_AI_DEFAULT_COUNT } from './canvasAiConfig';
import {
  getCanvasAiOutputSize,
  getCanvasWorkflowTemplateFromNode,
  isCanvasAgentTextTarget,
} from './canvasItemSelectors';
import { cloneDrawerValue } from './canvasSerialization';

export const getCanvasWorkflowAllRuntimeOutputSlots = (
  canvasItem: CanvasImageItem,
  workflow: CanvasWorkflowTemplate
): CanvasAiGeneratedOutput[] => {
  const drafts = createCanvasWorkflowOutputDrafts(canvasItem, workflow, undefined, 'all');
  const runtimeSnapshots = normalizeCanvasWorkflowRuntimeSnapshots(canvasItem.ai?.workflowRuntime);
  const snapshotsByTemplateId = new Map(runtimeSnapshots.map(snapshot => [snapshot.templateId, snapshot]));
  return drafts.map((draft) => {
    const nodeId = draft.nodeId || '';
    const outputIndex = Number(draft.id.split('_').pop()) || 0;
    const snapshotOutputs = snapshotsByTemplateId.get(nodeId)?.ai?.outputs;
    const output = Array.isArray(snapshotOutputs)
      ? snapshotOutputs[outputIndex] as CanvasAiGeneratedOutput | undefined
      : undefined;
    if (!output) return draft;
    return {
      ...draft,
      ...output,
      id: draft.id,
      name: output.name || draft.name,
      nodeId: draft.nodeId,
      nodeLabel: draft.nodeLabel,
    };
  });
};

export const getCanvasAiOutputPreviewSlots = (canvasItem?: CanvasImageItem | null): CanvasAiGeneratedOutput[] => {
  if (!isCanvasAiGeneratorType(canvasItem?.ai?.type) && canvasItem?.ai?.type !== 'workflow') return [];
  const outputs = canvasItem.ai.outputs || [];
  const workflow = getCanvasWorkflowTemplateFromNode(canvasItem);
  if (workflow) {
    if (canvasItem.ai.workflowOutputMode !== 'final') {
      return getCanvasWorkflowAllRuntimeOutputSlots(canvasItem, workflow);
    }
    const drafts = createCanvasWorkflowOutputDrafts(canvasItem, workflow);
    if (outputs.length === 0) return drafts;
    const usedOutputIds = new Set<string>();
    const merged = drafts.map((draft, index) => {
      const output = outputs.find(item => item.id === draft.id && !usedOutputIds.has(item.id))
        || outputs[index];
      if (!output) return draft;
      if (output.id) usedOutputIds.add(output.id);
      return recoverCanvasAiOutputWithUsableResult({
        ...draft,
        ...output,
        id: output.id || draft.id,
        name: output.name || draft.name,
      });
    });
    const extras = outputs.filter(output => output.id && !usedOutputIds.has(output.id));
    return [...merged, ...extras.map(recoverCanvasAiOutputWithUsableResult)];
  }
  if (outputs.length > 0) return outputs.map(recoverCanvasAiOutputWithUsableResult);
  const count = clamp(Math.round(Number(canvasItem.ai.count) || CANVAS_AI_DEFAULT_COUNT), 1, CANVAS_AI_MAX_OUTPUT_COUNT);
  const size = getCanvasAiOutputSize(canvasItem.ai.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO);
  return Array.from({ length: count }, (_, index) => ({
    id: `${canvasItem.id}_idle_output_${index}`,
    mediaType: getCanvasAiMediaType(canvasItem.ai),
    name: `Output #${index + 1}`,
    width: size.width,
    height: size.height,
  }));
};

export const getCanvasWorkflowGeneratorNodes = (workflow: CanvasWorkflowTemplate) => (
  workflow.nodes.filter(node => node.ai?.type === 'image-generator')
);

export const getCanvasWorkflowTerminalNodeTemplates = (workflow: CanvasWorkflowTemplate) => {
  const generatorIds = new Set(getCanvasWorkflowGeneratorNodes(workflow).map(node => node.id));
  const upstreamGeneratorIds = new Set<string>();
  workflow.nodes.forEach(node => {
    if (node.ai?.type !== 'image-generator') return;
    (node.inputs || []).forEach(inputId => {
      if (generatorIds.has(inputId)) upstreamGeneratorIds.add(inputId);
    });
  });
  const terminalNodes = getCanvasWorkflowGeneratorNodes(workflow).filter(node => !upstreamGeneratorIds.has(node.id));
  return terminalNodes.length > 0 ? terminalNodes : getCanvasWorkflowGeneratorNodes(workflow).slice(-1);
};

export const getCanvasWorkflowOutputLabel = (node: CanvasWorkflowNodeTemplate, index?: number) => {
  const label = node.ai?.presetLabel || node.item.name || '工作流输出';
  return index && index > 0 ? `${label} #${index + 1}` : label;
};

export const getCanvasWorkflowOutputSlotTemplates = (
  workflow: CanvasWorkflowTemplate,
  mode: 'final' | 'all' = 'final'
) => {
  const outputNodes = mode === 'all'
    ? getCanvasWorkflowGeneratorNodes(workflow)
    : getCanvasWorkflowTerminalNodeTemplates(workflow);
  const slots = outputNodes.flatMap(node => {
    const count = clamp(Math.round(Number(node.ai?.count) || CANVAS_AI_DEFAULT_COUNT), 1, CANVAS_WORKFLOW_MAX_OUTPUT_SLOTS);
    return Array.from({ length: count }, (_, index) => ({ node, index }));
  });
  const fallbackNode = outputNodes[outputNodes.length - 1] || workflow.nodes.find(node => node.ai?.type === 'image-generator') || workflow.nodes[0];
  if (slots.length > 0) return slots.slice(0, CANVAS_WORKFLOW_MAX_OUTPUT_SLOTS);
  return fallbackNode ? [{ node: fallbackNode, index: 0 }] : [];
};

export const createCanvasWorkflowOutputDrafts = (
  canvasItem: CanvasImageItem,
  workflow: CanvasWorkflowTemplate,
  status?: CanvasAiGeneratedOutput['status'],
  mode: 'final' | 'all' = 'final'
): CanvasAiGeneratedOutput[] => {
  const now = Date.now();
  const slots = getCanvasWorkflowOutputSlotTemplates(workflow, mode);
  return (slots.length > 0 ? slots : [{ node: workflow.nodes[0], index: 0 }]).map((slot, slotIndex) => {
    const size = getCanvasAiOutputSize(slot.node.ai?.aspectRatio || CANVAS_AI_DEFAULT_ASPECT_RATIO);
    const label = getCanvasWorkflowOutputLabel(slot.node, slot.index);
    return {
      id: `${canvasItem.id}_workflow_${mode}_output_${slot.node.id}_${slot.index}`,
      name: label || `输出 ${slotIndex + 1}`,
      nodeId: slot.node.id,
      nodeLabel: getCanvasWorkflowOutputLabel(slot.node),
      prompt: slot.node.ai?.presetPrompt || slot.node.item.content || '',
      status,
      generatedAt: status ? now + slotIndex : undefined,
      width: size.width,
      height: size.height,
    };
  });
};

export const normalizeCanvasWorkflowRuntimeSnapshots = (value: unknown): CanvasWorkflowRuntimeNodeSnapshot[] => {
  return getCanvasWorkflowRuntimeSnapshots(value).map(snapshot => cloneDrawerValue(snapshot));
};

export const createCanvasWorkflowRuntimeSnapshots = (
  workflow: CanvasWorkflowTemplate,
  runtimeItems: CanvasImageItem[],
  idMap: Map<string, string>
): CanvasWorkflowRuntimeNodeSnapshot[] => (
  workflow.nodes.map(node => {
    const runtimeId = idMap.get(node.id);
    const runtimeItem = runtimeItems.find(item => item.id === runtimeId);
    if (!runtimeItem) return null;
    return {
      templateId: node.id,
      item: {
        content: runtimeItem.item.content,
        name: runtimeItem.item.name,
        remark: runtimeItem.item.remark,
        remarks: runtimeItem.item.remarks,
      },
      ai: runtimeItem.ai
        ? {
          prompt: runtimeItem.ai.prompt,
          status: runtimeItem.ai.status,
          error: runtimeItem.ai.error,
          generatedAt: runtimeItem.ai.generatedAt,
          outputs: cloneDrawerValue(runtimeItem.ai.outputs || []),
        }
        : undefined,
    } as CanvasWorkflowRuntimeNodeSnapshot;
  }).filter((item): item is CanvasWorkflowRuntimeNodeSnapshot => !!item)
);

export const getCanvasWorkflowGroup = (canvasItem?: CanvasImageItem | null): CanvasWorkflowExpandedGroup | null => {
  const group = canvasItem?.workflowGroup;
  if (!group || typeof group !== 'object') return null;
  const record = group as Partial<CanvasWorkflowExpandedGroup>;
  if (!record.groupId || !record.templateId || !record.workflowId || !record.module) return null;
  return record as CanvasWorkflowExpandedGroup;
};

export const createCanvasWorkflowRuntimeValue = (
  workflow: CanvasWorkflowTemplate,
  runtimeItems: CanvasImageItem[],
  idMap: Map<string, string>,
  previousRuntime?: unknown,
): CanvasWorkflowRuntime => {
  const previous = normalizeCanvasWorkflowRuntime(previousRuntime);
  const snapshots = createCanvasWorkflowRuntimeSnapshots(workflow, runtimeItems, idMap);
  return {
    ...previous,
    nodeSnapshots: Object.fromEntries(snapshots.map(snapshot => [snapshot.templateId, snapshot])),
    internalSlotBindings: collectCanvasWorkflowInternalSlotBindings({
      workflow,
      runtimeItems,
      idMap,
      previousRuntime,
    }),
  };
};

export const applyCanvasWorkflowRuntimeSnapshots = (
  workflow: CanvasWorkflowTemplate,
  items: CanvasImageItem[],
  idMap: Map<string, string>,
  runtimeSnapshots: CanvasWorkflowRuntimeNodeSnapshot[]
) => {
  if (runtimeSnapshots.length === 0) return items;
  const snapshotByTemplateId = new Map(runtimeSnapshots.map(snapshot => [snapshot.templateId, snapshot]));
  return items.map(item => {
    const templateEntry = Array.from(idMap.entries()).find(([, runtimeId]) => runtimeId === item.id);
    const templateId = templateEntry?.[0];
    if (!templateId) return item;
    const snapshot = snapshotByTemplateId.get(templateId);
    if (!snapshot) return item;
    const templateNode = workflow.nodes.find(node => node.id === templateId);
    return {
      ...item,
      item: {
        ...item.item,
        content: snapshot.item?.content ?? item.item.content,
        name: snapshot.item?.name ?? item.item.name,
        remark: snapshot.item?.remark ?? item.item.remark,
        remarks: snapshot.item?.remarks ?? item.item.remarks,
      },
      ai: item.ai && snapshot.ai
        ? {
          ...item.ai,
          prompt: snapshot.ai.prompt ?? item.ai.prompt,
          status: snapshot.ai.status || item.ai.status,
          error: snapshot.ai.error,
          generatedAt: snapshot.ai.generatedAt,
          outputs: cloneDrawerValue(snapshot.ai.outputs || []),
          aspectRatio: templateNode?.ai?.aspectRatio || item.ai.aspectRatio,
          outputFormat: templateNode?.ai?.outputFormat || item.ai.outputFormat,
          count: templateNode?.ai?.count || item.ai.count,
        }
        : item.ai,
    };
  });
};

export const getComparableCanvasWorkflowTemplate = (workflow: CanvasWorkflowTemplate) => ({
  userInput: normalizeCanvasWorkflowUserInput(workflow.userInput),
  nodes: workflow.nodes
    .map(node => ({
      id: node.id,
      x: Math.round(node.x),
      y: Math.round(node.y),
      width: Math.round(node.width),
      height: Math.round(node.height),
      item: {
        type: node.item.type,
        content: node.item.content || '',
        name: node.item.name || '',
        remark: node.item.remark || '',
        url: isReplaceableInternalImageSlot(node) ? '' : node.item.url || '',
        path: isReplaceableInternalImageSlot(node) ? '' : node.item.path || '',
      },
      inputs: [...(node.inputs || [])].sort(),
      fixedInput: !!node.fixedInput,
      textMode: node.textMode || '',
      contextRouting: node.contextRouting || '',
      acceptsExternalInputs: !!node.acceptsExternalInputs,
      externalInputTypes: [...(node.externalInputTypes || [])].sort(),
      outputType: node.outputType || '',
      bridgeType: node.bridgeType || '',
      internalSlot: node.internalSlot
        ? cloneDrawerValue(node.internalSlot)
        : null,
      ai: node.ai
        ? {
          type: node.ai.type,
          provider: node.ai.provider,
          model: node.ai.model,
          prompt: node.ai.prompt || '',
          presetId: node.ai.presetId || '',
          presetLabel: node.ai.presetLabel || '',
          presetPrompt: node.ai.presetPrompt || '',
          aspectRatio: node.ai.aspectRatio || '',
          outputFormat: node.ai.outputFormat || '',
          count: node.ai.count || 1,
        }
        : null,
    }))
    .sort((a, b) => a.id.localeCompare(b.id)),
});

export const hasCanvasWorkflowTemplateChanged = (
  currentWorkflow: CanvasWorkflowTemplate,
  originalWorkflow: CanvasWorkflowTemplate
) => (
  JSON.stringify(getComparableCanvasWorkflowTemplate(currentWorkflow)) !==
  JSON.stringify(getComparableCanvasWorkflowTemplate(originalWorkflow))
);

export const createCanvasWorkflowModuleOutputsFromExpandedGroup = (
  moduleNode: CanvasImageItem,
  workflow: CanvasWorkflowTemplate,
  groupItems: CanvasImageItem[],
  idMap: Map<string, string>
) => {
  const drafts = createCanvasWorkflowOutputDrafts(moduleNode, workflow);
  const slots = getCanvasWorkflowOutputSlotTemplates(workflow);
  return drafts.map((draft, index) => {
    const slot = slots[index];
    const canvasId = slot ? idMap.get(slot.node.id) : '';
    const source = canvasId ? groupItems.find(item => item.id === canvasId) : null;
    const output = source?.ai?.outputs?.[slot?.index || 0];
    return output
      ? { ...draft, ...cloneDrawerValue(output), id: draft.id, name: draft.name }
      : draft;
  });
};

export const sortCanvasWorkflowRuntimeNodeIds = (sourceItems: CanvasImageItem[]) => {
  const itemsById = new Map(sourceItems.map(item => [item.id, item]));
  const runnableIds = sourceItems
    .filter(item => item.ai?.type === 'image-generator' || (isCanvasAgentTextTarget(item) && (item.inputs || []).length > 0))
    .map(item => item.id);
  const nodeSet = new Set(runnableIds);
  const indegree = new Map(runnableIds.map(id => [id, 0]));
  const children = new Map<string, string[]>();

  runnableIds.forEach(targetId => {
    const target = itemsById.get(targetId);
    (target?.inputs || []).forEach(inputId => {
      const source = itemsById.get(inputId);
      if (!source || !nodeSet.has(inputId)) return;
      indegree.set(targetId, (indegree.get(targetId) || 0) + 1);
      children.set(inputId, [...(children.get(inputId) || []), targetId]);
    });
  });

  const byCanvasPosition = (a: string, b: string) => {
    const itemA = itemsById.get(a);
    const itemB = itemsById.get(b);
    return (itemA?.x || 0) - (itemB?.x || 0) || (itemA?.y || 0) - (itemB?.y || 0);
  };
  const queue = runnableIds.filter(id => (indegree.get(id) || 0) === 0).sort(byCanvasPosition);
  const order: string[] = [];

  while (queue.length > 0) {
    const id = queue.shift();
    if (!id) break;
    order.push(id);
    (children.get(id) || []).forEach(childId => {
      const nextDegree = (indegree.get(childId) || 0) - 1;
      indegree.set(childId, nextDegree);
      if (nextDegree === 0) {
        queue.push(childId);
        queue.sort(byCanvasPosition);
      }
    });
  }

  if (order.length < runnableIds.length) {
    const ordered = new Set(order);
    order.push(...runnableIds.filter(id => !ordered.has(id)).sort(byCanvasPosition));
  }
  return order;
};

export const getCanvasExpandedWorkflowDownstreamGeneratorIds = (
  sourceId: string,
  groupItems: CanvasImageItem[]
) => {
  const groupIds = new Set(groupItems.map(item => item.id));
  const children = new Map<string, string[]>();
  groupItems.forEach(item => {
    (item.inputs || []).forEach(inputId => {
      if (!groupIds.has(inputId)) return;
      children.set(inputId, [...(children.get(inputId) || []), item.id]);
    });
  });

  const reachable = new Set<string>([sourceId]);
  const queue = [sourceId];
  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId) break;
    (children.get(currentId) || []).forEach(childId => {
      if (reachable.has(childId)) return;
      reachable.add(childId);
      queue.push(childId);
    });
  }

  const order = sortCanvasWorkflowRuntimeNodeIds(groupItems);
  const orderedReachable = order.filter(id => reachable.has(id));
  return orderedReachable.includes(sourceId)
    ? orderedReachable
    : [sourceId, ...orderedReachable];
};
