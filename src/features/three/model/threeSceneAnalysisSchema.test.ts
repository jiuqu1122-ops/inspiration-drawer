import { describe, expect, it } from 'vitest';
import {
  normalizeSceneAnalysis,
  parseSceneAnalysisResponse,
  SceneAnalysisResponseError,
} from './threeSceneAnalysisSchema';

const validAnalysis = (): Record<string, any> => ({
  version: 1,
  composition: {
    subjectCenter: [0.5, 0.55],
    subjectWidth: 0.5,
    subjectHeight: 0.35,
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
  ground: { visible: true, horizonY: 0.64, slope: 'flat' },
  environment: { backgroundColor: '#d8d8d8', backgroundBrightness: 0.8 },
  lighting: { keyDirection: 'top-left', softness: 0.8, contrast: 0.35, fillStrength: 0.4 },
  subject: { shapeHint: 'rounded-box', aspect: [1.8, 0.8, 1.2] },
  secondaryObjects: [],
});

describe('SceneAnalysisV1 parsing', () => {
  it('accepts a complete semantic analysis', () => {
    expect(parseSceneAnalysisResponse(validAnalysis())).toEqual(normalizeSceneAnalysis(validAnalysis()));
  });

  it('extracts fenced JSON', () => {
    const parsed = parseSceneAnalysisResponse(`\`\`\`json\n${JSON.stringify(validAnalysis())}\n\`\`\``);
    expect(parsed.camera.azimuthDeg).toBe(35);
  });

  it('extracts the first balanced JSON object from surrounding explanation', () => {
    const parsed = parseSceneAnalysisResponse(`分析如下：\n${JSON.stringify(validAnalysis())}\n以上是结果。`);
    expect(parsed.subject.shapeHint).toBe('rounded-box');
  });

  it('fills non-critical missing fields with stable defaults', () => {
    const parsed = parseSceneAnalysisResponse({
      composition: { subjectCenter: [0.4, 0.6] },
      subject: { shapeHint: 'cylindrical' },
    });
    expect(parsed.camera.shot).toBe('medium-close');
    expect(parsed.lighting.softness).toBeCloseTo(0.72);
    expect(parsed.subject.aspect).toEqual([1.4, 1, 1]);
  });

  it('clamps invalid normalized coordinates and semantic values', () => {
    const input = validAnalysis();
    input.composition.subjectCenter = [4, -2];
    input.camera.azimuthDeg = 900;
    input.camera.elevationDeg = -200;
    const parsed = parseSceneAnalysisResponse(input);
    expect(parsed.composition.subjectCenter).toEqual([1, 0]);
    expect(parsed.camera.azimuthDeg).toBe(180);
    expect(parsed.camera.elevationDeg).toBe(-75);
  });

  it('limits secondary composition objects to four', () => {
    const input = validAnalysis();
    input.secondaryObjects = Array.from({ length: 7 }, (_, index) => ({
      role: `support-${index}`,
      center: [0.2 + index * 0.05, 0.7],
      width: 0.1,
      height: 0.1,
      depthOrder: 'same',
    }));
    expect(parseSceneAnalysisResponse(input).secondaryObjects).toHaveLength(4);
  });

  it('rejects a response without any semantic analysis', () => {
    expect(() => parseSceneAnalysisResponse('{}')).toThrow(SceneAnalysisResponseError);
  });
});
