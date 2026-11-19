import type { GithubSkillInspection, InstalledGithubSkill } from './githubSkillClient';
export const SKILL_FIXTURE_ID = 'github-0123456789abcdef0123456789abcdef';
export const SKILL_FIXTURE_COMMIT = '1'.repeat(40);
export const SKILL_FIXTURE_TEXT = '---\nname: Fixture skill\ndescription: Offline fixture only\n---\nUse the full methodology. Read references/check.md if needed. Scripts must not execute.\nEND_OF_FULL_SKILL';
export const makeInstalledSkillFixture = (): InstalledGithubSkill => ({
  package: { id: SKILL_FIXTURE_ID, repository: 'fixture/skills', directory: 'skills/design', originalRef: 'feature/design', commit: SKILL_FIXTURE_COMMIT,
    name: 'Fixture skill', description: 'Offline fixture only', sourceUrl: 'https://github.com/fixture/skills/tree/'+SKILL_FIXTURE_COMMIT+'/skills/design',
    files: [{ path: 'SKILL.md', size: SKILL_FIXTURE_TEXT.length, blob: 'a'.repeat(40), sha256: 'c'.repeat(64) }, { path: 'references/check.md', size: 14, blob: 'b'.repeat(40), sha256: 'd'.repeat(64) }, { path: 'scripts/probe.sh', size: 10, blob: 'e'.repeat(40), sha256: 'f'.repeat(64) }], totalBytes: 200, license: 'MIT', installedAt: 1000,
    compatibility: { level: 'dependencies_missing', dependencies: ['bash'], notes: ['Scripts are saved, never executed.'] } }, enabled: true, versions: [SKILL_FIXTURE_COMMIT],
});
export const makeSkillInspectionFixture = (previewId = 'preview-offline-fixture'): GithubSkillInspection => ({ previewId, repository: 'fixture/skills', originalRef: 'feature/design', commit: SKILL_FIXTURE_COMMIT, expiresAt: Date.now()+60_000, candidates: [makeInstalledSkillFixture().package] });
