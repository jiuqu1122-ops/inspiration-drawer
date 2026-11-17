/** Isolated production ChatComposer + CSS. No App, DB, credentials, model calls or paid operations. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../src/features/chat/components/chat.css';
import { ChatComposer } from '../src/features/chat/components/ChatComposer';
const params=new URLSearchParams(location.search);
const mask=params.get('mask')==='1';
const dark=params.get('dark')==='1';
const widths=[300,360,520,640];
function Fixture({width}:{width:number}){
 const [model,setModel]=useState('nano');const [ratio,setRatio]=useState('16:9');const [resolution,setResolution]=useState('2K');const [quality,setQuality]=useState('high');const [maskMode,setMaskMode]=useState<'off'|'on'>('off');
 return <section data-probe-case={width} className={`chat-shell chat-shell--drawer ${dark?'is-dark':''}`} style={{position:'relative',left:'auto',right:'auto',bottom:'auto',height:'auto',display:'block',width,boxSizing:'border-box',margin:0,flex:'0 0 auto',padding:10}}>
 <div style={{fontSize:12,marginBottom:10}}>{width}px / {mask?'quality + mask':'unsupported mask notice'} / {dark?'dark':'light'}</div>
 <ChatComposer value="" onChange={()=>{}} attachments={[]} onAttachmentsChange={()=>{}} onSend={()=>{throw new Error('AI disabled in fixture')}} onStop={()=>{}} busy={false} stoppable={false} model="gpt-6-1-sol" modelOptions={['gpt-6-1-sol']} onModelChange={()=>{}}
 imageModel={model} imageModelOptions={[{value:'nano',label:'Nano Banana 2.1',supportsMask:mask},{value:'gpt',label:'Gpt image 2.6 high / long server model label',supportsMask:mask}]} onImageModelChange={setModel}
 imageAspectRatio={ratio} imageAspectRatioOptions={[{value:'1:1',label:'1:1'},{value:'16:9',label:'2048\u00d71152 (16:9)'},{value:'3:2',label:'2048\u00d71365 (3:2)'}]} onImageAspectRatioChange={setRatio}
 imageResolution={resolution} imageResolutionOptions={[{value:'1K',label:'1K'},{value:'2K',label:'2K'},{value:'4K',label:'4K'}]} onImageResolutionChange={setResolution}
 imageQuality={quality} imageQualityOptions={mask?[{value:'high',label:'high'},{value:'max',label:'max'}]:[]} onImageQualityChange={setQuality}
 imageMaskMode={maskMode} onImageMaskModeChange={setMaskMode} webSearchEnabled={false} onWebSearchEnabledChange={()=>{}} />
 </section>;
}
function metrics(){
 const reports=Array.from(document.querySelectorAll<HTMLElement>('[data-probe-case]')).map(root=>{
  const panel=root.querySelector<HTMLElement>('.chat-image-settings')!;const controls=panel?.querySelector<HTMLElement>('.chat-image-settings__controls');
  const rect=panel?.getBoundingClientRect();const buttons=Array.from(panel?.querySelectorAll<HTMLElement>('.chat-image-setting-trigger')||[]);const faults:string[]=[];
  if(!rect||!controls) faults.push('settings panel not open');
  for(let i=0;i<buttons.length;i++){
   const r=buttons[i].getBoundingClientRect();
   if(r.width<90||r.height<28) faults.push(`collapsed button ${i}`);
   if(r.left<rect.left-1||r.right>rect.right+1) faults.push(`button overflow ${i}`);
   for(let j=0;j<i;j++){const b=buttons[j].getBoundingClientRect();if(Math.min(r.right,b.right)-Math.max(r.left,b.left)>1 && Math.min(r.bottom,b.bottom)-Math.max(r.top,b.top)>1)faults.push(`overlap ${j}/${i}`);}
  }
  const note=panel?.querySelector('.chat-image-settings__mask-note');
  if(note&&controls&&note.getBoundingClientRect().top<controls.getBoundingClientRect().bottom-1)faults.push('notice shares controls row');
  if(panel&&panel.scrollWidth>panel.clientWidth+1)faults.push('panel horizontal overflow');
  return {width:root.dataset.probeCase,buttons:buttons.length,controlsDisplay:controls?getComputedStyle(controls).display:'missing',faults};
 });
 const pass=reports.every(r=>r.faults.length===0);
 const output=document.getElementById('results')!;output.textContent=JSON.stringify({pass,reports},null,2);output.dataset.pass=String(pass);
}
function Probe(){
 useEffect(()=>{requestAnimationFrame(()=>{document.querySelectorAll<HTMLButtonElement>('.chat-image-settings-toggle').forEach(button=>button.click());setTimeout(metrics,100);});},[]);
 return <><h2 style={{fontSize:16}}>Production Chat image settings: layout regression</h2><div style={{display:'flex',gap:16,alignItems:'start'}}>{widths.map(width=><Fixture key={width} width={width}/>)}</div><pre id="results">Waiting for paint...</pre></>;
}
createRoot(document.getElementById('root')!).render(<Probe/>);
