// @ts-expect-error Node fixture API is outside the browser tsconfig.
import { readFileSync } from 'node:fs';
// @ts-expect-error Node fixture API is outside the browser tsconfig.
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const source=readFileSync(new URL('../../../integrations/rhino/InspirationDrawer.Rhino/Panel/image-preview.js',import.meta.url),'utf8');
const thumb='data:image/png;base64,dGh1bWI='; const full='data:image/jpeg;base64,ZnVsbA==';
class Element {
  hidden=true; inert=false; src=''; textContent=''; isConnected=true;
  dataset:Record<string,string>={}; children:Element[]=[];
  listeners=new Map<string,(event?:any)=>void>(); focus=vi.fn();
  classList={add:vi.fn(),remove:vi.fn()};
  addEventListener(name:string,fn:(event?:any)=>void){this.listeners.set(name,fn);}
  removeAttribute(name:string){if(name==='src')this.src='';}
  querySelectorAll(){return this.children;}
  closest(selector?:string){return selector?.startsWith('button') ? null : this;}
}
function setup(){
  const ids=new Map(['image-preview','image-preview-image','image-preview-close','image-preview-status','messages','input'].map(id=>[id,new Element()]));
  const body=new Element();body.children=[...ids.values()];
  const listeners=new Map<string,(event:any)=>void>();
  const window:any={};
  class DecodedImage {onload?:()=>void;onerror?:()=>void;set src(_source:string){this.onload?.();}}
  const doc={getElementById:(id:string)=>ids.get(id),body,addEventListener:(name:string,fn:(event:any)=>void)=>listeners.set(name,fn)};
  runInNewContext(source,{document:doc,window,Image:DecodedImage});
  const load=vi.fn(async()=>full);window.rhinoImagePreview.configure({load});window.rhinoImagePreview.sync('conversation-one');
  const target=new Element();target.dataset={previewSrc:thumb,messageId:'assistant-one',imageIndex:'2'};
  ids.get('messages')!.children=[target];
  const click=()=>ids.get('messages')!.listeners.get('click')!({target});
  return {ids,body,listeners,viewer:window.rhinoImagePreview,load,target,click};
}
const settle=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
describe('Rhino read-only image preview interaction',()=>{
 it('opens the thumbnail immediately and upgrades only its matching image',async()=>{
  const f=setup();f.click();expect(f.ids.get('image-preview')!.hidden).toBe(false);expect(f.ids.get('image-preview-image')!.src).toBe(thumb);
  await settle();expect(f.load).toHaveBeenCalledExactlyOnceWith('assistant-one',2);expect(f.ids.get('image-preview-image')!.src).toBe(full);expect(f.ids.get('image-preview-status')!.textContent).toContain('清晰预览');
 });
 it('keeps the viewer open across repeated heartbeats and closes on Escape with focus restored',async()=>{
  const f=setup();f.click();await settle();f.viewer.sync('conversation-one');expect(f.ids.get('image-preview')!.hidden).toBe(false);
  f.listeners.get('keydown')!({key:'Escape',preventDefault:vi.fn()});expect(f.ids.get('image-preview')!.hidden).toBe(true);expect(f.target.focus).toHaveBeenCalledOnce();expect(f.ids.get('image-preview-image')!.src).toBe('');
 });
 it('restores focus to the replacement thumbnail after chat rendering',async()=>{
  const f=setup();f.click();await settle();f.target.isConnected=false;const replacement=new Element();replacement.dataset={...f.target.dataset};f.ids.get('messages')!.children=[replacement];
  f.ids.get('image-preview-close')!.listeners.get('click')!();expect(replacement.focus).toHaveBeenCalledOnce();
 });
 it('ignores a late full image after switching conversations',async()=>{
  const f=setup();let resolve!:(value:string)=>void;f.load.mockImplementation(()=>new Promise<string>(done=>resolve=done));f.click();f.viewer.sync('another-conversation');resolve(full);await settle();
  expect(f.ids.get('image-preview')!.hidden).toBe(true);expect(f.ids.get('image-preview-image')!.src).toBe('');
 });
 it('keeps the thumbnail with a readable error when the original cannot load',async()=>{
  const f=setup();f.load.mockRejectedValue(new Error('missing original'));f.click();await settle();expect(f.ids.get('image-preview-image')!.src).toBe(thumb);expect(f.ids.get('image-preview-status')!.textContent).toContain('当前显示缩略图');
 });
 it('supports keyboard opening, traps Tab, and rejects active image formats',async()=>{
  const f=setup();const prevent=vi.fn();f.ids.get('messages')!.listeners.get('keydown')!({target:f.target,key:'Enter',preventDefault:prevent});await settle();expect(prevent).toHaveBeenCalled();
  const tab=vi.fn();f.listeners.get('keydown')!({key:'Tab',preventDefault:tab});expect(tab).toHaveBeenCalled();
  f.ids.get('image-preview-close')!.listeners.get('click')!();f.load.mockClear();f.target.dataset.previewSrc='data:image/svg+xml;base64,PHN2Zy8+';f.click();expect(f.load).not.toHaveBeenCalled();expect(f.ids.get('image-preview')!.hidden).toBe(true);
 });
});
