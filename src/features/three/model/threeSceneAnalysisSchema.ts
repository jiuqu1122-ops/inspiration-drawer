import { z } from 'zod';
import type {
  SceneAnalysisSecondaryObject,
  SceneAnalysisV1,
  SceneCameraPerspective,
  SceneCameraShot,
  SceneGroundSlope,
  SceneKeyDirection,
  SceneSecondaryDepthOrder,
  SceneSecondaryShapeHint,
  SceneSubjectElevation,
  SceneSubjectOrientation,
  SceneSubjectShapeHint,
} from './threeSceneAnalysisTypes';

export const THREE_SCENE_MAX_SECONDARY_OBJECTS = 4;

const subjectOrientations = ['front', 'front-left', 'front-right', 'side-left', 'side-right', 'rear', 'unknown'] as const;
const subjectElevations = ['low', 'center', 'high'] as const;
const cameraShots = ['close', 'medium-close', 'medium', 'wide'] as const;
const cameraPerspectives = ['flat', 'mild', 'moderate', 'strong'] as const;
const groundSlopes = ['flat', 'slight-up', 'slight-down'] as const;
const keyDirections = ['front', 'front-left', 'front-right', 'left', 'right', 'top', 'top-left', 'top-right', 'rear-left', 'rear-right'] as const;
const subjectShapeHints = ['box', 'rounded-box', 'flat', 'tall', 'cylindrical', 'spherical', 'organic'] as const;
const secondaryDepthOrders = ['front', 'same', 'behind'] as const;
const secondaryShapeHints = ['box', 'flat', 'cylindrical'] as const;

const normalizedPointSchema = z.tuple([
  z.number().min(0).max(1),
  z.number().min(0).max(1),
]);

const secondaryObjectSchema = z.object({
  role: z.string().min(1).max(80),
  center: normalizedPointSchema,
  width: z.number().min(0.02).max(0.95),
  height: z.number().min(0.02).max(0.95),
  depthOrder: z.enum(secondaryDepthOrders),
  shapeHint: z.enum(secondaryShapeHints),
}).strict();

export const sceneAnalysisV1Schema = z.object({
  version: z.literal(1),
  composition: z.object({
    subjectCenter: normalizedPointSchema,
    subjectWidth: z.number().min(0.05).max(0.95),
    subjectHeight: z.number().min(0.05).max(0.95),
    subjectOrientation: z.enum(subjectOrientations),
    subjectElevation: z.enum(subjectElevations),
  }).strict(),
  camera: z.object({
    azimuthDeg: z.number().min(-180).max(180),
    elevationDeg: z.number().min(-75).max(75),
    shot: z.enum(cameraShots),
    perspective: z.enum(cameraPerspectives),
    horizonY: z.number().min(0).max(1),
  }).strict(),
  ground: z.object({
    visible: z.boolean(),
    horizonY: z.number().min(0).max(1),
    slope: z.enum(groundSlopes),
  }).strict(),
  environment: z.object({
    backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i),
    backgroundBrightness: z.number().min(0).max(1),
  }).strict(),
  lighting: z.object({
    keyDirection: z.enum(keyDirections),
    softness: z.number().min(0).max(1),
    contrast: z.number().min(0).max(1),
    fillStrength: z.number().min(0).max(1),
  }).strict(),
  subject: z.object({
    shapeHint: z.enum(subjectShapeHints),
    aspect: z.tuple([
      z.number().min(0.1).max(8),
      z.number().min(0.1).max(8),
      z.number().min(0.1).max(8),
    ]),
  }).strict(),
  secondaryObjects: z.array(secondaryObjectSchema).max(THREE_SCENE_MAX_SECONDARY_OBJECTS),
}).strict();

