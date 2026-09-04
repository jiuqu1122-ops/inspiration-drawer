export type ThreeVector3 = [number, number, number];

export type ThreeScenePrimitiveType =
  | 'box'
  | 'rounded_box'
  | 'sphere'
  | 'cylinder'
  | 'plane'
  | 'capsule'
  | 'cone'
  | 'torus';

export type ThreeSceneCamera = {
  position: ThreeVector3;
  target: ThreeVector3;
  fov: number;
  near: number;
  far: number;
};

export type ThreeSceneMaterial = {
  color: string;
  roughness: number;
  metalness: number;
  opacity: number;
};

export type ThreeSceneObject = {
  id: string;
  label?: string;
  primitive: ThreeScenePrimitiveType;
  position: ThreeVector3;
  rotation: ThreeVector3;
  scale: ThreeVector3;
  /** Torus sweep in radians. Ignored by other primitives. */
  arc?: number;
  /** Torus tube radius relative to its base radius. Ignored by other primitives. */
  thickness?: number;
  material: ThreeSceneMaterial;
};

export type ThreeSceneLight = {
  id: string;
  type: 'ambient' | 'directional' | 'point' | 'area';
  position?: ThreeVector3;
  target?: ThreeVector3;
  color: string;
  intensity: number;
  width?: number;
  height?: number;
};

export type SceneSpecV1 = {
  version: 1;
  camera: ThreeSceneCamera;
  environment: {
    background: string;
    ground: {
      enabled: boolean;
      color: string;
      size: number;
      roughness: number;
    };
  };
  objects: ThreeSceneObject[];
  lights: ThreeSceneLight[];
};

export type CanvasThreeSceneData = {
  type: 'three-scene';
  sceneSpec: SceneSpecV1;
  /** Camera returned by the latest image analysis, used by “reset view”. */
  analysisCamera?: ThreeSceneCameraState;
  sourceImageId: string;
  /** Ordered canvas inputs used for multi-view analysis. `sourceImageId` remains for older projects. */
  sourceImageIds?: string[];
  sourceImagePath?: string;
  /** Fallback sources retained when the original canvas inputs are later removed. */
  sourceImagePaths?: string[];
  preview?: string;
  /** Semantic image-space analysis retained for development diagnostics and rematching. */
  sceneAnalysis?: import('./threeSceneAnalysisTypes').SceneAnalysisV1;
  referenceOverlay?: {
    visible: boolean;
    opacity: number;
    guides: boolean;
  };
  status?: 'idle' | 'working' | 'success' | 'error';
  error?: string;
  createdAt: number;
  updatedAt?: number;
};

export type ThreeSceneCameraState = Pick<ThreeSceneCamera, 'position' | 'target' | 'fov'>;
