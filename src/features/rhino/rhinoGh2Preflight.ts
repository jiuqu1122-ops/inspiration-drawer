import type { RhinoScriptIssue } from './rhinoArgumentRecovery';

type SdkValue = 'editorType' | 'editor' | 'canvas' | 'document' | 'objectList';
const activeCanvasGuidance = 'For GH2 use rhino_native_g2_get_canvas_graph and rhino_native_g2_inspect_parameters with exact IDs. For custom inspection, import Grasshopper2.UI.Editor, check Editor.Instance/Canvas/Document, then iterate doc.Objects.Forwards or find an exact ID with doc.Objects.Find(System.Guid(id)). Preserve already placed nodes and wires.';
const path = '[A-Za-z_]\\w*(?:[ \\t]*\\.[ \\t]*[A-Za-z_]\\w*)*';

/** Track only obvious active GH2 paths. Leave other object collections alone. */
export function inspectRhinoGh2Sdk(source: string, code: string): RhinoScriptIssue[] {
  const lines = code.split('\n');
  const original = source.split('\n');
  const bindings = new Map<string, SdkValue>([['Grasshopper2.UI.Editor', 'editorType']]);
  const rhinoRoots = new Set<string>(['Rhino']);
  const pluginTypes = new Set<string>();
  const transition: Partial<Record<SdkValue, Record<string, SdkValue>>> = {
    editorType: { Instance: 'editor' }, editor: { Canvas: 'canvas' },
    canvas: { Document: 'document' }, document: { Objects: 'objectList' },
  };
  const valueOf = (name: string) => {
    const parts = name.replace(/\s/g, '').split('.');
    for (let n = parts.length; n > 0; n--) {
      let value = bindings.get(parts.slice(0, n).join('.'));
      if (!value) continue;
      for (const member of parts.slice(n)) value = value && transition[value]?.[member];
      return value;
    }
    return undefined;
  };
  const iteration = new RegExp(`\\bfor\\s+[^:\\n]+?\\s+in\\s+(${path})(?=\\s*(?::|[)\\],]|\\bif\\b|$))|\\b(?:list|tuple|iter|set|sorted)\\(\\s*(${path})\\s*(?=[,)])`, 'g');
  const loadedPlugins = new RegExp(`\\b(${path})\\s*\\.\\s*GetLoadedPlugIns\\s*\\(`, 'g');
  const issues: RhinoScriptIssue[] = [];
  for (const [index, line] of lines.entries()) {
    const editorImport = line.match(/^\s*from\s+Grasshopper2\.UI\s+import\s+Editor(?:\s+as\s+(\w+))?\s*$/);
    if (editorImport) bindings.set(editorImport[1] || 'Editor', 'editorType');
    const uiImport = line.match(/^\s*import\s+Grasshopper2\.UI\s+as\s+(\w+)\s*$/);
    if (uiImport) bindings.set(uiImport[1] + '.Editor', 'editorType');
    const rhinoImport = line.match(/^\s*import\s+Rhino\s+as\s+(\w+)\s*$/);
    if (rhinoImport) rhinoRoots.add(rhinoImport[1]);
    const pluginImport = line.match(/^\s*from\s+Rhino\.PlugIns\s+import\s+PlugIn(?:\s+as\s+(\w+))?\s*$/);
    if (pluginImport) pluginTypes.add(pluginImport[1] || 'PlugIn');

    for (const match of line.matchAll(iteration)) {
      if (valueOf(match[1] || match[2]) !== 'objectList') continue;
      issues.push({ code: 'rhino_gh2_object_list_not_iterable', line: index + 1,
        api: 'Grasshopper2.Doc.ObjectList', actualType: 'ObjectList cannot be directly iterated',
        instruction: activeCanvasGuidance });
    }
    for (const match of line.matchAll(loadedPlugins)) {
      const receiver = match[1].replace(/\s/g, '');
      if (!pluginTypes.has(receiver) && ![...rhinoRoots].some(root => receiver === root + '.PlugIns.PlugIn')) continue;
      issues.push({ code: 'rhino_plugin_loaded_api_missing', line: index + 1,
        api: 'Rhino.PlugIns.PlugIn.GetLoadedPlugIns', actualType: 'this member does not exist in RhinoCommon',
        instruction: activeCanvasGuidance + ' For a separate inventory task, use Rhino.PlugIns.PlugIn.GetInstalledPlugInNames(Rhino.PlugIns.PlugInType.Any, True, False) for loaded names.' });
    }
    const assignment = line.match(new RegExp(`^\\s*([A-Za-z_]\\w*)\\s*=(?!=)\\s*(${path})\\s*(?:if .* else None\\s*)?$`));
    const target = line.match(/^\s*([A-Za-z_]\w*)\s*=(?!=)/)?.[1];
    if (target) {
      const viaEto = /^\s*\w+\s*=\s*next\s*\(/.test(line) && /\.Windows\b.*\.GetType\s*\(\s*\)\s*\.\s*FullName\s*==/.test(line)
        && /\.FullName\s*==\s*(['"])Grasshopper2\.UI\.Editor\1/.test(original[index]);
      const value = viaEto ? 'editor' : assignment && valueOf(assignment[2]);
      if (value) bindings.set(target, value);
      else bindings.delete(target);
      rhinoRoots.delete(target);
      pluginTypes.delete(target);
    }
  }
  return issues;
}
