import type { BufferItem } from '../types';
import type {
  CanvasImageItem,
  CanvasWorkflowRuntime,
  CanvasWorkflowRuntimeNodeSnapshot,
  CanvasWorkflowSlotAsset,
  CanvasWorkflowSlotBinding,
} from './canvasModel';
import type {
  CanvasWorkflowInternalSlot,
  CanvasWorkflowNodeTemplate,
  CanvasWorkflowTemplate,
} from './canvasTemplates';

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const cleanString = (value: unknown, maxLength = 2000) => (
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
);

const cleanOptionalString = (value: unknown, maxLength = 2000) => {
  const result = cleanString(value, maxLength);
  return result || undefined;
};

const cleanNonNegativeInteger = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : undefined;
};

export const normalizeCanvasWorkflowInternalSlot = (
  value: unknown,
  fallback?: { id?: string; label?: string; order?: number },
): CanvasWorkflowInternalSlot | undefined => {
  const record = asRecord(value);
  if (!record || record.mode !== 'replaceable_internal') return undefined;
  const id = cleanString(record.id || fallback?.id, 80);
  const label = cleanString(record.label || fallback?.label || id, 80);
  if (!id || !label) return undefined;

  const multiple = record.multiple === true;
  const minItems = cleanNonNegativeInteger(record.minItems);
  const rawMaxItems = cleanNonNegativeInteger(record.maxItems);
  const maxItems = multiple
    ? Math.max(minItems || 0, rawMaxItems || 12)
    : 1;
  const defaultRecord = asRecord(record.defaultValue);
  const defaultValue = defaultRecord
    ? {
        url: cleanOptionalString(defaultRecord.url),
        path: cleanOptionalString(defaultRecord.path),
        sourceItemId: cleanOptionalString(defaultRecord.sourceItemId, 160),
      }
    : undefined;
  const hasDefaultValue = !!(defaultValue?.url || defaultValue?.path || defaultValue?.sourceItemId);

  return {
    id,
    label,
    mediaType: 'image',
    mode: 'replaceable_internal',
    multiple,
    minItems,
    maxItems,
    required: record.required === true,
    description: cleanOptionalString(record.description, 240),
    emptyHint: cleanOptionalString(record.emptyHint, 160),
    role: cleanOptionalString(record.role, 120),
    order: cleanNonNegativeInteger(record.order) ?? fallback?.order,
    defaultValue: hasDefaultValue ? defaultValue : undefined,
    clearable: record.clearable !== false,
  };
};

export const isReplaceableInternalImageSlot = (
  node?: Pick<CanvasWorkflowNodeTemplate, 'item' | 'internalSlot'> | null,
): boolean => (
  !!node
  && node.item?.type === 'image'
  && node.internalSlot?.mode === 'replaceable_internal'
  && node.internalSlot.mediaType === 'image'
);

export const isExternalReferenceImageBridge = (
  node?: Pick<
    CanvasWorkflowNodeTemplate,
    'acceptsExternalInputs' | 'bridgeType' | 'externalInputTypes' | 'item' | 'outputType'
  > | null,
): boolean => (
  !!node
  && node.acceptsExternalInputs === true
  && (
    node.bridgeType === 'reference_image'
    || node.externalInputTypes?.includes('image') === true
    || node.item?.type === 'file'
    || node.outputType === 'image'
    || node.outputType === 'image[]'
  )
);

export const isConcreteFixedImageNode = (
  node?: Pick<
    CanvasWorkflowNodeTemplate,
    'fixedInput' | 'item' | 'acceptsExternalInputs' | 'bridgeType' | 'internalSlot'
  > | null,
): boolean => (
  !!node
  && node.fixedInput === true
  && node.item?.type === 'image'
  && node.acceptsExternalInputs !== true
  && node.bridgeType !== 'reference_image'
  && !isReplaceableInternalImageSlot(node)
);

export const getCanvasWorkflowInternalSlotNodes = (workflow?: CanvasWorkflowTemplate | null) => (
  (workflow?.nodes || [])
    .filter(isReplaceableInternalImageSlot)
    .sort((left, right) => (
      Number(left.internalSlot?.order ?? Number.MAX_SAFE_INTEGER)
      - Number(right.internalSlot?.order ?? Number.MAX_SAFE_INTEGER)
      || left.id.localeCompare(right.id)
    ))
);

