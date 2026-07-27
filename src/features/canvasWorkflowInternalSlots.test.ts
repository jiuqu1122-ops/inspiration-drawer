import { describe, expect, it } from 'vitest';
import type { CanvasImageItem, CanvasWorkflowSlotAsset } from './canvasModel';
import type {
  CanvasWorkflowInternalSlot,
  CanvasWorkflowNodeTemplate,
  CanvasWorkflowTemplate,
} from './canvasTemplates';
import {
  applyCanvasWorkflowInternalSlotBindings,
  appendCanvasWorkflowInternalSlotAsset,
  clearCanvasWorkflowInternalSlot,
  collectCanvasWorkflowInternalSlotBindings,
  getCanvasWorkflowInternalSlotBinding,
  getCanvasWorkflowInternalSlotNodes,
  getMissingCanvasWorkflowInternalSlots,
  isConcreteFixedImageNode,
  isExternalReferenceImageBridge,
  isExpandedCanvasWorkflowInternalSlotNode,
  isReplaceableInternalImageSlot,
  normalizeCanvasWorkflowRuntime,
  removeCanvasWorkflowInternalSlotAsset,
  reorderCanvasWorkflowInternalSlotAssets,
  replaceCanvasWorkflowInternalSlot,
} from './canvasWorkflowInternalSlots';
import {
  embedCanvasWorkflowFixedImages,
  exportCanvasWorkflowInstance,
  materializeCanvasWorkflowInstance,
} from './canvasWorkflowPortableImages';
import { normalizeCanvasWorkflowTemplate } from './canvasTemplateStorage';
import { resolveWorkflowInputs } from './appAgent/commands/workflowInputResolver';
import {
  INTERNAL_SLOT_ACCEPTANCE_WORKFLOW_LIST,
  INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS,
} from './workflows/internalSlotAcceptanceWorkflows';

const asset = (name: string, updatedAt = 1): CanvasWorkflowSlotAsset => ({
  sourceItemId: `drawer-${name}`,
  path: `C:\\images\\${name}.png`,
  url: `asset://localhost/${name}.png`,
  thumbnail: `asset://localhost/${name}-thumb.png`,
  name,
  updatedAt,
});

const createModule = (
  workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign,
  id = 'module-1',
): CanvasImageItem => ({
  id,
  item: {
    id: `${id}-item`,
    type: 'text',
    content: '',
    name: workflow.label,
    createdAt: 1,
    isQuickAccess: false,
  },
  x: 20,
  y: 30,
  width: 590,
  height: 700,
  inputs: ['external-node'],
  ai: {
    type: 'workflow',
    presetId: workflow.id,
    workflow,
    workflowRuntime: {},
  },
});

const slotById = (
  workflow: CanvasWorkflowTemplate,
  slotId: string,
): CanvasWorkflowInternalSlot => (
  getCanvasWorkflowInternalSlotNodes(workflow)
    .find(node => node.internalSlot?.id === slotId)!
    .internalSlot!
);

const instantiateForTest = (workflow: CanvasWorkflowTemplate) => {
  const idMap = new Map<string, string>();
  const items = workflow.nodes.map((node, index): CanvasImageItem => {
    const runtimeId = `runtime-${index}`;
    idMap.set(node.id, runtimeId);
    return {
      id: runtimeId,
      item: {
        ...node.item,
        id: runtimeId,
        type: node.item.type,
        content: node.item.content || '',
        createdAt: 1,
        isQuickAccess: false,
      },
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      inputs: (node.inputs || []).map(inputId => idMap.get(inputId) || inputId),
      ai: node.ai ? { ...node.ai, type: node.ai.type || 'image-generator' } as CanvasImageItem['ai'] : undefined,
    };
  });
  return { idMap, items };
};

