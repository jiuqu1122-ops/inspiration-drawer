import { describe, expect, it, vi } from 'vitest';
import { createChatImageSlots, executeChatImageOutputs, normalizeChatImageOutputCount } from './chatImageOutputOperation';

describe('bounded Chat image output jobs',()=>{
 it.each([6,10])('submits %i independent single-output jobs without relying on provider n',async count=>{
  const generate=vi.fn(async(_args:Record<string,unknown>)=>({media:[{id:String(generate.mock.calls.length),type:'image',path:'fixture.png'}]}));
  const result=await executeChatImageOutputs({args:{prompt:'fixture',count,referenceImages:['fixture-ref']},generate}) as any;
  expect(generate).toHaveBeenCalledTimes(count);expect(result.media).toHaveLength(count);expect(result.requestedCount).toBe(count);expect(result.partial).toBe(false);
  for(const [args] of generate.mock.calls) expect(args).toMatchObject({count:1,referenceImages:['fixture-ref']});
 });
 it('caps shared active image jobs at ten across concurrent calls',async()=>{
  const slot=createChatImageSlots();let active=0,max=0;const releases:Array<()=>void>=[];
  const jobs=Array.from({length:20},()=>slot(async()=>{active++;max=Math.max(max,active);await new Promise<void>(resolve=>releases.push(resolve));active--;return true;}));
  await vi.waitFor(()=>expect(releases).toHaveLength(10));
  while(releases.length) { const next=releases.splice(0);next.forEach(release=>release());await new Promise(resolve=>setTimeout(resolve,0)); }
  await Promise.all(jobs);expect(max).toBe(10);
 });
 it('keeps successes and exact errors without silently topping up paid failures',async()=>{
  let i=0;const generate=vi.fn(async()=>{if(i++===1)throw Error('429 fixture');return {media:[{id:String(i),path:'fixture.png',type:'image'}]};});
  const result=await executeChatImageOutputs({args:{count:6},generate}) as any;
  expect(generate).toHaveBeenCalledTimes(6);expect(result).toMatchObject({requestedCount:6,succeeded:5,failed:1,partial:true,ok:false});expect(result.failures[0].error).toBe('429 fixture');
 });
 it('does not submit any job when already cancelled',async()=>{
  const controller=new AbortController();controller.abort();const generate=vi.fn();
  const result=await executeChatImageOutputs({args:{count:6},signal:controller.signal,generate}) as any;
  expect(generate).not.toHaveBeenCalled();expect(result.cancelled).toBe(true);expect(result.media).toEqual([]);
 });
 it('rejects output counts over ten instead of silently truncating',()=>{
  expect(normalizeChatImageOutputCount(10)).toBe(10);expect(()=>normalizeChatImageOutputCount(11)).toThrow('10');expect(()=>normalizeChatImageOutputCount(Infinity)).toThrow();
 });
});
