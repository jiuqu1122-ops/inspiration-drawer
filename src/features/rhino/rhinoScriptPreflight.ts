import { rhinoDiagnosticText } from './rhinoErrorDiagnostic';
import { RhinoNativeScriptPreflightError, type RhinoScriptIssue } from './rhinoArgumentRecovery';

// A deliberately conservative lexical check, not a Python/C# evaluator. Unknown
// dynamic types still go to Rhino; comments, embedded GH source and strings do
// not become executable calls. No generated script is rewritten or executed here.
function maskNonCode(source: string, csharp: boolean): string {
  const strings = /'''[\s\S]*?(?:'''|$)|"""[\s\S]*?(?:"""|$)|@"(?:""|[^"])*"|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|#[^\r\n]*/g;
  const csStrings = /\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|@"(?:""|[^"])*"|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'/g;
  return source.replace(csharp ? csStrings : strings, match => match.replace(/[^\r\n]/g, ' '));
}

const GH_REFLECTION_SCAN_GUIDANCE = 'Do not inspect Grasshopper assemblies with Assembly.GetTypes() from RhinoCode. This reflection path is incompatible with the Rhino host assembly set. Use the native GH2 tools instead: inspect the current canvas, search/describe components, apply/connect the graph, solve, then read diagnostics back.';

/**
 * Detect only the known read-only Grasshopper reflection probe. This is a
 * local preflight: the script is not sent to Rhino and is never rewritten.
 * Any possible document/geometry write fails open to the normal executor.
 */
export const isRhinoGhAssemblyReflectionScan = (name: string, script: string): boolean => {
  if (name !== 'rhino_native_run_python') return false;
  const lines = script.split(/\r?\n/).map(raw => {
    const match = raw.match(/^( *)(.*)$/);
    const line = (match?.[2] || '').replace(/\s+#.*$/, '').trim();
    return { indent: match?.[1].length || 0, line };
  }).filter(item => item.line);
  if (lines.length !== 8 || lines[0].line !== 'import System' || lines[0].indent !== 0) return false;

  const [, assemblyLine, grasshopperLine, assemblyPrintLine, versionLine, typeLine, typeFilterLine, typePrintLine] = lines;
  const assemblyMatch = assemblyLine.line.match(/^for ([A-Za-z_]\w*) in System\.AppDomain\.CurrentDomain\.GetAssemblies\(\):$/);
  if (!assemblyMatch || assemblyLine.indent !== 0) return false;
  const assembly = assemblyMatch[1];
  if (!new RegExp(String.raw`^if ['"]Grasshopper['"] in ${assembly}\.GetName\(\)\.Name:$`).test(grasshopperLine.line)) return false;
  const unit = grasshopperLine.indent;
  if (unit < 1 || assemblyPrintLine.indent !== unit * 2
    || !new RegExp(String.raw`^print\(${assembly}\.GetName\(\)\.Name\)$`).test(assemblyPrintLine.line)) return false;
  if (versionLine.indent !== unit * 2
    || !new RegExp(String.raw`^if ['"]2['"] in ${assembly}\.GetName\(\)\.Name:$`).test(versionLine.line)) return false;
  const typeMatch = typeLine.line.match(new RegExp(String.raw`^for ([A-Za-z_]\w*) in ${assembly}\.GetTypes\(\):$`));
  if (!typeMatch || typeLine.indent !== unit * 3) return false;
  const type = typeMatch[1];
  if (typeFilterLine.indent !== unit * 4
    || !new RegExp(String.raw`^if ${type}\.Name in \[[A-Za-z0-9_'",.\s]+\] or ['"]ScriptComponent['"] in ${type}\.Name:$`).test(typeFilterLine.line)) return false;
  return typePrintLine.indent === unit * 5
    && new RegExp(String.raw`^print\(${type}\.FullName\)$`).test(typePrintLine.line);
};

/** Known host/module roots only. Unknown dynamic Python is intentionally not evaluated. */
const PYTHON_NAMESPACE_IMPORTS: Record<string, string> = {
  System: 'import System', Rhino: 'import Rhino', math: 'import math',
  scriptcontext: 'import scriptcontext', rhinoscriptsyntax: 'import rhinoscriptsyntax',
  rg: 'import Rhino.Geometry as rg', sc: 'import scriptcontext as sc', rs: 'import rhinoscriptsyntax as rs',
};
function missingPythonNamespaceImports(code: string): RhinoScriptIssue[] {
  const logical = code.replace(/\\\r?\n/g, ' ');
  // Dynamic namespace construction and wildcard imports cannot be proven locally.
  if (/\b(?:exec|eval|globals|locals|vars|__import__)\s*\(|\bimport\s*\*|\bfrom\s+__future__\s+import[^;]*\bannotations\b/.test(logical)) return [];
  const bound = new Set<string>();
  for (const match of logical.matchAll(/\bimport\s+([^;\r\n]+)/g)) {
    for (const item of match[1].split(',')) {
      const imported = item.trim().match(/^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?:\s+as\s+([A-Za-z_]\w*))?$/);
      if (imported) bound.add(imported[2] || imported[1].split('.')[0]);
    }
  }
  for (const match of logical.matchAll(/\bfrom\s+[\w.]+\s+import\s*(?:\(([^)]*)\)|([^;\r\n]+))/g)) {
    for (const item of (match[1] || match[2] || '').split(',')) {
      const imported = item.trim().match(/^([A-Za-z_]\w*)(?:\s+as\s+([A-Za-z_]\w*))?$/);
      if (imported) bound.add(imported[2] || imported[1]);
    }
  }
  // Any possible explicit binding suppresses the check, even across scopes.
  // Prefer missing a dynamic error to rejecting valid code.
  for (const match of logical.matchAll(/\b(?:def|class)\s+([A-Za-z_]\w*)|\bas\s+([A-Za-z_]\w*)|\bfor\s+([A-Za-z_]\w*)\s+in|\b([A-Za-z_]\w*)\s*(?::[^=\r\n]+)?=(?!=)/g)) bound.add(match[1] || match[2] || match[3] || match[4]);
  for (const match of logical.matchAll(/\bdef\s+\w+\s*\(([^)]*)\)|\blambda\s+([^:\r\n]+):/g)) {
    for (const name of (match[1] || match[2] || '').matchAll(/[A-Za-z_]\w*/g)) bound.add(name[0]);
  }
  const usageCode = code.replace(/(^|[;\n])([ \t]*)(?:from[ \t]+[\w.]+[ \t]+import[ \t]*(?:\([\s\S]*?\)|[^;\r\n]*)|import[ \t]+[^;\r\n]*)/g, match => match.replace(/[^\r\n]/g, ' '));
  const issues: RhinoScriptIssue[] = [];
  for (const [name, statement] of Object.entries(PYTHON_NAMESPACE_IMPORTS)) {
    if (bound.has(name)) continue;
    const use = new RegExp('(^|[^\\w.])' + name + '\\s*\\.', 'm').exec(usageCode);
    if (!use) continue;
    issues.push({ code:'rhino_python_missing_import', line:code.slice(0, use.index + use[1].length).split('\n').length,
      api:name, actualType:'Known Python namespace is used without an explicit import or binding',
      instruction:statement + ' before the first use of ' + name + '. Keep the complete script and original design; fix imports before dispatch. from System import Guid alone does not bind System. Do not rely on imports or variables from previous tool calls. This local rejection executed nothing; never repeat any earlier completed write.',
    });
  }
  return issues;
}

