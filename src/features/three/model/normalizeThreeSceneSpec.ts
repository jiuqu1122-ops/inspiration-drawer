import { sceneSpecV1Schema, THREE_SCENE_MAX_LIGHTS, THREE_SCENE_MAX_OBJECTS } from './threeSceneSchema';
import type {
  SceneSpecV1,
  ThreeSceneLight,
  ThreeSceneObject,
  ThreeScenePrimitiveType,
  ThreeVector3,
} from './threeSceneTypes';

const DEFAULT_CAMERA_POSITION: ThreeVector3 = [4, 3, 5];
const DEFAULT_CAMERA_TARGET: ThreeVector3 = [0, 0.7, 0];
const PRIMITIVES = new Set<ThreeScenePrimitiveType>([
  'box', 'rounded_box', 'sphere', 'cylinder', 'plane', 'capsule', 'cone', 'torus',
]);
const PRIMITIVE_ALIASES: Record<string, ThreeScenePrimitiveType> = {
  cube: 'box',
  roundedbox: 'rounded_box',
  'rounded-box': 'rounded_box',
  ellipsoid: 'sphere',
  oval: 'sphere',
  disc: 'cylinder',
  disk: 'cylinder',
  ring: 'torus',
};
const LIGHT_TYPES = new Set<ThreeSceneLight['type']>(['ambient', 'directional', 'point', 'area']);
const CSS_COLOR_NAMES = new Set([
  'black', 'white', 'gray', 'grey', 'red', 'green', 'blue', 'yellow', 'orange', 'purple',
  'pink', 'cyan', 'magenta', 'navy', 'teal', 'silver', 'maroon', 'olive',
]);

const recordOf = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const finite = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => (
  Math.min(max, Math.max(min, finite(value, fallback)))
);

const vector = (
  value: unknown,
  fallback: ThreeVector3,
  min = -20,
  max = 20,
): ThreeVector3 => {
  const input = Array.isArray(value) ? value : [];
  return [0, 1, 2].map(index => clamp(input[index], min, max, fallback[index])) as ThreeVector3;
};

const ensureUniqueIds = <T extends { id: string }>(items: T[]) => {
  const seen = new Set<string>();
  return items.map((item, index) => {
    const base = item.id || `item-${index + 1}`;
    let id = base;
    let suffix = 2;
    while (seen.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    seen.add(id);
    return id === item.id ? item : { ...item, id };
  });
};

export const normalizeThreeSceneColor = (value: unknown, fallback: string) => {
  const color = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) return color;
  if (/^(?:rgb|hsl)a?\(\s*[\d.%+\-,\s]+\)$/i.test(color)) return color;
  return CSS_COLOR_NAMES.has(color) ? color : fallback;
};

const defaultObject = (): ThreeSceneObject => ({
  id: 'subject',
  label: '主体',
  primitive: 'rounded_box',
  position: [0, 0.75, 0],
  rotation: [0, 0, 0],
  scale: [2.2, 1.5, 1.6],
  material: {
    color: '#8b9199',
    roughness: 0.55,
    metalness: 0.08,
    opacity: 1,
  },
});

const normalizePrimitive = (value: unknown): ThreeScenePrimitiveType | null => {
  if (typeof value !== 'string') return null;
  const key = value.trim().toLowerCase();
  if (PRIMITIVES.has(key as ThreeScenePrimitiveType)) return key as ThreeScenePrimitiveType;
  return PRIMITIVE_ALIASES[key] || null;
};

const normalizeObject = (value: unknown, index: number): ThreeSceneObject | null => {
  const raw = recordOf(value);
  const primitive = normalizePrimitive(raw.primitive);
  if (!primitive) return null;
  const material = recordOf(raw.material);
  const label = typeof raw.label === 'string' ? raw.label.trim().slice(0, 120) : '';
  return {
    id: String(raw.id || `object-${index + 1}`).trim().slice(0, 80) || `object-${index + 1}`,
    ...(label ? { label } : {}),
    primitive,
    position: vector(raw.position, [0, 0.5, 0]),
    rotation: vector(raw.rotation, [0, 0, 0], -Math.PI * 2, Math.PI * 2),
    scale: vector(raw.scale, [1, 1, 1], 0.05, 20),
    ...(primitive === 'torus' ? {
      arc: clamp(raw.arc, 0.2, Math.PI * 2, Math.PI * 2),
      thickness: clamp(raw.thickness, 0.04, 0.45, 0.14),
    } : {}),
    material: {
      color: normalizeThreeSceneColor(material.color, '#8b9199'),
      roughness: clamp(material.roughness, 0, 1, 0.55),
      metalness: clamp(material.metalness, 0, 1, 0.08),
      opacity: clamp(material.opacity, 0, 1, 1),
    },
  };
};

const normalizeLight = (value: unknown, index: number): ThreeSceneLight | null => {
  const raw = recordOf(value);
  const type = typeof raw.type === 'string' && LIGHT_TYPES.has(raw.type as ThreeSceneLight['type'])
    ? raw.type as ThreeSceneLight['type']
    : null;
  if (!type) return null;
  return {
    id: String(raw.id || `light-${index + 1}`).trim().slice(0, 80) || `light-${index + 1}`,
    type,
    ...(type === 'ambient' ? {} : { position: vector(raw.position, [4, 6, 4]) }),
    ...(type === 'directional' || type === 'area' ? { target: vector(raw.target, [0, 0.7, 0]) } : {}),
    color: normalizeThreeSceneColor(raw.color, '#ffffff'),
    intensity: clamp(raw.intensity, 0, 20, type === 'ambient' ? 0.45 : 2.4),
    ...(type === 'area' ? {
      width: clamp(raw.width, 0.1, 50, 4),
      height: clamp(raw.height, 0.1, 50, 4),
    } : {}),
  };
};

