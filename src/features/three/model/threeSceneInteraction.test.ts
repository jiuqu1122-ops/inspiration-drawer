import { describe, expect, it } from 'vitest';
import {
  shouldExitThreeSceneInteraction,
  shouldMountThreeSceneRenderer,
} from './threeSceneInteraction';

describe('three scene interaction policy', () => {
  it('mounts a renderer for only the active node', () => {
    expect(shouldMountThreeSceneRenderer('three-a', null)).toBe(false);
    expect(shouldMountThreeSceneRenderer('three-a', 'three-a')).toBe(true);
    expect(shouldMountThreeSceneRenderer('three-b', 'three-a')).toBe(false);
  });

  it('exits only when a click occurs outside the active viewport', () => {
    expect(shouldExitThreeSceneInteraction('three-a', true)).toBe(false);
    expect(shouldExitThreeSceneInteraction('three-a', false)).toBe(true);
    expect(shouldExitThreeSceneInteraction(null, false)).toBe(false);
  });
});