type KnownType = 'BrepFace' | 'Brep' | 'Brep[]' | 'Curve' | 'Vector3d' | 'Boolean' | 'Number';
function expressionType(expression: string, known: Map<string, KnownType>): KnownType | undefined {
  let value = expression.trim();
  while (/^\([^()]*\)$/.test(value)) value = value.slice(1, -1).trim();
  if (/^[A-Za-z_]\w*$/.test(value) && known.has(value)) return known.get(value);
  if (/\.Faces\s*\[[^\[\]]+\]$/.test(value)) return 'BrepFace';
  if (/\b(?:ToBrep|DuplicateFace)\s*\([^()]*\)$/.test(value)) return 'Brep';
  if (/\bCreatePlanarBreps\s*\([\s\S]*\)\s*\[[^\]]+\]$/.test(value)) return 'Brep';
  if (/\bCreatePlanarBreps\s*\([\s\S]*\)$/.test(value)) return 'Brep[]';
  if (/\b(?:PolylineCurve|LineCurve|ArcCurve|NurbsCurve|ToNurbsCurve|To3dCurve)\s*\([\s\S]*\)$/.test(value)) return 'Curve';
  if (/\bVector3d\s*\([\s\S]*\)$/.test(value) || /\bVector3d\.Unit[XYZ]$/.test(value)) return 'Vector3d';
  if (/^(?:True|False|true|false)$/.test(value)) return 'Boolean';
  if (/^[+-]?\d+(?:\.\d+)?$/.test(value)) return 'Number';
  return undefined;
}

