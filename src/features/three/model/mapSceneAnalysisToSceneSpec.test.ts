import { describe, expect, it } from 'vitest';
import { sceneSpecV1Schema } from './threeSceneSchema';
import { normalizeSceneAnalysis } from './threeSceneAnalysisSchema';
import { fitCameraToSubject, mapSceneAnalysisToSceneSpec } from './mapSceneAnalysisToSceneSpec';

const analysisFor = (patch: Record<string, unknown> = {}) => normalizeSceneAnalysis({
  version: 1,
  composition: {
    subjectCenter: [0.5, 0.5],
    subjectWidth: 0.5,
    subjectHeight: 0.4,
    subjectOrientation: 'front-right',
    subjectElevation: 'center',
  },
  camera: {
    azimuthDeg: 35,
    elevationDeg: 10,
    shot: 'medium-close',
    perspective: 'moderate',
    horizonY: 0.62,
  },
  ground: { visible: true, horizonY: 0.62, slope: 'flat' },
  environment: { backgroundColor: '#d8d8d8', backgroundBrightness: 0.8 },
  lighting: { keyDirection: 'top-left', softness: 0.8, contrast: 0.35, fillStrength: 0.4 },
  subject: { shapeHint: 'rounded-box', aspect: [1.8, 1, 1.2] },
  secondaryObjects: [],
  ...patch,
});

describe('mapSceneAnalysisToSceneSpec', () => {
  it('maps a positive front-right azimuth into the expected camera quadrant', () => {
    const scene = mapSceneAnalysisToSceneSpec(analysisFor());
    expect(scene.camera.position[0]).toBeGreaterThan(scene.camera.target[0]);
    expect(scene.camera.position[2]).toBeGreaterThan(scene.camera.target[2]);
    expect(scene.camera.fov).toBe(44);
  });

  it('uses a genuinely lower camera for negative elevation', () => {
    const scene = mapSceneAnalysisToSceneSpec(analysisFor({
      camera: { azimuthDeg: 0, elevationDeg: -20, shot: 'medium', perspective: 'mild', horizonY: 0.62 },
    }));
    expect(scene.camera.position[1]).toBeLessThan(scene.camera.target[1]);
  });

  it('maps flat perspective to a lower FOV than strong perspective', () => {
    const flat = mapSceneAnalysisToSceneSpec(analysisFor({
      camera: { azimuthDeg: 0, elevationDeg: 0, shot: 'medium', perspective: 'flat', horizonY: 0.62 },
    }));
    const strong = mapSceneAnalysisToSceneSpec(analysisFor({
      camera: { azimuthDeg: 0, elevationDeg: 0, shot: 'medium', perspective: 'strong', horizonY: 0.62 },
    }));
    expect(flat.camera.fov).toBe(28);
    expect(strong.camera.fov).toBe(56);
    expect(strong.camera.fov).toBeLessThanOrEqual(60);
  });

  it('does not let an AI-provided FOV directly control SceneSpec', () => {
    const scene = mapSceneAnalysisToSceneSpec(analysisFor({
      camera: {
        azimuthDeg: 0,
        elevationDeg: 0,
        shot: 'medium',
        perspective: 'flat',
        horizonY: 0.62,
        fov: 99,
      },
    }));
    expect(scene.camera.fov).toBe(28);
  });

  it('uses one stable subject proxy and no forced ground for floating product shots', () => {
    const scene = mapSceneAnalysisToSceneSpec(analysisFor({
      ground: { visible: false, horizonY: 0.62, slope: 'flat' },
      subject: { shapeHint: 'cylindrical', aspect: [0.7, 1.8, 0.7] },
    }));
    expect(scene.objects).toHaveLength(1);
    expect(scene.objects[0].primitive).toBe('cylinder');
    expect(scene.objects[0].scale[1]).toBeGreaterThanOrEqual(0.9);
    expect(scene.environment.ground.enabled).toBe(false);
  });

  it('always produces a schema-valid normalized SceneSpec with bounded units', () => {
    const scene = mapSceneAnalysisToSceneSpec(analysisFor({
      subject: { shapeHint: 'organic', aspect: [8, 0.1, 8] },
      secondaryObjects: Array.from({ length: 4 }, (_, index) => ({
        role: `support-${index}`,
        center: [index / 3, 0.8],
        width: 0.9,
        height: 0.9,
        depthOrder: index % 2 ? 'front' : 'behind',
      })),
    }));
    expect(() => sceneSpecV1Schema.parse(scene)).not.toThrow();
    expect(scene.objects).toHaveLength(5);
    expect(Math.max(...scene.objects.flatMap(object => object.scale))).toBeLessThanOrEqual(3.2);
    expect(scene.camera.near).toBeGreaterThan(0);
    expect(scene.camera.far).toBeGreaterThan(scene.camera.near);
  });

  it('fits the camera far enough to contain the proxy bounds', () => {
    const scene = mapSceneAnalysisToSceneSpec(analysisFor({
      composition: {
        subjectCenter: [0.95, 0.08],
        subjectWidth: 0.92,
        subjectHeight: 0.9,
        subjectOrientation: 'front',
        subjectElevation: 'high',
      },
      subject: { shapeHint: 'box', aspect: [3, 1, 1] },
    }));
    const fitted = fitCameraToSubject(scene);
    const distance = Math.hypot(
      fitted.camera.position[0] - fitted.camera.target[0],
      fitted.camera.position[1] - fitted.camera.target[1],
      fitted.camera.position[2] - fitted.camera.target[2],
    );
    expect(distance).toBeGreaterThan(2.2);
    expect(fitted.camera.far).toBeGreaterThan(distance);
  });
});
