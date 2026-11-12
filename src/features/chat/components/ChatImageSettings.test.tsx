// @ts-expect-error Node file access is used only for static CSS assertions in this test.
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChatImageSettings } from './ChatImageSettings';
const stylesheet = readFileSync(new URL('./chat.css', import.meta.url), 'utf8');
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
 it('keeps image controls compact with the inherited 11px medium type scale',()=>{
  const triggerStart=stylesheet.indexOf('.chat-image-setting-trigger {');
  const triggerEnd=stylesheet.indexOf('\n}',triggerStart)+2;
  const trigger=stylesheet.slice(triggerStart,triggerEnd);
  expect(trigger).toContain('font-family: inherit');
  expect(trigger).toContain('height: 30px');
  expect(trigger).toContain('font-size: 11px');
  expect(trigger).toContain('font-weight: 500');
  const valueStart=stylesheet.indexOf('.chat-image-setting-trigger strong {');
  const valueEnd=stylesheet.indexOf('\n}',valueStart)+2;
  const value=stylesheet.slice(valueStart,valueEnd);
  expect(value).toContain('font-size: 11px');
  expect(value).toContain('font-weight: 500');
  const menuStart=stylesheet.indexOf('.chat-image-setting-menu button {');
  const menuEnd=stylesheet.indexOf('\n}',menuStart)+2;
  const menu=stylesheet.slice(menuStart,menuEnd);
  expect(menu).toContain('font-family: inherit');
  expect(menu).toContain('font-size: 11px');
  expect(stylesheet).toContain('.chat-image-setting-menu .chat-model-option-copy strong {');
  expect(stylesheet).toContain('height: 28px');
  expect(stylesheet).toContain('.chat-image-setting-menu .chat-model-option-copy small {');
 });
 it('disables all current image-setting pickers during generation',()=>{
  const html=renderToStaticMarkup(<ChatImageSettings {...props} busy/>);
  expect(html.match(/disabled=""/g)).toHaveLength(3);
 });
});
