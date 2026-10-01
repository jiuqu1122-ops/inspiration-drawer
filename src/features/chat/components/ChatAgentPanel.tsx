import { Check, FileUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import {
  createChatSkill,
  importChatSkillMarkdown,
  MAX_CHAT_SKILL_INSTRUCTION_LENGTH,
  MAX_SKILL_MARKDOWN_LENGTH,
  removeChatSkill,
  saveChatSkill,
  selectChatSkill,
  type ChatSkill,
} from '../skills/chatSkills';

type Editor = { id?: string; name: string; description: string; triggers: string; instructions: string };
const blankEditor = (): Editor => ({ name: '', description: '', triggers: '', instructions: '' });

export function ChatAgentPanel({
  conversationId, skills, selectedSkill, onClose, onChange,
}: {
  conversationId: string;
  skills: ChatSkill[];
  selectedSkill?: ChatSkill;
  onClose: () => void;
  onChange: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState('');
  const [importedSkillId, setImportedSkillId] = useState('');

  const edit = (skill: ChatSkill) => {
    setEditor({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      triggers: skill.triggers.join('，'),
      instructions: skill.instructions,
    });
    setError('');
  };
  const save = () => {
    if (!editor) return;
    try {
      const existing = skills.find(skill => skill.id === editor.id);
      const skill = createChatSkill(
        editor.name, editor.description, editor.instructions,
        editor.triggers.split(/[,，、\n]/), existing,
      );
      saveChatSkill(skill);
      setEditor(null);
      setImportedSkillId('');
      setError('');
      onChange();
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
  };
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      if (!/\.md$/i.test(file.name)) throw new Error('请选择 .md 格式的技能文件。');
      if (file.size > MAX_SKILL_MARKDOWN_LENGTH * 4) throw new Error('Markdown 文件过大，请精简后再导入。');
      const skill = importChatSkillMarkdown(await file.text(), file.name);
      saveChatSkill(skill);
      setImportedSkillId(skill.id);
      edit(skill);
      onChange();
    } catch (cause) { setError(String(cause instanceof Error ? cause.message : cause)); }
  };

  return <div className="chat-agent-panel" role="dialog" aria-label="智能体管理">
    <div className="chat-agent-panel__header">
      <div><strong>智能体</strong><small>在当前对话中选择，也可导入或创建技能</small></div>
      <button type="button" className="chat-icon-button" onClick={onClose} aria-label="关闭智能体面板"><X size={15} /></button>
    </div>
    <div className="chat-agent-panel__actions">
      <button type="button" onClick={() => { setEditor(blankEditor()); setError(''); }}><Plus size={13} />新建智能体</button>
      <button type="button" onClick={() => fileRef.current?.click()}><FileUp size={13} />导入 .md</button>
      <input ref={fileRef} type="file" accept=".md,text/markdown" hidden onChange={event => void importFile(event)} />
    </div>
    {error && <p className="chat-agent-panel__error" role="alert">{error}</p>}
    {importedSkillId && <p className="chat-agent-panel__notice" role="status">已按现有 Chat/画布能力适配导入内容。请检查转换提示，再编辑或启用。</p>}
    {editor ? <div className="chat-agent-panel__editor">
      <label>名称<input value={editor.name} maxLength={80} onChange={event => setEditor({ ...editor, name: event.target.value })} placeholder="例如：产品外观设计师" /></label>
      <label>适用场景<input value={editor.description} maxLength={240} onChange={event => setEditor({ ...editor, description: event.target.value })} placeholder="简单描述这个智能体负责什么" /></label>
      <label>触发关键词<small>用逗号隔开；Chat 会据此提示是否启用</small><input value={editor.triggers} onChange={event => setEditor({ ...editor, triggers: event.target.value })} placeholder="例如：产品外观，CMF，工业设计" /></label>
      {skills.find(skill => skill.id === editor.id)?.conversionNotes.map(note => <p className="chat-agent-panel__note" key={note}>{note}</p>)}
      <label>技能指令<textarea rows={12} maxLength={MAX_CHAT_SKILL_INSTRUCTION_LENGTH} value={editor.instructions} onChange={event => setEditor({ ...editor, instructions: event.target.value })} placeholder="写下角色、工作步骤、输出要求和画布使用方式" /></label>
      <div className="chat-agent-panel__editor-actions"><button type="button" onClick={() => { setEditor(null); setError(''); setImportedSkillId(''); }}>取消</button><button type="button" className="is-primary" onClick={save}>保存智能体</button></div>
    </div> : <div className="chat-agent-panel__list">
      <button type="button" className={`chat-agent-panel__item ${!selectedSkill ? 'is-selected' : ''}`} onClick={() => { selectChatSkill(conversationId, null); onChange(); onClose(); }}>
        <span><strong>通用 Chat</strong><small>不启用自定义智能体</small></span>{!selectedSkill && <Check size={14} />}
      </button>
      {skills.map(skill => <div className={`chat-agent-panel__item ${selectedSkill?.id === skill.id ? 'is-selected' : ''}`} key={skill.id}>
        <button type="button" className="chat-agent-panel__select" onClick={() => { selectChatSkill(conversationId, skill.id); onChange(); onClose(); }}>
          <strong>{skill.name}</strong><small>{skill.description || (skill.source === 'imported' ? `导入自 ${skill.sourceFile || 'Markdown'}` : '自定义智能体')}</small>
        </button>
        {selectedSkill?.id === skill.id && <Check size={13} />}
        <button type="button" className="chat-agent-panel__icon" onClick={() => edit(skill)} title="编辑智能体" aria-label={`编辑${skill.name}`}><Pencil size={12} /></button>
        <button type="button" className="chat-agent-panel__icon" onClick={() => setPendingDelete(skill.id)} title="删除智能体" aria-label={`删除${skill.name}`}><Trash2 size={12} /></button>
        {pendingDelete === skill.id && <div className="chat-agent-panel__delete"><span>删除“{skill.name}”？</span><button type="button" onClick={() => setPendingDelete('')}>取消</button><button type="button" onClick={() => { removeChatSkill(skill.id); setPendingDelete(''); onChange(); }}>删除</button></div>}
      </div>)}
      {skills.length === 0 && <p className="chat-agent-panel__empty">导入 SKILL.md，或创建一个自己的智能体。</p>}
    </div>}
  </div>;
}
