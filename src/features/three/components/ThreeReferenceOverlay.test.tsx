import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThreeReferenceOverlay } from './ThreeReferenceOverlay';

describe('ThreeReferenceOverlay', () => {
  it('renders a contained reference image with controlled opacity and guides', () => {
    const markup = renderToStaticMarkup(React.createElement(ThreeReferenceOverlay, {
      source: 'https://example.com/reference.png',
      opacity: 0.4,
      guides: true,
    }));
    expect(markup).toContain('data-three-reference-overlay="true"');
    expect(markup).toContain('object-contain');
    expect(markup).toContain('opacity:0.4');
    expect(markup).toContain('left-1/3');
  });
});
