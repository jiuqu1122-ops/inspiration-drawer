import { describe, expect, it, vi } from 'vitest';
import { saveThreeSceneCapture } from './captureThreeScene';

describe('saveThreeSceneCapture', () => {
  it('stores a PNG through the existing dropped-file asset command', async () => {
    const invokeCommand = vi.fn(async () => 'C:\\assets\\three-view.png');
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';

    await expect(saveThreeSceneCapture(dataUrl, 'three-view.png', invokeCommand))
      .resolves.toBe('C:\\assets\\three-view.png');
    expect(invokeCommand).toHaveBeenCalledWith('save_dropped_file', {
      fileName: 'three-view.png',
      dataUrl,
    });
  });

  it('rejects non-PNG capture data', async () => {
    await expect(saveThreeSceneCapture('data:text/plain;base64,QQ==', 'view.png', vi.fn()))
      .rejects.toThrow('3D 视角截图数据无效');
  });
});
