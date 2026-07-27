import type {
  CanvasWorkflowInternalSlot,
  CanvasWorkflowNodeTemplate,
  CanvasWorkflowTemplate,
} from '../canvasTemplates';

const createSlotNode = (
  nodeId: string,
  slot: Omit<CanvasWorkflowInternalSlot, 'mediaType' | 'mode'>,
  x: number,
): CanvasWorkflowNodeTemplate => ({
  id: nodeId,
  x,
  y: 0,
  width: 240,
  height: 220,
  item: {
    id: nodeId,
    type: 'image',
    content: '',
    name: slot.label,
    createdAt: 0,
    isQuickAccess: false,
  },
  inputs: [],
  fixedInput: true,
  acceptsExternalInputs: false,
  outputType: slot.multiple ? 'image[]' : 'image',
  internalSlot: {
    ...slot,
    mediaType: 'image',
    mode: 'replaceable_internal',
  },
});

const createAcceptanceWorkflow = (
  id: string,
  label: string,
  slots: Array<Omit<CanvasWorkflowInternalSlot, 'mediaType' | 'mode'>>,
): CanvasWorkflowTemplate => {
  const slotNodes = slots.map((slot, index) => createSlotNode(
    `${id}-slot-${index + 1}`,
    slot,
    index * 270,
  ));
  return {
    id,
    label,
    hint: `${slots.length} 个通用内部图片槽位`,
    nodes: [
      ...slotNodes,
      {
        id: `${id}-generator`,
        x: slots.length * 270 + 100,
        y: 0,
        width: 560,
        height: 520,
        item: {
          id: `${id}-generator`,
          type: 'text',
          content: '',
          name: 'AI 最终生成',
          createdAt: 0,
          isQuickAccess: false,
        },
        inputs: slotNodes.map(node => node.id),
        outputType: 'image',
        ai: {
          type: 'image-generator',
          presetPrompt: '根据各命名图片槽位及其参考职责生成最终结果。',
          count: 1,
          outputs: [],
          status: 'idle',
        },
      },
    ],
    builtin: false,
  };
};

export const INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS = {
  characterDesign: createAcceptanceWorkflow(
    'internal-slot-acceptance-character-design',
    '角色设定',
    [
      {
        id: 'layout-master',
        label: '版式母版',
        required: true,
        multiple: false,
        role: 'LAYOUT_REF',
        order: 0,
      },
      {
        id: 'character-reference',
        label: '角色参考',
        required: true,
        multiple: true,
        maxItems: 4,
        role: 'SUBJECT_REF',
        order: 1,
      },
    ],
  ),
  productPresentation: createAcceptanceWorkflow(
    'internal-slot-acceptance-product-presentation',
    '产品展示',
    [
      {
        id: 'product-reference',
        label: '产品参考',
        required: true,
        multiple: true,
        maxItems: 6,
        role: 'PRODUCT_REF',
        order: 0,
      },
      {
        id: 'cmf-reference',
        label: 'CMF 参考',
        required: false,
        multiple: false,
        role: 'CMF_REF',
        order: 1,
      },
      {
        id: 'scene-reference',
        label: '场景参考',
        required: false,
        multiple: false,
        role: 'SCENE_REF',
        order: 2,
      },
    ],
  ),
  modelPhotography: createAcceptanceWorkflow(
    'internal-slot-acceptance-model-photography',
    '模特摄影',
    [
      {
        id: 'person-reference',
        label: '人物参考',
        required: true,
        multiple: false,
        role: 'PERSON_REF',
        order: 0,
      },
      {
        id: 'background-reference',
        label: '背景参考',
        required: true,
        multiple: false,
        role: 'BACKGROUND_REF',
        order: 1,
      },
      {
        id: 'garment-reference',
        label: '服装参考',
        required: false,
        multiple: true,
        maxItems: 5,
        role: 'GARMENT_REF',
        order: 2,
      },
    ],
  ),
} as const;

export const INTERNAL_SLOT_ACCEPTANCE_WORKFLOW_LIST = Object.values(
  INTERNAL_SLOT_ACCEPTANCE_WORKFLOWS,
);
