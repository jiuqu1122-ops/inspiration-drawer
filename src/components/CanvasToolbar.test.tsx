import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CanvasToolbar } from './CanvasToolbar';

describe('canvas music entry', () => {
  it('places the music entry immediately below video and uses the same SVG icon treatment', () => {
    const noop = () => {};
    const html = renderToStaticMarkup(<CanvasToolbar toolbarRef={{ current: null }} top="50%" navigator={null} promptValue="" promptOptions={[]} workflowValue="" workflowOptions={[]} hasWorkflow={false} onAddImage={noop} onCreateThreeScene={noop} onAddFusion={noop} onAddVideo={noop} onAddMusic={noop} onAddFrameInterpolation={noop} onAddEnhancement={noop} onPromptChange={noop} onWorkflowChange={noop} onRunWorkflow={noop} onAddText={noop} onOpenInspirationSpace={noop} />);
    expect(html).toMatch(/>视频<\/span><\/button><button[^>]+title="新增 AI 音乐节点"[^>]*><svg/);
    expect(html).toContain('lucide-music');
    expect(html).not.toContain('♫');
  });
});
