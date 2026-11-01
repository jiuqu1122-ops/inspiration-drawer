import { describe, expect, it } from 'vitest';
import {
  canvasAiPersistedRouteHintsForNode,
  buildCanvasNodeViewModel,
  isCanvasCloudVideoGeneratorType,
  shouldShowCanvasWalletVideoCapabilityWarning,
} from './canvasNodeViewModel';
import canvasNodeViewModelSource from './canvasNodeViewModel.ts?raw';
import canvasNodeSource from './components/CanvasNode.tsx?raw';
import canvasLocalMediaControlsSource from '../../components/CanvasLocalMediaControls.tsx?raw';
import { getCanvasAiDefaultModel } from '../../utils/canvasAiConfig';
import type { CanvasAiProvider, CanvasImageItem } from '../canvasModel';

describe('folded workflow wallet price display', () => {
  const pricing = {
    agentRequestCredits: '7', inspirationAnalysisCredits: '3', canvasTextAgentCredits: '1',
    imageDefaultCredits: '999999', videoDefaultCredits: '500', videoModels: [],
    imageModels: [
      { model: 'nano-banana-2', billingType: 'image_resolution' as const,
        creditsByResolution: { '2k': '15', '4k': '18' } },
      { model: 'nano-banana-pro', billingType: 'image_resolution' as const,
        creditsByResolution: { '2k': '18', '4k': '20' } },
      { model: 'image2', billingType: 'image_resolution' as const,
        creditsByResolution: { '1k': '10', '2k': '15', '4k': '18' } },
    ],
  };

  const getViewModel = (model: string, resolution?: string) => {
    const item: CanvasImageItem = {
      id: 'module', x: 0, y: 0, width: 640, height: 500,
      item: { id: 'module-asset', type: 'text', content: '', createdAt: 0 },
      ai: { type: 'workflow', status: 'success', workflow: {
        id: 'saved-workflow', label: 'Saved workflow', hint: '',
        nodes: [{ id: 'render', x: 0, y: 0, width: 100, height: 100,
          item: { id: 'asset', type: 'image', content: '' },
          ai: { type: 'image-generator', provider: 'new-api', model, resolution, count: 1,
            providerCandidates: [{ source: 'wallet', provider: 'new-api', model,
              providerChannelId: 'legacy-channel' }] } }],
      } },
    };
    const scope = {
      canvasAgent: { settings: { apiProvider: 'unmind-wallet', apiCredentialSource: 'cloud_wallet' } },
      canvasAiCloudImageModels: { provider: 'new-api', models: [], pricing,
        catalog: pricing.imageModels.map(price => ({ id: price.model, displayName: price.model,
          modality: 'image', capabilities: { resolutions: Object.keys(price.creditsByResolution) } })) },
      canvasAiCredentialSource: 'wallet', canvasAiProvider: 'new-api',
      canvasAiExpandedOutputNodeIds: new Set(), canvasAiPromptEditingId: null,
      canvasItems: [item], canvasItemsById: new Map([[item.id, item]]), canvasRenderScale: 1,
      canvasSelectedIdsSet: new Set(), canvasTextAgentRunningIds: [], cloudAccount: null,
      getCanvasAiNodeDesignSizeForItem: () => ({ width: 640, height: 500 }),
      getCanvasAiResolvedModel: (provider: CanvasAiProvider, saved?: string) => saved || getCanvasAiDefaultModel(provider),
      getCanvasAiUnifiedImageModelValue: () => '', getCanvasImageInputBufferItemsForNode: () => [],
      getStableCanvasImageSource: () => '',
    };
    const original = JSON.stringify(item);
    const viewModel = buildCanvasNodeViewModel(scope, item);
    const moved = buildCanvasNodeViewModel({ ...scope, canvasRenderScale: .25 }, { ...item, x: 900, y: 600 });
    expect(moved.canvasRunCreditLabel).toBe(viewModel.canvasRunCreditLabel);
    expect(JSON.stringify(item)).toBe(original);
    return viewModel;
  };

  it.each([
    ['gemini-3.1-flash-image-preview', '2k', 15],
    ['gemini-3-flash-image-preview', '4k', 18],
    ['gemini-3-pro-image-preview', '4k', 20],
    ['gemini-3.1-pro-image-preview', '2k', 18],
    ['Xais Nano Pro_2K', undefined, 18],
    ['Xais Nano 2_4K', undefined, 18],
    ['gpt-image-2', '1k', 10],
    ['nano-banana-pro', '4k', 20],
  ] as const)('shows the configured price for saved model %s / %s after moving and zooming', (model, resolution, credits) => {
    const viewModel = getViewModel(model, resolution);
    expect(viewModel.canvasWorkflowCreditEstimate).toMatchObject({ pricingState: 'ready', totalCredits: credits });
    expect(viewModel.canvasRunCreditLabel).toBe(`1图片节点 · ${credits}积分`);
  });

  it('still reports a genuinely unpriced saved model', () => {
    const viewModel = getViewModel('unknown-custom-model', '2k');
    expect(viewModel.canvasWorkflowCreditEstimate).toMatchObject({ pricingState: 'unavailable', totalCredits: 0 });
    expect(viewModel.canvasRunCreditLabel).toBe('价格未配置');
  });
});

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
