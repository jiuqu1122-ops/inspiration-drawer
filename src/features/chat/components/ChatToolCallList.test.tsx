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
