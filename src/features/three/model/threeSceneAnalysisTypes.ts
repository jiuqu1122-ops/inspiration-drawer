export type SceneSubjectOrientation =
  | 'front'
  | 'front-left'
  | 'front-right'
  | 'side-left'
  | 'side-right'
  | 'rear'
  | 'unknown';

export type SceneSubjectElevation = 'low' | 'center' | 'high';
export type SceneCameraShot = 'close' | 'medium-close' | 'medium' | 'wide';
export type SceneCameraPerspective = 'flat' | 'mild' | 'moderate' | 'strong';
export type SceneGroundSlope = 'flat' | 'slight-up' | 'slight-down';
export type SceneKeyDirection =
  | 'front'
  | 'front-left'
  | 'front-right'
  | 'left'
  | 'right'
  | 'top'
  | 'top-left'
  | 'top-right'
  | 'rear-left'
  | 'rear-right';
export type SceneSubjectShapeHint =
  | 'box'
  | 'rounded-box'
  | 'flat'
  | 'tall'
  | 'cylindrical'
  | 'spherical'
  | 'organic';
export type SceneSecondaryDepthOrder = 'front' | 'same' | 'behind';
export type SceneSecondaryShapeHint = 'box' | 'flat' | 'cylindrical';

export type SceneAnalysisSecondaryObject = {
  role: string;
  center: [number, number];
  width: number;
  height: number;
  depthOrder: SceneSecondaryDepthOrder;
  shapeHint: SceneSecondaryShapeHint;
};

/**
 * Semantic, image-space analysis produced by Vision AI.
 * All screen-space values are normalized to 0..1. It intentionally contains no
 * Three.js positions, rotations, scales, camera vectors, or light intensities.
 */
export type SceneAnalysisV1 = {
  version: 1;
  composition: {
    subjectCenter: [number, number];
    subjectWidth: number;
    subjectHeight: number;
    subjectOrientation: SceneSubjectOrientation;
    subjectElevation: SceneSubjectElevation;
  };
  camera: {
    azimuthDeg: number;
    elevationDeg: number;
    shot: SceneCameraShot;
    perspective: SceneCameraPerspective;
    horizonY: number;
  };
  ground: {
    visible: boolean;
    horizonY: number;
    slope: SceneGroundSlope;
  };
  environment: {
    backgroundColor: string;
    backgroundBrightness: number;
  };
  lighting: {
    keyDirection: SceneKeyDirection;
    softness: number;
    contrast: number;
    fillStrength: number;
  };
  subject: {
    shapeHint: SceneSubjectShapeHint;
    aspect: [number, number, number];
  };
  secondaryObjects: SceneAnalysisSecondaryObject[];
};
