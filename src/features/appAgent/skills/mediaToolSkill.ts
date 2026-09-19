import type { AppAgentSkill, ContextScope } from './types';
import { matchKeywords } from './skillUtils';

const MEDIA_TOOL_KEYWORDS = [
  '补帧',
  '插帧',
  'rife',
  '图片增强',
  '视频增强',
  '清晰度增强',
  '图增强',
  '视增强',
  'image enhancement',
  'video enhancement',
  'frame interpolation',
  '溶图',
  '融合图片',
  'image fusion',
] as const;

export const mediaToolSkill: AppAgentSkill = {
  id: 'media-tool-skill',
  label: 'Media Tool',
  description: '画布补帧、图片增强、视频增强和溶图工具。',
  match: input => matchKeywords(input.userText, MEDIA_TOOL_KEYWORDS),
  getRequiredContext: (): ContextScope[] => ['canvas'],
  buildPromptPatch: () => [
    'Active skill: media-tool-skill.',
    'Use canvas_create_media_tool with toolType frame-interpolation, image-enhancement, video-enhancement or image-fusion.',
    'image-fusion requires exactly two valid image inputIds ordered as base image then style image.',
    'Use selected media nodes as inputIds when available. autoRun may be costly and can require confirmation.',
  ].join('\n'),
};
