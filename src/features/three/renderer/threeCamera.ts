import type { Camera, Vector3 } from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { ThreeSceneCameraState } from '../model/threeSceneTypes';

export const readThreeCameraState = (
  camera: Camera & { fov?: number },
  target: Vector3,
): ThreeSceneCameraState => ({
  position: [camera.position.x, camera.position.y, camera.position.z],
  target: [target.x, target.y, target.z],
  fov: typeof camera.fov === 'number' ? camera.fov : 40,
});

export const resetThreeCamera = (
  camera: Camera & { fov?: number; updateProjectionMatrix?: () => void },
  controls: OrbitControlsImpl | null,
  state: ThreeSceneCameraState,
) => {
  camera.position.set(...state.position);
  if (typeof camera.fov === 'number') camera.fov = state.fov;
  camera.updateProjectionMatrix?.();
  if (controls) {
    controls.target.set(...state.target);
    controls.update();
  } else {
    camera.lookAt(...state.target);
  }
};
