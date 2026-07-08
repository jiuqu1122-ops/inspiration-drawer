import type { AppAgentSkill, ContextScope } from './types';
import { matchKeywords } from './skillUtils';

const SERVER_KEYWORDS = [
  'app server',
  'codex server',
  'tunnel',
  'cloudflared',
  'provider',
  '模型配置',
  '启动服务',
  '停止服务',
  '重启服务',
  '服务',
] as const;

export const serverRuntimeSkill: AppAgentSkill = {
  id: 'server-runtime-skill',
  label: 'Server Runtime',
  description: 'App/Codex server、tunnel、provider 和模型配置。',
  match: input => matchKeywords(input.userText, SERVER_KEYWORDS),
  getRequiredContext: (): ContextScope[] => ['server', 'settings'],
  buildPromptPatch: () => [
    'Active skill: server-runtime-skill.',
    'Server start, stop, restart, tunnel and provider writes are system_process risk and must be confirmed.',
    'Use semantic app tools or settings context; do not run shell commands from the app agent.',
  ].join('\n'),
};
