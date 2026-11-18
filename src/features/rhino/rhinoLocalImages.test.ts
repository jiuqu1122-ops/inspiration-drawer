import { describe, expect, it, vi } from 'vitest';
import { saveRhinoLocalImages, validateRhinoLocalImages } from './rhinoLocalImages';
const image = { name: 'reference.png', dataUrl: 'data:image/png;base64,QUJD' };
describe('Rhino local reference image boundary', () => {
  it('supports old panel requests without images', () => expect(validateRhinoLocalImages(undefined)).toEqual([]));
  it('rejects arbitrary file paths, HTML/SVG, bad base64 and oversized payloads before saving', () => {
    for (const dataUrl of ['C:/private/image.png', 'data:image/svg+xml;base64,QUJD', 'data:image/png;base64,@@@', 'data:image/png;base64,' + 'A'.repeat(1024 * 1024)]) {
      expect(() => validateRhinoLocalImages([{ ...image, dataUrl }])).toThrow();
    }
    expect(() => validateRhinoLocalImages(Array(7).fill(image))).toThrow();
  });
  it('saves with host-controlled names and preserves the bound document metadata', async () => {
    const save = vi.fn(async () => 'C:/synthetic/local.png');
    const result = await saveRhinoLocalImages({ id: 'request-123456', kind: 'send', documentId: 12, localImages: [{ ...image, name: '../../do-not-use.png' }] }, save);
    expect(save).toHaveBeenCalledExactlyOnceWith({ fileName: 'rhino-local-request-123456-0.png', dataUrl: image.dataUrl });
    expect(result[0]).toMatchObject({ type: 'image', mimeType: 'image/png', path: 'C:/synthetic/local.png' });
    expect(JSON.parse(result[0].metadataJson!)).toMatchObject({ source: 'rhino-local', documentId: 12, role: 'reference' });
  });
});
