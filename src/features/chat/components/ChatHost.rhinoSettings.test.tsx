import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({ states:[] as any[],cursor:0,bridge:vi.fn(),runtime:vi.fn() }));
vi.mock('react',async original=>({
  ...await original<typeof import('react')>(),
  useState:(initial:any)=>{const index=mocks.cursor++;if(index>=mocks.states.length)mocks.states[index]=typeof initial==='function'?initial():initial;
    return [mocks.states[index],(value:any)=>{mocks.states[index]=typeof value==='function'?value(mocks.states[index]):value;}];},
  useRef:(current:any)=>({current}),useEffect:()=>{},useCallback:(fn:any)=>fn,
}));
vi.mock('../../designMemory/navigation',()=>({useDesignMemoryConversationRequest:()=>null}));
vi.mock('../runtime/canvasChatVisibility',()=>({useCanvasChatVisibility:()=>false,setCanvasChatVisibility:vi.fn()}));
vi.mock('../runtime/canvasWorkflowProgress',()=>({useCanvasWorkflowProgress:()=>null,useCanvasWorkflowConversationRequest:()=>null}));
vi.mock('../runtime/useChatRuntime',()=>({useChatRuntime:mocks.runtime}));
vi.mock('../../cloudAccountContext',()=>({useCloudAccount:()=>({scheduleQuotaRefresh:vi.fn()})}));
vi.mock('./ChatView',()=>({ChatView:()=>null}));
vi.mock('../../rhino/useRhinoBridge',()=>({useRhinoBridge:mocks.bridge,withRhinoTools:(fn:any)=>fn,getRhinoTools:()=>[],assertRhinoResultTarget:()=>{}}));
import { ChatHost, type ChatHostProps } from './ChatHost';
const AUTO='__auto__';
const props=():ChatHostProps=>({visible:true,variant:'drawer',onClose:vi.fn(),selectedItems:[],model:'chat-model',imageModel:'desktop-model',runtimeImageModel:'desktop-model',
  imageModelOptions:[{value:AUTO,label:'Auto'},{value:'desktop-model',label:'Desktop A'},{value:'rhino-model',label:'Rhino B'}],
  runtimeImageModelOptions:[{value:'desktop-model',resolutions:['1K'],aspectRatios:['1:1']},{value:'rhino-model',resolutions:['2K','4K'],aspectRatios:['16:9'],aspectRatiosByResolution:{'4k':['4096x2304']},supportedQualities:['high','max']}],
  imageResolution:'1K',imageResolutionOptions:[{value:'1K',label:'1K'}],imageAspectRatio:'1:1',imageAspectRatioOptions:[{value:'1:1',label:'Square'}],
  onImageModelChange:vi.fn(),onImageResolutionChange:vi.fn(),onImageAspectRatioChange:vi.fn(),executeTool:vi.fn(),
});
const render=(p:ChatHostProps)=>{mocks.cursor=0;return ChatHost(p);};
beforeEach(()=>{mocks.states.length=0;mocks.cursor=0;vi.clearAllMocks();mocks.runtime.mockImplementation(()=>({loading:false,conversations:[],messages:[]}));});
describe('ChatHost Rhino image preference integration',()=>{
 it('lets Rhino select a different model and output settings without modifying desktop preferences',()=>{
  const p=props();render(p);
  let panel=mocks.bridge.mock.lastCall![0];
  expect(panel.imageModel).toBe(AUTO);
  expect(panel.imageModelOptions.map((v:any)=>v.value)).toContain('rhino-model');
  panel.onImageModelChange('rhino-model');render(p);
  panel=mocks.bridge.mock.lastCall![0];
  expect(panel.imageModel).toBe('rhino-model');
  expect(panel.imageResolutionOptions.map((v:any)=>v.value)).toEqual([AUTO,'2K','4K']);
  panel.onImageResolutionChange('4K');render(p);
  panel=mocks.bridge.mock.lastCall![0];
  expect(panel.imageAspectRatioOptions.map((v:any)=>v.value)).toEqual([AUTO,'4096x2304']);
  panel.onImageAspectRatioChange('4096x2304');panel.onImageQualityChange('max');render(p);
  const desktop=mocks.runtime.mock.calls[mocks.runtime.mock.calls.length-2]![0];
  const rhino=mocks.runtime.mock.calls[mocks.runtime.mock.calls.length-1]![0];
  expect(desktop).toMatchObject({conversationScope:'desktop',imageModel:'desktop-model',imageResolution:'1K',imageAspectRatio:'1:1'});
  expect(rhino).toMatchObject({conversationScope:'rhino',imageModel:'rhino-model',imageResolution:'4K',imageAspectRatio:'4096x2304',imageQuality:'max'});
  expect(p.onImageModelChange).not.toHaveBeenCalled();expect(p.onImageResolutionChange).not.toHaveBeenCalled();expect(p.onImageAspectRatioChange).not.toHaveBeenCalled();
 });
});
