import { normalizeThreeSceneSpec } from './normalizeThreeSceneSpec';
import type { SceneSpecV1, ThreeSceneCameraState, ThreeVector3 } from './threeSceneTypes';

export const updateThreeSceneCamera = (
  sceneSpec: SceneSpecV1,
  camera: Partial<ThreeSceneCameraState>,
) => normalizeThreeSceneSpec({
  ...sceneSpec,
  camera: { ...sceneSpec.camera, ...camera },
});

export const updateThreeSceneEnvironment = (
  sceneSpec: SceneSpecV1,
  patch: { background?: string; groundEnabled?: boolean },
) => normalizeThreeSceneSpec({
  ...sceneSpec,
  environment: {
    ...sceneSpec.environment,
    ...(patch.background === undefined ? {} : { background: patch.background }),
    ground: {
      ...sceneSpec.environment.ground,
      ...(patch.groundEnabled === undefined ? {} : { enabled: patch.groundEnabled }),
    },
  },
});

export const updateThreeSceneMainLight = (
  sceneSpec: SceneSpecV1,
  patch: { intensity?: number; position?: ThreeVector3 },
) => {
  const mainIndex = sceneSpec.lights.findIndex(light => light.type !== 'ambient');
  if (mainIndex < 0) return sceneSpec;
  return normalizeThreeSceneSpec({
    ...sceneSpec,
    lights: sceneSpec.lights.map((light, index) => (
      index === mainIndex ? { ...light, ...patch } : light
    )),
  });
};
