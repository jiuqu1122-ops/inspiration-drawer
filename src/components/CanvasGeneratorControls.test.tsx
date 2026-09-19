import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CanvasGeneratorControls } from './CanvasGeneratorControls';

describe('CanvasGeneratorControls server video placeholders', () => {
  it('does not visually select the first resolution, duration, or ratio for an empty value', () => {
    const html = renderToStaticMarkup(<CanvasGeneratorControls
      mediaType="video"
      menuScale={1}
      modelValue="minimax-h3"
      modelOptions={[{ value: 'minimax-h3', label: 'MiniMax H3' }]}
      modelTitle="MiniMax H3"
      onModelChange={() => undefined}
      aspectRatioValue=""
      aspectRatioOptions={[{ value: '16:9', label: '16:9' }, { value: '9:16', label: '9:16' }]}
      aspectRatioTitle="请选择比例"
      useWideAspectRatioMenu={false}
      onAspectRatioChange={() => undefined}
      videoAspectRatioMode="list"
      supportsImageResolution={false}
      imageResolutionValue=""
      imageResolutionOptions={[]}
      onImageResolutionChange={() => undefined}
      outputFormatValue="png"
      outputFormatOptions={[]}
      outputFormatTitle=""
      onOutputFormatChange={() => undefined}
      videoResolutionValue=""
      videoResolutionOptions={[{ value: '768p', label: '768P' }, { value: '2k', label: '2K' }]}
      onVideoResolutionChange={() => undefined}
      videoSupportsFirstLastFrame={false}
      videoInputMode="REF"
      onVideoInputModeChange={() => undefined}
      videoDuration={0}
      videoDurationOptions={[{ value: '5', label: '5秒' }, { value: '10', label: '10秒' }]}
      onVideoDurationChange={() => undefined}
      videoCfrMode="off"
      onVideoCfrModeChange={() => undefined}
      count={1}
      onCountChange={() => undefined}
    />);

    expect(html).toContain('>清晰度<');
    expect(html).toContain('>时长<');
    expect(html).toContain('>比例<');
    expect(html).not.toContain('>768P<');
    expect(html).not.toContain('>5秒<');
  });
});