function knownAssignments(code: string): Map<string, KnownType> {
  const assignments = new Map<string, string[]>();
  const shadowed = new Set<string>();
  // Ambiguous names (formal parameters/loop variables/reassignments) are not
  // propagated across scopes. Missing a dynamic type is preferable to guessing.
  for (const match of code.matchAll(/(?:def\s+\w+|(?:public|private|internal|protected)\s+(?:\w+\s+)*\w+)\s*\(([^)]*)\)/g)) {
    for (const token of match[1].matchAll(/[A-Za-z_]\w*/g)) shadowed.add(token[0]);
  }
  for (const match of code.matchAll(/\bfor\s+([A-Za-z_]\w*)\s+in\b/g)) shadowed.add(match[1]);
  for (const match of code.replace(/;/g, '\n').matchAll(/^\s*(?:(?:var|BrepFace|Brep|Curve|Surface|Vector3d)\s+)?([A-Za-z_]\w*)\s*=\s*([^=\r\n][^\r\n]*)/gm)) {
    const values = assignments.get(match[1]) || [];
    values.push(match[2].trim());
    assignments.set(match[1], values);
  }
  const known = new Map<string, KnownType>();
  for (let pass = 0; pass < 4; pass++) {
    for (const [name, values] of assignments) {
      if (values.length !== 1 || shadowed.has(name)) continue;
      const type = expressionType(values[0], known);
      if (type) known.set(name, type);
    }
  }
  return known;
}

function callArguments(code: string, start: number): string[] | undefined {
  const args: string[] = [];
  const stack = [')'];
  let beginning = start;
  for (let index = start; index < code.length; index++) {
    const char = code[index];
    if (char === '(' || char === '[' || char === '{') stack.push(char === '(' ? ')' : char === '[' ? ']' : '}');
    else if (char === ')' || char === ']' || char === '}') {
      if (stack.pop() !== char) return undefined;
      if (!stack.length) { const last = code.slice(beginning, index).trim(); if (last) args.push(last); return args; }
    } else if (char === ',' && stack.length === 1) {
      args.push(code.slice(beginning, index).trim()); beginning = index + 1;
      if (args.length > 16) return undefined;
    }
  }
  return undefined;
}

const EXTRUSION_GUIDANCE = 'Surface.CreateExtrusion(profile: Curve, direction: Vector3d) only extrudes a curve. For a trimmed BrepFace (including holes), use face.CreateExtrusion(pathCurve: Curve, cap: bool), check the returned Brep for null/IsValid/IsSolid, and preserve all inner loops. Do not replace the face with only its outer boundary, delete holes, flatten freeform geometry, or commit objects until all in-memory parts validate.';

