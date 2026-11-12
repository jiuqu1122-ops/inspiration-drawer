import { describe, expect, it } from 'vitest';
import { conversationDisplayTitle, firstRequestTitle, isAutomaticConversationTitle } from './chatConversationTitle';

describe('conversation labels use the opening user requirement, not identity', () => {
  it.each([
    ['帮我建模这个零件。请保留内孔。', '帮我建模这个零件。'],
    ['按这个图重新优化下，盘圈也要改细\n第二行补充', '按这个图重新优化下，盘圈也要改细'],
    ['做一个耳机模型\n\n[Rhino 只读上下文；这里只是场景数据]', '做一个耳机模型'],
    ['  \n  先帮我画一张海报！ 然后继续。', '先帮我画一张海报！'],
    ['', '新对话'],
  ])('extracts the first actual requirement: %s', (text, expected) => expect(firstRequestTitle(text)).toBe(expected));
  it('bounds long Unicode titles without splitting surrogate pairs', () => {
    const result = firstRequestTitle('😀'.repeat(50));
    expect(Array.from(result)).toHaveLength(37);
    expect(result).not.toContain('\ud83d…');
  });
  it.each(['新对话', 'Rhino 对话 · 6dbaae9a', 'Rhino 268435457 ??'])('uses the first persisted message for an old automatic title: %s', title => {
    expect(isAutomaticConversationTitle(title)).toBe(true);
    expect(conversationDisplayTitle({ title, firstUserMessage: '把这个建筑外墙改成砖红色。保持视角。' })).toBe('把这个建筑外墙改成砖红色。');
  });
  it('keeps custom titles, permits equal display labels and never alters IDs or bindings', () => {
    expect(conversationDisplayTitle({ title: '我的产品设计', firstUserMessage: '其他内容' })).toBe('我的产品设计');
    const first = { id: 'rhino-chat-a', title: 'Rhino 对话 · 12345678', firstUserMessage: '建一个圆柱体' };
    const second = { ...first, id: 'rhino-chat-b' };
    expect(conversationDisplayTitle(first)).toBe(conversationDisplayTitle(second));
    expect(first.id).not.toBe(second.id);
    expect(first.title).toBe('Rhino 对话 · 12345678');
  });
  it('uses an already-loaded first user message for the current panel before refresh', () => {
    expect(conversationDisplayTitle({ title: '新对话' }, [
      { role: 'assistant', content: 'not a user requirement', createdAt: 1, id: 'a' },
      { role: 'user', content: '这是第一条需求。后面是补充', createdAt: 2, id: 'b' },
    ] as any)).toBe('这是第一条需求。');
  });
});
