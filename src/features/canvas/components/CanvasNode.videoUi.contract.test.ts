import { describe, expect, it } from 'vitest';
import canvasNodeSource from './CanvasNode.tsx?raw';
import canvasGenerationActionsSource from '../controllers/canvasGenerationActions.ts?raw';

describe('Canvas video node UI contracts', () => {
  it('does not render the persistent pure-text media warning', () => {
    expect(canvasNodeSource).not.toContain('此模型要求媒体输入，文字仅作为辅助指令');
  });

  it('retains run-time validation for models that require media input', () => {
    expect(canvasGenerationActionsSource).toContain('!resolvedVideoCapabilities.supportsTextPrompt');
    expect(canvasGenerationActionsSource).toContain('inputImages.length + inputVideos.length + inputAudios.length === 0');
    expect(canvasGenerationActionsSource).toContain('当前模型要求至少连接一个媒体输入，不能仅提交文字');
    expect(canvasGenerationActionsSource).toContain('inputImages.length < minimumReferenceImages');
    expect(canvasGenerationActionsSource).toContain('inputVideos.length < resolvedVideoCapabilities.minReferenceVideos');
    expect(canvasGenerationActionsSource).toContain('inputAudios.length < resolvedVideoCapabilities.minReferenceAudios');
  });
});