export const isExpandedCanvasWorkflowInternalSlotNode = (
  item?: Pick<CanvasImageItem, 'workflowGroup'> | null,
  workflow?: CanvasWorkflowTemplate | null,
) => {
  const group = asRecord(item?.workflowGroup);
  const templateId = cleanString(group?.templateId, 160);
  return !!templateId && getCanvasWorkflowInternalSlotNodes(workflow)
    .some(node => node.id === templateId);
};

export const normalizeCanvasWorkflowSlotAsset = (
  value: unknown,
  fallbackUpdatedAt = Date.now(),
): CanvasWorkflowSlotAsset | null => {
  const record = asRecord(value);
  if (!record) return null;
  const asset: CanvasWorkflowSlotAsset = {
    sourceItemId: cleanOptionalString(record.sourceItemId, 160),
    path: cleanOptionalString(record.path),
    url: cleanOptionalString(record.url),
    thumbnail: cleanOptionalString(record.thumbnail),
    originalUrl: cleanOptionalString(record.originalUrl),
    name: cleanOptionalString(record.name, 160),
    updatedAt: Number.isFinite(Number(record.updatedAt))
      ? Number(record.updatedAt)
      : fallbackUpdatedAt,
  };
  if (!asset.sourceItemId && !asset.path && !asset.url && !asset.thumbnail && !asset.originalUrl) {
    return null;
  }
  return asset;
};

const getAssetIdentity = (asset: CanvasWorkflowSlotAsset) => (
  asset.sourceItemId
  || asset.path
  || asset.originalUrl
  || asset.url
  || asset.thumbnail
  || ''
);

