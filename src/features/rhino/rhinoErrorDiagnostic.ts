// Versioned wire record: also read by hosts running an independently updated runtime.
export const STAGE_FAILURE_MARK = 'DRAWER_STAGE_FAILURE_V1:';
export const MAX_STAGE_RECORD = 4096;
export const STAGE_REASON_PREFIXES = ['Missing staged geometry', 'Invalid staged geometry', 'Invalid staged bounds',
  'No staged geometry to commit', 'Open solid', 'Expected Brep/surface geometry for', 'Geometry type/intent mismatch for',
  'Required planar face is curved', 'External wall is curved', 'Planar capping could not produce the required solid',
  'Invalid solid volume', 'Indeterminate solid orientation', 'Could not add staged part', 'Could not replace staged part',
  'Feature acceptance failed before write', 'division by zero', 'invalid syntax'];
// Used on BOTH sides: do not serialize arbitrary messages/locals and then try to redact them.
export const UNSAFE_DIAGNOSTIC_LABEL = /(?:bearer|password|passwd|secret|token|credential|api[ _-]?key|sk-|gh[pousr]_|github_pat_|AKIA|[0-9a-f]{24,}|(?=[a-z0-9]{28,})[a-z0-9]*\d)/i;
// Full-match grammar (also compiled by Python), not a pass-through for exception messages.
export const SAFE_PYTHON_MESSAGE = /^(?:name '[\w.]+' is not defined|(?:type object '[\w.]+'|'[\w.]+' object) has no attribute '[\w.]+'|'[\w.]+' object is not iterable|Invalid U and V counts\.(?: \(System\.InvalidOperationException\))?|division by zero|invalid syntax|External wall is curved|Unexpected output count: \d{1,9}|(?:Open solid: |Expected Brep\/surface geometry for )[\w .\u3400-\u9fff-]{1,48}|[\w .\u3400-\u9fff-]{1,48} mesh is not an outward solid\.?)$/;
const safeMessage = (v: unknown): boolean => typeof v === 'string' && v.length <= 180
  && SAFE_PYTHON_MESSAGE.test(v) && !UNSAFE_DIAGNOSTIC_LABEL.test(v);
const safeLabel = (v: unknown): v is string => typeof v === 'string' && v.length <= 48
  && /^[\p{L}\p{N}_ .{}[\];-]+$/u.test(v) && !UNSAFE_DIAGNOSTIC_LABEL.test(v);
const safeType = (v: unknown): v is string => typeof v === 'string' && v.length <= 120
  && v.split('.').every(segment => safeLabel(segment) && /^[\p{L}_][\p{L}\p{N}_]*$/u.test(segment));
const omittedDetail = '未保存自由文本。';
const stageTrace = 'Traceback (DrawerGeometryStage):';
const fallbackFailure = 'Rhino 原生 run_python 执行失败；未收到可安全显示的异常详情。请先检查文档，不能自动重放。';

/** Only a complete, bounded protocol line is evidence; ordinary stdout is never a diagnostic. */
function stageFailure(stream: string): string | undefined {
  const lines = stream.slice(-8192).split(/\r?\n/);
  for (const line of lines.reverse()) {
    const record = line.replace(/^RuntimeError: /, '');
    if (!record.startsWith(STAGE_FAILURE_MARK) || record.length > MAX_STAGE_RECORD) continue;
    try {
      const d = JSON.parse(record.slice(STAGE_FAILURE_MARK.length));
      if (!safeType(d?.type)) continue;
      const trace = [stageTrace];
      if (Number.isSafeInteger(d.line) && d.line > 0) trace.push(`  File "<drawer-user-script>", line ${d.line}`
        + (safeLabel(d.fn) ? `, in ${d.fn}` : ''));
      if (safeLabel(d.stage)) trace.push(`阶段：${d.stage}`);
      if (safeLabel(d.part)) trace.push(`零件：${d.part}`);
      if (d.rollbackIncomplete === true) trace.push('回滚未完成，请检查文档。');
      const cause = safeMessage(d.message) ? d.message
        : STAGE_REASON_PREFIXES.includes(d.reason) ? d.reason + (safeLabel(d.part) ? (d.reason.endsWith(' for') ? ' ' : ': ') + d.part : '')
        : d.type === 'AssertionError' ? '断言未通过。未保存自由文本；请在该检查处明确记录失败约束。' : omittedDetail;
      trace.push(`${d.type}: ${cause}`);
      return trace.join('\n');
    } catch { /* Truncated or unrelated text. */ }
  }
}

