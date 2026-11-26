import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ChatToolCallList } from './ChatToolCallList';
import type { ChatToolCall } from '../model/chatTypes';
const call=(index:number,status:ChatToolCall['status']='completed'):ChatToolCall=>({id:'call-'+index,messageId:'assistant-test',toolName:index===0?'rhino_native_g1_solve_graph':'rhino_native_g1_describe_component',argumentsJson:'{}',resultJson:status==='error'?JSON.stringify({error:'fixture'}):'{}',status,createdAt:index});
describe('compact tool execution history',()=>{
 it('collapses even a single completed internal tool call by default',()=>{
  const html=renderToStaticMarkup(<ChatToolCallList messageId="m" calls={[call(0)]} onResolve={vi.fn()}/>);
  expect(html).toContain('aria-expanded="false"');expect(html).toContain('chat-tool-call-group');expect(html).not.toContain('chat-tool__summary');
 });
 it('keeps a single active tool call expanded while it is running',()=>{
  const html=renderToStaticMarkup(<ChatToolCallList messageId="m" calls={[call(0,'running')]} onResolve={vi.fn()}/>);
  expect(html).toContain('aria-expanded="true"');expect(html).toContain('chat-tool__summary');
 });
 it('collapses a short multi-step workflow into one compact row',()=>{
  const html=renderToStaticMarkup(<ChatToolCallList messageId="m" calls={[call(0),call(1)]} onResolve={vi.fn()}/>);
  expect(html).toContain('2');expect(html).toContain('aria-expanded="false"');expect(html).not.toContain('chat-tool__summary');
 });
 it('collapses long completed history but summarizes failures and keeps all records available',()=>{
  const html=renderToStaticMarkup(<ChatToolCallList messageId="m" calls={Array.from({length:29},(_,i)=>call(i,i===4?'error':'completed'))} onResolve={vi.fn()}/>);
  expect(html).toContain('29');expect(html).toContain('1');expect(html).toContain('aria-expanded="false"');
  expect(html).not.toContain('chat-tool__summary');
 });
 it('expands automatically while a native call is awaiting approval or running',()=>{
  for(const status of ['running','awaiting-approval'] as const){
   const html=renderToStaticMarkup(<ChatToolCallList messageId={status} calls={Array.from({length:6},(_,i)=>call(i,i===5?status:'completed'))} onResolve={vi.fn()}/>);
   expect(html).toContain('aria-expanded');expect(html).toContain('aria-expanded="true"');expect(html).toContain('chat-tool__summary');
  }
 });
 it('keeps pending native approvals visible and expanded',()=>{
  const approval={...call(0,'awaiting-approval'),toolName:'rhino_native_g1_apply_graph'};
  const html=renderToStaticMarkup(<ChatToolCallList messageId="m" calls={[approval,...Array.from({length:5},(_,i)=>call(i+1))]} onResolve={vi.fn()}/>);
  expect(html).toContain('aria-expanded="true"');expect(html).toContain('chat-tool__approval');
 });
});

describe('Rhino comparison steps in a long history', () => {
  const viewport = (index: number, toolName: string) => ({
    ...call(index), toolName, resultJson: JSON.stringify({ rhinoStepPreview: { version: 1, count: 1 } }),
  });
  it.each([false, true])('shows each comparison card once, without opening dozens of other rows (active=%s)', active => {
    const calls = Array.from({ length: 42 }, (_, index) => call(index));
    calls[2] = viewport(2, 'rhino_review_viewport');
    calls[28] = viewport(28, 'rhino_native_get_viewport_image');
    if (active) calls[41] = call(41, 'awaiting-approval');
    const html = renderToStaticMarkup(<ChatToolCallList messageId="m" calls={calls} onResolve={vi.fn()} />);
    expect(html.match(/class="chat-tool__summary"/g)).toHaveLength(active ? 3 : 2);
    expect(html.match(/对照 Rhino 视口与参考图/g)).toHaveLength(1);
    expect(html.match(/查看 Rhino 视口/g)).toHaveLength(1);
    expect(html.indexOf('对照 Rhino 视口与参考图')).toBeLessThan(html.indexOf('查看 Rhino 视口'));
    expect(html).toContain('查看全部 42 步');
    if (active) expect(html).toContain('允许');
  });

  it('keeps an unmarked viewport or unrelated result in ordinary collapsed history', () => {
    const calls = [{ ...call(0), toolName: 'rhino_review_viewport', resultJson: '{"viewportImageCount":2}' },
      viewport(1, 'rhino_native_g1_solve_graph')];
    const html = renderToStaticMarkup(<ChatToolCallList messageId="m" calls={calls} onResolve={vi.fn()} />);
    expect(html).not.toContain('chat-tool__summary');
    expect(html).not.toContain('查看全部');
  });
});
