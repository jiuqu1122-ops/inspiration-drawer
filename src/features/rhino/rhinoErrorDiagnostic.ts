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

export function readableRhinoMcpFailure(error: unknown): string {
  const text = rhinoDiagnosticText(error);
  const exception = text.match(/(?:NameError|TypeError|SyntaxError|ValueError|AttributeError|ImportError|ModuleNotFoundError|IndexError|RuntimeError):[^\n]*/g)?.slice(-1)[0];
  const message = exception || text.split('\n').find(line => line.trim() && line.trim() !== 'Failed') || 'Rhino MCP 工具执行失败，详细信息见工具回执。';
  const location = [...text.matchAll(/\bline\s+(\d+)/gi)].slice(-1)[0]?.[1];
  return message.slice(0, 1200) + (location ? '\n脚本位置：第 ' + location + ' 行。' : '');
}