// Python prints "Type: detail" (or just the type); Rhino may instead print
// "detail (System.SomeException)". Trust frame metadata, never the source line below it.
function terminalException(text: string) {
  const traced = /^Traceback(?:\s|:)|^\s*File ["'][^\n]+["'], line \d+/m.test(text);
  for (const raw of text.split('\n').reverse()) {
    const line = raw.trimEnd();
    const typed = /^([\w.]{1,120})(?::[ \t]*(.*))?$/.exec(line);
    if (typed && safeType(typed[1]) && (/(?:Error|Exception)$/.test(typed[1]) || (traced && typed[1] !== 'Traceback' && typed[2] !== undefined))) {
      return {type: typed[1], detail: typed[2] ?? '', line};
    }
    const managed = / \(((?:[A-Za-z_]\w*\.)+[A-Za-z_]\w*Exception)\)$/.exec(line);
    if (managed && !/^\s/.test(line) && safeType(managed[1])) return {type: managed[1], detail: line, line};
  }
}
function exceptionSummary(e: NonNullable<ReturnType<typeof terminalException>>) {
  const detail = safeMessage(e.detail) ? e.detail : e.type === 'AssertionError' ? '断言未通过。' + (e.detail ? omittedDetail : '') : omittedDetail;
  return `${e.type}: ${detail}`;
}

/** The C# bridge can join native text blocks with LF before setting isError again.
 * Select evidence from both shapes, not arbitrary progress stdout or traceback source lines. */
export function nativePythonFailure(content: ReadonlyArray<{type: string; text?: string}>, isError: boolean): string | undefined {
  let staged: string | undefined, hostMessage: string | undefined, unconfirmed: string | undefined;
  let exception: ReturnType<typeof terminalException>;
  let location: ReturnType<typeof diagnosticLocation> = {};
  let flagged = isError, hasTrace = false, uncertain = false;
  function inspect(text: string, stream: 'text' | 'stderr' | 'stdout') {
    staged ??= stageFailure(text);
    if (stream === 'stdout' || (stream === 'text' && !flagged)) return;
    if (text.startsWith('RHINO_NATIVE_OUTCOME_UNCONFIRMED:')) {
      unconfirmed = 'RHINO_NATIVE_OUTCOME_UNCONFIRMED: Rhino 原生 MCP 未确认写入结果。已暂停后续原生写入；请检查并保存 Rhino/GH 文档，然后重新启动该 Rhino 实例。';
      return;
    }
    const tail = text.slice(-32000).replace(/\r\n/g, '\n');
    const frame = diagnosticLocation(tail);
    if (frame.line) location = frame;
    hasTrace ||= /^Traceback \(most recent call last\):/m.test(tail);
    uncertain ||= /(?:timed?\s*out|TimeoutException|TaskCanceledException|OperationCanceledException)/i.test(tail);
    const found = terminalException(tail);
    if (found && (flagged || hasTrace || frame.line || tail.trim() === found.line)) {
      // Some hosts repeat a managed cause as a less informative "Exception:" in stderr.
      if (!exception || !safeMessage(exception.detail) || (safeMessage(found.detail) && found.type !== 'Exception')) exception = found;
    } else if (flagged && (safeMessage(text) || /^Rhino 原生 MCP (?:正在处理另一项操作。本次调用未派发，也未排队。|工具列表已变化，已阻止调用|返回 HTTP \d{3})$/.test(text))) {
      hostMessage = text;
    }
  }
  for (const {type, text} of content) {
    if (type !== 'text' || !text) continue;
    // A successful native call normally returns one compact JSON object per block.
    // On error the adapter concatenates those objects; preserve whole stdout strings
    // until after decoding, so a marker after lengthy progress is not cut off.
    const accept = (s: string) => {
      let value;
      try { value = JSON.parse(s); } catch { return false; }
      if (!value || typeof value !== 'object') return false;
      if (value.error || value.isError === true) flagged = true;
      if (typeof value.stdout === 'string') inspect(value.stdout, 'stdout');
      if (typeof value.stderr === 'string') inspect(value.stderr, 'stderr');
      if (typeof value.error === 'string') inspect(value.error, 'text');
      if (typeof value.message === 'string' && flagged) inspect(value.message, 'text');
      return true;
    };
    if (!accept(text)) {
      inspect(text, 'text');
      if (text.trimStart().startsWith('{')) for (const line of text.split(/\r?\n/)) accept(line);
    }
  }
  if (unconfirmed || staged) return unconfirmed || staged;
  if (!flagged && !exception) return undefined;
  const header = exception && hasTrace && !uncertain ? 'Traceback:\n' : '';
  const frame = location.line ? `  File "<python>", line ${location.line}${location.fn ? ', in ' + location.fn : ''}\n` : '';
  if (exception && !safeMessage(exception.detail) && safeMessage(hostMessage)) exception.detail = hostMessage!;
  const message = exception ? exceptionSummary(exception) : hostMessage || fallbackFailure;
  return header + frame + message;
}

/** Decode structured MCP diagnostics for display, without touching stored receipts. */
export function rhinoDiagnosticText(error: unknown): string {
  const output: string[] = [], seen = new Set<unknown>();
  let staged: string | undefined;
  function visit(value: unknown, depth = 0): void {
    if (depth > 6 || output.length > 40 || value == null) return;
    if (value instanceof Error) { visit(value.message, depth + 1); return; }
    if (typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
      if (Array.isArray(value)) { value.slice(0, 20).forEach(item => visit(item, depth + 1)); return; }
      const record = value as Record<string, unknown>;
      if (typeof record.stdout === 'string') staged ??= stageFailure(record.stdout);
      for (const key of ['message', 'error', 'stderr', 'details', 'content', 'text']) visit(record[key], depth + 1);
      return;
    }
    if (typeof value !== 'string') return;
    const text = value.replace(/^(?:(?:RhinoNativeMcpToolError|RhinoDocumentGeometryWriteError|Error):\s*)+/, '').trim();
    if (!text) return;
    staged ??= stageFailure(text);
    // Parse before truncation: C# can return compact JSON with a very long stdout.
    function decode(s: string) {
      if (!['{', '[', '"'].includes(s[0])) return false;
      try { visit(JSON.parse(s), depth + 1); return true; } catch { return false; }
    }
    if (decode(text)) return;
    for (const line of text.split(/\r?\n/)) {
      if (!line.trim() || decode(line)) continue;
      if (output.length <= 40) output.push(line.slice(0, 2000));
    }
  }
  visit(error);
  const unconfirmed = output.find(line => line.startsWith('RHINO_NATIVE_OUTCOME_UNCONFIRMED:'));
  return (unconfirmed || staged || [...new Set(output)].join('\n'))
    .replace(/\\u(0027|0022|003c|003e|0026)/gi, (_value, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\r\\n/g, '\n').replace(/\r\n/g, '\n').trim();
}

/** Prefer the user's source call site over the injected exec wrapper or helper internals. */
function diagnosticLocation(text: string): { line?: string; fn?: string } {
  const frames = [...text.matchAll(/^\s*File ["']([^"'\n]+)["'],?\s+line (\d+)(?:, in ([^\r\n]+))?/gm)];
  const frame = frames.filter(f => f[1] === '<drawer-user-script>').pop()
    || (!frames.some(f => f[1] === '<drawer-geometry-stage>') ? frames.pop() : undefined);
  if (frame) return {line: frame[2], fn: safeLabel(frame[3]) ? frame[3] : undefined};
  return {line: !frames.length ? [...text.matchAll(/^\s*(?:Script location:\s*)?line\s+(\d+)/gmi)].pop()?.[1] : undefined};
}

export function readableRhinoMcpFailure(error: unknown): string {
  const text = rhinoDiagnosticText(error);
  const lines = text.split('\n');
  const unconfirmed = lines.find(line => line.startsWith('RHINO_NATIVE_OUTCOME_UNCONFIRMED:'));
  if (unconfirmed) return unconfirmed.slice('RHINO_NATIVE_OUTCOME_UNCONFIRMED:'.length).trim();
  const staged = lines.includes(stageTrace);
  const typed = terminalException(text);
  const exception = staged ? lines[lines.length - 1] : typed && exceptionSummary(typed);
  const message = exception || lines.find(line => line.trim() && !/^(?:Failed$|Traceback|File [\x22'])/.test(line.trim())) || fallbackFailure;
  const {line, fn} = diagnosticLocation(text);
  return [message.slice(0, 1200),
    line && `脚本位置：第 ${line} 行${fn ? `（${fn}）` : ''}。`,
    ...(staged ? lines.filter(s => /^(阶段：|零件：|回滚未完成)/.test(s)) : []),
  ].filter(Boolean).join('\n');
}

/** Diagnose the actual geometry assertion, without asserting that a remote script made zero writes. */
export function rhinoGeometryFailureExplanation(error: unknown): string | undefined {
  const text = rhinoDiagnosticText(error);
  const staged = text.split('\n').includes(stageTrace);
  const hint = geometryConstraintHint(text, staged ? undefined : diagnosticLocation(text).line);
  if (!staged) return hint;
  return readableRhinoMcpFailure(text) + '\n' + (hint || '请先核对文档和可能的部分写入，不能自动重放。');
}

function geometryConstraintHint(text: string, line?: string): string | undefined {
  const location = line ? `（脚本第 ${line} 行）` : '';
  const meshPart = rhinoOutwardMeshFailurePart(text);
  if (meshPart) return `${meshPart} 未通过朝外实体网格检查${location}。需要检查网格是否有效、闭合且面朝向一致，才能区分整体朝内和拓扑缺陷。`;
  const kind = text.match(/(?:Expected Brep\/surface geometry for|Geometry type\/intent mismatch for|Unsupported bake geometry type:)\s*([^\r\n;]+)/i);
  if (kind) return `烘焙被几何类型检查拦截${location}：${kind[1].slice(0, 180)}。网格不是 Brep，GH 输出也可能是包装类型；应读取实际输出类型，解包后按网格／曲线／曲面等原类型烘焙。只有用户明确要求封闭实体才执行实体约束，不能为绕过检查把网格强转 Brep 或填平纹理孔洞。请先核对本次文档变化，不能自动重放写入。`;
  const count = text.match(/Unexpected output count:\s*(\d+)/i);
  if (count) return `脚本的输出数量断言未通过${location}，本次报告 ${count[1]} 项；这不等于 GH 没有输出或烘焙功能不可用。应读取选定几何输出的实际分支和数据项，不能凭猜测写死数量、只取第一分支或截掉多余对象。只有用户明确要求的数量或已核实的源计划才是约束。现有错误文本不能证明零写入，需先检查文档，不能自动重放烘焙。`;
  const open = text.match(/Open solid:\s*([^\r\n;]+)/i);
  if (open) return `部件 ${open[1].slice(0, 180)} 未形成封闭实体${location}，脚本的几何检查因此中止；这不是“连续对话失忆”或 MCP 不支持建模的证据。需要检查裸边、接缝和封口：仅平面开口可尝试 CapPlanarHoles；无法封口时应重建该部件。曲线或开放浮雕只有在符合用户要求时才能按曲线／曲面验证，不能为通过检查把必需实体降级。已完成的其他部件不能据此判为失败，也不能自动重放脚本。`;
  if (/External wall is curved|Required planar face is curved/i.test(text)) return `脚本报告了应为平面的面仍有曲率${location}。这说明该几何约束未通过，不能仅凭报错断定对话上下文丢失。应核对实际目标面和建模方式，在内存中用满足要求的截面／平面重建并验证，再替换目标对象；不能把所有装饰曲面都要求成平面，也不能跳过直壁约束。保留已完成部件，先读取当前文档，不能自动重放失败脚本。`;
  return undefined;
}

export function rhinoOutwardMeshFailurePart(error: unknown): string | undefined {
  return rhinoDiagnosticText(error).match(/^\s*ValueError:\s*([^\r\n]{1,180}?)\s+mesh is not an outward solid\.?\s*$/mi)?.[1].trim();
}
