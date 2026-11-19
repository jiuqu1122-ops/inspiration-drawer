import { describe,expect,it,vi } from 'vitest';
import { makePrototypeFixture } from './prototypeFixture';
import { parsePrototype } from './prototypeSchema';
import { applyPrototypeMotions } from './prototypeMotion';
import { renderPrototypeHtml } from './prototypeHtml';
import { buildPrototypeSketch } from './prototypeSketch';
import { getMessageHtmlArtifacts } from '../html/chatHtmlArtifacts';
import { getGeneratedFilesFromToolCall,type ChatMessage } from '../model/chatTypes';
import { createInspirationChatToolExecutor } from '../tools/inspirationChatToolExecutor';
import { routeChatToolCall } from '../tools/chatToolRouter';
import { compactChatToolResultForProvider } from '../tools/chatToolResult';
function rich(){const d=makePrototypeFixture();d.nodes[0].letterSpacing=-.4;d.nodes.push({id:'detail-vector',parentId:'home',kind:'vector',name:'Editable icon',x:20,y:10,width:24,height:24,fill:'transparent',stroke:'#223344',strokeWidth:2,points:[{x:0,y:.5},{x:.5,y:0,outX:.7,outY:.1},{x:1,y:1,inX:.8,inY:.9}],closed:false});const frame=d.nodes.find(n=>n.kind==='frame')!;frame.shadows=[{x:0,y:12,blur:28,spread:0,color:'#11223324'}];frame.gradient={fromX:0,fromY:0,toX:1,toY:0,stops:[{offset:0,color:'#ddeedd'},{offset:1,color:'#ffffff'}]};return d;}
describe('single design source for detailed Sketch and actual motion preview',()=>{
 it('preserves the exact static design and editable layers when only adding motion',()=>{
  const original=rich();const updated=applyPrototypeMotions(original,[{targetId:original.nodes[0].id,trigger:'enter',effect:'slide-up',duration:360},{targetId:'detail-vector',trigger:'hover',effect:'scale',duration:180}]);
  expect(updated.nodes).toEqual(original.nodes);expect(updated.screens).toEqual(original.screens);expect(updated.interactions).toEqual(original.interactions);expect(original).not.toHaveProperty('motions');
  expect(buildPrototypeSketch(updated).pages).toEqual(buildPrototypeSketch(original).pages);
  const html=renderPrototypeHtml(updated);expect(html).toContain('box-shadow:');expect(html).toContain('linear-gradient(');expect(html).toContain('letter-spacing:-0.4px');expect(html).toContain('<path d=');expect(html).toContain('el.animate(');expect(html).toContain('prefers-reduced-motion');expect(html).not.toContain('开发阶段实现');
 });
 it('exports shadows, alpha, gradients, tracking and vectors using the published Sketch data contract',()=>{
  const p=buildPrototypeSketch(rich());const all=(ls:any[]):any[]=>ls.flatMap(n=>[n,...(n.layers?all(n.layers):[])]);const nodes=p.pages.flatMap(p=>all(p.content.layers));
  expect(nodes.some(n=>n._class==='shapePath')).toBe(true);expect(nodes.some(n=>n.style?.shadows?.length>0)).toBe(true);expect(nodes.some(n=>n.style?.fills?.some((f:any)=>f.fillType===1&&f.gradient.stops.length===2))).toBe(true);expect(nodes.some(n=>n.attributedString?.attributes[0].attributes.kerning===-.4)).toBe(true);
 });
 it('merges by target and trigger and supports explicit removal without mutating static data',()=>{
  const source=rich(),targetId=source.nodes[0].id;const a=applyPrototypeMotions(source,[{targetId,trigger:'enter',effect:'fade',duration:200}]);
  const b=applyPrototypeMotions(a,[{targetId,trigger:'enter',effect:'slide-up',duration:300}]);expect(b.motions).toHaveLength(1);expect(b.motions![0].effect).toBe('slide-up');expect(applyPrototypeMotions(b,[],true).motions).toEqual([]);expect(b.nodes).toEqual(source.nodes);
 });
 it.each([{targetId:'missing',trigger:'enter',effect:'fade',duration:200},{targetId:'detail-vector',trigger:'enter',effect:'eval',duration:200},{targetId:'detail-vector',trigger:'enter',effect:'fade',duration:999999},{targetId:'detail-vector',trigger:'enter',effect:'count-up',duration:200}])('rejects invalid or executable motion before output: %j',motion=>{expect(()=>applyPrototypeMotions(rich(),[motion])).toThrow();});
 it('keeps text inert and rejects CSS/vector injections',()=>{
  const d=rich();d.nodes[0].text='</script><script>parent.BAD=1</script>';expect(renderPrototypeHtml(d)).not.toContain('<script>parent.BAD');
  const bad=rich();bad.nodes.find(n=>n.gradient)!.gradient!.stops[0].color='url(file:///secret)';expect(()=>parsePrototype(bad)).toThrow();
  const badPoint=rich();badPoint.nodes.find(n=>n.kind==='vector')!.points![0].x=99;expect(()=>parsePrototype(badPoint)).toThrow();
 });
 it('runs read→motion-only edit→real package output through the ordinary router without redrawing UI',async()=>{
  const source=rich();const existing={id:'old-sketch',name:'Design.sketch',path:'C:/fixture/design.sketch',format:'sketch'};
  const message={id:'old',conversationId:'c',role:'assistant',status:'completed',content:'',attachments:[],createdAt:1,toolCalls:[{id:'create',toolName:'create_ui_prototype',argumentsJson:JSON.stringify({prototype:source}),resultJson:JSON.stringify({files:[existing]}),status:'completed',messageId:'old',createdAt:1}]} as ChatMessage;
  const artifact=getMessageHtmlArtifacts(message)[0];const createPrototype=vi.fn(async(_value:unknown,_conversationId:string)=>({files:[{...existing,id:'new-sketch'}],prototype:{id:source.id,name:source.name,screens:source.screens.length,nodes:source.nodes.length,interactions:source.interactions.length}}));
  const executor=createInspirationChatToolExecutor({createPrototype,createFile:vi.fn(),generateMedia:vi.fn(),executeExistingTool:vi.fn(),listWorkflowDescriptors:()=>[],searchWeb:vi.fn()});
  const context={conversationId:'c',messageId:'new',userText:'Keep this exact design, add entrance motion',recentMessages:[message]};
  const read=await routeChatToolCall({name:'get_ui_prototype',args:{artifactId:artifact.id},context,executor});expect(read.result).toMatchObject({totalNodes:source.nodes.length});
  const result=await routeChatToolCall({name:'animate_ui_prototype',args:{artifactId:artifact.id,motions:[{targetId:source.nodes[0].id,trigger:'enter',effect:'fade',duration:240}]},context,executor});
  expect(createPrototype).toHaveBeenCalledOnce();expect(parsePrototype(createPrototype.mock.calls[0][0]).nodes).toEqual(source.nodes);expect(result.result).toMatchObject({staticDesignPreserved:true});
  const next={...message,id:'new',toolCalls:[{id:'motion',messageId:'new',toolName:'animate_ui_prototype',argumentsJson:'{}',resultJson:JSON.stringify(result.result),status:'completed',createdAt:2}]} as ChatMessage;
  expect(getGeneratedFilesFromToolCall(next.toolCalls[0])).toHaveLength(1);const animated=getMessageHtmlArtifacts(next)[0];expect(animated.prototype!.nodes).toEqual(source.nodes);expect(animated.source).toContain('el.animate');
  expect(compactChatToolResultForProvider('animate_ui_prototype',result.result)).not.toHaveProperty('prototypeDocument');
  await expect(routeChatToolCall({name:'animate_ui_prototype',args:{artifactId:artifact.id,motions:[]},context:{...context,conversationId:'other'},executor})).rejects.toThrow('当前对话');
 });
});
