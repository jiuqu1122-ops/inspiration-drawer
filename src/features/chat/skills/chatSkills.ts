import { createChatId } from '../model/chatTypes';

export type ChatSkill = {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  instructions: string;
  source: 'created' | 'imported';
  sourceFile?: string;
  sourceShareId?: string;
  conversionNotes: string[];
  updatedAt: number;
};

const SKILLS_KEY = 'drawer_chat_skills_v1';
const SELECTION_KEY = 'drawer_chat_skill_selection_v1';
export const CHAT_SKILLS_CHANGED_EVENT = 'drawer-chat-skills-changed';
export const MAX_SKILL_MARKDOWN_LENGTH = 40_000;
export const MAX_CHAT_SKILL_INSTRUCTION_LENGTH = 16_000;
const MAX_IMPORTED_BODY_LENGTH = 15_000;

const notifyChange = () => window.dispatchEvent(new Event(CHAT_SKILLS_CHANGED_EVENT));

export const loadChatSkills = (): ChatSkill[] => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SKILLS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is ChatSkill => (
      value && typeof value === 'object'
      && typeof value.id === 'string'
      && typeof value.name === 'string'
      && typeof value.instructions === 'string'
    )).map(value => ({
      ...value,
      description: typeof value.description === 'string' ? value.description : '',
      triggers: Array.isArray(value.triggers) ? value.triggers.filter(trigger => typeof trigger === 'string') : [],
      conversionNotes: Array.isArray(value.conversionNotes) ? value.conversionNotes.filter(note => typeof note === 'string') : [],
      sourceShareId: typeof value.sourceShareId === 'string' ? value.sourceShareId : undefined,
    }));
  } catch { return []; }
};

export const saveChatSkill = (skill: ChatSkill) => {
  const current = loadChatSkills();
  localStorage.setItem(SKILLS_KEY, JSON.stringify([
    skill,
    ...current.filter(item => item.id !== skill.id),
  ]));
  notifyChange();
};

export const importSharedChatSkill = (markdown: string, fileName: string, shareId: string): ChatSkill => {
  const existing = loadChatSkills().find(skill => skill.sourceShareId === shareId);
  if (existing) return existing;
  const skill = { ...importChatSkillMarkdown(markdown, fileName), sourceShareId: shareId };
  saveChatSkill(skill);
  return skill;
};

export const chatSkillToMarkdown = (skill: ChatSkill): string => {
  const frontmatterValue = (value: string) => value.replace(/[\r\n]+/g, ' ').trim();
  return [
    '---',
    `name: ${frontmatterValue(skill.name)}`,
    `description: ${frontmatterValue(skill.description)}`,
    `triggers: ${skill.triggers.map(frontmatterValue).join(', ')}`,
    '---',
    '',
    skill.instructions.trim(),
  ].join('\n');
};

export const removeChatSkill = (id: string) => {
  localStorage.setItem(SKILLS_KEY, JSON.stringify(loadChatSkills().filter(item => item.id !== id)));
  const selections = loadSelections();
  for (const [conversationId, selectedId] of Object.entries(selections)) {
    if (selectedId === id) delete selections[conversationId];
  }
  localStorage.setItem(SELECTION_KEY, JSON.stringify(selections));
  notifyChange();
};

const loadSelections = (): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(SELECTION_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
  } catch { return {}; }
};

export const getSelectedChatSkill = (conversationId: string): ChatSkill | undefined => {
  if (!conversationId) return undefined;
  const id = loadSelections()[conversationId];
  return loadChatSkills().find(skill => skill.id === id);
};

export const selectChatSkill = (conversationId: string, skillId: string | null) => {
  if (!conversationId) return;
  const selections = loadSelections();
  if (skillId) selections[conversationId] = skillId;
  else delete selections[conversationId];
  localStorage.setItem(SELECTION_KEY, JSON.stringify(selections));
  notifyChange();
};

