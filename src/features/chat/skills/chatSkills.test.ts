import { afterEach, describe, expect, it, vi } from 'vitest';
import { chatSkillToMarkdown, createChatSkill, getSelectedChatSkill, importChatSkillMarkdown, importSharedChatSkill, loadChatSkills, removeChatSkill, saveChatSkill, selectChatSkill, suggestChatSkill } from './chatSkills';

afterEach(() => vi.unstubAllGlobals());

describe('Chat agents and Markdown skill conversion', () => {
  it('imports SKILL.md metadata and adapts external tool steps without claiming scripts can run', () => {
    const skill = importChatSkillMarkdown(`---
name: product-designer
description: >-
  用于工业设计和产品外观方案
triggers: 工业设计, CMF
---
# Product Designer

先使用 image_gen.imagegen 生成方案，再通过 web.run 查询参考。

\`\`\`python
print('external script')
\`\`\`

查看 references/checklist.md。`, 'SKILL.md');

    expect(skill.name).toBe('product-designer');
    expect(skill.description).toBe('用于工业设计和产品外观方案');
    expect(skill.triggers).toEqual(['工业设计', 'CMF']);
    expect(skill.instructions).toContain('generate_image');
    expect(skill.instructions).toContain('web_search');
    expect(skill.instructions).not.toContain("print('external script')");
    expect(skill.conversionNotes.some(note => note.includes('脚本'))).toBe(true);
    expect(skill.conversionNotes.some(note => note.includes('其他文件'))).toBe(true);
  });

  it('suggests a relevant agent, but avoids an ambiguous tie', () => {
    const product = createChatSkill('产品设计师', '负责工业设计和产品外观', '分析需求', ['产品外观']);
    const writing = createChatSkill('文案助手', '负责营销文案', '写文案', ['营销文案']);
    expect(suggestChatSkill('请帮我设计这个产品外观', [product, writing])?.id).toBe(product.id);
    expect(suggestChatSkill('你好', [product, writing])).toBeUndefined();
    expect(suggestChatSkill('请写营销文案', [writing, { ...writing, id: 'another' }])).toBeUndefined();
  });

  it('rejects empty or oversized imported skills', () => {
    expect(() => importChatSkillMarkdown('---\nname: empty\n---\n', 'SKILL.md')).toThrow();
    expect(() => importChatSkillMarkdown('a'.repeat(40_001), 'SKILL.md')).toThrow();
  });

  it('persists agents and their conversation selection, then clears selection on deletion', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    vi.stubGlobal('window', { dispatchEvent: () => true });
    const skill = createChatSkill('工业设计', '产品外观', '给出方案', ['外观']);
    saveChatSkill(skill);
    selectChatSkill('conversation-1', skill.id);
    expect(loadChatSkills()).toHaveLength(1);
    expect(getSelectedChatSkill('conversation-1')?.name).toBe('工业设计');
    removeChatSkill(skill.id);
    expect(loadChatSkills()).toEqual([]);
    expect(getSelectedChatSkill('conversation-1')).toBeUndefined();
  });

  it('adds a shared Markdown agent once and preserves its share identity after editing', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
    });
    vi.stubGlobal('window', { dispatchEvent: () => true });
    const markdown = '---\nname: 产品设计师\ndescription: 工业设计\n---\n# 产品设计师\n使用 image_gen.imagegen 创建设计方案。';
    const first = importSharedChatSkill(markdown, 'SKILL.md', 'share-1');
    const second = importSharedChatSkill(markdown, 'SKILL.md', 'share-1');
    expect(second.id).toBe(first.id);
    expect(loadChatSkills()).toHaveLength(1);
    expect(first.instructions).toContain('generate_image');
    expect(createChatSkill(first.name, first.description, first.instructions, first.triggers, first).sourceShareId).toBe('share-1');
    expect(importChatSkillMarkdown(chatSkillToMarkdown(first), 'shared.md').name).toBe(first.name);
  });
});
