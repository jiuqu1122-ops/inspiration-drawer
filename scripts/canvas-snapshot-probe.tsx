// Synthetic fixture only. Never imports App or production persistence/model calls.
import { useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { invoke } from '@tauri-apps/api/core';
import { CanvasNodeLayer } from '../src/features/canvas/components/CanvasNodeLayer';
import { applyCanvasContentTransform, CANVAS_CONTENT_TRANSFORM } from '../src/features/canvas/canvasImagePresentation';
import type { CanvasImageItem } from '../src/features/canvasModel';
import '../src/index.css';
const ref = <T,>(current: T) => ({current});
const noop = () => {};
const frame = () => new Promise<void>(resolve => requestAnimationFrame(()=>resolve()));
const sleep = (ms:number) => new Promise(resolve=>setTimeout(resolve,ms));
const checks: Record<string,boolean> = {};
const errors:string[]=[];
window.addEventListener('error',event=>errors.push(event.message));
window.addEventListener('unhandledrejection',event=>errors.push(String(event.reason)));
const image = (color:string, index:number) => {
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=384;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=color;ctx.fillRect(0,0,512,384);
  ctx.fillStyle='#ffffff';ctx.font='60px sans-serif';ctx.fillText(String(index),25,75);
  return canvas.toDataURL('image/png');
};
const originals:CanvasImageItem[]=Array.from({length:60},(_,i)=>({id:`snap-${i}`,x:20+(i%10)*166,y:20+Math.floor(i/10)*130,width:150,height:112.5,
 item:{id:`asset-${i}`,type:'image',name:`Synthetic ${i}`,content:'fixture',createdAt:1,thumbnail:image(`hsl(${i*137.5%360},60%,45%)`,i)}, rotation:i===1?90:0}));
const view={x:-100,y:-100,width:2500,height:1500};
const actions:{copy:string[];brush:string[];drag:string[]}={copy:[],brush:[],drag:[]};
let current:any;
function Harness(){
 const [snapshotMode,setSnapshotMode]=useState(true);
 const [items,setItems]=useState(originals);const itemsRef=useRef(items);itemsRef.current=items;
 const [selected,setSelected]=useState<string[]>([]);const selectedRef=useRef(selected);selectedRef.current=selected;
 const hovered=useRef('');const content=useRef<HTMLDivElement>(null);
 const select=(ids:string[])=>{selectedRef.current=ids;setSelected(ids);};
 const scope={canvasSnapshotMode:snapshotMode,canvasItems:items,canvasRenderableItems:items,canvasItemsRef:itemsRef,canvasItemsById:new Map(items.map(item=>[item.id,item])),canvasSnapshotViewport:view,
 canvasSelectedIdsSet:new Set(selected),canvasSelectedIdsRef:selectedRef,canvasHoveredItemIdRef:hovered,canvasRenderScale:1,canvasScaledNodeRadius:14,
 canvasTextAgentRunningIds:[],threeSceneAnalyzingIds:[],activeThreeSceneId:null,activeThreeSceneIdRef:ref(null),canvasAiPromptEditingId:null,
 canvasPromptOptimizingId:null,canvasInputMenuForId:null,canvasInputPickTargetId:null,canvasConnectionDraft:null,canvasAiExpandedOutputNodeIds:new Set(),
 canvasAiProvider:'openai-compatible',canvasAiCredentialSource:'local',canvasAiCloudImageModels:null,canvasAiUnifiedImageModelOptions:[],canvasAgent:{settings:{}},canvasWorkflowTemplates:[],canvasWorkflowSingleEditGroupIds:[],
 getStableCanvasImageSource:(item:CanvasImageItem)=>item.item.thumbnail||'',getCanvasAiNodeDesignSizeForItem:()=>null,
 updateCanvasSelection:select,exitThreeSceneInteraction:noop,preventCanvasNativeDrag:noop,enableCanvasWorkflowSingleEditForItem:()=>false,
 startCanvasItemDrag:(_event:unknown,id:string)=>{actions.drag.push(id);select(selectedRef.current.includes(id)?selectedRef.current:[id]);},
 openCanvasContextMenu:noop,copyCanvasImageToSystemClipboard:(item:CanvasImageItem)=>{actions.copy.push(item.id);},openCanvasBrushEditor:(id:string)=>{actions.brush.push(id);},
 rotateCanvasImageClockwise:(id:string)=>setItems(old=>old.map(item=>item.id===id?{...item,rotation:(((item.rotation||0)+90)%360) as CanvasImageItem['rotation']}:item)),
 removeCanvasItemsByIds:(ids:string[])=>setItems(old=>old.filter(item=>!ids.includes(item.id)))};
 useLayoutEffect(()=>{current={scope,itemsRef,content:content.current,setItems,select,setSnapshotMode};});
 return <div className="drawer-theme" style={{padding:12}}><h1>Isolated synthetic snapshot canvas</h1><pre id="status">Running…</pre>
  <div data-canvas-surface="true" style={{position:'relative',height:700,overflow:'auto'}}><div style={{position:'relative',width:6000,height:4000}}>
  <div ref={content} data-canvas-content-layer="true" style={{position:'relative',width:6000,height:4000,transform:CANVAS_CONTENT_TRANSFORM,transformOrigin:'0 0',...({'--canvas-render-scale':1} as any)}}>
   <CanvasNodeLayer scope={scope} canvasItemsRef={itemsRef}/>
  </div></div></div><button id="outside">Outside</button></div>;
}
createRoot(document.getElementById('root')!).render(<Harness/>);
const host=()=>document.querySelector<HTMLElement>('[data-canvas-snapshot-host]')!;
const rootNode=(id:string)=>document.querySelector<HTMLElement>(`[data-canvas-item-id="${id}"]`)!;
const until=async(test:()=>boolean,timeout=20000)=>{const start=performance.now();while(!test()){if(performance.now()-start>timeout)throw new Error('Fixture timeout waiting for condition');await sleep(40);}};
const hover=(id:string,inside:boolean)=>{rootNode(id).dispatchEvent(new PointerEvent(inside?'pointerover':'pointerout',{bubbles:true,pointerType:'mouse',relatedTarget:document.body}));};
const distribution=(times:number[])=>{const sorted=times.sort((a,b)=>a-b);const q=(p:number)=>Number(sorted[Math.max(0,Math.ceil(sorted.length*p)-1)].toFixed(2));return{p50:q(.5),p95:q(.95),p99:q(.99),max:q(1),samples:times.length};};
const benchmark=async()=>{const times:number[]=[];let old=performance.now();for(let i=0;i<160;i++){const scale=.65+Math.sin(i/26)*.25;applyCanvasContentTransform(current.content,scale,0,0);await frame();const now=performance.now();times.push(now-old);old=now;}applyCanvasContentTransform(current.content,1,0,0);await frame();return distribution(times);};
async function run(){let fatal:string|null=null;let off:any,on:any;try{
 await until(()=>Boolean(current&&host()));current.setSnapshotMode(false);await frame();await until(()=>document.querySelectorAll('[data-canvas-main-media="true"]').length===60);
 await Promise.all([...document.querySelectorAll<HTMLImageElement>('img[data-canvas-main-media]')].map(img=>img.decode()));
 const originalModel=JSON.stringify(current.itemsRef.current);off=await benchmark();checks.legacyModeAvailable=document.querySelectorAll('img[data-canvas-main-media]').length===60;
 current.setSnapshotMode(true);await until(()=>Number(host().dataset.snapshotStaticCount)===60);await frame();await frame();
 checks.allImagesRastered=Number(host().dataset.snapshotStaticCount)===60;
 checks.noStaticImageElements=document.querySelectorAll('img[data-canvas-main-media]').length===0;
 checks.originalModelUnchanged=JSON.stringify(current.itemsRef.current)===originalModel;
 checks.tilesBounded=document.querySelectorAll('[data-canvas-snapshot-tile]').length<=48;
 checks.cacheBounded=Number(host().dataset.snapshotCacheBytes)<=96*1024*1024;
 const tiles=[...document.querySelectorAll<HTMLCanvasElement>('[data-canvas-snapshot-tile]')];
 checks.pixelsActuallyDrawn=tiles.some(tile=>{const data=tile.getContext('2d')!.getImageData(0,0,tile.width,tile.height).data;for(let i=3;i<data.length;i+=64)if(data[i]>0)return true;return false;});
 const cacheCount=host().dataset.snapshotCacheCount;const drawCount=tiles.reduce((n,tile)=>n+Number(tile.dataset.snapshotDrawCount),0);
 on=await benchmark();
 checks.zoomReusesBitmaps=host().dataset.snapshotCacheCount===cacheCount;
 checks.zoomReusesTilePixels=[...document.querySelectorAll<HTMLCanvasElement>('[data-canvas-snapshot-tile]')].reduce((n,tile)=>n+Number(tile.dataset.snapshotDrawCount),0)===drawCount;
 const root=rootNode('snap-0');hover('snap-0',true);await frame();await frame();
 checks.hoverPromotesWithoutReplacingRoot=rootNode('snap-0')===root&&Boolean(root.querySelector('[data-canvas-snapshot-preview]'));
 const copy=root.querySelector<HTMLButtonElement>('button[title="复制图片"]')!;copy.click();checks.copyUsesOriginalNode=actions.copy.join(',')==='snap-0';
 const pointer=new PointerEvent('pointerdown',{bubbles:true,cancelable:true,pointerId:25,pointerType:'mouse',isPrimary:true,button:0,clientX:50,clientY:50});root.dispatchEvent(pointer);await frame();await frame();
 checks.pointerDownKeepsCaptureRoot=rootNode('snap-0')===root&&actions.drag.includes('snap-0');
 window.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:25,button:0}));await sleep(20);hover('snap-0',false);flushSync(()=>current.select([]));await until(()=>Number(host().dataset.snapshotStaticCount)===60);
 const oldItem=current.itemsRef.current[0];flushSync(()=>current.setItems((items:CanvasImageItem[])=>items.map(item=>item.id==='snap-0'?{...item,x:item.x+36,rotation:180,item:{...item.item,thumbnail:image('#b200ee',999)}}:item)));
 await until(()=>Number(host().dataset.snapshotCacheCount)>Number(cacheCount));await frame();
 checks.sourceAndGeometryInvalidate=Number.parseFloat(rootNode('snap-0').style.left)===oldItem.x+36&&Number(host().dataset.snapshotStaticCount)===60;
 flushSync(()=>current.setItems((items:CanvasImageItem[])=>items.filter(item=>item.id!=='snap-0')));await frame();checks.removeUpdatesSnapshot=!document.querySelector('[data-canvas-item-id="snap-0"]');
 flushSync(()=>current.setItems(originals));await until(()=>Number(host().dataset.snapshotStaticCount)===60);checks.restoreReusesResidentCache=Number(host().dataset.snapshotCacheCount)===61;
 current.setSnapshotMode(false);await frame();await frame();checks.switchOffRestoresImages=document.querySelectorAll('img[data-canvas-main-media]').length===60;
 current.setSnapshotMode(true);await until(()=>Number(host().dataset.snapshotStaticCount)===60);checks.switchBackReusesCache=Number(host().dataset.snapshotCacheCount)===61;
 }catch(error){fatal=String(error);}
 const result={probe:'snapshot-hybrid-isolated',checksPassed:!fatal&&!errors.length&&Object.values(checks).every(Boolean),checks,frameIntervals:{legacy:off,snapshot:on},errors,fatal,
 limitations:['Synthetic DOM events and isolated adapters, not full App or physical mouse/IME.','RAF intervals are not GPU frame times.','60 distinct 512x384 synthetic PNG inputs, not photographic high-resolution files.','Fixture copies use original-node callback; no real system clipboard or user files touched.']};
 document.getElementById('status')!.textContent=JSON.stringify(result,null,2);console.log('SNAPSHOT_PROBE_RESULT',JSON.stringify(result));await invoke('probe_result',{result});
}
void sleep(500).then(run);
