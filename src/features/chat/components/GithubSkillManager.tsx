import { useEffect, useRef, useState } from 'react';
import { Download, Github, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { inspectGithubSkills, installGithubSkill, manageGithubSkill, refreshGithubSkills, type GithubSkillInspection, type GithubSkillPackage, type InstalledGithubSkill } from '../skills/githubSkillClient';
import { selectChatSkill } from '../skills/chatSkills';

export const compatibilityLabel = (level: string) => ({ chat_compatible: '可用于 Chat（工具仍需逐项校验）', methodology_only: '方法论可用，部分步骤不支持', dependencies_missing: '依赖缺失：脚本 / MCP 不可执行' })[level] || '兼容性未知';
export function GithubSkillDetails({ value }: { value: GithubSkillPackage }) {
  return <div className="github-skill-details">
    <strong>{value.name}</strong><p>{value.description || '仓库未提供技能说明'}</p>
    <dl><dt>来源</dt><dd>{value.repository}</dd><dt>目录</dt><dd>{value.directory || '（根目录）'}</dd>
      <dt>固定版本</dt><dd className="github-skill-commit">{value.commit}</dd><dt>原始 ref</dt><dd>{value.originalRef}</dd>
      <dt>文件</dt><dd>{value.files.length} 个 · {(value.totalBytes / 1024).toFixed(1)} KiB</dd>
      <dt>兼容性</dt><dd>{compatibilityLabel(value.compatibility.level)}</dd><dt>依赖线索</dt><dd>{value.compatibility.dependencies.join('、') || '未发现（不代表完全兼容）'}</dd>
      <dt>来源链接</dt><dd>{value.sourceUrl}</dd><dt>许可证</dt><dd>{value.license}</dd></dl>
    <p className="github-skill-risk">第三方低信任内容。兼容性分析不是安全审计。原始脚本会保存，但不会执行，也不会安装任何 MCP 或依赖。</p>
    <details><summary>完整文件清单与校验信息</summary><ul>{value.files.map(f => <li key={f.path}><code>{f.path}</code> · {f.size} B<small>{f.sha256 ? `SHA256 ${f.sha256}` : `Git blob ${f.blob}`}</small></li>)}</ul></details>
  </div>;
}
export function GithubSkillManager({ conversationId, selectedId, onChange }: { conversationId: string; selectedId?: string; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState(''); const [reference, setReference] = useState(''); const [directory, setDirectory] = useState('');
  const [list, setList] = useState<InstalledGithubSkill[]>([]);
  const [inspection, setInspection] = useState<GithubSkillInspection | null>(null);
  const [action, setAction] = useState<'install' | 'update'>('install');
  const [busy, setBusy] = useState(''); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [detail, setDetail] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { void refreshGithubSkills().then(setList).catch(e => setError(String(e))); return () => controller.current?.abort(); }, []);
  const run = async (label: string, fn: (signal: AbortSignal) => Promise<void>) => {
    controller.current?.abort(); const next = new AbortController(); controller.current = next;
    setBusy(label); setError(''); setNotice('');
    try { await fn(next.signal); }
    catch (e) { setError(String(e instanceof Error ? e.message : e)); }
    finally { if (controller.current === next) { controller.current = null; setBusy(''); } }
  };
  const refresh = async () => { setList(await refreshGithubSkills()); onChange(); };
  const check = () => run('正在解析 ref 并检查固定快照…', async signal => {
    setAction('install'); setInspection(null);
    setInspection(await inspectGithubSkills(url, reference.trim() || undefined, directory.trim() || undefined, signal));
  });
  const install = (p: GithubSkillPackage) => run('等待原生确认；确认后下载并逐文件校验…', async signal => {
    if (!inspection) return;
    try { await installGithubSkill(inspection.previewId, p.id, action, signal, progress => setBusy(`正在下载与校验 ${(progress.completed / 1024).toFixed(1)} / ${(progress.total / 1024).toFixed(1)} KiB`)); await refresh(); setNotice('已保存完整技能包。仅安装不会自动在当前对话启用。'); }
    finally { setInspection(null); } // Confirmation tokens are single-use, including denial/cancellation.
  });
  const manage = (p: InstalledGithubSkill, operation: 'enable' | 'disable' | 'rollback' | 'uninstall', version?: string) => run('等待确认并处理技能…', async signal => {
    await manageGithubSkill(p.package.id, operation, version, signal); await refresh(); setNotice('技能管理操作已完成。');
  });
  const update = (p: InstalledGithubSkill) => run('正在检查更新，不会静默替换…', async signal => {
    const result = await inspectGithubSkills(`https://github.com/${p.package.repository}`, p.package.originalRef, p.package.directory, signal);
    if (result.commit === p.package.commit) { setInspection(null); setNotice('当前已是该 ref 的最新版本。固定 commit ref 不会跟随分支更新。'); return; }
    setAction('update'); setInspection(result); setOpen(true);
  });
  return <section className="github-skills" aria-label="GitHub 技能管理">
    <div className="github-skills__heading"><span><Github size={14} />GitHub Skills</span><button type="button" disabled={!!busy} onClick={() => setOpen(v => !v)}><Download size={12} />从 GitHub 安装</button></div>
    {open && <div className="github-skills__source">
      <label>公开仓库或技能目录链接<input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://github.com/owner/repo" disabled={!!busy} /></label>
      <div className="github-skills__fields"><label>ref（可选）<input value={reference} onChange={e => setReference(e.target.value)} placeholder="默认分支 / feature/a / tag / commit" disabled={!!busy} /></label><label>技能目录（可选）<input value={directory} onChange={e => setDirectory(e.target.value)} placeholder="skills/example" disabled={!!busy} /></label></div>
      <small>不需要 Git 或 Token。歧义链接请用仓库根链接和明确 ref；不假定默认分支名。</small>
      <button className="is-primary" type="button" disabled={!!busy || !url.trim()} onClick={() => void check()}>检查仓库</button>
    </div>}
    {busy && <div className="github-skills__status" role="status"><LoaderCircle size={13} className="chat-spin" /><span>{busy}</span><button type="button" onClick={() => controller.current?.abort()}><X size={12} />取消</button></div>}
    {error && <p className="chat-agent-panel__error" role="alert">{error}</p>}
    {notice && <p className="chat-agent-panel__notice" role="status">{notice}</p>}
    {inspection && <div className="github-skills__candidates"><div className="github-skills__heading"><strong>{action === 'update' ? '更新预览' : '选择要安装的技能'}</strong><button type="button" disabled={!!busy} onClick={() => setInspection(null)}>关闭</button></div>
      <small>检查有效期 15 分钟；确认、下载绑定同一固定 commit。</small>
      {inspection.candidates.map(p => {
        const previous = list.find(s => s.package.id === p.id)?.package;
        const changed = previous && p.files.filter(f => !previous.files.some(old => old.path === f.path && old.blob === f.blob)).length;
        return <article className="github-skills__candidate" key={p.id}><GithubSkillDetails value={p} />
          {action === 'update' && previous && <p>旧版本 {previous.commit.slice(0, 12)} → {p.commit.slice(0, 12)}；新增/改动 {changed} 个，删除 {previous.files.filter(f => !p.files.some(n => n.path === f.path)).length} 个文件。旧版保留可回退。</p>}
          <button type="button" className="is-primary" disabled={!!busy} onClick={() => void install(p)}>{action === 'update' ? '确认更新…' : '确认安装…'}</button></article>;
      })}</div>}
    <div className="github-skills__installed"><strong>已安装（{list.length}）</strong>
      {!list.length && <p className="chat-agent-panel__empty">尚未安装 GitHub 技能。也可在 Chat 中让 AI 帮你寻找并检查。</p>}
      {list.map(p => <article className="github-skills__installed-item" key={p.package.id}>
        <button className="github-skills__title" type="button" onClick={() => setDetail(v => v === p.package.id ? '' : p.package.id)}><strong>{p.package.name}</strong><small>{p.enabled ? '已启用' : '已禁用'} · {p.package.commit.slice(0, 12)}{selectedId === p.package.id ? ' · 本会话选用' : ''}</small></button>
        <small>{p.package.repository} / {p.package.directory || '根目录'} · {compatibilityLabel(p.package.compatibility.level)}</small>
        <div className="github-skills__buttons"><button type="button" disabled={!!busy || !p.enabled} onClick={() => { selectChatSkill(conversationId, p.package.id); onChange(); }}>本会话使用</button>
          <button type="button" disabled={!!busy} onClick={() => void manage(p, p.enabled ? 'disable' : 'enable')}>{p.enabled ? '禁用' : '启用'}</button>
          <button type="button" disabled={!!busy} onClick={() => void update(p)}><RefreshCw size={11} />检查更新</button>
          <button type="button" disabled={!!busy} onClick={() => void manage(p, 'uninstall')}>卸载…</button></div>
        {detail === p.package.id && <><GithubSkillDetails value={p.package} /><small>安装时间：{new Date(p.package.installedAt).toLocaleString()}</small>{p.versions.filter(v => v !== p.package.commit).map(v => <button key={v} type="button" disabled={!!busy} onClick={() => void manage(p, 'rollback', v)}>回退到 {v.slice(0, 12)}…</button>)}</>}
      </article>)}
    </div>
  </section>;
}
