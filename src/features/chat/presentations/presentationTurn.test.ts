import { describe, expect, it } from 'vitest';
import type { ChatMessage, ChatToolCall } from '../model/chatTypes';
import { resolvePresentationTurnText, resolvePresentationToolChoice, needsPresentationDeliveryRecovery, mergePresentationToolCalls, validatePresentationImageCall, shouldContinuePresentationAfterMedia, presentationInterruptedMessage } from './presentationTurn';
const imageCall = (id = 'image-call', count = 1): ChatToolCall => ({ id, messageId: 'a', toolName: 'generate_image', argumentsJson: JSON.stringify({ count }), status: 'completed', createdAt: 1, resultJson: JSON.stringify({ media: [{ id: 'media-' + id, type: 'image', path: 'C:/fixture/image.png' }] }) });
const fileCall: ChatToolCall = { ...imageCall('file'), toolName: 'create_file', resultJson: JSON.stringify({ files: [{ id: 'file', path: 'C:/fixture/deck.pptx', name: 'deck.pptx', format: 'pptx' }] }) };
describe('AI illustrations are an intermediate step, not the PPT deliverable', () => {
  it('continues after a successful image and stops only after an actual pptx exists', () => {
    expect(shouldContinuePresentationAfterMedia('制作一份PPT', [imageCall()])).toBe(true);
    expect(shouldContinuePresentationAfterMedia('制作一份PPT', [imageCall(), fileCall])).toBe(false);
    expect(shouldContinuePresentationAfterMedia(null, [imageCall()])).toBe(false);
  });
  it('preserves earlier image results when the next round creates the PPT', () => {
    const old = imageCall(); const pending = { ...fileCall, status: 'running' as const };
    expect(mergePresentationToolCalls([old, pending], [fileCall])).toEqual([old, fileCall]);
    expect(mergePresentationToolCalls([old], [fileCall])).toEqual([old, fileCall]);
  });
  it('allows the model to request more than two calls/four illustrations without a deck-wide cap', () => {
    const prior = Array.from({ length: 30 }, (_, index) => imageCall(String(index), 4));
    expect(() => validatePresentationImageCall('制作产品展示PPT', 'generate_image', { count: 4 }, prior)).not.toThrow();
    expect(() => validatePresentationImageCall('制作PPT', 'generate_image_variants', { variants: [{}, {}, {}, {}] }, prior)).not.toThrow();
  });
  it('still blocks explicitly unwanted images regardless of past calls', () => {
    expect(() => validatePresentationImageCall('制作PPT，不要AI生图', 'generate_image', {}, [])).toThrow('不使用 AI 生图');
    expect(() => validatePresentationImageCall('做纯文字PPT', 'generate_image', {}, [])).toThrow();
  });
  it('never describes image-only progress as a finished PPT after interruption', () => {
    expect(presentationInterruptedMessage([imageCall()])).toContain('PPT 尚未生成可下载文件');
    expect(presentationInterruptedMessage([imageCall()])).toContain('1 张配图已保留');
  });
  it('handles a short explicit continuation without reviving an unrelated old PPT task', () => {
    const message = (content: string) => ({ role: 'user', content } as ChatMessage);
    expect(resolvePresentationTurnText('继续', [message('制作一个PPT')])).toContain('制作一个PPT');
    expect(resolvePresentationTurnText('继续', [message('制作一个PPT'), message('帮我生成一张海报')])).toBeNull();
    expect(resolvePresentationTurnText('今天吃什么', [message('制作一个PPT')])).toBeNull();
  });
});


describe('clarification content is not a product routing trigger', () => {
  it.each(['是模拟器', '是实车', '是医疗设备', '是咖啡机'])('does not hardcode %s as a PPT action', text => {
    const history = [{ role: 'user', content: '做一份产品调研PPT' } as ChatMessage];
    expect(resolvePresentationTurnText(text, history)).toBeNull();
  });
});


