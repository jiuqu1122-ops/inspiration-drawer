import { Canvas } from '@react-three/fiber';
import type { SceneSpecV1, ThreeSceneCameraState } from '../model/threeSceneTypes';
import { ThreeSceneRenderer, type ThreeSceneViewportApi } from './ThreeSceneRenderer';

export default function ThreeSceneViewport(props: {
  sceneSpec: SceneSpecV1;
  onReady: (api: ThreeSceneViewportApi) => void;
  onInteractionStart: () => void;
  onCameraCommit: (camera: ThreeSceneCameraState) => void;
}) {
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 1.5]}
      shadows
      camera={{
        position: props.sceneSpec.camera.position,
        fov: props.sceneSpec.camera.fov,
        near: props.sceneSpec.camera.near,
        far: props.sceneSpec.camera.far,
      }}
      gl={{ antialias: true, preserveDrawingBuffer: true, powerPreference: 'high-performance' }}
      performance={{ min: 0.6 }}
      onPointerDown={event => event.stopPropagation()}
      onPointerUp={event => event.stopPropagation()}
      onPointerMove={event => event.stopPropagation()}
      onWheel={event => event.stopPropagation()}
    >
      <ThreeSceneRenderer {...props} />
    </Canvas>
  );
}
