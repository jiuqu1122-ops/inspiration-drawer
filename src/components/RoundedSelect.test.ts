import { describe, expect, it } from 'vitest';
import { getAspectRatioOptionVisualDimensions } from './RoundedSelect';

describe('RoundedSelect aspect-ratio option visual', () => {
  it.each([
    ['1:1', 'square'],
    ['3:4', 'portrait'],
    ['4:3', 'landscape'],
    ['9:16', 'portrait'],
    ['16:9', 'landscape'],
  ] as const)('renders %s as a %s thumbnail', (value, orientation) => {
    const dimensions = getAspectRatioOptionVisualDimensions(value);

    if (orientation === 'square') {
      expect(dimensions.width).toBeCloseTo(dimensions.height);
    } else if (orientation === 'portrait') {
      expect(dimensions.width).toBeLessThan(dimensions.height);
    } else {
      expect(dimensions.width).toBeGreaterThan(dimensions.height);
    }
  });

  it.each(['1:1', '3:4', '4:3', '9:16', '16:9'])('preserves the numeric ratio for %s', value => {
    const [sourceWidth, sourceHeight] = value.split(':').map(Number);
    const dimensions = getAspectRatioOptionVisualDimensions(value);

    expect(dimensions.width / dimensions.height).toBeCloseTo(sourceWidth / sourceHeight);
  });
});
