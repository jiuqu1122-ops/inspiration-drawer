import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {captureHtmlDesign,HTML_DESIGN_CAPTURE_SCRIPT} from './htmlDesignCapture';
import {buildChatHtmlPreviewDocument,CHAT_HTML_PREVIEW_SANDBOX,CHAT_HTML_PREVIEW_CSP} from './chatHtmlPreviewDocument';
import {makePrototypeFixture} from '../prototypes/prototypeFixture';
let listener:(event:any)=>void;let source:{postMessage:ReturnType<typeof vi.fn>};let add:ReturnType<typeof vi.fn>;let remove:ReturnType<typeof vi.fn>;let requestId:string;
beforeEach(()=>{vi.useFakeTimers();source={postMessage:vi.fn((message)=>{requestId=message.id;})};add=vi.fn((_name,fn)=>{listener=fn;});remove=vi.fn();vi.stubGlobal('window',{addEventListener:add,removeEventListener:remove,setTimeout,clearTimeout});});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
const frame=()=>({contentWindow:source}) as any;
const response=(overrides:Record<string,unknown>={})=>({source,origin:'null',data:{channel:'drawer-static-design-v1',kind:'result',id:requestId,prototype:makePrototypeFixture(),warnings:['current static page only']},...overrides});
describe('static HTML export correlation and sandbox boundary',()=>{
 it('reads only the selected opaque-origin frame and validates data before saving',async()=>{
  const promise=captureHtmlDesign(frame());expect(source.postMessage).toHaveBeenCalledOnce();expect(requestId).toBeTruthy();
  listener(response());const value=await promise;expect(value.prototype).toEqual(makePrototypeFixture());expect(value.warnings).toEqual(['current static page only']);expect(remove).toHaveBeenCalledWith('message',expect.any(Function));
 });
 it('ignores wrong frame/origin/channel/request-id instead of accepting a forged export',async()=>{
  const promise=captureHtmlDesign(frame());let settled=false;void promise.then(()=>{settled=true;});
  listener(response({source:{}}));listener(response({origin:'https://evil.test'}));listener(response({data:{channel:'other',id:requestId,kind:'result'}}));listener(response({data:{channel:'drawer-static-design-v1',id:'wrong',kind:'result'}}));await Promise.resolve();expect(settled).toBe(false);
  listener(response());await promise;
 });
 it('rejects frame-provided code, arbitrary paths, invalid or oversized export data',async()=>{
  const promise=captureHtmlDesign(frame());const prototype={...makePrototypeFixture(),script:'tauri.invoke(...)'};listener(response({data:{channel:'drawer-static-design-v1',kind:'result',id:requestId,prototype}}));await expect(promise).rejects.toThrow('不支持字段');
 });
 it('times out and removes the response handler when capture does not answer',async()=>{
  const promise=captureHtmlDesign(frame());const assertion=expect(promise).rejects.toThrow('未响应');await vi.advanceTimersByTimeAsync(10000);await assertion;expect(remove).toHaveBeenCalled();
 });
 it('adds only fixed capture code inside the existing no-network/no-native sandbox',()=>{
  new Function(HTML_DESIGN_CAPTURE_SCRIPT);const page=buildChatHtmlPreviewDocument('<html><body>Design</body></html>');expect(page).toContain('drawer-static-design-v1');expect(page).not.toContain('__TAURI_INTERNALS__');expect(page).not.toContain('allow-same-origin');expect(CHAT_HTML_PREVIEW_SANDBOX).toBe('allow-scripts');expect(CHAT_HTML_PREVIEW_CSP).toContain("connect-src 'none'");expect(CHAT_HTML_PREVIEW_CSP).toContain("frame-src 'none'");
 });
});
