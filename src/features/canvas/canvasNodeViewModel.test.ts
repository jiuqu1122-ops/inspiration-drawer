import { describe, expect, it } from 'vitest';
import {
  canvasAiPersistedRouteHintsForNode,
  isCanvasCloudVideoGeneratorType,
  shouldShowCanvasWalletVideoCapabilityWarning,
} from './canvasNodeViewModel';
import canvasNodeViewModelSource from './canvasNodeViewModel.ts?raw';
import canvasNodeSource from './components/CanvasNode.tsx?raw';
import canvasLocalMediaControlsSource from '../../components/CanvasLocalMediaControls.tsx?raw';

describe('canvas node persisted route hints', () => {
  it('does not rehydrate legacy media channels or candidates for text nodes', () => {
    const hints = canvasAiPersistedRouteHintsForNode(true, {
      type: 'image-generator',
      provider: 'new-api',
      providerChannelId: 'stale-image-channel',
      providerCandidates: [{
        source: 'wallet',
        provider: 'new-api',
        providerChannelId: 'stale-image-channel',
        model: 'gpt-image-2',
      }],
    });

    expect(hints).toEqual({ providerCandidates: [], providerChannelId: undefined });
  });
});

describe('canvas local media capability routing', () => {
  it('does not create wallet video context for frame-interpolation nodes', () => {
    expect(isCanvasCloudVideoGeneratorType('video-generator')).toBe(true);
    expect(isCanvasCloudVideoGeneratorType('frame-interpolation')).toBe(false);
    expect(canvasNodeViewModelSource).toContain(
      'const canvasWalletVideoModelContext = isCanvasCloudVideoGeneratorType(canvasItem.ai?.type)',
    );
  });

  it('does not show the unresolved capability warning for frame-interpolation nodes', () => {
    expect(shouldShowCanvasWalletVideoCapabilityWarning('frame-interpolation', 'unresolved')).toBe(false);
  });

  it('still shows the unresolved capability warning for video-generator nodes', () => {
    expect(shouldShowCanvasWalletVideoCapabilityWarning('video-generator', 'unresolved')).toBe(true);
    expect(shouldShowCanvasWalletVideoCapabilityWarning('video-generator', 'resolved')).toBe(false);
    expect(canvasNodeSource).toContain('shouldShowCanvasWalletVideoCapabilityWarning(');
  });

  it('does not show the unresolved capability warning for local video-enhancement nodes', () => {
    expect(isCanvasCloudVideoGeneratorType('video-enhancement')).toBe(false);
    expect(shouldShowCanvasWalletVideoCapabilityWarning('video-enhancement', 'unresolved')).toBe(false);
  });

  it('keeps the local RIFE controls and their persisted parameter fields', () => {
    for (const field of [
      'interpolationRateMode',
      'interpolationTargetFps',
      'interpolationFactor',
      'videoCfrMode',
      'interpolationQuality',
      'interpolationKeepAudio',
      'outputFormat',
    ]) {
      expect(canvasLocalMediaControlsSource).toContain(field);
    }
  });
});