const parseFrontmatter = (markdown: string) => {
  const match = markdown.match(/^\uFEFF?---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!match) return { metadata: {} as Record<string, string>, body: markdown.trim() };
  const metadata: Record<string, string> = {};
  const lines = match[1].split(/\r?\n/);
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const entry = line.match(/^([\w-]+):\s*(.*?)\s*$/);
    if (!entry) continue;
    let value = entry[2];
    if (/^[>|][-+]?\s*$/.test(value)) {
      const block: string[] = [];
      while (index + 1 < lines.length && /^\s+\S/.test(lines[index + 1])) {
        block.push(lines[++index].trim());
      }
      value = block.join(' ');
    }
    metadata[entry[1].toLowerCase()] = value.replace(/^["']|["']$/g, '');
  }
  return { metadata, body: markdown.slice(match[0].length).trim() };
};

export const importChatSkillMarkdown = (markdown: string, fileName: string): ChatSkill => {
  if (markdown.length > MAX_SKILL_MARKDOWN_LENGTH) throw new Error('Markdown 文件超过 40 KB，请精简后再导入。');
  const { metadata, body } = parseFrontmatter(markdown);
  if (!body) throw new Error('Markdown 文件没有可用的技能说明。');
  const title = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const name = (metadata.name || title || fileName.replace(/\.md$/i, '') || '未命名技能').slice(0, 80);
  const description = (metadata.description || body.replace(/^#.*$/m, '').trim().split(/\r?\n\s*\r?\n/)[0] || '').slice(0, 240);
  const triggers = (metadata.triggers || metadata.keywords || '').split(/[,，、]/).map(value => value.trim()).filter(Boolean).slice(0, 12);
  const conversionNotes: string[] = [];
  let adapted = body;
  const toolMappings: Array<[RegExp, string]> = [
    [/\bimage_gen(?:\.imagegen)?\b/g, 'generate_image'],
    [/\bweb(?:\.run|__run)\b/g, 'web_search'],
    [/\bcanvas_create_workflow\b/g, 'create_workflow'],
    [/\bcanvas_run_workflow\b/g, 'run_workflow'],
    [/\bcanvas_create_generator\b/g, 'create_canvas_generator'],
  ];
  for (const [pattern, replacement] of toolMappings) {
    if (pattern.test(adapted)) {
      adapted = adapted.replace(pattern, replacement);
      conversionNotes.push(`已将外部工具调用映射为 ${replacement}。`);
    }
  }
  const externalCode = /```(?:bash|sh|shell|powershell|ps1|python|javascript|typescript|node)\b[\s\S]*?```/gi;
  if (externalCode.test(adapted)) {
    adapted = adapted.replace(externalCode, '\n> 原技能中的脚本步骤需要改用当前 Chat/画布工具完成；无法直接运行该脚本。\n');
    conversionNotes.push('原文件包含脚本；已转换为画布工具适配提示，脚本本身不会运行。');
  }
  if (/(?:\b(?:scripts|references|assets)\/|\b(?:scripts|references|assets)\\|\]\(\.\/)/i.test(adapted)) {
    conversionNotes.push('原文件引用了其他文件；当前只导入此 Markdown，请在编辑器中补充所需内容。');
  }
  if (/\b(?:functions\.exec|exec_command|apply_patch|terminal|shell_command)\b/i.test(adapted)) {
    conversionNotes.push('原文件提到命令行或代码编辑工具；Chat 无法执行这些外部操作，会按现有功能处理。');
  }
  if (/\bcanvas_[a-z_]+\b/i.test(adapted)) {
    conversionNotes.push('原文件包含当前 Chat 没有直接开放的画布工具；请在编辑器中将相关步骤改写为现有画布或工作流操作。');
  }
  const instructions = [
    '## 灵感抽屉 Chat / 画布适配',
    '将下列方法用于回答和创作。涉及画布、素材、图片、视频或工作流时，只能使用当前 Chat 实际提供的工具；不要执行本地脚本、读取未导入的附件、调用外部插件或声称完成不支持的操作。遇到无法映射的步骤，说明限制并完成可以执行的部分。',
    '可用能力按实际显示的工具判断：画布读取与添加、素材搜索、图片生成与编辑、视频生成、工作流创建与运行、文件创建。把原技能的设计方法和输出要求应用于这些能力，缺少的功能不要假装已完成。',
    '',
    adapted.slice(0, MAX_IMPORTED_BODY_LENGTH),
  ].join('\n');
  if (adapted.length > MAX_IMPORTED_BODY_LENGTH) conversionNotes.push('内容较长，已截取前 15,000 字符用于技能指令。');
  return {
    id: createChatId('chat-skill'), name, description, triggers, instructions,
    source: 'imported', sourceFile: fileName, conversionNotes, updatedAt: Date.now(),
  };
};

export const createChatSkill = (name: string, description: string, instructions: string, triggers: string[], existing?: ChatSkill): ChatSkill => {
  const trimmedName = name.trim();
  const trimmedInstructions = instructions.trim();
  if (!trimmedName) throw new Error('请填写智能体名称。');
  if (!trimmedInstructions) throw new Error('请填写技能指令。');
  if (trimmedInstructions.length > MAX_CHAT_SKILL_INSTRUCTION_LENGTH) throw new Error('技能指令不能超过 16,000 字符。');
  return {
    id: existing?.id || createChatId('chat-skill'),
    name: trimmedName.slice(0, 80),
    description: description.trim().slice(0, 240),
    triggers: triggers.map(value => value.trim()).filter(Boolean).slice(0, 12),
    instructions: trimmedInstructions,
    source: existing?.source || 'created',
    sourceFile: existing?.sourceFile,
    sourceShareId: existing?.sourceShareId,
    conversionNotes: existing?.conversionNotes || [],
    updatedAt: Date.now(),
  };
};

const COMMON_TERMS = new Set(['智能体', '技能', '帮助', '可以', '用户', '画布', '内容', '使用', '进行', '完成', '创建', '生成', '设计', '图片', '工作', '需要']);
const textTerms = (value: string) => {
  const terms = new Set<string>();
  for (const word of value.toLowerCase().match(/[a-z][a-z0-9-]{2,}|[\u4e00-\u9fff]{2,}/g) || []) {
    if (/^[\u4e00-\u9fff]+$/.test(word)) {
      for (let size = 2; size <= Math.min(4, word.length); size++) {
        for (let start = 0; start <= word.length - size; start++) {
          const term = word.slice(start, start + size);
          if (!COMMON_TERMS.has(term)) terms.add(term);
        }
      }
    } else terms.add(word);
  }
  return terms;
};

export const suggestChatSkill = (message: string, skills: ChatSkill[]): ChatSkill | undefined => {
  const text = message.trim().toLowerCase();
  if (!text) return undefined;
  const messageTerms = textTerms(text);
  const ranked = skills.map(skill => {
    if (skill.name.length >= 2 && text.includes(skill.name.toLowerCase())) return { skill, score: 100 };
    const matchingTriggers = skill.triggers.filter(trigger => trigger.length >= 2 && text.includes(trigger.toLowerCase()));
    if (matchingTriggers.length) return { skill, score: 20 + matchingTriggers.length * 5 };
    const skillTerms = textTerms(`${skill.name} ${skill.description}`);
    const matches = [...skillTerms].filter(term => messageTerms.has(term));
    const longest = matches.reduce((length, term) => Math.max(length, term.length), 0);
    return { skill, score: matches.length >= 3 && longest >= 3 ? matches.length : 0 };
  }).sort((a, b) => b.score - a.score);
  if (!ranked[0]?.score || ranked[0].score === ranked[1]?.score) return undefined;
  return ranked[0].skill;
};
