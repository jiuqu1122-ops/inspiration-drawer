import { useEffect, useRef } from 'react';
import type { DirectionalLight, RectAreaLight } from 'three';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import type { ThreeSceneLight } from '../model/threeSceneTypes';

RectAreaLightUniformsLib.init();

function Directional({ light }: { light: ThreeSceneLight }) {
  const ref = useRef<DirectionalLight>(null);
  useEffect(() => {
    if (!ref.current || !light.target) return;
    ref.current.target.position.set(...light.target);
    ref.current.target.updateMatrixWorld();
  }, [light.target]);
  return (
    <directionalLight
      ref={ref}
      position={light.position || [4, 6, 4]}
      color={light.color}
      intensity={light.intensity}
      castShadow
      shadow-mapSize-width={512}
      shadow-mapSize-height={512}
    />
  );
}

function Area({ light }: { light: ThreeSceneLight }) {
  const ref = useRef<RectAreaLight>(null);
  useEffect(() => {
    if (!ref.current) return;
    ref.current.lookAt(...(light.target || [0, 0.7, 0]));
  }, [light.target]);
  return (
    <rectAreaLight
      ref={ref}
      position={light.position || [4, 6, 4]}
      color={light.color}
      intensity={light.intensity}
      width={light.width || 4}
      height={light.height || 4}
    />
  );
}

export function ThreeLights({ lights }: { lights: ThreeSceneLight[] }) {
  return lights.map(light => {
    if (light.type === 'ambient') {
      return <ambientLight key={light.id} color={light.color} intensity={light.intensity} />;
    }
    if (light.type === 'directional') return <Directional key={light.id} light={light} />;
    if (light.type === 'area') return <Area key={light.id} light={light} />;
    return (
      <pointLight
        key={light.id}
        position={light.position || [4, 5, 4]}
        color={light.color}
        intensity={light.intensity}
        castShadow
      />
    );
  });
}
