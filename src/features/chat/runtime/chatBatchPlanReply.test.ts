import { describe, expect, it } from 'vitest';
import {
  fallbackBatchPlanDecision,
  isBatchPlanCancellation,
  isBatchPlanConfirmation,
  parseBatchPlanDecision,
} from './chatBatchPlanReply';

describe('batch plan conversational reply', () => {
  it.each(['开始生成', '没问题，开始吧', '我觉得没问题，就这样做吧', '不需要修改', '不需要修改，开始生成', '就按这个方案执行', '确认']) (
    'recognizes confirmation: %s',
    value => expect(isBatchPlanConfirmation(value)).toBe(true),
  );

  it.each(['可以，但是改成英文', '不行，版式有问题', '不要标题', '修改一下比例', '不需要中文说明']) (
    'keeps revision requests out of confirmation: %s',
    value => expect(isBatchPlanConfirmation(value)).toBe(false),
  );

  it.each(['算了', '取消', '先不做了'])('recognizes cancellation: %s', value => {
    expect(isBatchPlanCancellation(value)).toBe(true);
    expect(isBatchPlanConfirmation(value)).toBe(false);
  });

  it('parses the model decision from plain or fenced JSON', () => {
    expect(parseBatchPlanDecision('{"action":"confirm"}')).toBe('confirm');
    expect(parseBatchPlanDecision('```json\n{"action":"revise"}\n```')).toBe('revise');
    expect(parseBatchPlanDecision('判断结果：{"action":"cancel"}')).toBe('cancel');
    expect(parseBatchPlanDecision('\u200B')).toBeNull();
  });

  it('keeps keyword matching as a safe fallback only', () => {
    expect(fallbackBatchPlanDecision('继续')).toBe('confirm');
    expect(fallbackBatchPlanDecision('标题改短一点')).toBe('revise');
  });
});