describe('generic replaceable workflow internal image slots', () => {
  it('classifies fixed, replaceable and external image nodes explicitly', () => {
    const fixed: CanvasWorkflowNodeTemplate = {
      id: 'fixed', x: 0, y: 0, width: 1, height: 1,
      item: { id: 'fixed', type: 'image', content: '', createdAt: 0 },
      fixedInput: true,
    };
    const slotNode = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign.nodes[0];
    const bridge: CanvasWorkflowNodeTemplate = {
      ...fixed,
      id: 'bridge',
      item: { ...fixed.item, id: 'bridge', type: 'file' },
      fixedInput: false,
      acceptsExternalInputs: true,
      externalInputTypes: ['image'],
      outputType: 'image',
      bridgeType: 'reference_image',
    };
    expect(isConcreteFixedImageNode(fixed)).toBe(true);
    expect(isReplaceableInternalImageSlot(slotNode)).toBe(true);
    expect(isConcreteFixedImageNode(slotNode)).toBe(false);
    expect(isExternalReferenceImageBridge(bridge)).toBe(true);
  });

  it('assigns a single image to a slot with an arbitrary name', () => {
    const module = createModule();
    const slot = slotById(INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign, 'layout-master');
    const next = replaceCanvasWorkflowInternalSlot({ module, slot, assets: [asset('layout')] });
    expect(getCanvasWorkflowInternalSlotBinding(next.ai?.workflowRuntime, slot).assets)
      .toEqual([asset('layout')]);
  });

  it('overwrites a single-image slot instead of appending', () => {
    const slot = slotById(INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign, 'layout-master');
    const first = replaceCanvasWorkflowInternalSlot({ module: createModule(), slot, assets: [asset('one')] });
    const next = appendCanvasWorkflowInternalSlotAsset({ module: first, slot, asset: asset('two') });
    expect(getCanvasWorkflowInternalSlotBinding(next.ai?.workflowRuntime, slot).assets.map(value => value.name))
      .toEqual(['two']);
  });

  it('adds, removes and reorders assets in a multi-image slot', () => {
    const slot = slotById(INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign, 'character-reference');
    let module = replaceCanvasWorkflowInternalSlot({
      module: createModule(),
      slot,
      assets: [asset('a'), asset('b')],
    });
    module = appendCanvasWorkflowInternalSlotAsset({ module, slot, asset: asset('c') });
    module = reorderCanvasWorkflowInternalSlotAssets({ module, slot, fromIndex: 2, toIndex: 0 });
    module = removeCanvasWorkflowInternalSlotAsset({ module, slot, index: 1 });
    expect(getCanvasWorkflowInternalSlotBinding(module.ai?.workflowRuntime, slot).assets.map(value => value.name))
      .toEqual(['c', 'b']);
  });

  it('enforces maximum assets and de-duplicates the same source', () => {
    const base = slotById(INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign, 'character-reference');
    const slot = { ...base, maxItems: 2 };
    const module = replaceCanvasWorkflowInternalSlot({
      module: createModule(),
      slot,
      assets: [asset('a'), asset('a'), asset('b'), asset('c')],
    });
    expect(getCanvasWorkflowInternalSlotBinding(module.ai?.workflowRuntime, slot).assets.map(value => value.name))
      .toEqual(['a', 'b']);
  });

  it('honors clearable=false', () => {
    const base = slotById(INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign, 'layout-master');
    const slot = { ...base, clearable: false };
    const module = replaceCanvasWorkflowInternalSlot({ module: createModule(), slot, assets: [asset('a')] });
    expect(clearCanvasWorkflowInternalSlot({ module, slot })).toBe(module);
  });

  it('replacing an asset preserves module id, template id, inputs and workflow schema', () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    const module = createModule(workflow);
    const before = JSON.stringify(workflow);
    const slot = slotById(workflow, 'layout-master');
    const next = replaceCanvasWorkflowInternalSlot({ module, slot, assets: [asset('replacement')] });
    expect(next.id).toBe(module.id);
    expect(next.ai?.presetId).toBe(workflow.id);
    expect(next.inputs).toEqual(module.inputs);
    expect(JSON.stringify(workflow)).toBe(before);
  });

  it('keeps two slots isolated from each other', () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    const layout = slotById(workflow, 'layout-master');
    const character = slotById(workflow, 'character-reference');
    let module = replaceCanvasWorkflowInternalSlot({ module: createModule(workflow), slot: layout, assets: [asset('layout')] });
    module = replaceCanvasWorkflowInternalSlot({ module, slot: character, assets: [asset('person')] });
    expect(getCanvasWorkflowInternalSlotBinding(module.ai?.workflowRuntime, layout).assets[0]?.name).toBe('layout');
    expect(getCanvasWorkflowInternalSlotBinding(module.ai?.workflowRuntime, character).assets[0]?.name).toBe('person');
  });

  it('restores bindings into the same expanded runtime nodes and preserves topology', () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    const layout = slotById(workflow, 'layout-master');
    const character = slotById(workflow, 'character-reference');
    let module = replaceCanvasWorkflowInternalSlot({ module: createModule(workflow), slot: layout, assets: [asset('layout')] });
    module = replaceCanvasWorkflowInternalSlot({
      module,
      slot: character,
      assets: [asset('one'), asset('two')],
    });
    const expanded = instantiateForTest(workflow);
    const originalIds = expanded.items.map(item => item.id);
    const originalInputs = expanded.items.map(item => item.inputs);
    const restored = applyCanvasWorkflowInternalSlotBindings({
      workflow,
      items: expanded.items,
      idMap: expanded.idMap,
      runtime: module.ai?.workflowRuntime,
    });
    expect(restored.map(item => item.id)).toEqual(originalIds);
    expect(restored.map(item => item.inputs)).toEqual(originalInputs);
    expect(restored.find(item => item.id === expanded.idMap.get(workflow.nodes[0].id))?.item.name).toBe('layout');
    expect(restored.find(item => item.id === expanded.idMap.get(workflow.nodes[1].id))?.workflowSlotAssets?.length).toBe(2);
  });

  it('collects expanded slot values back into a collapsed runtime', () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    const expanded = instantiateForTest(workflow);
    const slotRuntimeId = expanded.idMap.get(workflow.nodes[0].id)!;
    const changedItems = expanded.items.map(item => item.id === slotRuntimeId
      ? {
          ...item,
          item: { ...item.item, ...asset('changed'), id: item.item.id, type: 'image' as const },
          workflowSlotAssets: [asset('changed')],
        }
      : item);
    const bindings = collectCanvasWorkflowInternalSlotBindings({
      workflow,
      runtimeItems: changedItems,
      idMap: expanded.idMap,
    });
    expect(bindings['layout-master'].assets[0]?.name).toBe('changed');
  });

  it('keeps an expanded slot empty after clearing instead of treating its node id as an asset', () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    const expanded = instantiateForTest(workflow);
    const slotRuntimeId = expanded.idMap.get(workflow.nodes[0].id)!;
    const clearedItems = expanded.items.map(item => item.id === slotRuntimeId
      ? {
          ...item,
          item: {
            ...item.item,
            content: '',
            path: undefined,
            url: undefined,
            thumbnail: undefined,
            sourceUrl: undefined,
            originalUrl: undefined,
            sourceItemId: undefined,
          },
          workflowSlotAssets: [],
        }
      : item);
    const bindings = collectCanvasWorkflowInternalSlotBindings({
      workflow,
      runtimeItems: clearedItems,
      idMap: expanded.idMap,
    });
    expect(bindings['layout-master'].assets).toEqual([]);
  });

  it('survives JSON save and reopen', () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    const slot = slotById(workflow, 'layout-master');
    const module = replaceCanvasWorkflowInternalSlot({ module: createModule(workflow), slot, assets: [asset('persisted')] });
    const restored = JSON.parse(JSON.stringify(module)) as CanvasImageItem;
    expect(getCanvasWorkflowInternalSlotBinding(restored.ai?.workflowRuntime, slot).assets[0]?.name)
      .toBe('persisted');
  });

  it('blocks required empty slots using each configured label', () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    expect(getMissingCanvasWorkflowInternalSlots({ workflow, runtime: {} }))
      .toEqual([
        { slotId: 'layout-master', label: '版式母版' },
        { slotId: 'character-reference', label: '角色参考' },
      ]);
  });

  it('allows optional slots to remain empty', () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.productPresentation;
    const product = slotById(workflow, 'product-reference');
    const module = replaceCanvasWorkflowInternalSlot({ module: createModule(workflow), slot: product, assets: [asset('product')] });
    expect(getMissingCanvasWorkflowInternalSlots({ workflow, runtime: module.ai?.workflowRuntime })).toEqual([]);
  });

  it('does not fan external images out to internal slots', () => {
    const slotNode = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign.nodes[0];
    const workflow = {
      id: 'slot-and-external',
      label: 'slot and external',
      nodes: [
        slotNode,
        {
          id: 'external-bridge',
          item: { type: 'file', name: '外部参考' },
          acceptsExternalInputs: true,
          externalInputTypes: ['image'],
          outputType: 'image',
          bridgeType: 'reference_image',
        },
        {
          id: 'generator',
          inputs: [slotNode.id, 'external-bridge'],
          item: { type: 'text', name: 'generator' },
          ai: {
            type: 'image-generator',
            requiresReferenceImages: true,
            presetPrompt: 'based on connected reference image',
          },
        },
      ],
    };
    const resolution = resolveWorkflowInputs({
      workflow,
      workflowRuntime: {
        internalSlotBindings: {
          'layout-master': { slotId: 'layout-master', assets: [asset('internal')] },
        },
      },
      selectedNodeIds: ['external-image'],
      canvasNodes: [{
        id: 'external-image',
        type: 'image',
        url: 'asset://localhost/external.png',
        hasSourceAsset: true,
      }],
    });
    expect(resolution.internalSlotBindings['layout-master']).toEqual(['drawer-internal']);
    expect(resolution.autoConnections).toEqual([{ sourceId: 'external-image', targetId: 'external-bridge' }]);
    expect(resolution.autoConnections.some(connection => connection.targetId === slotNode.id)).toBe(false);
  });

  it('returns slot-specific missing messages from the input resolver', () => {
    const resolution = resolveWorkflowInputs({
      workflow: INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign,
      workflowRuntime: {},
      allowRecentCanvasFallback: false,
    });
    expect(resolution.missingInternalSlots[0]).toEqual({ slotId: 'layout-master', label: '版式母版' });
    expect(resolution.missingRequiredInputs).toContain('请先设置「版式母版」');
  });

  it('template export strips private slot instance images', async () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    const slot = slotById(workflow, 'layout-master');
    const module = replaceCanvasWorkflowInternalSlot({ module: createModule(workflow), slot, assets: [asset('private')] });
    const [portableTemplate] = await embedCanvasWorkflowFixedImages([workflow], async () => 'data:image/png;base64,AA==');
    expect(JSON.stringify(portableTemplate)).not.toContain('private');
    expect(JSON.stringify(module.ai?.workflowRuntime)).toContain('private');
  });

  it('instance export optionally embeds current slot images', async () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    const slot = slotById(workflow, 'layout-master');
    const module = replaceCanvasWorkflowInternalSlot({ module: createModule(workflow), slot, assets: [asset('private')] });
    const withoutAssets = await exportCanvasWorkflowInstance({
      workflow,
      runtime: module.ai?.workflowRuntime,
      includeInternalSlotAssets: false,
      readImageDataUrl: async () => 'data:image/png;base64,AA==',
    });
    const withAssets = await exportCanvasWorkflowInstance({
      workflow,
      runtime: module.ai?.workflowRuntime,
      includeInternalSlotAssets: true,
      readImageDataUrl: async () => 'data:image/png;base64,AA==',
    });
    expect(withoutAssets.runtime).toBeUndefined();
    expect(withAssets.runtime?.internalSlotBindings?.['layout-master'].assets[0]?.url)
      .toBe('data:image/png;base64,AA==');
  });

  it('materializes imported instance assets and preserves slot definitions/order', async () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.productPresentation;
    const product = slotById(workflow, 'product-reference');
    const module = replaceCanvasWorkflowInternalSlot({ module: createModule(workflow), slot: product, assets: [asset('portable')] });
    const portable = await exportCanvasWorkflowInstance({
      workflow,
      runtime: module.ai?.workflowRuntime,
      includeInternalSlotAssets: true,
      readImageDataUrl: async () => 'data:image/png;base64,AA==',
    });
    const restored = await materializeCanvasWorkflowInstance({
      portable,
      saveImageDataUrl: async fileName => `C:\\cache\\${fileName}`,
      getDisplayUrl: path => `asset://localhost/${path.replace(/\\/g, '/')}`,
    });
    expect(getCanvasWorkflowInternalSlotNodes(restored.workflow).map(node => node.internalSlot?.id))
      .toEqual(['product-reference', 'cmf-reference', 'scene-reference']);
    expect(restored.runtime.internalSlotBindings?.['product-reference'].assets[0]?.path)
      .toMatch(/^C:\\cache\\/);
  });

  it('keeps legacy workflows unchanged when no internalSlot exists', () => {
    const legacy = normalizeCanvasWorkflowTemplate({
      id: 'legacy',
      label: 'Legacy',
      nodes: [
        {
          id: 'fixed-image',
          item: { type: 'image', name: 'fixed', path: 'C:\\fixed.png' },
          fixedInput: true,
        },
        {
          id: 'generator',
          inputs: ['fixed-image'],
          item: { type: 'text' },
          ai: { type: 'image-generator', presetPrompt: 'render' },
        },
      ],
    });
    expect(legacy?.nodes[0].internalSlot).toBeUndefined();
    expect(isConcreteFixedImageNode(legacy?.nodes[0])).toBe(true);
  });

  it('distinguishes a protected expanded slot node from an ordinary canvas image', () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    const expandedSlot = {
      workflowGroup: {
        templateId: workflow.nodes[0].id,
      },
    };
    const ordinaryImage = { workflowGroup: undefined };
    expect(isExpandedCanvasWorkflowInternalSlotNode(expandedSlot, workflow)).toBe(true);
    expect(isExpandedCanvasWorkflowInternalSlotNode(ordinaryImage, workflow)).toBe(false);
  });

  it('normalizes legacy runtime snapshot arrays without losing them', () => {
    const runtime = normalizeCanvasWorkflowRuntime([
      { templateId: 'generator', item: { content: 'saved' } },
    ]);
    expect(runtime.nodeSnapshots?.generator.item?.content).toBe('saved');
  });

  it('keeps separate instances of the same template independent', () => {
    const workflow = INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS.characterDesign;
    const slot = slotById(workflow, 'layout-master');
    const first = replaceCanvasWorkflowInternalSlot({
      module: createModule(workflow, 'module-a'),
      slot,
      assets: [asset('a')],
    });
    const second = replaceCanvasWorkflowInternalSlot({
      module: createModule(workflow, 'module-b'),
      slot,
      assets: [asset('b')],
    });
    const changedFirst = replaceCanvasWorkflowInternalSlot({ module: first, slot, assets: [asset('c')] });
    expect(getCanvasWorkflowInternalSlotBinding(changedFirst.ai?.workflowRuntime, slot).assets[0]?.name).toBe('c');
    expect(getCanvasWorkflowInternalSlotBinding(second.ai?.workflowRuntime, slot).assets[0]?.name).toBe('b');
  });

  it('all three acceptance workflows use the same generic slot implementation', () => {
    expect(INTERNAL_SLOT_ACCEPTANCE_WORKFLOW_LIST).toHaveLength(3);
    expect(INTERNAL_SLOT_ACCEPTANCE_WORKFLOW_LIST.map(workflow => (
      getCanvasWorkflowInternalSlotNodes(workflow).map(node => node.internalSlot?.mode)
    ))).toEqual([
      ['replaceable_internal', 'replaceable_internal'],
      ['replaceable_internal', 'replaceable_internal', 'replaceable_internal'],
      ['replaceable_internal', 'replaceable_internal', 'replaceable_internal'],
    ]);
  });
});
