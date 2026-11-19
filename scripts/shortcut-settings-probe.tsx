/** Production settings buttons, focus cleanup, recorder, native save and OS registration.
 * No app DB, external services, or user's production shortcut files.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { invoke } from '@tauri-apps/api/core';
import { DrawerHeaderAndSettings, type DrawerHeaderAndSettingsScope } from '../src/features/drawer/components/DrawerHeaderAndSettings';
import { AppFontSizeProvider } from '../src/features/preferences/AppFontSizeContext';
import { runCanvasInteractionsEffect04 } from '../src/features/canvas/controllers/canvasInteractionEffects';
import { runDrawerCoreEffect03 } from '../src/features/drawer/controllers/drawerCoreEffects';
import { handleRecordShortcutImpl } from '../src/features/snip/windowSnipActions';
import { queueShortcutTransition } from '../src/features/settings/shortcutRecording';
import '../src/index.css';
const phase=new URLSearchParams(location.search).get('phase')||'write';
const pause=(ms=70)=>new Promise(resolve=>setTimeout(resolve,ms));
const wait=async(test:()=>boolean,label:string)=>{for(let i=0;i<150;i++){if(test())return;await pause(40);}throw Error('Timeout: '+label);};
const check=(value:unknown,label:string)=>{if(!value)throw Error(label);};
const definitions=[
 ['shortcut','isRecording','setShortcut','setIsRecording','update-shortcut','Alt+G'],
 ['snipShortcut','isRecordingSnip','setSnipShortcut','setIsRecordingSnip','update-snip-shortcut','F1'],
 ['textShortcut','isRecordingText','setTextShortcut','setIsRecordingText','update-text-shortcut','Alt+T'],
 ['searchShortcut','isRecordingSearch','setSearchShortcut','setIsRecordingSearch','update-search-shortcut','Alt+S'],
 ['triggerShortcut','isRecordingTrigger','setTriggerShortcut','setIsRecordingTrigger','update-trigger-shortcut','Alt+Q'],
 ['noteShortcut','isRecordingNote','setNoteShortcut','setIsRecordingNote','update-note-shortcut','Alt+E'],
 ['canvasShortcut','isRecordingCanvas','setCanvasShortcut','setIsRecordingCanvas','update-canvas-shortcut','Alt+`'],
];
const defaults=definitions.map(item=>item[5]);
const expected=definitions.map((_,i)=>'Ctrl+Alt+Shift+F'+(13+i));
const messages:string[]=[];
let current={values:defaults,recording:definitions.map(()=>false),ready:false,hits:0};
let autoRun=async()=>{};
function Fixture(){
 const [values,setValues]=useState(defaults),[recording,setRecording]=useState(definitions.map(()=>false));
 const [ready,setReady]=useState(false),[toast,setToast]=useState(''),[hits,setHits]=useState(0);
 const isCanvasModeRef=useRef({current:phase!=='drawer'}).current;
 const stateRef=useRef({isAntiTouchMode:false,isOpen:true});
 const error=(message:string)=>{messages.push(message);setToast(message);};
 current={values,recording,ready,hits};
 useEffect(()=>{void Promise.all(definitions.map(item=>invoke<string>('get_shortcut',{name:item[4].replaceAll('-','_')}))).then(items=>{setValues(items);setReady(true);});},[]);
 useEffect(()=>runCanvasInteractionsEffect04({isCanvasModeRef}),[]);
 useEffect(()=>{
   if(!ready)return;
   const noop=()=>{};
   return runDrawerCoreEffect03({
    ...Object.fromEntries(definitions.map((item,index)=>[item[0],values[index]])),
    shortcutRecording:recording.some(Boolean),isCanvasModeRef,stateRef,licenseGateActiveRef:{current:false},
    setIsAntiTouchMode:()=>setHits(value=>value+1),createBlankFloatingNote:noop,enforceAntiTouchClosed:noop,
    enterCanvasMode:()=>setHits(value=>value+1),requestExitCanvasMode:()=>setHits(value=>value+1),markShortcutReveal:noop,
    searchInputRef:{current:null},setIsOpen:noop,setIsPinned:noop,setIsSearchActive:noop,setSearchQuery:noop,
    setShowFolderModal:noop,setShowSettings:noop,setShowTextInput:noop,setShowWebImageCollector:noop,
    showToast:error,startSnip:()=>setHits(value=>value+1),toggleTriggerMode:()=>setHits(value=>value+1),
   } as Parameters<typeof runDrawerCoreEffect03>[0]);
 },[ready,values,recording]);
 const scope:Record<string,unknown>={
  showSettings:true,activeSettingCategory:'shortcuts',isCanvasMode:phase!=='drawer',isCanvasWorkbenchActive:true,
  shouldShowLegacyAiSettings:()=>false,TABS:[],items:[],displayItems:[],folders:[],agentModels:[],drawerScopedItems:[],canvasSearchMediaResults:[],
  setCanvasSearchCandidateLimit:()=>{},setActiveSettingCategory:()=>{},appVersion:'ISOLATED TEST',
  setSearchQuery:()=>{},searchQuery:'',canvasSearchCandidateLimit:60,drawerAiAnalysisSummary:{analyzed:0,total:0},
  handleRecordShortcut:(event:React.KeyboardEvent,setter:(value:string)=>void,name:string)=>handleRecordShortcutImpl({onError:error},event,setter,name),
 };
 definitions.forEach((item,index)=>{
  scope[item[0]]=values[index];scope[item[1]]=recording[index];
  scope[item[2]]=(value:string)=>setValues(previous=>previous.map((v,i)=>i===index?value:v));
  scope[item[3]]=(value:boolean)=>setRecording(previous=>previous.map((v,i)=>i===index?value:v));
 });
 const fallback=new Proxy(scope,{get:(target,key)=>typeof key!=='string'?undefined:key in target?target[key]:key.startsWith('set')||key.startsWith('handle')?()=>{}:undefined});
 return <><DrawerHeaderAndSettings scope={fallback as DrawerHeaderAndSettingsScope}/>
 <section className="m-4 rounded-xl border p-4 text-sm" data-probe-info="true"><p>隔离验证：使用实际设置按钮 / 画布失焦逻辑 / 原生保存和注册；不读写用户配置。</p>
 <p role="status" data-probe-ready={String(ready)}>{toast||'点击任意快捷键，按新组合键；Esc 取消。'}</p><p>原生快捷键触发：<output id="native-hits">{hits}</output></p>
 <button type="button" id="run-checks" className="rounded border px-4 py-2" onClick={()=>void autoRun()}>运行完整检查</button></section></>;
}
createRoot(document.getElementById('root')!).render(<AppFontSizeProvider><Fixture/></AppFontSizeProvider>);
const buttons=()=>Array.from(document.querySelectorAll<HTMLButtonElement>('[data-shortcut-recording]'));
async function start(index:number){
 const button=buttons()[index];check(button,'Recorder '+index);
 button.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));button.click();
 await pause(90);check(button.dataset.shortcutRecording==='true','Click must stay in recording after RAF '+index);
 check(document.activeElement===button,'Recorder must retain keyboard focus '+index);return button;
}
// Unfocused, hidden WebView2 does not emit native blur/focusout. For automated
// cancel checks deliver its standard DOM event; the visible manual pass uses OS input.
function cancelFocus(button:HTMLButtonElement){button.blur();if(!document.hasFocus())button.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));}
function key(button:HTMLButtonElement,values:KeyboardEventInit){button.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,...values}));if(values.key==='Escape'&&!document.hasFocus())button.dispatchEvent(new FocusEvent('focusout',{bubbles:true}));}
async function finish(result:Record<string,unknown>){await queueShortcutTransition(async()=>{});await invoke('finish_shortcut_probe',{result});}
autoRun=async()=>{try{
 await wait(()=>current.ready,'initial shortcut config');check(buttons().length===7,'Seven real settings recorders');
 if(phase==='restart'){
  check(JSON.stringify(current.values)===JSON.stringify(expected),'All saved settings survive a process restart');
  await finish({pass:true,phase,values:current.values,checks:['fresh process reloads all seven saved native settings']});return;
 }
 await start(0);cancelFocus(buttons()[0]);await pause();check(!current.recording[0],'Click outside cancels');
 const esc=await start(0);key(esc,{key:'Escape',code:'Escape'});await pause();check(!current.recording[0],'Esc cancels');
 const conflict=await start(0);key(conflict,{key:'T',code:'KeyT',altKey:true});
 await wait(()=>messages.some(message=>message.includes('already assigned')),'native duplicate conflict');
 check(current.values[0]===defaults[0]&&current.recording[0],'Rejected duplicate preserves original and allows retry');
 key(conflict,{key:'Escape',code:'Escape'});await pause();
 for(let index=0;index<definitions.length;index++){
  const button=await start(index);
  key(button,{key:'F'+(13+index),code:'F'+(13+index),ctrlKey:true,altKey:true,shiftKey:true});
  await wait(()=>current.values[index]===expected[index]&&!current.recording[index],'save shortcut '+index);
  await queueShortcutTransition(async()=>{});
  const saved=await invoke('get_shortcut',{name:definitions[index][4]});check(saved===expected[index],'Native file saved '+index);
 }
 await pause();check(buttons().every(button=>button.dataset.shortcutRecording==='false'),'No stuck recording');
 await finish({pass:true,phase,values:current.values,checks:['actual DrawerHeaderAndSettings buttons','pointer-up + click + RAF focus regression','all seven keyboard recorders save through real native command','native duplicate rejects without replacing old value','Esc and blur cancel','real global shortcut effect resumes after recording'],messages});
 }catch(error){await finish({pass:false,phase,error:String(error),values:current.values,messages});}};
window.addEventListener('error',event=>{void finish({pass:false,phase,error:event.message});});
if(phase!=='manual')void pause(600).then(()=>autoRun());