describe('presentation continuation across ordinary clarification exchanges', () => {
  const message = (role: 'user' | 'assistant', content: string) => ({ role, content } as ChatMessage);
  it.each(['模拟器', '实车', '医疗设备', '咖啡机', '成年人使用，12页', '不用AI生图'])('preserves the current conversation answer without a topic router: %s', answer => {
    const history = [message('user', '做一份产品设计调研PPT'),
      message('assistant', '请确认具体研究对象和使用场景？确认后制作可编辑PPTX。'),
      message('user', answer),
      message('assistant', '范围已明确，可以开始制作。')];
    const brief = resolvePresentationTurnText('开始做吧', history);
    expect(brief).toContain('做一份产品设计调研PPT');
    expect(brief).toContain(answer);
    expect(brief).toContain('开始做吧');
    expect(resolvePresentationTurnText(answer, history.slice(0, 2))).toBeNull();
  });
  it('uses only the user replies, never assistant guesses, as inherited requirements', () => {
    const history = [message('user', '做一份产品设计调研PPT'),
      message('assistant', '给成年人还是儿童使用？'), message('user', '成年人'),
      message('assistant', '我猜你要黑色，准备生成。')];
    const brief = resolvePresentationTurnText('开始做吧', history);
    expect(brief).toContain('成年人');
    expect(brief).not.toContain('黑色');
  });
  it('does not revive an old deck after cancellation or a different task', () => {
    const start = message('user', '做一份产品设计调研PPT');
    expect(resolvePresentationTurnText('开始做吧', [start, message('user', '先别制作PPT')])).toBeNull();
    expect(resolvePresentationTurnText('开始做吧', [start, message('user', '帮我写一封邮件')])).toBeNull();
    expect(resolvePresentationTurnText('继续', [start, message('user', '生成一张海报')])).toBeNull();
  });
});


describe('PPT file delivery enforcement without forcing an unclarified subject', () => {
  const turn = { requested: true, createFileAvailable: true, explicitExport: false, fileAttempts: 0, recoveryCount: 0 };
  it('allows the initial research/clarification round and forces explicit file delivery or one correction', () => {
    expect(resolvePresentationToolChoice(turn)).toBeUndefined();
    for (const override of [{ explicitExport: true }, { fileAttempts: 1 }, { recoveryCount: 1 }]) {
      expect(resolvePresentationToolChoice({ ...turn, ...override })).toEqual({ type: 'function', function: { name: 'create_file' } });
    }
    expect(resolvePresentationToolChoice({ ...turn, createFileAvailable: false, recoveryCount: 1 })).toBeUndefined();
    expect(resolvePresentationToolChoice({ ...turn, requested: false, explicitExport: true })).toBeUndefined();
  });
  it.each(['当前会话没有提供文件创建工具，我无法生成PPTX。', '本轮可调用工具只有联网搜索，没有文件创建或导出工具。', '以下是整理好的10页文字内容。', ''])('does not accept a text-only non-delivery as success: %s', content => {
    expect(needsPresentationDeliveryRecovery({ ...turn, content })).toBe(true);
  });
  it.each(['你说的对象是游戏外设还是实车方向盘？', '请确认受众和研究范围后再制作。', '请补充公司资料。'])('leaves an actual clarification as a conversation: %s', content => {
    expect(needsPresentationDeliveryRecovery({ ...turn, content })).toBe(false);
  });
  it('does not recover for ordinary chat or after file tool attempts are exhausted', () => {
    expect(needsPresentationDeliveryRecovery({ ...turn, requested: false, content: '你好' })).toBe(false);
    expect(needsPresentationDeliveryRecovery({ ...turn, createFileAvailable: false, content: '文件创建失败' })).toBe(false);
  });
});


describe('style revisions remain in the current PPT artifact context', () => {
  const user = (content: string) => ({ role: 'user', content } as ChatMessage);
  const assistant = (file = true) => ({ role: 'assistant', content: '已完成', toolCalls: file ? [fileCall] : [] } as ChatMessage);
  it.each(['换一种风格', '换成电影感风格', '改成黑白排版', '去掉蓝色，颜色更温暖'])('inherits only an immediately relevant deck for: %s', text => {
    expect(resolvePresentationTurnText(text, [user('做一份产品调研PPT'), assistant()])).toContain('做一份产品调研PPT');
    expect(resolvePresentationTurnText(text, [user('做一份产品调研PPT'), assistant(), user('帮我写一封邮件'), assistant(false)])).toBeNull();
    expect(resolvePresentationTurnText(text, [])).toBeNull();
  });
  it('does not turn a new image or poster request into another deck', () => {
    expect(resolvePresentationTurnText('生成一张电影感海报', [user('做一份产品调研PPT'), assistant()])).toBeNull();
  });
});
