import { describe, expect, it } from 'vitest';
import { getChatFileCreationTurn, chatFileCreationTurnInstruction } from './chatFileCreationPolicy';
const call = (id: string): Record<string, unknown> => ({ role: 'assistant', tool_calls: [{ id, function: { name: 'create_file' } }] });
const result = (id: string, value: unknown): Record<string, unknown> => ({ role: 'tool', tool_call_id: id, content: JSON.stringify(value) });
describe('real file completion and bounded correction', () => {
  it('never counts a previous conversation turn as this request', () => {
    expect(getChatFileCreationTurn([call('old'), result('old', { files: [{ path: '/old.docx' }] }), { role: 'user', content: '做PPT' }]))
      .toEqual({ attempts: 0, completed: false, canAttempt: true });
  });
  it('allows a validation correction without claiming success', () => {
    const state = getChatFileCreationTurn([{ role: 'user', content: '做PPT' }, call('first'), result('first', { error: 'missing slides' })]);
    expect(state).toEqual({ attempts: 1, completed: false, canAttempt: true });
    expect(chatFileCreationTurnInstruction(state)).toContain('尚未产生可下载文件');
  });
  it('stops after two failed attempts and asks for an honest error, not fake completion', () => {
    const state = getChatFileCreationTurn([{ role: 'user' }, call('a'), result('a', { error: 'bad' }), call('b'), result('b', { files: [] })]);
    expect(state).toEqual({ attempts: 2, completed: false, canAttempt: false });
    expect(chatFileCreationTurnInstruction(state)).toContain('不得伪造链接或声称已完成');
  });
  it('stops once a genuine downloadable file exists and ignores unrelated tool results', () => {
    const messages = [{ role: 'user' }, call('a'), result('unknown', { files: [{ path: '/fake' }] })];
    expect(getChatFileCreationTurn(messages).completed).toBe(false);
    const state = getChatFileCreationTurn([...messages, result('a', { files: [{ path: '/real.pptx' }] })]);
    expect(state).toEqual({ attempts: 1, completed: true, canAttempt: false });
  });
  it('does not accept invalid, empty, or error-bearing pseudo-files', () => {
    for (const content of ['notjson', '{}', '{"files":[{"path":" "}]}', '{"files":[{"path":"x"}],"error":"failed"}']) {
      expect(getChatFileCreationTurn([{ role: 'user' }, call('a'), { role: 'tool', tool_call_id: 'a', content }]).completed).toBe(false);
    }
  });
});
