import { useEffect, useRef } from 'react';
import { OrbitControls } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { SceneSpecV1, ThreeSceneCameraState } from '../model/threeSceneTypes';
import { ThreeLights } from './ThreeLights';
import { ThreePrimitive } from './ThreePrimitive';
import { readThreeCameraState, resetThreeCamera } from './threeCamera';
import { captureThreeSceneCanvas } from './captureThreeSceneCanvas';

export type ThreeSceneViewportApi = {
  capture: () => string;
  resetCamera: (state?: ThreeSceneCameraState) => void;
};

export function ThreeSceneRenderer({
  sceneSpec,
  onReady,
  onInteractionStart,
  onCameraCommit,
}: {
  sceneSpec: SceneSpecV1;
  onReady: (api: ThreeSceneViewportApi) => void;
  onInteractionStart: () => void;
  onCameraCommit: (camera: ThreeSceneCameraState) => void;
}) {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { camera, gl, invalidate, scene } = useThree();

  useEffect(() => {
    resetThreeCamera(camera, controlsRef.current, sceneSpec.camera);
    invalidate();
  }, [camera, invalidate, sceneSpec.camera]);

  useEffect(() => {
    onReady({
      capture: () => {
        invalidate();
        gl.render(scene, camera);
        return captureThreeSceneCanvas(gl.domElement);
      },
      resetCamera: (state) => {
        resetThreeCamera(camera, controlsRef.current, state || sceneSpec.camera);
        invalidate();
      },
    });
  }, [camera, gl, invalidate, onReady, scene, sceneSpec.camera]);

  useEffect(() => { invalidate(); }, [invalidate, sceneSpec]);

  return (
    <>
      <color attach="background" args={[sceneSpec.environment.background]} />
      <ThreeLights lights={sceneSpec.lights} />
      {sceneSpec.environment.ground.enabled && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
          receiveShadow
        >
          <planeGeometry args={[sceneSpec.environment.ground.size, sceneSpec.environment.ground.size]} />
          <meshStandardMaterial
            color={sceneSpec.environment.ground.color}
            roughness={sceneSpec.environment.ground.roughness}
            metalness={0}
          />
        </mesh>
      )}
      {sceneSpec.objects.map(object => <ThreePrimitive key={object.id} object={object} />)}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping={false}
        rotateSpeed={0.78}
        zoomSpeed={0.82}
        panSpeed={0.72}
        onStart={onInteractionStart}
        onChange={() => invalidate()}
        onEnd={() => {
          if (!controlsRef.current) return;
          onCameraCommit(readThreeCameraState(camera, controlsRef.current.target));
        }}
      />
    </>
  );
}
