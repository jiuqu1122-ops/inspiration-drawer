import '../src/index.css';
/** Synthetic only: real ChatView + preview, no DB, credentials, AI or paid calls. */
import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { ChatView, type ChatViewProps } from '../src/features/chat/components/ChatView';
import type { ChatMessage } from '../src/features/chat/model/chatTypes';
const pause = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
const reports: Record<string, unknown>[] = [];
window.addEventListener('message', event => {
  const frame = document.querySelector('iframe[title="HTML 交互预览"]') as HTMLIFrameElement | null;
  if (event.source === frame?.contentWindow && event.data?.probe === 'html-canvas') reports.push(event.data);
});
const sample = (version: string) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>交互原型 ${version}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f7f5ef;color:#292b26;font:14px/1.6 system-ui}main{max-width:720px;margin:auto;padding:48px 30px}.eyebrow{font-size:11px;letter-spacing:3px;color:#8b906f}h1{font-size:38px;letter-spacing:-1px;line-height:1.2;font-weight:500;margin:18px 0}p{color:#74776c;max-width:440px}section{margin-top:32px;padding:24px;background:#fff;border:1px solid #e3e3d8;border-radius:14px}button{padding:10px 18px;border:0;border-radius:7px;background:#d9e8b6;color:#3a4a26;cursor:pointer;font:inherit}output{display:inline-block;min-width:48px;text-align:center;font-variant-numeric:tabular-nums;font-size:24px}small{color:#888}
</style></head><body><main><span class="eyebrow">INTERACTIVE / ${version}</span><h1>让想法，变得可触碰。</h1><p>这是一份真实运行的 HTML 原型。你可以点击按钮测试交互，在聊天里继续提出修改。</p><section><h3>产品数量</h3><button id="decrement">−</button><output id="count">0</output><button id="increment">+</button><p><small>安全隔离的本地预览 · 不连接后端</small></p></section><p id="security">正在检查安全边界…</p></main><script>
const runId = Math.random();
let value = 0;
const report = { probe: 'html-canvas', version: '${version}', runId };
try { parent.document.body.dataset.compromised = 'true'; report.parentBlocked = false; } catch { report.parentBlocked = true; }
try { localStorage.setItem('preview-leak','x'); report.storageBlocked = false; } catch { report.storageBlocked = true; }
report.nativeBridge = typeof window.__TAURI_INTERNALS__ !== 'undefined' || typeof window.ipc !== 'undefined';
try { if (window.__TAURI_INTERNALS__) window.__TAURI_INTERNALS__.invoke('chat_create_file').then(() => {report.invoked = true;send();}).catch(()=>{}); } catch {}
function send(){ parent.postMessage({...report, value}, '*'); }
document.getElementById('increment').onclick = () => { document.getElementById('count').textContent = ++value; send(); };
document.getElementById('decrement').onclick = () => { document.getElementById('count').textContent = --value; send(); };
document.getElementById('security').textContent = report.parentBlocked && report.storageBlocked ? '✓ 隔离检查通过' : '⚠ 隔离检查异常';
setTimeout(() => { document.getElementById('increment').click();send(); }, 50);
fetch('http://127.0.0.1:1468/SHOULD-NOT-LOAD').then(()=>{report.networkBlocked=false;send()}).catch(()=>{report.networkBlocked=true;send()});
</script></body></html>`;
const msg = (source: string, id='m', status: ChatMessage['status']='completed'): ChatMessage => ({id,conversationId:'probe-a',role:'assistant',content:'下面是可交互原型：\n\n```html\n'+source+'\n```',status,createdAt:1,attachments:[],toolCalls:[]});
const fileMessage = (version: string): ChatMessage => ({ ...msg('', 'm2'), content: '文件已生成，点击预览即可测试交互。', toolCalls: [{ id: 'file-call', messageId: 'm2', toolName: 'create_file', status: 'completed', createdAt: 2,
 argumentsJson: JSON.stringify({ fileName: '交互原型.html', format: 'html', content: sample(version) }),
 resultJson: JSON.stringify({ files: [{ id: 'f', name: '交互原型.html', format: 'html', path: 'synthetic-only.html' }] }),
}] });
const initial = msg(sample('A'));
let changeMessages: (messages: ChatMessage[]) => void;
let changeConversation: (id: string) => void;
const click = (selector:string) => { const element=document.querySelector<HTMLButtonElement>(selector); if(!element)throw Error('Missing control '+selector);element.click(); };
const waitFor = async (check:()=>boolean,label:string) => { for(let i=0;i<90;i++){if(check())return;await pause(50)}throw Error('Timeout: '+label); };
function Fixture(){
 const [messages,setMessages]=useState([initial]); const [conversationId,setConversation]=useState('probe-a'); const [notice,setNotice]=useState('Ready');
 changeMessages=setMessages;changeConversation=setConversation;
 const conversation={id:conversationId,title:'制作一个可点击的产品页',model:'default',createdAt:1,updatedAt:1,archived:false};
 const runtime={messages:conversationId==='probe-a'?messages:[],activeConversationId:conversationId,activeConversation:conversation,conversations:[conversation],loading:false,loadingOlder:false,hasMoreMessages:false,busy:false,stoppable:false,webSearchEnabled:false,
  newConversation:async()=>setConversation('probe-b'),selectConversation:setConversation,deleteConversations:async()=>[],loadOlderMessages:async()=>{},resolveToolApproval:async()=>{},retryLast:async()=>{},stop:async()=>{},setWebSearchEnabled:()=>{},setConversationModel:async()=>true,sendMessage:async()=>{setNotice('Probe: model requests are disabled');return false;}} as unknown as ChatViewProps['runtime'];
 useEffect(()=>{if(new URLSearchParams(location.search).has('autorun'))void runProbe().catch(error=>finish({pass:false,error:String(error),reports}));},[]);
 return <><div style={{padding:18,fontSize:12,display:'flex',gap:12,alignItems:'center'}}><b>HTML Canvas · isolated UI fixture</b><button onClick={()=>setMessages([msg(sample('B'))])}>更新原型 B</button><button onClick={()=>setConversation(conversationId==='probe-a'?'probe-b':'probe-a')}>切换对话</button><span>{notice}</span></div><pre id="probe-results" style={{position:'fixed',left:16,bottom:12,fontSize:10,maxHeight:180,overflow:'auto',maxWidth:500}} />
 <ChatView runtime={runtime} variant="canvas" width={460} onClose={()=>setNotice('关闭聊天')} selectedItems={[]} modelOptions={['default', 'claude-opus-5', 'gemini-4-argon', 'grok-4-6', 'gpt-6-1-terra', 'gemini-3-8-flash-high', 'gemini-3-7-flash', 'gpt-6-astra', 'gpt-6-1-sol']} imageModel="" imageModelOptions={[{value:'',label:'自动选择（推荐）',meta:'智能匹配'},...['Nano Banana 2.1','Nano Banana Pro','Gpt image 2.6 high','Gpt image 2.5','Gpt image 2.5 Medium','seedream-5.5','Long model label for ellipsis verification'].map(label=>({value:label,label,meta:'账号额度'}))]} onImageModelChange={()=>{}} imageAspectRatio="1:1" imageAspectRatioOptions={[{value:"1:1",label:"自动匹配"},...Array.from({length:14},(_,i)=>({value:String(i),label:`${i+1}:9`}))]} onImageAspectRatioChange={()=>{}} imageResolution="1K" imageResolutionOptions={[{value:"1K",label:"自动匹配"},{value:"2K",label:"2K"},{value:"4K",label:"4K"}]} onImageResolutionChange={()=>{}} />
 </>;
}
async function finish(result: Record<string,unknown>){document.getElementById('probe-results')!.textContent=JSON.stringify(result,null,2);document.body.dataset.probePass=String(result.pass);if(isTauri())await invoke('chat_copy_generated_file',{result});}
async function checkComposerPickers() {
 click('.chat-image-settings-toggle'); await pause(100);
 const llm = document.querySelector<HTMLButtonElement>('.chat-model-trigger')!;
 const images = Array.from(document.querySelectorAll<HTMLButtonElement>('.chat-image-setting-trigger'));
 const properties = ['fontSize','fontFamily','fontWeight','height','borderRadius','lineHeight'] as const;
 const visual = (element: Element) => Object.fromEntries(properties.map(key => [key, getComputedStyle(element)[key]]));
 const base = visual(llm);
 for (const trigger of images) if(JSON.stringify(visual(trigger))!==JSON.stringify(base))throw Error('Picker styles differ '+JSON.stringify({base,image:visual(trigger)}));
 const value = images[0].querySelector('.chat-image-setting-trigger__value')!;
 if(getComputedStyle(value).fontSize!==base.fontSize||getComputedStyle(value).fontWeight!==base.fontWeight)throw Error('Image model label overrides compact type');
 images[0].click(); await pause(100);
 const imageOption = document.querySelector<HTMLButtonElement>('.chat-image-setting-menu button')!;
 const imageOptionStyle = getComputedStyle(imageOption);
 const optionType = { fontSize:imageOptionStyle.fontSize,fontWeight:imageOptionStyle.fontWeight,minHeight:imageOptionStyle.minHeight };
 llm.click(); await pause(100);
 if(document.querySelector('.chat-image-setting-menu'))throw Error('Image menu remained open after LLM menu opened');
 const menu = document.querySelector<HTMLElement>('.chat-model-menu')!;
 const option = menu.querySelector('button')!;
 const style = getComputedStyle(option);
 if(JSON.stringify(optionType)!==JSON.stringify({fontSize:style.fontSize,fontWeight:style.fontWeight,minHeight:style.minHeight}))throw Error('Image and LLM options use different type/row scales');
 const rect=menu.getBoundingClientRect(), row=images[0].getBoundingClientRect();
 const x=Math.min(rect.right-8,Math.max(rect.left+8,row.left+12));
 const y=Math.min(rect.bottom-4,Math.max(rect.top+4,row.top+row.height/2));
 if(y<row.top||y>row.bottom)throw Error('Layer check did not overlap image-setting row');
 const hit=document.elementFromPoint(x,y);
 if(!hit||!menu.contains(hit))throw Error('LLM menu is behind image settings at overlap '+JSON.stringify({x,y,hit:hit?.className}));
 if(rect.left<0||rect.right>innerWidth+1||rect.top<0)throw Error('LLM picker escaped the viewport');
 for (const trigger of images) {
   trigger.click(); await pause(70);
   if(document.querySelector('.chat-model-menu'))throw Error('LLM menu remained open after image picker opened');
   const dropdown=document.querySelector<HTMLElement>('.chat-image-setting-menu')!;
   const box=dropdown.getBoundingClientRect();
   if(box.left<0||box.right>innerWidth+1||box.top<0)throw Error('Image picker escaped viewport');
 }
 window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); await pause(70);
 if(document.querySelector('.chat-image-setting-menu'))throw Error('Escape did not close picker');
 document.documentElement.classList.add('dark');
 for(const trigger of images)if(JSON.stringify(visual(trigger))!==JSON.stringify(visual(llm)))throw Error('Dark theme changed picker metrics');
 document.documentElement.classList.remove('dark');
 // Pointer events (rather than .click only) cover capture/outside-close ordering.
 llm.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); llm.click(); await pause(70);
 const menuToDismiss=document.querySelector('.chat-model-menu');
 if(!menuToDismiss)throw Error('LLM menu did not reopen');
 document.querySelector('textarea')!.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); await pause(70);
 if(document.querySelector('.chat-model-menu'))throw Error('Outside pointer did not dismiss LLM menu');
 click('.chat-image-settings-toggle'); await pause(70);
 return {base,optionType,layerHitTestPassed:true,mutualExclusionPassed:true,escapeAndOutsideClosePassed:true};
}
async function runProbe(){
 if(isTauri())await invoke('chat_create_file'); // trusted top-frame control must work once
 await waitFor(()=>Boolean(document.querySelector('[aria-label="打开 Canvas 预览"]')),'chat header');
 const composer=document.querySelector<HTMLTextAreaElement>('[data-chat-composer-input="true"]')!;
 const setValue=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;
 const setDraft=async(text:string)=>{setValue.call(composer,text);composer.dispatchEvent(new Event('input',{bubbles:true}));await pause(120);};
 const originalHeight=composer.getBoundingClientRect().height;
 const longDraft=Array.from({length:16},(_,i)=>`${i+1}. 本页面用于标准工作站相机与外参自动标定的完整流程，保留所有页面布局和交互。`).join('\n');
 await setDraft(longDraft);
 const expandedHeight=composer.getBoundingClientRect().height;
 if(expandedHeight<=originalHeight+40||composer.scrollHeight<=composer.clientHeight||getComputedStyle(composer).overflowY!=='auto')throw Error('Long composer draft did not grow/cap/scroll');
 await setDraft('短消息');
 const shrunkHeight=composer.getBoundingClientRect().height;
 if(shrunkHeight>=expandedHeight-30)throw Error('Composer did not shrink after shortening draft');
 await setDraft('');
 const composerLayout={originalHeight,expandedHeight,shrunkHeight};
 const pickerLayout=await checkComposerPickers();
 click('[aria-label="预览 HTML"]');
 await waitFor(()=>reports.some(r=>r.version==='A'&&r.networkBlocked&&r.value===1),'interactive initial document');
 const first=reports[reports.length-1];
 if(!first.parentBlocked||!first.storageBlocked||first.value!==1)throw Error('Isolation/interaction failed '+JSON.stringify(first));
 const frame=document.querySelector('iframe')!;if(frame.getAttribute('sandbox')!=='allow-scripts')throw Error('Wrong sandbox');
 const initialRuns=new Set(reports.map(r=>r.runId)).size;
 for(let i=0;i<28;i++){changeMessages([msg(sample('B')+`<!-- ${i} -->`,'m','streaming')]);await pause(80)}
 await waitFor(()=>reports.some(r=>r.version==='B'),'live tool/fence update while streaming');
 const streamingRuns=new Set(reports.map(r=>r.runId)).size-initialRuns;if(streamingRuns>4)throw Error('Too many frame reloads '+streamingRuns);
 changeMessages([msg(sample('B'))]);await pause(250);
 const stableRuns=new Set(reports.map(r=>r.runId)).size;
 click('[aria-label="切换手机宽度"]');await pause(200);
 if(new Set(reports.map(r=>r.runId)).size!==stableRuns)throw Error('Unchanged HTML lost interactive state');
 const auto=Array.from(document.querySelectorAll('label')).find(l=>l.textContent==='自动刷新')!.querySelector('input')!;auto.click();
 changeMessages([msg(sample('C'))]);await pause(1250);
 if(reports.some(r=>r.version==='C'))throw Error('Paused live update reloaded');
 click('[aria-label="刷新预览"]');await waitFor(()=>reports.some(r=>r.version==='C'),'manual refresh');
 auto.click();
 changeMessages([msg(sample('C')),fileMessage('D')]);await waitFor(()=>reports.some(r=>r.version==='D'),'follow-up revision');
 if(!document.querySelector('button[title="预览 HTML"]'))throw Error('Generated HTML file has no preview button');
 const select=document.querySelector<HTMLSelectElement>('[aria-label="HTML 版本"]')!;select.value=select.options[0].value;select.dispatchEvent(new Event('change',{bubbles:true}));await pause(150);
 changeMessages([msg(sample('C')),fileMessage('D'),msg(sample('E'),'m3')]);await pause(1250);
 if(reports.some(r=>r.version==='E'))throw Error('Pinned version unexpectedly followed latest');
 changeConversation('probe-b');await waitFor(()=>!document.querySelector('[aria-label="Canvas HTML 预览"]'),'conversation isolation');
 click('[aria-label="打开 Canvas 预览"]');await pause(100);
 if(document.querySelector('iframe'))throw Error('Previous conversation HTML leaked');
 click('[aria-label="关闭预览"]');changeConversation('probe-a');await pause(100);click('[aria-label="打开 Canvas 预览"]');await waitFor(()=>reports.some(r=>r.version==='E'),'reopen latest');
 const panel=document.querySelector<HTMLElement>('.chat-html-preview')!;const rect=panel.getBoundingClientRect();
 const layout={width:innerWidth,height:innerHeight,panelWidth:rect.width,panelRight:rect.right,overflow:panel.scrollWidth>panel.clientWidth+1};
 if(layout.overflow||rect.right>innerWidth+1||rect.left<0)throw Error('Layout overflow '+JSON.stringify(layout));
 await setDraft(longDraft);
 click('.chat-image-settings-toggle'); await pause(80);
 if(innerWidth<600) { click('[aria-label="关闭预览"]'); await pause(80); click('.chat-image-setting-trigger'); } else click('.chat-model-trigger');
 await pause(80);
 await finish({pass:true,composerLayout,pickerLayout,checks:['unified picker fonts/weights/heights','LLM menu above image settings (pixel hit test)','exclusive dropdowns and dismissal','light/dark picker metrics','composer grows for multiline/pasted text','composer caps with scrollbar','composer shrinks after clearing','inline JS interaction','parent DOM isolated','storage isolated','native IPC unavailable to sandbox (backend count)' ,'network blocked','streaming throttled','stable interaction','pause/manual refresh','follow-up revision','real file card preview','pin version','conversation isolation','responsive layout'],streamingRuns,layout,reports});
}
createRoot(document.getElementById('root')!).render(<Fixture/>);
