/** Synthetic UI only. No production DB, AI, actual Figma file or external service. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { ChatView, type ChatViewProps } from '../src/features/chat/components/ChatView';
import { makePrototypeFixture } from '../src/features/chat/prototypes/prototypeFixture';
import type { ChatMessage } from '../src/features/chat/model/chatTypes';
const doc=makePrototypeFixture();
const message:ChatMessage={id:'prototype-message',conversationId:'prototype-probe',role:'assistant',status:'completed',createdAt:1,content:'已生成可编辑的交互原型，支持页面、弹窗和 Tab 变体。',attachments:[],toolCalls:[{id:'prototype-call',messageId:'prototype-message',toolName:'create_ui_prototype',status:'completed',createdAt:1,argumentsJson:JSON.stringify({prototype:doc}),resultJson:JSON.stringify({files:[{id:'file',name:'交互原型.sketch',path:'synthetic-only.sketch',format:'sketch'}]})}]};
const wait=async(check:()=>boolean,label:string)=>{for(let i=0;i<100;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,50))}throw Error('Timeout '+label)};
const click=(selector:string)=>{const element=document.querySelector<HTMLButtonElement>(selector);if(!element)throw Error('Missing '+selector);element.click()};
let report:any;
window.addEventListener('message',event=>{const frame=document.querySelector('iframe');if(event.source===frame?.contentWindow&&event.data?.probe==='prototype')report=event.data;});
async function finish(result:Record<string,unknown>){document.querySelector('#results')!.textContent=JSON.stringify(result,null,2);if(isTauri())await invoke('chat_copy_generated_file',{result});}
async function run(){
 if(isTauri())await invoke('chat_create_file');
 await wait(()=>Boolean(document.querySelector('[title="预览交互原型"]')),'prototype file card');click('[title="预览交互原型"]');
 await wait(()=>Boolean(document.querySelector('iframe')),'preview');
 const exportButton=document.querySelector<HTMLButtonElement>('[aria-label="导出 Figma 设计文件"]')!;
 if(exportButton.disabled)throw Error('Prototype export was disabled');
 if(!document.body.textContent?.includes('不用安装插件')||!document.body.textContent?.includes('不转换为 Figma 原生变体'))throw Error('Missing direct import guide or conversion limits');
 const frame=document.querySelector('iframe')!;
 if(frame.sandbox.value!=='allow-scripts')throw Error('Sandbox changed');
 const harness=`<script>(()=>{const checks=[];const assert=(ok,name)=>{if(!ok)throw Error(name);checks.push(name)};const node=id=>document.querySelector('[data-node="'+id+'"]');const screen=id=>document.querySelector('[data-screen="'+id+'"]');const click=id=>node(id).click();setTimeout(()=>{try{
 assert(!screen('home').hidden,'start screen');assert(getComputedStyle(node('home-title')).fontSize==='26px','font styling preserved');assert(node('home-title').scrollHeight<=node('home-title').clientHeight,'title not clipped');click('home-detail');assert(!screen('detail').hidden&&screen('home').hidden,'page navigation');click('detail-order');assert(!screen('order').hidden,'third page');click('order-home');assert(!screen('home').hidden,'return navigation');
 click('tab-info-spec');assert(!document.querySelector('[data-state="tab-spec"]').hidden&&document.querySelector('[data-state="tab-info"]').hidden,'Tab state change');click('tab-spec-info');assert(!document.querySelector('[data-state="tab-info"]').hidden,'Tab reverse change');
 click('home-open');assert(!document.getElementById('prototype-overlay').hidden&&screen('dialog').parentElement.id==='prototype-overlay','open overlay');click('dialog-close');assert(document.getElementById('prototype-overlay').hidden&&screen('dialog').hidden,'close overlay');
 click('tab-info-spec');click('home-detail');click('detail-back');assert(!screen('home').hidden,'history back');assert(!document.querySelector('[data-state="tab-spec"]').hidden,'history preserves component state');click('tab-spec-info');let parentBlocked=false;try{parent.document.body.dataset.bad='x'}catch{parentBlocked=true}assert(parentBlocked,'parent DOM isolated');
 if(window.__TAURI_INTERNALS__)window.__TAURI_INTERNALS__.invoke('chat_create_file').catch(()=>{});
 parent.postMessage({probe:'prototype',pass:true,checks},'*');
 }catch(error){parent.postMessage({probe:'prototype',pass:false,error:String(error),checks},'*')}},80)})();<\/script>`;
 const source=frame.getAttribute('srcdoc')!;frame.srcdoc=source.replace('</body>',harness+'</body>');
 await wait(()=>Boolean(report),'interactive checks');
 if(!report.pass)throw Error(report.error);
 const panel=document.querySelector<HTMLElement>('.chat-html-preview')!;const box=panel.getBoundingClientRect();
 if(panel.scrollWidth>panel.clientWidth+1||box.right>innerWidth+1||box.left<0)throw Error('Preview controls overflow');
 await finish({pass:true,checks:[...report.checks,'prototype file card','Figma export available','native ACL blocks sandbox command','responsive controls'],layout:{width:innerWidth,panelWidth:box.width},screens:doc.screens.length,nodes:doc.nodes.length,interactions:doc.interactions.length});
}
function Probe(){
 const [closed,setClosed]=useState(false);const conversation={id:'prototype-probe',title:'制作可导入 Figma 的交互原型',model:'default',createdAt:1,updatedAt:1,archived:false};
 const runtime={messages:[message],activeConversationId:'prototype-probe',activeConversation:conversation,conversations:[conversation],loading:false,loadingOlder:false,hasMoreMessages:false,busy:false,stoppable:false,webSearchEnabled:false,newConversation:async()=>{},selectConversation:()=>{},deleteConversations:async()=>[],loadOlderMessages:async()=>{},resolveToolApproval:async()=>{},retryLast:async()=>{},stop:async()=>{},setWebSearchEnabled:()=>{},setConversationModel:async()=>true,sendMessage:async()=>false} as unknown as ChatViewProps['runtime'];
 useEffect(()=>{void run().catch(error=>finish({pass:false,error:String(error),report}));},[]);
 return <><div style={{padding:18,fontSize:12}}>Offline Figma prototype · production ChatView / renderer / sandbox</div><pre id="results" style={{position:'fixed',bottom:12,left:16,maxWidth:450,fontSize:10}}/>{!closed&&<ChatView runtime={runtime} variant="canvas" width={460} onClose={()=>setClosed(true)} selectedItems={[]} modelOptions={['default']} imageModel="" onImageModelChange={()=>{}} imageAspectRatio="1:1" onImageAspectRatioChange={()=>{}} imageResolution="1K" onImageResolutionChange={()=>{}}/>}</>;
}
createRoot(document.querySelector('#root')!).render(<Probe/>);
