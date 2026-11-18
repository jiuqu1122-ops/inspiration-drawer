/** Real Rhino panel assets with synthetic transport; no Rhino instance or AI calls. */
import { invoke, isTauri } from '@tauri-apps/api/core';
import panelHtml from '../integrations/rhino/InspirationDrawer.Rhino/Panel/index.html?raw';
const root = '/integrations/rhino/InspirationDrawer.Rhino/Panel/';
const pause = (ms = 80) => new Promise(resolve => setTimeout(resolve, ms));
const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id)! as T;
const check = (value: unknown, label: string) => { if (!value) throw Error(label); };
const wait = async (test: () => boolean, label: string) => { for (let i=0; i<90; i++) { if(test())return; await pause(50); } throw Error('Timeout: '+label); };
const commands: Record<string, any>[] = [];
const iconViolations: string[] = [];
document.addEventListener('securitypolicyviolation', event => { if(event.effectiveDirective==='img-src')iconViolations.push(event.blockedURI); });
const checkIcons = () => {
  const ids=['attach-local-image','reference-settings-toggle','image-settings-toggle','send','model-trigger','image-model-trigger','image-aspect-ratio-trigger','image-resolution-trigger'];
  return ids.map(id=>{
    const icon=byId(id).querySelector<SVGSVGElement>('svg');check(icon,'Missing icon SVG: '+id);
    const bounds=icon!.getBBox();check(bounds.width>0&&bounds.height>0,'Icon has no painted geometry under production CSP: '+id);
    return {id,width:bounds.width,height:bounds.height,color:getComputedStyle(icon!).color};
  });
};
const state = { conversationId:'fixture-chat', conversations:[{id:'fixture-chat',title:'参考图建模'}],
  busy:false, stoppable:false, messages:[{id:'fixture-message',role:'assistant',content:'此页面仅用于验证插件布局，不执行 Rhino 操作。',status:'completed'}],
  model:'gpt-6-1-sol', modelOptions:['gpt-6-1-sol','claude-opus-5','gemini-4-argon','grok-4-6','gpt-6-1-terra','gemini-3-8-flash-high','gemini-3-7-flash','gpt-6-astra',...Array.from({length:12},(_,i)=>'fixture-model-'+i)],
  imageModel:'auto',imageModelOptions:[{value:'auto',label:'自动选择（推荐）',supportsMask:true},...['Nano Banana 2.1','Nano Banana Pro','Gpt image 2.6 high','Gpt image 2.5','Gpt image 2.5 Medium','seedream-5.5'].map(label=>({value:label,label,supportsMask:true}))],
  imageAspectRatio:'auto',imageAspectRatioOptions:[{value:'auto',label:'自动匹配'},...['1:1','4:3','3:4','16:9','9:16'].map(value=>({value,label:value}))],
  imageResolution:'auto',imageResolutionOptions:[{value:'auto',label:'自动匹配'},...['1K','2K','4K'].map(value=>({value,label:value}))],
  imageQuality:'', imageQualityOptions:[] as Array<{value:string;label:string}>, selectedCount:2,imageMaskEnabled:false,
};
let manyParts = false;
const nativeFetch=window.fetch.bind(window);
window.fetch = async (resource,init) => {
  const pathname=typeof resource==='string'?resource:'';
  if(pathname.startsWith('/panel/state'))return Response.json({connected:true,instanceId:'synthetic-only',processId:12345,state,context:{name:'隔离测试 · 未连接 Rhino',selection:[]},commands:commands.map(request=>({id:request.id,status:'completed',request}))});
  if(pathname.startsWith('/panel/parts'))return Response.json({parts:manyParts?Array.from({length:12},(_,i)=>({id:String(i),name:`分件 ${i+1}`,kind:"object",type:"Brep",layer:"Default",material:{source:"layer"}})):[],layers:[{visible:true,path:'Default'},{visible:true,path:'外壳'}]});
  if(pathname==='/panel/command'){
    const command=JSON.parse(String(init?.body||'{}'));commands.push(command);
    const key=({'model':'model','image-model':'imageModel','image-aspect-ratio':'imageAspectRatio','image-resolution':'imageResolution','image-quality':'imageQuality'} as Record<string,string>)[command.kind];
    if(key)(state as Record<string,unknown>)[key]=command.value;
    if(command.kind==='mask-mode')state.imageMaskEnabled=command.value==='on';
    return Response.json({id:command.id,status:'pending'});
  }
  return nativeFetch(resource,init);
};
const loadScript=(file:string)=>new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=root+file;script.onload=()=>resolve();script.onerror=()=>reject(Error('Cannot load '+file));document.body.append(script);});
const click=(id:string)=>byId<HTMLButtonElement>(id).click();
const fits = () => {
  for(const id of ['composer','input','image-settings-toggle','reference-settings-toggle','model-trigger','send']) {
    const rect=byId(id).getBoundingClientRect();check(rect.left>=-1&&rect.right<=innerWidth+1&&rect.bottom<=innerHeight+1&&rect.top>=0,'Viewport bounds: '+id+JSON.stringify(rect));
  }
  check(document.body.scrollHeight<=innerHeight+2,'Body overflow '+document.body.scrollHeight+'/'+innerHeight);
  const composer=byId('composer');check(composer.scrollWidth<=composer.clientWidth+1,'Composer horizontal overflow');
};
const popupFits=()=>{const menu=document.querySelector<HTMLElement>('.panel-picker-menu')!;check(menu,'Missing menu');const rect=menu.getBoundingClientRect();check(rect.left>=0&&rect.right<=innerWidth+1&&rect.top>=0&&rect.bottom<=innerHeight+1,'Menu outside viewport');check(menu.contains(document.elementFromPoint(rect.left+12,rect.top+12)),'Menu occluded');return menu;};
async function finish(result:Record<string,unknown>){if(isTauri())await invoke('chat_copy_generated_file',{result});else{document.body.dataset.probePass=String(result.pass);console.log(result);}}
async function run(){
 if(isTauri())await invoke('chat_create_file');
 document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')||'light';
 const parsed=new DOMParser().parseFromString(panelHtml,'text/html');
 const links=Array.from(parsed.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]'));
 await Promise.all(links.map(link=>new Promise<void>((resolve,reject)=>{const copy=document.createElement('link');copy.rel='stylesheet';copy.href=root+link.getAttribute('href')!.split('/').pop();copy.onload=()=>resolve();copy.onerror=reject;document.head.append(copy);} )));
 document.body.replaceChildren(...Array.from(parsed.body.children).filter(element=>element.tagName!=='SCRIPT'));
 await loadScript('panel-pickers.js');await loadScript('markdown.js');await loadScript('image-preview.js');await loadScript('panel.js');
 await wait(()=>!byId<HTMLButtonElement>('model-trigger').disabled,'model catalog');await pause();
 const icons=checkIcons();
 check(!document.querySelector('use[href]'),'No external/shadow-tree icon dependency');
 const composer=byId('composer');
 for(const id of ['model','image-model','image-aspect-ratio','image-resolution','viewport','canvas','mask','mask-layer','attach-local-image'])check(composer.contains(byId(id)),'Control outside input card: '+id);
 check(byId('input').getBoundingClientRect().top<byId('image-settings').getBoundingClientRect().top,'Input must precede image controls');
 check(byId('image-settings').getBoundingClientRect().top<byId('model-trigger').getBoundingClientRect().top,'LLM picker must be in bottom toolbar');
 const metrics=(element:Element)=>{const style=getComputedStyle(element);return {fontSize:style.fontSize,fontWeight:style.fontWeight,height:style.height,borderRadius:style.borderRadius};};
 const base=metrics(byId('model-trigger'));
 for(const id of ['image-model-trigger','image-aspect-ratio-trigger','image-resolution-trigger'])check(JSON.stringify(metrics(byId(id)))===JSON.stringify(base),'Picker scale: '+id);
 fits();
 click('model-trigger');await pause();const llm=popupFits();
 llm.scrollTop=36;await pause(1150);check(document.querySelector('.panel-picker-menu')===llm&&llm.scrollTop===36,'Polling must not remount or reset open model menu');
 const rect=llm.getBoundingClientRect(),imageRow=byId('image-settings').getBoundingClientRect();
 const x=Math.min(rect.right-5,Math.max(rect.left+5,imageRow.left+24)),y=imageRow.top+imageRow.height/2;
 check(y>=rect.top&&y<=rect.bottom&&llm.contains(document.elementFromPoint(x,y)),'LLM must overlay image settings');
 click('image-model-trigger');await pause();check(document.querySelectorAll('.panel-picker-menu').length===1,'Only one picker at a time');
 popupFits().querySelectorAll<HTMLButtonElement>('button')[1].click();await wait(()=>commands.some(c=>c.kind==='image-model'),'image model change');
 await wait(()=>!byId<HTMLButtonElement>('image-resolution-trigger').disabled,'setting completion');
 click('image-resolution-trigger');await pause();popupFits().querySelectorAll<HTMLButtonElement>('button')[2].click();await pause();
 check(commands.filter(c=>c.kind==='image-model').length===1&&commands.filter(c=>c.kind==='image-resolution').length===1,'Setting changes must dispatch once');
 click('model-trigger');await pause();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));check(!document.querySelector('.panel-picker-menu'),'Escape closes model menu');
 click('model-trigger');await pause();byId('input').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));check(!document.querySelector('.panel-picker-menu'),'Outside click closes model menu');
 state.imageQualityOptions=[{value:'high',label:'高质量'},{value:'standard',label:'标准'}];state.imageQuality='high';
 await wait(()=>!byId('image-quality-field').hidden,'quality capability');
 check(JSON.stringify(metrics(byId('image-quality-trigger')))===JSON.stringify(base),'Quality control uses same scale');
 click('image-quality-trigger');await pause();popupFits().querySelectorAll<HTMLButtonElement>('button')[1].click();await wait(()=>commands.some(c=>c.kind==='image-quality'),'quality change');
 state.imageQualityOptions=[];await wait(()=>byId('image-quality-field').hidden,'hide unsupported quality');
 click('reference-settings-toggle');check(!byId('reference-settings').hidden,'Reference controls expandable');
 await pause();fits();
 byId<HTMLInputElement>('mask').click();await wait(()=>commands.some(c=>c.kind==='mask-mode'),'mask change');await pause();
 check(byId<HTMLInputElement>('viewport').checked,'Mask retains required viewport context');
 const image=document.createElement('canvas');image.width=24;image.height=24;const context=image.getContext('2d')!;context.fillStyle='#b2b7bf';context.fillRect(0,0,24,24);
 const blob=await new Promise<Blob>(resolve=>image.toBlob(value=>resolve(value!),'image/png'));
 const transfer=new DataTransfer();transfer.items.add(new File([blob],'fixture.png',{type:'image/png'}));
 const fileInput=byId<HTMLInputElement>('local-image-input');fileInput.files=transfer.files;fileInput.dispatchEvent(new Event('change',{bubbles:true}));
 await wait(()=>!byId('local-image-list').hidden,'local thumbnail');check(byId('local-image-list').querySelector('img'),'local image retained');
 manyParts=true;await wait(()=>byId('parts-count').textContent==='12','bounded parts list');
 const input=byId<HTMLTextAreaElement>('input');input.value=Array.from({length:14},(_,i)=>`${i+1}. 参考图片创建真实几何，保留造型与分件。`).join('\n');input.dispatchEvent(new Event('input',{bubbles:true}));await pause();fits();
 if(input.scrollHeight>input.clientHeight+1)check(getComputedStyle(input).overflowY==='auto','Long draft must be scrollable after flex shrink');
 const expandedHeight=input.getBoundingClientRect().height;
 click('send');await wait(()=>commands.some(c=>c.kind==='send'),'send');
 const send=commands.find(c=>c.kind==='send')!;check(send.localImages?.length===1&&send.includeCanvasSelection&&send.includeViewport,'Same image/reference send contract');
 check(commands.filter(c=>c.kind==='send').length===1,'No duplicate sends');await wait(()=>input.value===''&&byId('local-image-list').hidden,'Accepted send clears text and images');
 state.busy=true;state.stoppable=true;await wait(()=>!byId('stop').hidden,'stop state');check(byId<HTMLButtonElement>('model-trigger').disabled,'Busy model disabled');
 state.busy=false;state.stoppable=false;await wait(()=>!byId<HTMLButtonElement>('model-trigger').disabled,'idle state');
 if(!byId('reference-settings').hidden)click('reference-settings-toggle');
 input.value='参考画布图片，保留外壳比例与结构，为当前模型生成一张效果图。';input.dispatchEvent(new Event('input',{bubbles:true}));await pause();fits();
 // Menu remains open at capture to visually inspect the compact toolbar/layering.
 click(innerWidth<400?'model-trigger':'image-model-trigger');await pause();popupFits();
 checkIcons();check(iconViolations.length===0,'CSP blocked an icon/image resource');
 await finish({pass:true,icons,iconViolations,width:innerWidth,height:innerHeight,theme:document.documentElement.dataset.theme,base,expandedHeight,
  checks:['icons paint under production img-src policy','all controls inside composer','desktop Chat control metrics','LLM above image settings','exclusive pickers','open menu survives catalog polling','escape/outside close','image model and resolution dispatch exactly once','local raster upload','reference/mask settings retained','quality capability retained','long input and many parts stay in viewport','send payload unchanged','busy/stop state'],commandKinds:commands.map(c=>c.kind)});
}
void run().catch(error=>finish({pass:false,error:String(error),iconViolations,commands:commands.map(c=>({kind:c.kind}))}));