export function inspectRhinoScript(name: string, script: string): RhinoScriptIssue[] {
  if (!['rhino_native_run_python', 'rhino_native_run_csharp'].includes(name)) return [];
  const code = maskNonCode(script, name.endsWith('run_csharp'));
  const imports = name === 'rhino_native_run_python' ? missingPythonNamespaceImports(code) : [];
  const issues: RhinoScriptIssue[] = [];
  if (isRhinoGhAssemblyReflectionScan(name, script)) {
    const position = code.search(/\bGetTypes\s*\(\s*\)/);
    issues.push({
      code: 'rhino_gh_reflection_scan',
      line: code.slice(0, position).split('\n').length,
      api: 'System.Reflection Assembly.GetTypes',
      actualType: 'Grasshopper assembly type enumeration',
      instruction: GH_REFLECTION_SCAN_GUIDANCE,
    });
  }
  if (!script.includes('CreateExtrusion')) return [...issues,...imports];
  const known = knownAssignments(code);
  const redefinedRoots = new Set<string>();
  for (const match of code.matchAll(/^\s*(?:(?:class|def)\s+([A-Za-z_]\w*)|(?:(?:var|dynamic)\s+)?([A-Za-z_]\w*)\s*=)/gm)) redefinedRoots.add(match[1] || match[2]);
  const surfaceNames = new Set(['Surface', 'Rhino.Geometry.Surface']);
  for (const match of code.matchAll(/\bimport\s+Rhino\.Geometry\s+as\s+(\w+)|\bfrom\s+Rhino\s+import\s+Geometry\s+as\s+(\w+)|\busing\s+(\w+)\s*=\s*Rhino\.Geometry\s*;/g)) surfaceNames.add(`${match[1] || match[2] || match[3]}.Surface`);
  for (const match of code.matchAll(/\bimport\s+Rhino\s+as\s+(\w+)/g)) surfaceNames.add(`${match[1]}.Geometry.Surface`);
  for (const match of code.matchAll(/\bfrom\s+Rhino\.Geometry\s+import\s+([^\r\n]+)/g)) {
    const surface = match[1].match(/(?:^|,)\s*Surface(?:\s+as\s+(\w+))?\s*(?:,|$)/);
    if (surface?.[1]) surfaceNames.add(surface[1]);
  }
  for (const match of code.matchAll(/\b([A-Za-z_]\w*(?:\s*\.\s*[A-Za-z_]\w*)*)\s*\.\s*CreateExtrusion\s*\(/g)) {
    const receiver = match[1].replace(/\s/g, '');
    if (!surfaceNames.has(receiver) || redefinedRoots.has(receiver.split('.')[0])) continue; // face.CreateExtrusion is a different, valid API.
    const args = callArguments(code, match.index! + match[0].length);
    if (!args) continue;
    if (args.length !== 2) {
      issues.push({ code: 'rhino_surface_extrusion_arity', line: script.slice(0, match.index).split('\n').length, api: 'Rhino.Geometry.Surface.CreateExtrusion', actualType: `${args.length} arguments supplied; exactly Curve + Vector3d are required`, instruction: EXTRUSION_GUIDANCE });
      if (issues.length >= 8) break;
      continue;
    }
    const first = expressionType(args[0], known);
    const second = expressionType(args[1], known);
    const incorrect = first && first !== 'Curve' ? { actualType: first, expected: 'Curve' }
      : second && second !== 'Vector3d' ? { actualType: second, expected: 'Vector3d' } : undefined;
    if (!incorrect) continue;
    issues.push({ code: 'rhino_surface_extrusion_argument_type', line: script.slice(0, match.index).split('\n').length,
      api: 'Rhino.Geometry.Surface.CreateExtrusion', actualType: `${incorrect.actualType} supplied where ${incorrect.expected} is required`, instruction: EXTRUSION_GUIDANCE });
    if (issues.length >= 8) break;
  }
  return [...issues,...imports];
}

export function assertRhinoScriptPreflight(name: string, args: Record<string, unknown>): void {
  if (typeof args.script !== 'string') return;
  const issues = inspectRhinoScript(name, args.script);
  if (issues.length) {
    const correctionTool = issues.some(issue => issue.code === 'rhino_gh_reflection_scan')
      ? 'rhino_native_g2_get_canvas_graph'
      : name;
    throw new RhinoNativeScriptPreflightError(issues, correctionTool);
  }
}

/** Diagnostic only: a remote TypeError is NOT evidence that nothing was written. */
export function rhinoScriptFailureExplanation(error: unknown): string | undefined {
  const text = rhinoDiagnosticText(error);
  const missing = text.match(/(?:NameError:\s*)?name\s+['"]([A-Za-z_]\w*)['"]\s+is not defined/i);
  if (missing) {
    const name = missing[1];
    const line = [...text.matchAll(/\bline\s+(\d+)/gi)].slice(-1)[0]?.[1];
    const importStatement = PYTHON_NAMESPACE_IMPORTS[name];
    return 'Python 脚本使用了未定义的名称 ' + name + (line ? '（第 ' + line + ' 行）' : '') + '。'
      + (importStatement ? '需要在使用前明确写入 ' + importStatement + '；不能依赖上一轮工具调用的导入。' : '需要先定义该名称或补齐正确的导入。');
  }
  if (/BrepFace[\s\S]{0,180}(?:cannot be converted|could not be converted)[\s\S]{0,100}(?:Rhino\.Geometry\.)?Curve/i.test(text)
    && /(?:Surface\s*\.?\s*CreateExtrusion|Rhino\.Geometry\.Surface[\s\S]{0,50}CreateExtrusion)/i.test(text)) {
    return '\u5efa\u6a21\u811a\u672c\u628a\u9762\uff08BrepFace\uff09\u4f20\u7ed9\u4e86\u53ea\u63a5\u53d7\u66f2\u7ebf\uff08Curve\uff09\u7684\u62c9\u4f38\u65b9\u6cd5\u3002\u9762\u62c9\u4f38\u5e94\u6539\u7528 BrepFace.CreateExtrusion\uff0c\u5e76\u4fdd\u7559\u5185\u5b54\u3002';
  }
  return undefined;
}

/** A structured MCP isError receipt, not a transport rejection or local guess. */
export class RhinoNativeMcpToolError extends Error {
  constructor(message: string) { super(message); this.name = 'RhinoNativeMcpToolError'; }
}

/** Allows inspection only, NEVER retries. Timeouts/disconnects stay uncertain. */
export const isConfirmedRhinoScriptFailure = (error: unknown): boolean => error instanceof RhinoNativeMcpToolError
  && /Traceback[\s\S]{0,20000}\b(?:TypeError|SyntaxError|ValueError|AttributeError|NameError|IndexError|RuntimeError)\s*:/.test(error.message)
  && !/(?:timed?\s*out|TimeoutException|TaskCanceledException|OperationCanceledException)/i.test(error.message);

/** Reuse the conservative lexical mask for document-write evidence, never evaluate code. */
export const rhinoExecutableScriptCode = (name: string, source: string) => maskNonCode(source, name.endsWith('run_csharp'));
