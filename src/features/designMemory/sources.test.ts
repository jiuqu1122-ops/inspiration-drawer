import { describe, expect, it, vi } from 'vitest';
import type { InspirationProfile } from '../appAgent/inspirationMemory/types';
import type { ChatMessage, ChatSummary } from '../chat/model/chatTypes';
import { DesignMemoryClient } from './storage';
import {
  beginChatDesignSummaryMemory, beginDrawerImageMemory, buildChatSummaryMemory,
  buildDrawerImageMemory, buildExplicitChatDesignMemory, completeChatDesignSummaryMemory,
  designMemoryProjectId, isDesignMemoryTask, syncAnalyzedDrawerProfile,
} from './sources';

const message = (content: string, role: ChatMessage['role'] = 'user'): ChatMessage => ({
  id: 'user-message', conversationId: 'conversation-old', content, role,
  status: 'completed', createdAt: 1, attachments: [], toolCalls: [],
});
const profile: InspirationProfile = {
  itemId: 'image-1', summary: '金属磨砂耳机，圆润外壳', category: '耳机', objects: ['耳机'],
  form: { silhouette: ['圆润'], geometry: ['曲面'], proportion: [] },
  cmf: { colors: ['灰色'], materials: ['铝合金'], finishes: ['磨砂'] }, style: ['极简'],
  interaction: [], scene: ['桌面'], mood: [], userTags: ['参考'], userNotes: [], analyzedAt: '2026-10-29',
};
const summary: ChatSummary = {
  conversationId: 'conversation-old', summary: '讨论了耳机设计和金属工艺，助手提出方案但尚未确认。',
  throughMessageId: 'message-boundary', updatedAt: 2,
};

describe('attributed design memory sources without AI calls', () => {
  it('separates explicit long-term preferences from project requirements', () => {
    const preference = buildExplicitChatDesignMemory(message('记住，我长期喜欢金属磨砂设计'));
    expect(preference).toMatchObject({ scope: 'long-term', projectId: null, evidence: 'explicit-user-statement' });
    expect(preference?.attribution.messageIds).toEqual(['user-message']);
    const project = buildExplicitChatDesignMemory(message('本项目设计采用哑光金属材质'), { projectId: 'project-a', title: '耳机设计' });
    expect(project).toMatchObject({ scope: 'project', projectId: 'project-a' });
    expect(buildExplicitChatDesignMemory(message('请记住这个项目采用金属材质'))?.scope).toBe('project');
    expect(buildExplicitChatDesignMemory(message('我喜欢金属磨砂设计'))?.scope).toBe('long-term');
  });
  it('does not promote assistant proposals, questions, examples, or ordinary chat to facts', () => {
    expect(buildExplicitChatDesignMemory(message('记住我的设计偏好是金属', 'assistant'))).toBeNull();
    expect(buildExplicitChatDesignMemory(message('我希望采用金属设计，好吗？'))).toBeNull();
    expect(buildExplicitChatDesignMemory(message('假设我喜欢金属设计'))).toBeNull();
    expect(buildExplicitChatDesignMemory(message('他说我喜欢金属设计'))).toBeNull();
    expect(buildExplicitChatDesignMemory(message('你好'))).toBeNull();
    expect(buildExplicitChatDesignMemory(message('好的，方案二'))).toBeNull();
  });
  it('uses conversation isolation unless a stable shared project ID is explicitly supplied', () => {
    expect(designMemoryProjectId('a')).toBe('conversation:a');
    expect(designMemoryProjectId('b')).toBe('conversation:b');
    expect(designMemoryProjectId('a', 'headphones')).toBe('headphones');
    expect(buildExplicitChatDesignMemory(message('本项目采用金属设计'))?.projectId).toBe('conversation:conversation-old');
  });
  it('reuses known persisted summaries with attribution, never as accepted long-term facts', () => {
    const draft = buildChatSummaryMemory(summary, { title: '旧耳机项目', projectId: 'headphones' });
    expect(draft).toMatchObject({ id: 'chat-summary:conversation-old', scope: 'project', projectId: 'headphones', evidence: 'conversation-summary' });
    expect(draft?.attribution.throughMessageId).toBe('message-boundary');
    expect(buildChatSummaryMemory({ ...summary, throughMessageId: null }, {})).toBeNull();
    expect(buildChatSummaryMemory({ ...summary, summary: '聊了午饭吃什么' }, {})).toBeNull();
  });
  it('tolerates partial historical metadata without inventing analysis or crashing the importer', () => {
    const partial = { itemId: 'old-image', summary: '旧设计参考', analyzedAt: '2026-01-01',
      form: null, cmf: { colors: ['red', null, 8] }, aiTags: [null, { name: 'minimal' }],
    } as unknown as InspirationProfile;
    expect(buildDrawerImageMemory(partial)?.tags).toEqual(['red', 'minimal']);
    expect(buildDrawerImageMemory({ ...partial, summary: undefined } as unknown as InspirationProfile)).toBeNull();
  });
  it('indexes existing analyzed image features without inferring collecting means liking', () => {
    const draft = buildDrawerImageMemory(profile, { title: '耳机参考图' });
    expect(draft).toMatchObject({ sourceId: 'image-1', kind: 'drawer-image', evidence: 'analyzed-image' });
    expect(draft?.content).toContain('收藏不代表用户喜欢');
    expect(draft?.tags).toContain('铝合金');
    expect(draft?.attribution.analyzedAt).toBe(profile.analyzedAt);
    expect(JSON.stringify(draft)).not.toContain('data:image');
    expect(buildDrawerImageMemory({ ...profile, analyzedAt: undefined })).toBeNull();
  });
  it('keeps summary/image tickets from start through completion without reacquiring', async () => {
    let enabled = true;
    const commands: string[] = [];
    const client = new DesignMemoryClient(async <T,>(command: string, args?: Record<string, unknown>) => {
      commands.push(command);
      if (command === 'design_memory_get_settings') return {
        drawerImage: { enabled, generation: 1 }, chatDesign: { enabled, generation: 1 },
      } as T;
      if (command === 'design_memory_acquire_lease') return {
        kind: args?.kind, sourceId: args?.sourceId, generation: 1, sourceRevision: 1,
      } as T;
      if (command === 'design_memory_upsert') return { accepted: true, written: 1 } as T;
      throw new Error(command);
    });
    const ticket = await beginChatDesignSummaryMemory('conversation-old', [message('本项目采用金属设计')], client);
    expect(ticket).not.toBeNull();
    await completeChatDesignSummaryMemory(ticket, summary, {}, client);
    const imageTicket = await beginDrawerImageMemory('image-1', client);
    await syncAnalyzedDrawerProfile(imageTicket, profile, {}, client);
    expect(commands.filter(command => command === 'design_memory_acquire_lease')).toHaveLength(2);
    expect(commands.filter(command => command === 'design_memory_upsert')).toHaveLength(2);
    enabled = false; client.invalidate({ kinds: ['chat-design'], reason: 'settings' });
    await completeChatDesignSummaryMemory(ticket, summary, {}, client);
    expect(commands.filter(command => command === 'design_memory_upsert')).toHaveLength(2);
  });
  it('never starts memory work for non-design summaries', async () => {
    const acquire = vi.fn(); const client = { acquire } as unknown as DesignMemoryClient;
    expect(await beginChatDesignSummaryMemory('conversation', [message('周末吃什么')], client)).toBeNull();
    expect(acquire).not.toHaveBeenCalled();
    expect(isDesignMemoryTask('请设计一款耳机的 CMF')).toBe(true);
    expect(isDesignMemoryTask('你好')).toBe(false);
  });
});