export const normalizeCanvasWorkflowSlotAssets = (
  value: unknown,
  slot?: CanvasWorkflowInternalSlot,
): CanvasWorkflowSlotAsset[] => {
  const rawAssets = Array.isArray(value) ? value : [];
  const seen = new Set<string>();
  const assets = rawAssets
    .map(asset => normalizeCanvasWorkflowSlotAsset(asset))
    .filter((asset): asset is CanvasWorkflowSlotAsset => !!asset)
    .filter(asset => {
      const identity = getAssetIdentity(asset);
      if (!identity || seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  const maxItems = !slot
    ? 12
    : slot.multiple === true
      ? Math.max(1, Number(slot.maxItems) || 12)
      : 1;
  return assets.slice(0, maxItems);
};

const normalizeRuntimeSnapshots = (
  value: unknown,
): Record<string, CanvasWorkflowRuntimeNodeSnapshot> => {
  const snapshots: Record<string, CanvasWorkflowRuntimeNodeSnapshot> = {};
  const addSnapshot = (candidate: unknown, key?: string) => {
    const record = asRecord(candidate);
    const templateId = cleanString(record?.templateId || key, 160);
    if (!record || !templateId) return;
    snapshots[templateId] = {
      templateId,
      item: asRecord(record.item) as Partial<BufferItem> | undefined,
      ai: asRecord(record.ai) as CanvasWorkflowRuntimeNodeSnapshot['ai'],
    };
  };
  if (Array.isArray(value)) {
    value.forEach(candidate => addSnapshot(candidate));
  } else {
    const record = asRecord(value);
    Object.entries(record || {}).forEach(([key, candidate]) => addSnapshot(candidate, key));
  }
  return snapshots;
};

export const normalizeCanvasWorkflowRuntime = (
  value: unknown,
): CanvasWorkflowRuntime => {
  if (Array.isArray(value)) {
    return { nodeSnapshots: normalizeRuntimeSnapshots(value) };
  }
  const record = asRecord(value) || {};
  const rawBindings = asRecord(record.internalSlotBindings) || {};
  const internalSlotBindings: Record<string, CanvasWorkflowSlotBinding> = {};
  Object.entries(rawBindings).forEach(([key, candidate]) => {
    const binding = asRecord(candidate);
    const slotId = cleanString(binding?.slotId || key, 80);
    if (!binding || !slotId) return;
    internalSlotBindings[slotId] = {
      slotId,
      assets: normalizeCanvasWorkflowSlotAssets(binding.assets),
    };
  });
  const nodeSnapshots = normalizeRuntimeSnapshots(record.nodeSnapshots);
  return {
    ...record,
    nodeSnapshots,
    internalSlotBindings,
  };
};

export const getCanvasWorkflowRuntimeSnapshots = (
  value: unknown,
): CanvasWorkflowRuntimeNodeSnapshot[] => (
  Object.values(normalizeCanvasWorkflowRuntime(value).nodeSnapshots || {})
);

export const createCanvasWorkflowSlotAssetFromItem = (
  item: Partial<BufferItem>,
  updatedAt = Date.now(),
): CanvasWorkflowSlotAsset | null => {
  const hasConcreteSource = !!(
    item.path
    || item.url
    || item.thumbnail
    || item.originalUrl
    || item.sourceUrl
  );
  return normalizeCanvasWorkflowSlotAsset({
    sourceItemId: item.sourceItemId || (hasConcreteSource ? item.id : undefined),
    path: item.path,
    url: item.url,
    thumbnail: item.thumbnail,
    originalUrl: item.originalUrl || item.sourceUrl,
    name: item.name,
    updatedAt,
  }, updatedAt);
};

export const applyCanvasWorkflowSlotAssetToItem = (
  item: BufferItem,
  asset?: CanvasWorkflowSlotAsset | null,
): BufferItem => ({
  ...item,
  type: 'image',
  sourceItemId: asset?.sourceItemId,
  path: asset?.path,
  url: asset?.url,
  thumbnail: asset?.thumbnail,
  originalUrl: asset?.originalUrl,
  sourceUrl: asset?.originalUrl,
  name: asset?.name || item.name,
  content: asset ? (asset.name || item.content || '') : '',
});

export const getCanvasWorkflowInternalSlotBinding = (
  runtimeValue: unknown,
  slot: CanvasWorkflowInternalSlot,
): CanvasWorkflowSlotBinding => {
  const runtime = normalizeCanvasWorkflowRuntime(runtimeValue);
  const binding = runtime.internalSlotBindings?.[slot.id];
  if (binding) {
    return {
      slotId: slot.id,
      assets: normalizeCanvasWorkflowSlotAssets(binding.assets, slot),
    };
  }
  const defaultAsset = normalizeCanvasWorkflowSlotAsset({
    ...slot.defaultValue,
    updatedAt: 0,
  }, 0);
  return {
    slotId: slot.id,
    assets: defaultAsset ? [defaultAsset] : [],
  };
};

const updateModuleSlotBinding = (
  module: CanvasImageItem,
  slot: CanvasWorkflowInternalSlot,
  update: (assets: CanvasWorkflowSlotAsset[]) => CanvasWorkflowSlotAsset[],
): CanvasImageItem => {
  if (module.ai?.type !== 'workflow') return module;
  const runtime = normalizeCanvasWorkflowRuntime(module.ai.workflowRuntime);
  const current = getCanvasWorkflowInternalSlotBinding(runtime, slot).assets;
  const nextAssets = normalizeCanvasWorkflowSlotAssets(update(current), slot);
  return {
    ...module,
    ai: {
      ...module.ai,
      workflowRuntime: {
        ...runtime,
        internalSlotBindings: {
          ...(runtime.internalSlotBindings || {}),
          [slot.id]: {
            slotId: slot.id,
            assets: nextAssets,
          },
        },
      },
    },
  };
};

export const replaceCanvasWorkflowInternalSlot = (input: {
  module: CanvasImageItem;
  slot: CanvasWorkflowInternalSlot;
  assets: CanvasWorkflowSlotAsset[];
}) => updateModuleSlotBinding(
  input.module,
  input.slot,
  () => input.assets,
);

export const clearCanvasWorkflowInternalSlot = (input: {
  module: CanvasImageItem;
  slot: CanvasWorkflowInternalSlot;
}) => (
  input.slot.clearable === false
    ? input.module
    : updateModuleSlotBinding(input.module, input.slot, () => [])
);

export const appendCanvasWorkflowInternalSlotAsset = (input: {
  module: CanvasImageItem;
  slot: CanvasWorkflowInternalSlot;
  asset: CanvasWorkflowSlotAsset;
}) => updateModuleSlotBinding(
  input.module,
  input.slot,
  current => input.slot.multiple === true ? [...current, input.asset] : [input.asset],
);

export const removeCanvasWorkflowInternalSlotAsset = (input: {
  module: CanvasImageItem;
  slot: CanvasWorkflowInternalSlot;
  index: number;
}) => updateModuleSlotBinding(input.module, input.slot, current => {
  const minItems = Math.max(0, Number(input.slot.minItems) || 0);
  if (current.length <= minItems || input.index < 0 || input.index >= current.length) return current;
  return current.filter((_, index) => index !== input.index);
});

export const reorderCanvasWorkflowInternalSlotAssets = (input: {
  module: CanvasImageItem;
  slot: CanvasWorkflowInternalSlot;
  fromIndex: number;
  toIndex: number;
}) => updateModuleSlotBinding(input.module, input.slot, current => {
  if (
    input.fromIndex < 0
    || input.fromIndex >= current.length
    || input.toIndex < 0
    || input.toIndex >= current.length
    || input.fromIndex === input.toIndex
  ) return current;
  const next = [...current];
  const [asset] = next.splice(input.fromIndex, 1);
  next.splice(input.toIndex, 0, asset);
  return next;
});

export const collectCanvasWorkflowInternalSlotBindings = (input: {
  workflow: CanvasWorkflowTemplate;
  runtimeItems: CanvasImageItem[];
  idMap: Map<string, string>;
  previousRuntime?: unknown;
}): Record<string, CanvasWorkflowSlotBinding> => {
  const previousRuntime = normalizeCanvasWorkflowRuntime(input.previousRuntime);
  const bindings = { ...(previousRuntime.internalSlotBindings || {}) };
  getCanvasWorkflowInternalSlotNodes(input.workflow).forEach(node => {
    const slot = node.internalSlot!;
    const runtimeId = input.idMap.get(node.id);
    const runtimeItem = input.runtimeItems.find(item => item.id === runtimeId);
    const runtimeAssets = normalizeCanvasWorkflowSlotAssets(
      runtimeItem?.workflowSlotAssets,
      slot,
    );
    const asset = runtimeItem ? createCanvasWorkflowSlotAssetFromItem(runtimeItem.item) : null;
    if (slot.multiple === true) {
      const existing = getCanvasWorkflowInternalSlotBinding(previousRuntime, slot).assets;
      bindings[slot.id] = {
        slotId: slot.id,
        assets: normalizeCanvasWorkflowSlotAssets(
          runtimeAssets.length > 0
            ? runtimeAssets
            : asset
              ? [asset, ...existing.slice(1)]
              : existing,
          slot,
        ),
      };
    } else {
      bindings[slot.id] = {
        slotId: slot.id,
        assets: asset ? [asset] : [],
      };
    }
  });
  return bindings;
};

export const applyCanvasWorkflowInternalSlotBindings = (input: {
  workflow: CanvasWorkflowTemplate;
  items: CanvasImageItem[];
  idMap: Map<string, string>;
  runtime?: unknown;
}): CanvasImageItem[] => {
  const slotNodeByRuntimeId = new Map(
    getCanvasWorkflowInternalSlotNodes(input.workflow)
      .map(node => [input.idMap.get(node.id), node] as const)
      .filter((entry): entry is [string, CanvasWorkflowNodeTemplate] => !!entry[0]),
  );
  return input.items.map(item => {
    const node = slotNodeByRuntimeId.get(item.id);
    if (!node?.internalSlot) return item;
    const binding = getCanvasWorkflowInternalSlotBinding(input.runtime, node.internalSlot);
    return {
      ...item,
      item: applyCanvasWorkflowSlotAssetToItem(item.item, binding.assets[0]),
      workflowSlotAssets: binding.assets,
    };
  });
};

export const getMissingCanvasWorkflowInternalSlots = (input: {
  workflow?: CanvasWorkflowTemplate | null;
  runtime?: unknown;
}) => getCanvasWorkflowInternalSlotNodes(input.workflow)
  .filter(node => {
    const slot = node.internalSlot!;
    if (!slot.required && !(Number(slot.minItems) > 0)) return false;
    const minimum = Math.max(slot.required ? 1 : 0, Number(slot.minItems) || 0);
    return getCanvasWorkflowInternalSlotBinding(input.runtime, slot).assets.length < minimum;
  })
  .map(node => ({
    slotId: node.internalSlot!.id,
    label: node.internalSlot!.label,
  }));
