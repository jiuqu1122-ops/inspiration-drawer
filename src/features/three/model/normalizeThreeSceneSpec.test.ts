import { describe, expect, it } from 'vitest';
import {
  createDefaultThreeSceneSpec,
  normalizeThreeSceneSpec,
  parseThreeSceneSpecJson,
  ThreeSceneSpecError,
} from './normalizeThreeSceneSpec';

describe('normalizeThreeSceneSpec', () => {
  it('accepts a valid SceneSpec v1', () => {
    const input = createDefaultThreeSceneSpec();
    expect(normalizeThreeSceneSpec(input)).toEqual(input);
  });

  it('clamps unsafe camera, scale and light values', () => {
    const input = createDefaultThreeSceneSpec();
    input.camera.fov = 500;
    input.objects[0].scale = [-2, 1000, 0] as unknown as [number, number, number];
    input.lights[1].intensity = 100000;

    const result = normalizeThreeSceneSpec(input);
    expect(result.camera.fov).toBe(100);
    expect(result.objects[0].scale).toEqual([0.05, 20, 0.05]);
    expect(result.lights[1].intensity).toBe(20);
  });

  it('limits objects to eight and lights to four while retaining ambient light', () => {
    const input = createDefaultThreeSceneSpec();
    input.objects = Array.from({ length: 12 }, (_, index) => ({
      ...input.objects[0],
      id: `object-${index}`,
    }));
    input.lights = Array.from({ length: 7 }, (_, index) => ({
      id: `light-${index}`,
      type: 'point' as const,
      position: [index, 4, 2] as [number, number, number],
      color: '#ffffff',
      intensity: 2,
    }));

    const result = normalizeThreeSceneSpec(input);
    expect(result.objects).toHaveLength(8);
    expect(result.lights).toHaveLength(4);
    expect(result.lights[0].type).toBe('ambient');
  });

  it('drops unknown primitives and restores a safe subject when none remain', () => {
    const input = {
      ...createDefaultThreeSceneSpec(),
      objects: [{ primitive: 'torus-knot' }],
    };
    const result = normalizeThreeSceneSpec(input);
    expect(result.objects).toHaveLength(1);
    expect(result.objects[0].primitive).toBe('rounded_box');
  });

  it('deduplicates model-generated object ids for stable rendering keys', () => {
    const input = createDefaultThreeSceneSpec();
    input.objects = [input.objects[0], { ...input.objects[0] }];
    expect(normalizeThreeSceneSpec(input).objects.map(object => object.id))
      .toEqual(['subject', 'subject-2']);
  });

  it('normalizes useful primitive aliases and torus parameters', () => {
    const input = createDefaultThreeSceneSpec();
    input.objects = [
      {
        ...input.objects[0],
        id: 'headband',
        label: '头梁',
        primitive: 'ring' as unknown as 'torus',
        arc: 99,
        thickness: 0.01,
      },
      {
        ...input.objects[0],
        id: 'shell',
        label: '外壳',
        primitive: 'ellipsoid' as unknown as 'sphere',
      },
    ];
    const result = normalizeThreeSceneSpec(input);
    expect(result.objects[0]).toMatchObject({
      primitive: 'torus',
      arc: Math.PI * 2,
      thickness: 0.04,
    });
    expect(result.objects[1].primitive).toBe('sphere');
  });

  it('returns a user-facing error for malformed model JSON', () => {
    expect(() => parseThreeSceneSpecJson('{not-json')).toThrow(ThreeSceneSpecError);
    expect(() => parseThreeSceneSpecJson('{not-json')).toThrow('3D 场景生成失败，请重试。');
  });

  it('does not report an empty AI scene as a successful placeholder cube', () => {
    const input = { ...createDefaultThreeSceneSpec(), objects: [] };
    expect(() => parseThreeSceneSpecJson(input)).toThrow(ThreeSceneSpecError);
  });

  it('does not report unsupported AI geometry as a successful placeholder cube', () => {
    const input = {
      ...createDefaultThreeSceneSpec(),
      objects: [{ primitive: 'torus-knot' }],
    };
    expect(() => parseThreeSceneSpecJson(input)).toThrow(ThreeSceneSpecError);
  });

  it('rejects a single block result so the analyzer can request a structural retry', () => {
    const input = createDefaultThreeSceneSpec();
    input.objects[0] = {
      ...input.objects[0],
      id: 'headphones',
      label: '耳机',
      material: { ...input.objects[0].material, color: '#f4f1eb' },
    };
    expect(() => parseThreeSceneSpecJson(input)).toThrow(ThreeSceneSpecError);
  });
});
