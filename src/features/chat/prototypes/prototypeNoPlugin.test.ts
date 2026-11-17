import { describe, expect, it } from 'vitest';
import packageSource from '../../../../package.json?raw';
import configSource from '../../../../src-tauri/tauri.conf.json?raw';
import settingsSource from '../../drawer/components/DrawerHeaderAndSettings.tsx?raw';
import mainSource from '../../../../src-tauri/src/main.rs?raw';
import nativeSource from '../../../../src-tauri/src/commands/chat_prototypes.rs?raw';
import { CHAT_PROTOTYPE_RULES } from './prototypeTools';
import { buildPrototypeSketch } from './prototypeSketch';
import { makePrototypeFixture } from './prototypeFixture';
describe('no-plugin direct file route',()=>{
  it('does not ship or build a Figma importer or expose installation commands',()=>{
    expect(packageSource).not.toContain('build:figma-plugin');expect(packageSource).not.toContain('typecheck:figma-plugin');
    expect(configSource).not.toContain('figma-plugin');expect(settingsSource).not.toContain('FigmaPluginSetup');
    expect(mainSource).not.toContain('figma_plugin_installer');expect(mainSource).not.toContain('install_figma_plugin');
    expect(nativeSource).not.toContain('include_bytes!');expect(nativeSource).not.toContain('integrations/figma');
  });
  it('tells the model the exact file type and honest conversion limitations',()=>{
    for(const text of ['.sketch','无需安装插件','不生成伪造 .fig','静态坐标','不转换为 Figma 原生交互','不能要求用户创建插件'])expect(CHAT_PROTOTYPE_RULES).toContain(text);
    expect(CHAT_PROTOTYPE_RULES).not.toContain('ZIP 包');
  });
  it('generates only design data, with no executable plugin fields or app access',()=>{
    const output=buildPrototypeSketch(makePrototypeFixture());expect(output).not.toHaveProperty('code');expect(output).not.toHaveProperty('ui');expect(output).not.toHaveProperty('manifest');
    expect(JSON.stringify(output)).not.toContain('__TAURI_INTERNALS__');
  });
});