const recordOf = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const numberOf = (value: unknown, fallback: number) => {
  const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => (
  Math.min(max, Math.max(min, numberOf(value, fallback)))
);

const enumOf = <T extends string>(value: unknown, values: readonly T[], fallback: T): T => {
  const normalized = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  return values.includes(normalized as T) ? normalized as T : fallback;
};

const pointOf = (value: unknown, fallback: [number, number]): [number, number] => {
  const raw = Array.isArray(value) ? value : [];
  return [
    clamp(raw[0], 0, 1, fallback[0]),
    clamp(raw[1], 0, 1, fallback[1]),
  ];
};

const aspectOf = (value: unknown): [number, number, number] => {
  const raw = Array.isArray(value) ? value : [];
  return [
    clamp(raw[0], 0.1, 8, 1.4),
    clamp(raw[1], 0.1, 8, 1),
    clamp(raw[2], 0.1, 8, 1),
  ];
};

const colorOf = (value: unknown, fallback = '#d8d8d8') => {
  const color = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.toLowerCase();
  if (/^#[0-9a-f]{3}$/i.test(color)) {
    return `#${color.slice(1).split('').map(character => character.repeat(2)).join('')}`.toLowerCase();
  }
  return fallback;
};

const orientationAzimuth = (orientation: SceneSubjectOrientation) => ({
  front: 0,
  'front-left': 32,
  'front-right': -32,
  'side-left': 82,
  'side-right': -82,
  rear: 180,
  unknown: 25,
}[orientation]);

const normalizeSecondary = (value: unknown, index: number): SceneAnalysisSecondaryObject | null => {
  const raw = recordOf(value);
  const center = pointOf(raw.center, [0.5, 0.65]);
  const width = clamp(raw.width, 0.02, 0.95, 0.16);
  const height = clamp(raw.height, 0.02, 0.95, 0.12);
  if (width * height < 0.0015) return null;
  const role = String(raw.role || `support-${index + 1}`).trim().slice(0, 80) || `support-${index + 1}`;
  const inferredShape: SceneSecondaryShapeHint = /surface|ground|backdrop|平面|背景|地面/i.test(role)
    ? 'flat'
    : /pole|bottle|column|杆|瓶|柱/i.test(role) ? 'cylindrical' : 'box';
  return {
    role,
    center,
    width,
    height,
    depthOrder: enumOf<SceneSecondaryDepthOrder>(raw.depthOrder, secondaryDepthOrders, 'same'),
    shapeHint: enumOf<SceneSecondaryShapeHint>(raw.shapeHint, secondaryShapeHints, inferredShape),
  };
};

export const normalizeSceneAnalysis = (value: unknown): SceneAnalysisV1 => {
  const root = recordOf(value);
  const composition = recordOf(root.composition);
  const camera = recordOf(root.camera);
  const ground = recordOf(root.ground);
  const environment = recordOf(root.environment);
  const lighting = recordOf(root.lighting);
  const subject = recordOf(root.subject);
  const orientation = enumOf<SceneSubjectOrientation>(composition.subjectOrientation, subjectOrientations, 'unknown');
  const cameraHorizon = clamp(camera.horizonY, 0, 1, 0.62);
  const normalized: SceneAnalysisV1 = {
    version: 1,
    composition: {
      subjectCenter: pointOf(composition.subjectCenter, [0.5, 0.55]),
      subjectWidth: clamp(composition.subjectWidth, 0.05, 0.95, 0.5),
      subjectHeight: clamp(composition.subjectHeight, 0.05, 0.95, 0.4),
      subjectOrientation: orientation,
      subjectElevation: enumOf<SceneSubjectElevation>(composition.subjectElevation, subjectElevations, 'center'),
    },
    camera: {
      azimuthDeg: clamp(camera.azimuthDeg, -180, 180, orientationAzimuth(orientation)),
      elevationDeg: clamp(camera.elevationDeg, -75, 75, 10),
      shot: enumOf<SceneCameraShot>(camera.shot, cameraShots, 'medium-close'),
      perspective: enumOf<SceneCameraPerspective>(camera.perspective, cameraPerspectives, 'mild'),
      horizonY: cameraHorizon,
    },
    ground: {
      visible: typeof ground.visible === 'boolean' ? ground.visible : true,
      horizonY: clamp(ground.horizonY, 0, 1, cameraHorizon),
      slope: enumOf<SceneGroundSlope>(ground.slope, groundSlopes, 'flat'),
    },
    environment: {
      backgroundColor: colorOf(environment.backgroundColor),
      backgroundBrightness: clamp(environment.backgroundBrightness, 0, 1, 0.8),
    },
    lighting: {
      keyDirection: enumOf<SceneKeyDirection>(lighting.keyDirection, keyDirections, 'top-left'),
      softness: clamp(lighting.softness, 0, 1, 0.72),
      contrast: clamp(lighting.contrast, 0, 1, 0.35),
      fillStrength: clamp(lighting.fillStrength, 0, 1, 0.42),
    },
    subject: {
      shapeHint: enumOf<SceneSubjectShapeHint>(subject.shapeHint, subjectShapeHints, 'rounded-box'),
      aspect: aspectOf(subject.aspect),
    },
    secondaryObjects: (Array.isArray(root.secondaryObjects) ? root.secondaryObjects : [])
      .slice(0, THREE_SCENE_MAX_SECONDARY_OBJECTS)
      .map(normalizeSecondary)
      .filter((item): item is SceneAnalysisSecondaryObject => !!item),
  };
  return sceneAnalysisV1Schema.parse(normalized);
};

const extractFirstJsonObject = (text: string) => {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
    } else if (character === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0 && start >= 0) return text.slice(start, index + 1);
    }
  }
  return '';
};

export class SceneAnalysisResponseError extends Error {
  constructor(
    message = '模型没有返回可用的图片构图分析',
    public readonly details = message,
  ) {
    super(message);
    this.name = 'SceneAnalysisResponseError';
  }
}

export const parseSceneAnalysisResponse = (value: unknown): SceneAnalysisV1 => {
  try {
    let parsed: unknown = value;
    if (!parsed || typeof parsed !== 'object') {
      const text = String(value || '').trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```$/i, '');
      try {
        parsed = JSON.parse(text);
      } catch {
        const extracted = extractFirstJsonObject(text);
        if (!extracted) throw new Error('missing JSON object');
        parsed = JSON.parse(extracted);
      }
    }
    const root = recordOf(parsed);
    const hasSemanticContent = ['composition', 'camera', 'ground', 'environment', 'lighting', 'subject']
      .some(key => Object.keys(recordOf(root[key])).length > 0);
    if (!hasSemanticContent) throw new Error('empty scene analysis');
    return normalizeSceneAnalysis(root);
  } catch (error) {
    console.error('SceneAnalysis response parse failed:', error);
    const details = error instanceof z.ZodError
      ? error.issues.map(issue => `${issue.path.join('.') || 'root'}: ${issue.message}`).join('\n')
      : String(error instanceof Error ? error.message : error || 'unknown parse error');
    throw new SceneAnalysisResponseError('模型没有返回可用的图片构图分析', details);
  }
};
