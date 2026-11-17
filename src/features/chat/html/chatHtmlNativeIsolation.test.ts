import { describe, expect, it } from 'vitest';
import buildSource from '../../../../src-tauri/build.rs?raw';
import capabilitySource from '../../../../src-tauri/capabilities/local-app-commands.json?raw';
import mainSource from '../../../../src-tauri/src/main.rs?raw';
import { GENERAL_CHAT_SYSTEM_PROMPT } from '../context/chatContextBuilder';

describe('HTML native capability boundary', () => {
  it('enables an app ACL manifest and preserves all registered local commands without remote grants', () => {
    const capability = JSON.parse(capabilitySource);
    expect(capability).toMatchObject({ local: true, windows: ['*'], permissions: ['local-app-commands'] });
    expect(capability.remote).toBeUndefined();
    expect(buildSource).toContain('app_manifest(');
    expect(buildSource).toContain('src/main.rs');
    expect(buildSource).toContain('permissions_path_pattern(pattern)');
    expect(buildSource).toContain('commands.allow');
    const commands = mainSource.split('.invoke_handler(tauri::generate_handler![')[1].split('])')[0].split(',').map(value => value.trim()).filter(Boolean);
    expect(commands.length).toBeGreaterThan(100);
    expect(commands.every(command => /^[a-zA-Z0-9_:]+$/.test(command))).toBe(true);
  });
  it('guides semantic file delivery without confusing interactive prototypes with images', () => {
    for (const value of ['format="html"', '内联', '不是生图请求', '仅讲解', '完整更新版本', '联网 API']) expect(GENERAL_CHAT_SYSTEM_PROMPT).toContain(value);
  });
});
