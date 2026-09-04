import { RoundedBox } from '@react-three/drei';
import { DoubleSide } from 'three';
import type { ThreeSceneObject } from '../model/threeSceneTypes';

const Material = ({ object }: { object: ThreeSceneObject }) => (
  <meshStandardMaterial
    color={object.material.color}
    roughness={object.material.roughness}
    metalness={object.material.metalness}
    opacity={object.material.opacity}
    transparent={object.material.opacity < 1}
    side={object.primitive === 'plane' ? DoubleSide : undefined}
  />
);

export function ThreePrimitive({ object }: { object: ThreeSceneObject }) {
  const common = {
    position: object.position,
    rotation: object.rotation,
    scale: object.scale,
    castShadow: object.primitive !== 'plane',
    receiveShadow: true,
    name: object.label || object.id,
  } as const;

  if (object.primitive === 'rounded_box') {
    return (
      <RoundedBox {...common} args={[1, 1, 1]} radius={0.16} smoothness={2}>
        <Material object={object} />
      </RoundedBox>
    );
  }
  return (
    <mesh {...common}>
      {object.primitive === 'sphere' ? <sphereGeometry args={[0.5, 28, 18]} />
        : object.primitive === 'cylinder' ? <cylinderGeometry args={[0.5, 0.5, 1, 28]} />
          : object.primitive === 'capsule' ? <capsuleGeometry args={[0.28, 0.44, 6, 16]} />
            : object.primitive === 'cone' ? <coneGeometry args={[0.5, 1, 28]} />
              : object.primitive === 'torus' ? (
                <torusGeometry args={[
                  0.5,
                  object.thickness ?? 0.14,
                  12,
                  40,
                  object.arc ?? Math.PI * 2,
                ]} />
              )
          : object.primitive === 'plane' ? <planeGeometry args={[1, 1]} />
            : <boxGeometry args={[1, 1, 1]} />}
      <Material object={object} />
    </mesh>
  );
}
