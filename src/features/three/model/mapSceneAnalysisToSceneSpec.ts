import { sceneSpecV1Schema } from './threeSceneSchema';
import { normalizeThreeSceneSpec } from './normalizeThreeSceneSpec';
import type {
  SceneAnalysisSecondaryObject,
  SceneAnalysisV1,
  SceneKeyDirection,
  SceneSubjectOrientation,
} from './threeSceneAnalysisTypes';
import type { SceneSpecV1, ThreeSceneObject, ThreeVector3 } from './threeSceneTypes';

const DEG_TO_RAD = Math.PI / 180;
const VIEWPORT_ASPECT = 4 / 3;
const BASE_SUBJECT_HEIGHT = 1;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 4) => Number(value.toFixed(digits));
const vector = (values: number[]): ThreeVector3 => values.map(value => round(value)) as ThreeVector3;

const fovForPerspective = (perspective: SceneAnalysisV1['camera']['perspective']) => ({
  flat: 28,
  mild: 35,
  moderate: 44,
  strong: 56,
}[perspective]);

const distanceForShot = (shot: SceneAnalysisV1['camera']['shot']) => ({
  close: 2.7,
  'medium-close': 3.45,
  medium: 4.35,
  wide: 5.8,
}[shot]);

const orientationYaw = (orientation: SceneSubjectOrientation) => ({
  front: 0,
  'front-left': -0.28,
  'front-right': 0.28,
  'side-left': -Math.PI / 2,
  'side-right': Math.PI / 2,
  rear: Math.PI,
  unknown: 0,
}[orientation]);

const keyLightOffset = (direction: SceneKeyDirection): ThreeVector3 => ({
  front: [0, 3.8, 5],
  'front-left': [-4.2, 3.8, 4.6],
  'front-right': [4.2, 3.8, 4.6],
  left: [-5, 3.2, 1.5],
  right: [5, 3.2, 1.5],
  top: [0, 6, 1.2],
  'top-left': [-4, 5.5, 3.2],
  'top-right': [4, 5.5, 3.2],
  'rear-left': [-4.2, 4, -4.5],
  'rear-right': [4.2, 4, -4.5],
}[direction] as ThreeVector3);

