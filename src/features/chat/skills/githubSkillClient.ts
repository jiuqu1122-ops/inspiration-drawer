import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { createChatId } from '../model/chatTypes';
import { clearChatSkillSelections, getSelectedChatSkill, selectChatSkill, setGithubChatSkills, type ChatSkill } from './chatSkills';

export const GITHUB_SKILL_CONTEXT_BUDGET = 40_000;
export type SkillFile = { path: string; blob: string; size: number; sha256: string | null };
export type GithubSkillPackage = {
  id: string; repository: string; directory: string; originalRef: string; commit: string;
  name: string; description: string; sourceUrl: string; files: SkillFile[]; totalBytes: number;
  license: string; installedAt: number;
  compatibility: { level: string; dependencies: string[]; notes: string[] };
};
export type InstalledGithubSkill = { package: GithubSkillPackage; enabled: boolean; versions: string[] };
export type GithubSkillInspection = { previewId: string; repository: string; originalRef: string; commit: string; candidates: GithubSkillPackage[]; expiresAt: number };
export type SkillResource = { skillId: string; version: string; path: string; content: string; totalCharacters: number; nextOffset: number | null };
export type GithubSkillRequest =
  | { operation: 'list' }
  | { operation: 'inspect'; source: { url: string; reference?: string; directory?: string } }
  | { operation: 'install'; preview_id: string; skill_id: string; action: 'install' | 'update'; use_in_current_conversation?: boolean }
  | { operation: 'read'; skill_id: string; version: string; path: string; offset: number; limit: number }
  | { operation: 'manage'; skill_id: string; action: 'enable' | 'disable' | 'rollback' | 'uninstall'; version?: string };

export type GithubSkillProgress = { completed: number; total: number };
export async function githubSkillRequest<T>(request: GithubSkillRequest, signal?: AbortSignal, onProgress?: (progress: GithubSkillProgress) => void): Promise<T> {
  if (signal?.aborted) throw new Error('已取消技能操作');
  const requestId = createChatId('github-skills');
  const cancel = () => { void invoke('github_skills_cancel', { requestId }).catch(() => {}); };
  const unlisten = onProgress ? await listen<GithubSkillProgress & { requestId: string }>('github-skills-progress', event => { if (event.payload.requestId === requestId) onProgress(event.payload); }).catch(() => undefined) : undefined;
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) { unlisten?.(); throw new Error('已取消技能操作'); }
  try { return await invoke<T>('github_skills_request', { requestId, request }); }
  finally { signal?.removeEventListener('abort', cancel); unlisten?.(); }
}
let installed: InstalledGithubSkill[] = [];
export const getGithubSkillMetadata = () => installed.filter(s => s.enabled).map(s => ({
  id: s.package.id, name: s.package.name, description: s.package.description.slice(0, 240),
  version: s.package.commit, compatibility: s.package.compatibility.level,
}));
export async function refreshGithubSkills(signal?: AbortSignal) {
  const records = await githubSkillRequest<InstalledGithubSkill[]>({ operation: 'list' }, signal);
  if (!Array.isArray(records)) throw new Error('原生技能服务不可用，请在桌面客户端中使用');
  installed = records;
  setGithubChatSkills(installed.map(({ package: p, enabled }): ChatSkill => ({
    id: p.id, name: p.name, description: p.description, source: 'github', instructions: '',
    triggers: [], conversionNotes: p.compatibility.notes, updatedAt: p.installedAt, disabled: !enabled,
    github: { version: p.commit, repository: p.repository, directory: p.directory, enabled },
  })));
  return installed;
}
export const inspectGithubSkills = (url: string, reference?: string, directory?: string, signal?: AbortSignal) =>
  githubSkillRequest<GithubSkillInspection>({ operation: 'inspect', source: { url, reference, directory } }, signal);
export async function installGithubSkill(previewId: string, skillId: string, action: 'install' | 'update', signal?: AbortSignal, onProgress?: (progress: GithubSkillProgress) => void, useInCurrentConversation = false) {
  const value = await githubSkillRequest<InstalledGithubSkill>({ operation: 'install', preview_id: previewId, skill_id: skillId, action, use_in_current_conversation: useInCurrentConversation }, signal, onProgress);
  await refreshGithubSkills();
  return value;
}
export async function manageGithubSkill(skillId: string, action: 'enable' | 'disable' | 'rollback' | 'uninstall', version?: string, signal?: AbortSignal) {
  const result = await githubSkillRequest({ operation: 'manage', skill_id: skillId, action, version }, signal);
  if (action === 'uninstall' || action === 'disable') clearChatSkillSelections(skillId);
  await refreshGithubSkills();
  return result;
}
export const readGithubSkillResource = (skillId: string, version: string, path: string, offset = 0, limit = GITHUB_SKILL_CONTEXT_BUDGET, signal?: AbortSignal) =>
  githubSkillRequest<SkillResource>({ operation: 'read', skill_id: skillId, version, path, offset, limit }, signal);

/** Metadata is never treated as the instructions. Complete SKILL.md is loaded only for a selected version. */
export async function hydrateGithubSkill(skill: ChatSkill, signal?: AbortSignal): Promise<ChatSkill> {
  if (skill.source !== 'github' || !skill.github) return skill;
  const resource = await readGithubSkillResource(skill.id, skill.github.version, 'SKILL.md', 0, GITHUB_SKILL_CONTEXT_BUDGET, signal);
  if (resource.nextOffset !== null) throw new Error(`技能 ${skill.name} 的 SKILL.md 共 ${resource.totalCharacters} 字符，超过单轮 ${GITHUB_SKILL_CONTEXT_BUDGET} 字符预算。未静默截断或执行；请使用读取工具明确分段阅读。`);
  return { ...skill, instructions: resource.content };
}
export async function activateGithubSkill(conversationId: string, skillId: string, version: string, signal?: AbortSignal) {
  const all = await refreshGithubSkills(signal);
  const found = all.find(s => s.package.id === skillId && s.enabled && s.package.commit === version);
  if (!found) throw new Error('技能版本未安装、已禁用或并非当前启用版本，请重新列出技能');
  const selected = getSelectedChatSkill(conversationId);
  if (selected && selected.id !== skillId) throw new Error('当前对话已明确选用其他智能体，不能自动切换；请用户在面板选择');
  const skill: ChatSkill = { id: skillId, name: found.package.name, description: found.package.description, source: 'github', instructions: '', triggers: [], conversionNotes: found.package.compatibility.notes, updatedAt: found.package.installedAt, github: { version, repository: found.package.repository, directory: found.package.directory, enabled: true } };
  const hydrated = await hydrateGithubSkill(skill, signal);
  selectChatSkill(conversationId, skillId);
  return hydrated;
}
