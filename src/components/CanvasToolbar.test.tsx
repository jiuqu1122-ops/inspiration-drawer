import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { CanvasToolbar } from './CanvasToolbar';

const noop = () => {};
const renderToolbar = () => renderToStaticMarkup(
  <CanvasToolbar
    toolbarRef={{ current: null }}
    top="50%"
    navigator={null}
    promptValue=""
    promptOptions={[]}
    workflowValue=""
    workflowOptions={[]}
    hasWorkflow={false}
    onAddImage={noop}
    onCreateThreeScene={noop}
    onAddFusion={noop}
    onAddLayerOperation={noop}
    onAddVideo={noop}
    onAddMusic={noop}
    onAddFrameInterpolation={noop}
    onAddEnhancement={noop}
    onPromptChange={noop}
    onWorkflowChange={noop}
    onRunWorkflow={noop}
    onAddText={noop}
    onOpenInspirationSpace={noop}
  />,
);

it('exposes a visible entry for the layer split and interactive edit node', () => {
  const html = renderToolbar();
  expect(html).toMatch(/<button[^>]+aria-label="图层拆分 \/ 交互编辑"[^>]*>.*?<span[^>]*>图层<\/span><\/button>/);
});

describe('canvas music entry', () => {
  it('places the music entry immediately below video and uses the same SVG icon treatment', () => {
    const html = renderToolbar();
    expect(html).toMatch(/>视频<\/span><\/button><button[^>]+title="新增 AI 音乐节点"[^>]*><svg/);
    expect(html).toContain('lucide-music');
    expect(html).not.toContain('♫');
  });
});

describe('canvas snapshot controls', () => {
  it('does not expose a snapshot toggle or its ON/OFF labels', () => {
    const html = renderToolbar();

    expect(html).not.toContain('data-canvas-snapshot-toggle');
    expect(html).not.toMatch(/快照(?:开|关|模式)/);
    expect(html).toContain('title="新增 AI 生图节点"');
    expect(html).toContain('title="新增 AI 溶图节点"');
  });
});