const adjustHexBrightness = (color: string, brightness: number) => {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return '#d8d8d8';
  const amount = clamp(brightness, 0, 1) / 0.8;
  const channels = [0, 2, 4].map(offset => (
    clamp(Math.round(Number.parseInt(match[1].slice(offset, offset + 2), 16) * amount), 0, 255)
  ));
  return `#${channels.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
};

const createSubjectObject = (analysis: SceneAnalysisV1) => {
  const [rawWidth, rawHeight, rawDepth] = analysis.subject.aspect;
  const safeHeight = Math.max(0.1, rawHeight);
  let width = clamp(rawWidth / safeHeight, 0.28, 3.2) * BASE_SUBJECT_HEIGHT;
  let height = BASE_SUBJECT_HEIGHT;
  let depth = clamp(rawDepth / safeHeight, 0.18, 2.6) * BASE_SUBJECT_HEIGHT;
  let primitive: ThreeSceneObject['primitive'] = 'rounded_box';

  switch (analysis.subject.shapeHint) {
    case 'box':
      primitive = 'box';
      break;
    case 'flat':
      primitive = 'box';
      depth = Math.min(depth, 0.12);
      break;
    case 'tall':
      primitive = 'box';
      height = Math.max(1, width * 1.35);
      break;
    case 'cylindrical':
      primitive = 'cylinder';
      break;
    case 'spherical': {
      primitive = 'sphere';
      const diameter = clamp((width + height + depth) / 3, 0.65, 1.5);
      width = diameter;
      height = diameter;
      depth = diameter;
      break;
    }
    case 'organic':
    case 'rounded-box':
    default:
      primitive = 'rounded_box';
      break;
  }

  const horizontalOffset = (analysis.composition.subjectCenter[0] - 0.5) * 2.25;
  const verticalOffset = (0.5 - analysis.composition.subjectCenter[1]) * 1.35;
  const elevationOffset = analysis.composition.subjectElevation === 'high'
    ? 0.18
    : analysis.composition.subjectElevation === 'low' ? -0.12 : 0;
  const groundedY = height / 2;
  const positionY = analysis.ground.visible
    ? Math.max(groundedY, groundedY + verticalOffset + elevationOffset)
    : verticalOffset + elevationOffset;

  return {
    id: 'subject-proxy',
    label: '主体构图体块',
    primitive,
    position: vector([horizontalOffset, positionY, 0]),
    rotation: vector([0, orientationYaw(analysis.composition.subjectOrientation), 0]),
    scale: vector([width, height, depth]),
    material: {
      color: '#8f949b',
      roughness: 0.62,
      metalness: 0.04,
      opacity: 0.9,
    },
  } satisfies ThreeSceneObject;
};

const createSecondaryObject = (
  item: SceneAnalysisSecondaryObject,
  index: number,
  analysis: SceneAnalysisV1,
): ThreeSceneObject => {
  const width = clamp(item.width * 3.2, 0.12, 2.4);
  const height = clamp(item.height * 2.5, 0.1, 2.1);
  const depth = item.shapeHint === 'flat' ? 0.06 : clamp(Math.min(width, height) * 0.65, 0.1, 1.1);
  const x = (item.center[0] - 0.5) * 3.5;
  const screenY = (0.5 - item.center[1]) * 2.2;
  const y = analysis.ground.visible ? Math.max(height / 2, height / 2 + screenY) : screenY;
  const z = item.depthOrder === 'front' ? 0.72 : item.depthOrder === 'behind' ? -0.72 : 0;
  return {
    id: `secondary-${index + 1}`,
    label: item.role,
    primitive: item.shapeHint === 'cylindrical' ? 'cylinder' : item.shapeHint === 'flat' ? 'plane' : 'box',
    position: vector([x, y, z]),
    rotation: item.shapeHint === 'flat' ? vector([-Math.PI / 2, 0, 0]) : [0, 0, 0],
    scale: vector([width, height, depth]),
    material: {
      color: '#a3a7ac',
      roughness: 0.72,
      metalness: 0.02,
      opacity: 0.82,
    },
  };
};

const objectHalfExtents = (object: ThreeSceneObject) => ({
  x: object.scale[0] / 2,
  y: object.scale[1] / 2,
  z: object.scale[2] / 2,
});

/** Adjusts distance and clipping planes without changing the analyzed view direction. */
export const fitCameraToSubject = (sceneSpec: SceneSpecV1): SceneSpecV1 => {
  const { target, position, fov } = sceneSpec.camera;
  const radians = fov * DEG_TO_RAD;
  let requiredHalfHeight = 0.5;
  let maxRadius = 0.5;
  sceneSpec.objects.forEach((object) => {
    const half = objectHalfExtents(object);
    requiredHalfHeight = Math.max(
      requiredHalfHeight,
      Math.abs(object.position[1] - target[1]) + half.y,
      (Math.abs(object.position[0] - target[0]) + half.x) / VIEWPORT_ASPECT,
    );
    maxRadius = Math.max(
      maxRadius,
      Math.hypot(half.x, half.y, half.z) + Math.hypot(
        object.position[0] - target[0],
        object.position[1] - target[1],
        object.position[2] - target[2],
      ),
    );
  });
  const currentOffset = [
    position[0] - target[0],
    position[1] - target[1],
    position[2] - target[2],
  ];
  const currentDistance = Math.max(0.1, Math.hypot(...currentOffset));
  const fitDistance = requiredHalfHeight / Math.tan(radians / 2) * 1.14;
  const distance = clamp(Math.max(currentDistance, fitDistance), 2.2, 30);
  const direction = currentOffset.map(value => value / currentDistance);
  const fittedPosition = vector([
    target[0] + direction[0] * distance,
    target[1] + direction[1] * distance,
    target[2] + direction[2] * distance,
  ]);
  const near = clamp(distance - maxRadius * 2.1, 0.02, Math.max(0.02, distance * 0.7));
  const far = clamp(Math.max(distance + maxRadius * 4.5, near + 10), 12, 160);
  return {
    ...sceneSpec,
    camera: {
      ...sceneSpec.camera,
      position: fittedPosition,
      near: round(near),
      far: round(far),
    },
  };
};

export const mapSceneAnalysisToSceneSpec = (analysis: SceneAnalysisV1): SceneSpecV1 => {
  const subject = createSubjectObject(analysis);
  const objects = [
    subject,
    ...analysis.secondaryObjects.slice(0, 4).map((item, index) => createSecondaryObject(item, index, analysis)),
  ];
  const fov = clamp(fovForPerspective(analysis.camera.perspective), 25, 60);
  const slopeAdjustment = analysis.ground.slope === 'slight-up' ? 4 : analysis.ground.slope === 'slight-down' ? -4 : 0;
  const horizonAdjustment = (0.62 - analysis.camera.horizonY) * 22;
  const elevation = clamp(analysis.camera.elevationDeg + slopeAdjustment + horizonAdjustment, -65, 70) * DEG_TO_RAD;
  const azimuth = clamp(analysis.camera.azimuthDeg, -180, 180) * DEG_TO_RAD;
  const occupancy = clamp(Math.max(analysis.composition.subjectWidth, analysis.composition.subjectHeight), 0.12, 0.9);
  const occupancyFactor = clamp(Math.pow(0.52 / occupancy, 0.45), 0.72, 1.55);
  const baseDistance = distanceForShot(analysis.camera.shot) * occupancyFactor;
  const target: ThreeVector3 = vector([
    0,
    Math.max(0.15, subject.scale[1] * 0.52 + (analysis.composition.subjectCenter[1] - 0.5) * 0.55),
    0,
  ]);
  const horizontalDistance = baseDistance * Math.cos(elevation);
  const cameraPosition = vector([
    target[0] + horizontalDistance * Math.sin(azimuth),
    Math.max(0.12, target[1] + baseDistance * Math.sin(elevation)),
    target[2] + horizontalDistance * Math.cos(azimuth),
  ]);
  const keyOffset = keyLightOffset(analysis.lighting.keyDirection);
  const softness = analysis.lighting.softness;
  const contrast = analysis.lighting.contrast;
  const fillStrength = analysis.lighting.fillStrength;
  const keyIntensity = round(2.2 + contrast * 2.8);
  const ambientIntensity = round(0.22 + fillStrength * (0.72 - contrast * 0.28));
  const fillIntensity = round(0.25 + fillStrength * (1.45 - contrast * 0.72));
  const background = adjustHexBrightness(
    analysis.environment.backgroundColor,
    analysis.environment.backgroundBrightness,
  );

  const mapped: SceneSpecV1 = {
    version: 1,
    camera: {
      position: cameraPosition,
      target,
      fov,
      near: 0.05,
      far: 80,
    },
    environment: {
      background,
      ground: {
        enabled: analysis.ground.visible,
        color: adjustHexBrightness(background, Math.max(0.1, analysis.environment.backgroundBrightness - 0.08)),
        size: 18,
        roughness: round(0.68 + softness * 0.22),
      },
    },
    objects,
    lights: [
      {
        id: 'ambient-fill',
        type: 'ambient',
        color: '#ffffff',
        intensity: ambientIntensity,
      },
      {
        id: 'key-area',
        type: 'area',
        position: vector([
          target[0] + keyOffset[0],
          target[1] + keyOffset[1],
          target[2] + keyOffset[2],
        ]),
        target,
        color: '#ffffff',
        intensity: keyIntensity,
        width: round(2.4 + softness * 5.6),
        height: round(2.4 + softness * 5.6),
      },
      {
        id: 'opposite-fill',
        type: 'point',
        position: vector([
          target[0] - keyOffset[0] * 0.62,
          target[1] + Math.max(1.2, keyOffset[1] * 0.55),
          target[2] - keyOffset[2] * 0.35,
        ]),
        color: '#ffffff',
        intensity: fillIntensity,
      },
    ],
  };

  const normalized = normalizeThreeSceneSpec(fitCameraToSubject(mapped));
  return sceneSpecV1Schema.parse(normalized);
};
