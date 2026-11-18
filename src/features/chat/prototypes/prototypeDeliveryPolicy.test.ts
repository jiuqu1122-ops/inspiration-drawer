import { describe, expect, it } from 'vitest';
import { prototypeCapabilityInstruction, requestsPrototypeArtifact } from './prototypeDeliveryPolicy';
import { getChatToolDefinitions } from '../tools/chatToolDefinitions';
describe('editable design delivery routing', () => {
  it.each(['帮我生成一个 .fig 文件', '帮我做一个fig文件', '制作一套可导入 Figma 的原型', 'Create an editable Figma design file', '给我导出 Sketch 设计稿'])('recognizes editable artifact delivery: %s', text => expect(requestsPrototypeArtifact(text)).toBe(true));
  it.each(['如何导出 Figma 文件？', '只讨论 Figma 原型，不要生成文件', '先别制作 Figma 原型', 'What is Sketch?', '帮我生成设计文件，只要 .fig，不接受 Sketch', 'Export only .fig, no Sketch alternative'])('does not force a tool for discussion: %s', text => expect(requestsPrototypeArtifact(text)).toBe(false));
  it.each(['帮我生成 .fig', '设计一套设备校准界面', 'make a clickable onboarding flow'])('exposes prototype capability for semantic decisions: %s', text => expect(getChatToolDefinitions(text).some(tool => tool.function.name === 'create_ui_prototype')).toBe(true));
  it('describes the actual Sketch alternative only while the real tool is available', () => {
    expect(prototypeCapabilityInstruction([])).toBe('');
    expect(prototypeCapabilityInstruction(['create_ui_prototype'])).toContain('Native .fig export is unavailable, but .sketch export');
  });
});
