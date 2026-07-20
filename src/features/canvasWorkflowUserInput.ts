import type { CanvasImageItem } from './canvasModel';

export type CanvasWorkflowUserInputConfig = {
  enabled: boolean;
  type?: 'text';
  label?: string;
  placeholder?: string;
  required?: boolean;
  acceptImages?: boolean;
  acceptFiles?: boolean;
};

export const DEFAULT_CANVAS_WORKFLOW_USER_INPUT: Readonly<CanvasWorkflowUserInputConfig> = {
  enabled: true,
  type: 'text',
  label: '用户需求',
  placeholder: '描述你希望这个工作流完成的任务…',
  required: false,
  acceptImages: true,
  acceptFiles: false,
};

const cleanText = (value: unknown, maxLength: number) => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

export const normalizeCanvasWorkflowUserInput = (
  value: unknown,
): CanvasWorkflowUserInputConfig => {
  const record = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  return {
    enabled: typeof record.enabled === 'boolean'
      ? record.enabled
      : DEFAULT_CANVAS_WORKFLOW_USER_INPUT.enabled,
    type: 'text',
    label: cleanText(record.label, 80) || DEFAULT_CANVAS_WORKFLOW_USER_INPUT.label,
    placeholder: cleanText(record.placeholder, 240) || DEFAULT_CANVAS_WORKFLOW_USER_INPUT.placeholder,
    required: record.required === true,
    acceptImages: typeof record.acceptImages === 'boolean'
      ? record.acceptImages
      : DEFAULT_CANVAS_WORKFLOW_USER_INPUT.acceptImages,
    acceptFiles: record.acceptFiles === true,
  };
};

export const buildCanvasWorkflowUserInputContext = (
  request: unknown,
  configValue?: unknown,
) => {
  const config = normalizeCanvasWorkflowUserInput(configValue);
  const content = cleanText(request, 6_000);
  if (!config.enabled || !content) return '';
  return `${config.label || '用户需求'}：\n${content}`;
};

const isRunnableWorkflowItem = (item: CanvasImageItem) => (
  item.ai?.type === 'image-generator'
  || (item.item.type === 'text' && !item.ai && item.textMode !== 'plain')
);

export const selectCanvasWorkflowUserInputTargetIds = (
  runtimeItems: CanvasImageItem[],
  explicitTargetNodeIds: string[] = [],
) => {
  const itemIds = new Set(runtimeItems.map(item => item.id));
  const explicitTargets = Array.from(new Set(explicitTargetNodeIds.filter(id => itemIds.has(id))));
  if (explicitTargets.length > 0) return explicitTargets;

  const runnableItems = runtimeItems.filter(isRunnableWorkflowItem);
  const runnableIds = new Set(runnableItems.map(item => item.id));
  const rootRunnableIds = runnableItems
    .filter(item => !(item.inputs || []).some(inputId => runnableIds.has(inputId)))
    .map(item => item.id);
  return rootRunnableIds.length > 0 ? rootRunnableIds : runnableItems.slice(0, 1).map(item => item.id);
};

export const injectCanvasWorkflowUserInputContext = (
  runtimeItems: CanvasImageItem[],
  options: {
    workflowNodeId: string;
    request: unknown;
    config?: unknown;
    targetNodeIds: string[];
  },
): CanvasImageItem[] => {
  const context = buildCanvasWorkflowUserInputContext(options.request, options.config);
  const targetNodeIds = new Set(options.targetNodeIds.filter(Boolean));
  if (!context || targetNodeIds.size === 0) return runtimeItems;

  const contextId = `${options.workflowNodeId}:workflow-user-input`;
  const contextItem: CanvasImageItem = {
    id: contextId,
    item: {
      id: contextId,
      type: 'text',
      content: context,
      name: normalizeCanvasWorkflowUserInput(options.config).label || '用户需求',
      createdAt: Date.now(),
      isQuickAccess: false,
    },
    textMode: 'plain',
    x: -10_000,
    y: -10_000,
    width: 1,
    height: 1,
  };

  return [
    ...runtimeItems.map(item => (
      targetNodeIds.has(item.id)
        ? { ...item, inputs: Array.from(new Set([...(item.inputs || []), contextId])) }
        : item
    )),
    contextItem,
  ];
};
