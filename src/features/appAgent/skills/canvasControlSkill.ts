import type { AppAgentSkill, ContextScope } from './types';
import { matchKeywords } from './skillUtils';

const CANVAS_KEYWORDS = [
  '画布',
  '节点',
  '连接',
  '整理布局',
  '运行节点',
  '更新 prompt',
  '修改 prompt',
  '复制节点',
  '删除节点',
  '清空画布',
  '适配视图',
  'canvas',
  'node',
  'prompt',
  'fit view',
] as const;

export const canvasControlSkill: AppAgentSkill = {
  id: 'canvas-control-skill',
  label: 'Canvas Control',
  description: '画布节点、连接、布局、运行和参数更新。',
  match: input => matchKeywords(input.userText, CANVAS_KEYWORDS, {
    baseScore: input.hasCanvasContext ? 0.5 : 0.42,
  }),
  getRequiredContext: (): ContextScope[] => ['canvas'],
  buildPromptPatch: () => [
    'Active skill: canvas-control-skill.',
    'Use canvas_manage for existing node operations and canvas_* tools for node creation, workflow, connection, organize and run actions.',
    'Running nodes/workflows is costly. Deleting nodes or clearing canvas is destructive.',
    'Use node IDs from the compact canvas context only.',
  ].join('\n'),
};
