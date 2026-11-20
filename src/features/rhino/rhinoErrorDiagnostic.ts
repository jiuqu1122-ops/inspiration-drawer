/** Decode structured MCP diagnostics for display, without touching stored receipts. */
export function rhinoDiagnosticText(error: unknown): string {
  const output: string[] = []; const seen = new Set<unknown>();
  function visit(value: unknown, depth = 0): void {
    if (depth > 5 || output.length > 40 || value == null) return;
    if (value instanceof Error) { visit(value.message, depth + 1); return; }
    if (typeof value === 'object') {
      if (seen.has(value)) return; seen.add(value);
      if (Array.isArray(value)) { value.slice(0, 20).forEach(item => visit(item, depth + 1)); return; }
      const record = value as Record<string, unknown>;
      for (const key of ['message', 'error', 'stderr', 'details', 'content', 'text']) if (record[key] != null) visit(record[key], depth + 1);
      return;
    }
    if (typeof value !== 'string' || !value.trim()) return;
    const text = value.slice(0, 64_000).replace(/^(?:(?:RhinoNativeMcpToolError|RhinoDocumentGeometryWriteError|Error):\s*)+/, '').trim();
    try { const decoded: unknown = JSON.parse(text); if (decoded !== text) { visit(decoded, depth + 1); return; } } catch { /* Mixed compact JSON blocks and plain text are common. */ }
    const lines = text.split(/\r?\n/); let structured = false;
    for (const line of lines) {
      try { const decoded: unknown = JSON.parse(line); if (decoded && typeof decoded === 'object') { visit(decoded, depth + 1); structured = true; continue; } } catch { /* Keep plain traceback lines. */ }
      if (line.trim()) output.push(line);
    }
    if (structured) return;
  }
  visit(error);
  return [...new Set(output)].join('\n')
    .replace(/\\u(0027|0022|003c|003e|0026)/gi, (_value, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\r\\n/g, '\n').replace(/\r\n/g, '\n').trim();
}

/** Prefer the user's source call site over the injected exec wrapper or helper internals. */
function diagnosticScriptLine(text: string): string | undefined {
  return [...text.matchAll(/^\s*File ["']<drawer-user-script>["'],?\s+line\s+(\d+)/gmi)].slice(-1)[0]?.[1]
    || [...text.matchAll(/\bline\s+(\d+)/gi)].slice(-1)[0]?.[1];
}

export function readableRhinoMcpFailure(error: unknown): string {
  const text = rhinoDiagnosticText(error);
  const exception = text.match(/(?:NameError|TypeError|SyntaxError|ValueError|AttributeError|ImportError|ModuleNotFoundError|IndexError|RuntimeError|AssertionError|Exception):[^\n]*/g)?.slice(-1)[0];
  const message = exception || text.split('\n').find(line => line.trim() && line.trim() !== 'Failed') || 'Rhino MCP 工具执行失败，详细信息见工具回执。';
  const location = diagnosticScriptLine(text);
  return message.slice(0, 1200) + (location ? '\n脚本位置：第 ' + location + ' 行。' : '');
}

/** Diagnose the actual geometry assertion, without asserting that a remote script made zero writes. */
export function rhinoGeometryFailureExplanation(error: unknown): string | undefined {
  const text = rhinoDiagnosticText(error);
  const line = diagnosticScriptLine(text);
  const location = line ? `（脚本第 ${line} 行）` : '';
  const kind = text.match(/(?:Expected Brep\/surface geometry for|Geometry type\/intent mismatch for|Unsupported bake geometry type:)\s*([^\r\n;]+)/i);
  if (kind) return `烘焙被几何类型检查拦截${location}：${kind[1].slice(0, 180)}。网格不是 Brep，GH 输出也可能是包装类型；应读取实际输出类型，解包后按网格／曲线／曲面等原类型烘焙。只有用户明确要求封闭实体才执行实体约束，不能为绕过检查把网格强转 Brep 或填平纹理孔洞。请先核对本次文档变化，不能自动重放写入。`;
  const count = text.match(/Unexpected output count:\s*(\d+)/i);
  if (count) return `脚本的输出数量断言未通过${location}，本次报告 ${count[1]} 项；这不等于 GH 没有输出或烘焙功能不可用。应读取选定几何输出的实际分支和数据项，不能凭猜测写死数量、只取第一分支或截掉多余对象。只有用户明确要求的数量或已核实的源计划才是约束。现有错误文本不能证明零写入，需先检查文档，不能自动重放烘焙。`;
  const open = text.match(/Open solid:\s*([^\r\n;]+)/i);
  if (open) return `部件 ${open[1].slice(0, 180)} 未形成封闭实体${location}，脚本的几何检查因此中止；这不是“连续对话失忆”或 MCP 不支持建模的证据。需要检查裸边、接缝和封口：仅平面开口可尝试 CapPlanarHoles；无法封口时应重建该部件。曲线或开放浮雕只有在符合用户要求时才能按曲线／曲面验证，不能为通过检查把必需实体降级。已完成的其他部件不能据此判为失败，也不能自动重放脚本。`;
  if (/External wall is curved|Required planar face is curved/i.test(text)) return `脚本报告了应为平面的面仍有曲率${location}。这说明该几何约束未通过，不能仅凭报错断定对话上下文丢失。应核对实际目标面和建模方式，在内存中用满足要求的截面／平面重建并验证，再替换目标对象；不能把所有装饰曲面都要求成平面，也不能跳过直壁约束。保留已完成部件，先读取当前文档，不能自动重放失败脚本。`;
  return undefined;
}
