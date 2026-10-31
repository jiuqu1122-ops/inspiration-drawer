import { describe, expect, it } from 'vitest';
import { preparePresentationFileRequest } from './preparePresentationRequest';
import type { ChatMessage, ChatToolExecutionContext } from '../model/chatTypes';
const attachment = { id: 'image-1', type: 'image' as const, path: 'C:/private/user.png', messageId: 'm', createdAt: 1 };
const context: ChatToolExecutionContext = { conversationId: 'current', messageId: 'assistant', userText: '做一份 PPT', recentMessages: [], currentUserAttachments: [attachment] };
const args = (imageAttachmentId: string | null = null) => ({ fileName: '方案.pptx', format: 'pptx', presentation: { title: '产品方案', slides: [{ title: '封面', imageAttachmentId, bullets: null }] } });
describe('presentation request binding', () => {
  it('keeps existing document generation unchanged', () => {
    const request = { fileName: '报告.docx', format: 'docx', content: '# Report' };
    expect(preparePresentationFileRequest(request, context)).toBe(request);
  });
  it('normalizes nullable bullets and uses only a supplied attachment ID, without sending paths', () => {
    const result = preparePresentationFileRequest(args('image-1'), context);
    expect(JSON.stringify(result)).not.toContain('C:/private');
    expect(result).toMatchObject({ format: 'pptx', presentation: { slides: [{ imageAttachmentId: 'image-1', bullets: [] }] } });
  });
  it('does not invent visuals when no images are supplied', () => {
    expect(preparePresentationFileRequest(args(), { ...context, currentUserAttachments: [] })).toMatchObject({ presentation: { slides: [{ imageAttachmentId: null }] } });
  });
  it.each(['../../secret.png', 'https://example.test/image.png', 'private-other-image'])('rejects unknown image reference %s', id => {
    expect(() => preparePresentationFileRequest(args(id), context)).toThrow('图片 ID 不在当前会话');
  });
  it('permits completed generated image IDs in this conversation, not other conversations', () => {
    const message = { conversationId: 'current', attachments: [], toolCalls: [{ toolName: 'generate_image', status: 'completed', resultJson: JSON.stringify({ media: [{ id: 'generated-1', type: 'image', path: 'C:/generated/result.png' }] }) }] } as unknown as ChatMessage;
    expect(preparePresentationFileRequest(args('generated-1'), { ...context, recentMessages: [message] })).toBeDefined();
    expect(() => preparePresentationFileRequest(args('generated-1'), { ...context, recentMessages: [{ ...message, conversationId: 'other' }] })).toThrow();
  });
  it('requires real slide structure, not a renamed text outline or an unbounded deck', () => {
    expect(() => preparePresentationFileRequest({ format: 'pptx', content: '# outline' }, context)).toThrow('slides');
    expect(() => preparePresentationFileRequest({ ...args(), presentation: { title: 'deck', slides: Array(41).fill({ title: 'x' }) } }, context)).toThrow('1～40');
  });
});


describe('presentation input safety and research condensation', () => {
  it('drops malformed decorative elements instead of failing the whole PPT', () => {
    const request = preparePresentationFileRequest({
      ...args(),
      presentation: {
        title: '产品方案',
        slides: [{ title: '封面', elements: [
          { kind: 'ellipse', x: 10, y: 10, width: Number.POSITIVE_INFINITY, height: 20 },
          { kind: 'rect', x: 20, y: 20, width: 30, height: 20 },
        ] }],
      },
    }, context);
    expect(request).toMatchObject({ presentation: { slides: [{ elements: [{ kind: 'rect', width: 30 }] }] } });
  });

  it('rejects uncondensed search dumps with an actionable correction', () => {
    const dump = `${'来源：'.repeat(3)} ${'结论和网页原文 '.repeat(180)} https://a.example.test https://b.example.test`;
    expect(() => preparePresentationFileRequest({
      ...args(),
      presentation: { title: '研究', slides: [{ title: '案例', body: dump }] },
    }, context)).toThrow('未提炼的检索原文');
  });
});


describe('presentation style normalization', () => {
  it('passes author decisions through and gives omitted legacy fields an undecorated fallback', () => {
    expect(preparePresentationFileRequest({ ...args(), presentation: { title: 'deck', designStyle: 'technical style', theme: 'warm', slides: [{ title: 'x' }] } }, context))
      .toMatchObject({ presentation: { designStyle: 'technical', theme: 'warm' } });
    expect(preparePresentationFileRequest(args(), context)).toMatchObject({ presentation: { designStyle: 'custom', theme: 'light' } });
    expect(() => preparePresentationFileRequest({ ...args(), presentation: { title: 'deck', designStyle: 'blueprint-dark', slides: [{ title: 'x' }] } }, context)).toThrow('designStyle');
  });
  it('leaves a valid custom canvas composition unchanged without adding titles or decoration', () => {
    const elements = [{ kind: 'text', x: 12, y: 72, width: 60, height: 15, text: 'Custom title', fontSize: 32, color: '#FFFFFF' }, { kind: 'rect', x: 0, y: 0, width: 100, height: 12, fill: '#C85335' }];
    const result = preparePresentationFileRequest({ ...args(), presentation: { title: 'deck', designStyle: 'custom', theme: 'dark', slides: [{ layout: 'canvas', title: 'Custom title', elements }] } }, context);
    expect(result).toMatchObject({ presentation: { designStyle: 'custom', theme: 'dark', slides: [{ layout: 'canvas', title: 'Custom title', elements }] } });
  });
  it('rejects an invisible title or silently discarded body in a freeform page', () => {
    const slide = { layout: 'canvas', title: 'Visible', elements: [{ kind: 'text', text: 'Other', color: '#111111', x: 5, y: 5, width: 60, height: 20 }] };
    expect(() => preparePresentationFileRequest({ ...args(), presentation: { title: 'deck', slides: [slide] } }, context)).toThrow('canvas');
    expect(() => preparePresentationFileRequest({ ...args(), presentation: { title: 'deck', slides: [{ ...slide, body: 'Do not lose me', elements: [{ ...slide.elements[0], text: 'Visible' }] }] } }, context)).toThrow('canvas');
  });
});


describe('generated visual binding', () => {
  it('does not attach an unselected historical generated image to the cover', () => {
    const message = { conversationId: 'current', attachments: [], toolCalls: [{ toolName: 'generate_image', status: 'completed', resultJson: JSON.stringify({ media: [{ id: 'generated-cover', type: 'image', path: 'C:/generated/cover.png' }] }) }] } as unknown as ChatMessage;
    const result = preparePresentationFileRequest(args(), { ...context, recentMessages: [message] });
    expect(result).toMatchObject({ presentation: { slides: [{ imageAttachmentId: null }] } });
  });
});


describe('presentation quality gate', () => {
  it('rejects duplicate continuation titles and fragment-only pages', () => {
    expect(() => preparePresentationFileRequest({
      ...args(), presentation: { title: 'deck', slides: [
        { title: '同一个结论', body: '完整内容' },
        { title: '同一个结论', body: '后半句' },
      ] },
    }, context)).toThrow('相同标题');
    expect(() => preparePresentationFileRequest({
      ...args(), presentation: { title: 'deck', slides: [
        { title: '结论', body: '完整内容' },
        { title: '新页', body: '；残句' },
      ] },
    }, context)).toThrow('残句');
  });
});
