// @ts-expect-error Node file access is used only for static CSS assertions in this test.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChatImageSettings } from './ChatImageSettings';
const stylesheet = readFileSync(new URL('./chat.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const props={ model:'image',modelOptions:[{value:'image',label:'Image model'}],onModelChange:vi.fn(),aspectRatio:'16:9',aspectRatioOptions:[{value:'16:9',label:'16:9'}],onAspectRatioChange:vi.fn(),resolution:'2K',resolutionOptions:[{value:'2K',label:'2K'}],onResolutionChange:vi.fn(),busy:false };
describe('Chat image settings layout markup',()=>{
 it('keeps the unsupported mask out of the compact toolbar and removes its explanatory sentence',()=>{
  const html=renderToStaticMarkup(<ChatImageSettings {...props}/>);
  expect(html).not.toContain('chat-image-settings__mask-note');
  expect(html).not.toContain('\u5f53\u524d\u6a21\u578b\u672a\u5f00\u542f\u906e\u7f69\u7f16\u8f91');
  expect(html.match(/aria-haspopup="listbox"/g)).toHaveLength(3);
  expect(html).toContain('chat-image-settings__primary');
  expect(html.indexOf('aria-label="\u6a21\u578b')).toBeLessThan(html.indexOf('aria-label="\u6bd4\u4f8b'));
  expect(html.indexOf('aria-label="\u6bd4\u4f8b')).toBeLessThan(html.indexOf('aria-label="\u6e05\u6670\u5ea6'));
 });
 it('adds quality and mask controls only for capabilities declared by the model',()=>{
  const html=renderToStaticMarkup(<ChatImageSettings {...props} maskSupported quality="high" qualityOptions={[{value:'high',label:'high'}]}/>);
  expect(html.match(/aria-haspopup="listbox"/g)).toHaveLength(5);
  expect(html).not.toContain('chat-image-settings__mask-note');
 });
 it('keeps the three primary settings on one compact row without clipping dropdown menus',()=>{
  const start=stylesheet.indexOf('.chat-image-settings__controls {');
  const end=stylesheet.indexOf('\n}',start)+2;
  const block=stylesheet.slice(start,end);
  expect(block).toContain('display: flex');
  expect(block).toContain('overflow: visible');
  expect(stylesheet).toContain('grid-template-columns: minmax(0, 1fr) minmax(56px, 22%) minmax(54px, 18%)');
  expect(block).not.toContain('display: grid');
  expect(stylesheet).not.toContain('.chat-image-settings__mask-note');
 });
 it('uses the same LLM font, weight, height and radius tokens for every image picker',()=>{
  const block = (selector: string) => {
    const start = stylesheet.indexOf('\n' + selector + ' {') + 1;
    return stylesheet.slice(start, stylesheet.indexOf('\n}', start) + 2);
  };
  for (const selector of ['.chat-image-setting-trigger', '.chat-composer__tools .chat-model-trigger']) {
    const trigger = block(selector);
    expect(trigger).toContain('font-family: inherit');
    expect(trigger).toContain('font-size: var(--chat-picker-font-size)');
    expect(trigger).toContain('font-weight: var(--chat-picker-font-weight)');
    expect(trigger).toContain('height: var(--chat-picker-height)');
    expect(trigger).toContain('border-radius: var(--chat-picker-radius)');
    expect(trigger).toContain('padding: 0 7px');
  }
  expect(block('.chat-image-setting-trigger__value')).toContain('font-size: inherit');
  expect(block('.chat-image-setting-trigger__value')).toContain('font-weight: inherit');
  for (const selector of ['.chat-image-setting-menu button', '.chat-composer__tools .chat-model-menu button']) {
    const menu = block(selector);
    expect(menu).toContain('font-size: var(--chat-picker-font-size)');
    expect(menu).toContain('font-weight: var(--chat-picker-font-weight)');
    expect(menu).toContain('min-height: var(--chat-picker-option-height)');
  }
  expect(stylesheet).toContain('--chat-picker-font-size: 8px');
  expect(stylesheet).toContain('--chat-picker-height: 27px');
  expect(block('.chat-image-setting-menu .chat-model-option-copy small')).toContain('font-size: var(--chat-picker-meta-size)');
 });
 it('raises the active footer stacking context above the image settings rather than offsetting the menu',()=>{
  expect(stylesheet).toContain('.chat-composer__footer.is-menu-open {\n  z-index: var(--chat-layer-active)');
  expect(stylesheet).toContain('--chat-layer-settings: 2');
  expect(stylesheet).toContain('--chat-layer-active: 3');
  expect(stylesheet).not.toContain('bottom: calc(100% + 52px)');
 });
 it('accepts a composer-owned open picker so image menus cannot stay open behind the LLM menu',()=>{
  const open = renderToStaticMarkup(<ChatImageSettings {...props} openPicker="model" onOpenPickerChange={vi.fn()}/>);
  expect(open).toContain('role="listbox"');
  expect(open).toContain('aria-selected="true"');
  const closed = renderToStaticMarkup(<ChatImageSettings {...props} openPicker={null} onOpenPickerChange={vi.fn()}/>);
  expect(closed).not.toContain('role="listbox"');
 });
 it('disables all current image-setting pickers during generation',()=>{
  const html=renderToStaticMarkup(<ChatImageSettings {...props} busy/>);
  expect(html.match(/disabled=""/g)).toHaveLength(3);
 });
});
