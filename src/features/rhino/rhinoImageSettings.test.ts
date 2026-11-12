import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultRhinoImageSettings, readRhinoImageSettings, resolveRhinoImageSettings, RHINO_IMAGE_SETTINGS_KEY } from './rhinoImageSettings';
import { CHAT_AUTO_IMAGE_SETTING as AUTO } from '../chat/runtime/chatImageGenerationSettings';
const choices = [{value:AUTO,label:'Auto'},{value:'model-a',label:'Model A'},{value:'model-b',label:'Model B'}];
const profiles = [
  { value:'model-a',resolutions:['1K','2K'],aspectRatios:['1:1','16:9'],supportedQualities:[], supportsMask:false },
  { value:'model-b',resolutions:['2K','4K'],aspectRatios:['1:1','3:2'],aspectRatiosByResolution:{'2k':['2048x1152'],'4k':['4096x2304']},supportedQualities:['high','max'],supportsMask:true },
];
afterEach(()=>vi.unstubAllGlobals());
describe('independent Rhino image settings',()=>{
  it('can select any catalog model without an active desktop model',()=>{
    const result=resolveRhinoImageSettings({...defaultRhinoImageSettings,model:'model-b',resolution:'4K',aspectRatio:'4096x2304',quality:'max'},choices,profiles);
    expect(result).toMatchObject({model:'model-b',resolution:'4K',aspectRatio:'4096x2304',quality:'max'});
    expect(result.resolutionOptions.map(v=>v.value)).toEqual([AUTO,'2K','4K']);
    expect(result.aspectRatioOptions.map(v=>v.value)).toEqual([AUTO,'4096x2304']);
  });
  it('updates allowed dimensions after changing resolution or model',()=>{
    const result=resolveRhinoImageSettings({...defaultRhinoImageSettings,model:'model-b',resolution:'2K'},choices,profiles);
    expect(result.aspectRatioOptions.map(v=>v.value)).toEqual([AUTO,'2048x1152']);
    const next=resolveRhinoImageSettings({...defaultRhinoImageSettings,model:'model-a'},choices,profiles);
    expect(next.resolutionOptions.map(v=>v.value)).toEqual([AUTO,'1K','2K']);
    expect(next.qualityOptions).toEqual([]);
  });
  it('persists only the Rhino settings key, never reads the desktop choice',()=>{
    const getItem=vi.fn((key:string)=>key===RHINO_IMAGE_SETTINGS_KEY ? JSON.stringify({model:'model-b',resolution:'4K',aspectRatio:'3:2',quality:'max'}) : 'desktop-choice');
    vi.stubGlobal('localStorage',{getItem});
    expect(readRhinoImageSettings()).toMatchObject({model:'model-b',resolution:'4K',aspectRatio:'3:2',quality:'max'});
    expect(getItem).toHaveBeenCalledExactlyOnceWith(RHINO_IMAGE_SETTINGS_KEY);
  });
  it('retains an independent saved choice across temporary catalog absence',()=>{
    const saved={...defaultRhinoImageSettings,model:'model-b',resolution:'4K'};
    expect(resolveRhinoImageSettings(saved,[],[]).model).toBe(AUTO);
    expect(resolveRhinoImageSettings(saved,choices,profiles).model).toBe('model-b');
    expect(saved.resolution).toBe('4K');
  });
});
