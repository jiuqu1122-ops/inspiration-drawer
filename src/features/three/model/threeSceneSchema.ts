import { z } from 'zod';

export const THREE_SCENE_MAX_OBJECTS = 8;
export const THREE_SCENE_MAX_LIGHTS = 4;

const vector3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const colorSchema = z.string().min(1).max(48);

export const threeScenePrimitiveSchema = z.enum([
  'box',
  'rounded_box',
  'sphere',
  'cylinder',
  'plane',
  'capsule',
  'cone',
  'torus',
]);

export const sceneSpecV1Schema = z.object({
  version: z.literal(1),
  camera: z.object({
    position: vector3Schema,
    target: vector3Schema,
    fov: z.number().min(15).max(100),
    near: z.number().min(0.001).max(10),
    far: z.number().min(1).max(500),
  }).strict(),
  environment: z.object({
    background: colorSchema,
    ground: z.object({
      enabled: z.boolean(),
      color: colorSchema,
      size: z.number().min(1).max(100),
      roughness: z.number().min(0).max(1),
    }).strict(),
  }).strict(),
  objects: z.array(z.object({
    id: z.string().min(1).max(80),
    label: z.string().max(120).optional(),
    primitive: threeScenePrimitiveSchema,
    position: vector3Schema,
    rotation: vector3Schema,
    scale: vector3Schema.refine(value => value.every(axis => axis > 0 && axis <= 20)),
    arc: z.number().min(0.2).max(Math.PI * 2).optional(),
    thickness: z.number().min(0.04).max(0.45).optional(),
    material: z.object({
      color: colorSchema,
      roughness: z.number().min(0).max(1),
      metalness: z.number().min(0).max(1),
      opacity: z.number().min(0).max(1),
    }).strict(),
  }).strict()).max(THREE_SCENE_MAX_OBJECTS),
  lights: z.array(z.object({
    id: z.string().min(1).max(80),
    type: z.enum(['ambient', 'directional', 'point', 'area']),
    position: vector3Schema.optional(),
    target: vector3Schema.optional(),
    color: colorSchema,
    intensity: z.number().min(0).max(20),
    width: z.number().min(0.1).max(50).optional(),
    height: z.number().min(0.1).max(50).optional(),
  }).strict()).max(THREE_SCENE_MAX_LIGHTS),
}).strict();
