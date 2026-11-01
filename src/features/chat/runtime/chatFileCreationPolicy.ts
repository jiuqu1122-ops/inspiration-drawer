export type ChatFileCreationTurn = { attempts: number; completed: boolean; canAttempt: boolean };
export const MAX_FILE_CREATION_ATTEMPTS = 2;

/** Only count calls following the latest real user message, never prior turns.
 * Failed validation is not a file: permit one correction, not an infinite loop
 * and not the old false "file already created" instruction after any attempt. */
export const getChatFileCreationTurn = (messages: Array<Record<string, unknown>>): ChatFileCreationTurn => {
  let boundary = -1;
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') { boundary = i; break; }
  const calls = new Set<string>();
  let completed = false;
  for (const message of messages.slice(boundary + 1)) {
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      for (const value of message.tool_calls) {
        const call = value as { id?: unknown; function?: { name?: unknown } };
        if (call.function?.name === 'create_file' && typeof call.id === 'string') calls.add(call.id);
      }
    }
    if (message.role !== 'tool' || !calls.has(String(message.tool_call_id || ''))) continue;
    try {
      const result = typeof message.content === 'string' ? JSON.parse(message.content) : message.content;
      if (result && !result.error && Array.isArray(result.files)
        && result.files.some((file: { path?: unknown }) => typeof file?.path === 'string' && file.path.trim())) completed = true;
    } catch { /* Invalid/failed output does not create a visible file. */ }
  }
  return { attempts: calls.size, completed, canAttempt: !completed && calls.size < MAX_FILE_CREATION_ATTEMPTS };
};
export const chatFileCreationTurnInstruction = (turn: ChatFileCreationTurn) => turn.completed
  ? '请求的文件已经成功生成。不要再调用任何工具；提示用户通过文件卡片打开或另存为。'
  : turn.attempts >= MAX_FILE_CREATION_ATTEMPTS
    ? '文件生成重试仍未成功，本轮不得继续调用工具。准确说明尚未生成可下载文件及失败原因，不得伪造链接或声称已完成。'
    : turn.attempts > 0
      ? '上一轮文件生成失败，尚未产生可下载文件。根据工具错误修正 create_file 参数后最多再试一次；PPTX 必须提供有效 presentation.slides，只用真实附件 ID。若错误提示 comparison 文字过长，请把每个比较项压缩成短标题+最多 2～4 行要点，必要时拆成两页 comparison；若错误提示 designStyle 无效，只能使用 editorial、technical、minimal、cinematic、brutalist、soft 或 custom；theme 只能使用 light、dark、warm、mono、vivid 或 pastel；若错误提示检索原文未提炼，请把每页改成一个结论、2～4 条短证据和必要来源；若错误提示 element 几何无效，删除该装饰图元或改为有限的 0～100 百分比。不能声称已经生成。'
      : '';