export const createDefaultThreeSceneSpec = (): SceneSpecV1 => ({
  version: 1,
  camera: {
    position: [...DEFAULT_CAMERA_POSITION],
    target: [...DEFAULT_CAMERA_TARGET],
    fov: 40,
    near: 0.05,
    far: 80,
  },
  environment: {
    background: '#d9d9d9',
    ground: {
      enabled: true,
      color: '#d2d2d0',
      size: 20,
      roughness: 0.82,
    },
  },
  objects: [defaultObject()],
  lights: [
    { id: 'ambient', type: 'ambient', color: '#ffffff', intensity: 0.42 },
    {
      id: 'main',
      type: 'directional',
      position: [4, 7, 5],
      target: [0, 0.7, 0],
      color: '#ffffff',
      intensity: 2.4,
    },
  ],
});

export const normalizeThreeSceneSpec = (value: unknown): SceneSpecV1 => {
  const fallback = createDefaultThreeSceneSpec();
  const raw = recordOf(value);
  const camera = recordOf(raw.camera);
  const environment = recordOf(raw.environment);
  const ground = recordOf(environment.ground);
  const objects = ensureUniqueIds((Array.isArray(raw.objects) ? raw.objects : [])
    .slice(0, THREE_SCENE_MAX_OBJECTS)
    .map(normalizeObject)
    .filter((item): item is ThreeSceneObject => Boolean(item)));
  const lights = ensureUniqueIds((Array.isArray(raw.lights) ? raw.lights : [])
    .slice(0, THREE_SCENE_MAX_LIGHTS)
    .map(normalizeLight)
    .filter((item): item is ThreeSceneLight => Boolean(item)));
  if (!lights.some(light => light.type === 'ambient')) {
    const ambientId = lights.some(light => light.id === 'ambient') ? 'ambient-fill' : 'ambient';
    lights.unshift({ id: ambientId, type: 'ambient', color: '#ffffff', intensity: 0.35 });
  }
  const near = clamp(camera.near, 0.001, 10, fallback.camera.near);
  const far = Math.max(near + 1, clamp(camera.far, 1, 500, fallback.camera.far));
  const normalized: SceneSpecV1 = {
    version: 1,
    camera: {
      position: vector(camera.position, fallback.camera.position),
      target: vector(camera.target, fallback.camera.target),
      fov: clamp(camera.fov, 15, 100, fallback.camera.fov),
      near,
      far,
    },
    environment: {
      background: normalizeThreeSceneColor(environment.background, fallback.environment.background),
      ground: {
        enabled: typeof ground.enabled === 'boolean' ? ground.enabled : fallback.environment.ground.enabled,
        color: normalizeThreeSceneColor(ground.color, fallback.environment.ground.color),
        size: clamp(ground.size, 1, 100, fallback.environment.ground.size),
        roughness: clamp(ground.roughness, 0, 1, fallback.environment.ground.roughness),
      },
    },
    objects: objects.length > 0 ? objects : [defaultObject()],
    lights: lights.length > 0 ? lights.slice(0, THREE_SCENE_MAX_LIGHTS) : fallback.lights,
  };
  return sceneSpecV1Schema.parse(normalized);
};

export class ThreeSceneSpecError extends Error {
  constructor(message = '3D 场景生成失败，请重试。') {
    super(message);
    this.name = 'ThreeSceneSpecError';
  }
}

const hasRenderableSourceObject = (value: unknown) => {
  const raw = recordOf(value);
  if (!Array.isArray(raw.objects) || raw.objects.length === 0) return false;
  return raw.objects.some((item) => {
    const object = recordOf(item);
    return normalizePrimitive(object.primitive) !== null;
  });
};

const isDefaultPlaceholderScene = (sceneSpec: SceneSpecV1) => {
  if (sceneSpec.objects.length !== 1) return false;
  const [object] = sceneSpec.objects;
  const genericName = `${object.id} ${object.label || ''}`.trim().toLowerCase();
  return object.primitive === 'rounded_box'
    && (genericName === 'subject' || genericName === 'subject 主体' || genericName === '主体')
    && object.position.every((value, index) => Math.abs(value - [0, 0.75, 0][index]) < 0.0001)
    && object.scale.every((value, index) => Math.abs(value - [2.2, 1.5, 1.6][index]) < 0.0001)
    && object.material.color.toLowerCase() === '#8b9199';
};

const isUnderDetailedBlockScene = (sceneSpec: SceneSpecV1) => (
  sceneSpec.objects.length === 1
  && (sceneSpec.objects[0].primitive === 'box' || sceneSpec.objects[0].primitive === 'rounded_box')
);

export const parseThreeSceneSpecJson = (value: unknown): SceneSpecV1 => {
  try {
    let parsed: unknown = value;
    if (!parsed || typeof parsed !== 'object') {
      const text = String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start < 0 || end <= start) throw new Error('missing JSON object');
      parsed = JSON.parse(text.slice(start, end + 1));
    }
    // The normalizer deliberately has a safe placeholder for persisted/partial canvas data.
    // AI responses must not be allowed to turn an empty or unsupported object list into that
    // placeholder and then masquerade as a successful image analysis.
    if (!hasRenderableSourceObject(parsed)) throw new Error('missing renderable scene objects');
    const normalized = normalizeThreeSceneSpec(parsed);
    if (isDefaultPlaceholderScene(normalized) || isUnderDetailedBlockScene(normalized)) {
      throw new Error('under-detailed block scene');
    }
    return normalized;
  } catch (error) {
    console.error('Three SceneSpec validation failed:', error);
    throw new ThreeSceneSpecError();
  }
};
