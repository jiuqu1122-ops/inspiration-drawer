import program from './modeling/gh2_model_verification.py?raw';
import type { RhinoNativeTool } from './rhinoProtocol';
import type { ChatToolCall } from '../chat/model/chatTypes';
import { RhinoNativeArgumentError } from './rhinoArgumentRecovery';

export const GH2_VERIFY_MODEL_TOOL = 'rhino_native_g2_verify_model';
export const GH2_REPAIR_OUTPUTS_TOOL = 'rhino_native_g2_repair_output_conversion';
export const GH2_MODEL_MARKER = 'INSPIRATION_GH2_MODEL_V1:';
const ids = { type: 'array', minItems: 1, maxItems: 64, items: { type: 'string', pattern: '^[a-fA-F0-9-]{36}$' } };
export const gh2ModelTools = (): RhinoNativeTool[] => [{
  name: GH2_VERIFY_MODEL_TOOL, readOnly: true, destructive: false, workflowPhase: 'verify',
  description: 'Required post-build GH2 model acceptance. Read exact selected final components and geometry output parameter IDs from the current graph first. Checks real CLR output types (including opaque Python.Runtime.PyObject), every output item up to a bounded audit, valid native geometry, connected-empty inputs, unavailable components, component faults and actual preview caches/display settings. Solve success or a printed object count alone cannot pass. Does not change the graph. For any product or shape, diagnose and repair concrete issues, solve and reverify after the last write. This is structural/preview-data verification, not design fidelity or camera framing.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['componentIds', 'geometryOutputIds'], properties: { componentIds: ids, geometryOutputIds: ids } },
}, {
  name: GH2_REPAIR_OUTPUTS_TOOL, readOnly: false, destructive: false, workflowPhase: 'build',
  description: 'Repair only diagnosed opaque Python.Runtime.PyObject FINAL geometry outputs by enabling their existing Python output-marshalling property. Requires exact GH2 documentId from g2_verify_model and exact selected component/output IDs. Rechecks diagnosis before changing anything; touches no code, nodes, wires, sliders, input/Guid conversion, geometry or preview modes. Leaves intentional Python-to-Python intermediate data alone by selecting final geometry outputs only. Does not solve or prove completion: follow with native g2_solve_canvas and g2_verify_model. No blind replay after an uncertain result.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['componentIds', 'geometryOutputIds', 'expectedDocumentId'], properties: { componentIds: ids, geometryOutputIds: ids, expectedDocumentId: { type: 'string', pattern: '^[a-fA-F0-9-]{36}$' } } },
}];
const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id);
export function buildGh2ModelScript(args: Record<string, unknown>, repair = false): string {
  const plan: Record<string, unknown> = {};
  for (const key of ['componentIds', 'geometryOutputIds']) {
    const value = args[key];
    if (!Array.isArray(value) || !value.length || value.length > 64 || value.some(id => !validId(id)) || new Set(value.map(id => String(id).toLowerCase())).size !== value.length) throw new RhinoNativeArgumentError(`Provide 1..64 unique exact GH2 ${key}`);
    plan[key] = value;
  }
  if (repair) {
    if (!validId(args.expectedDocumentId)) throw new RhinoNativeArgumentError('Supply the exact GH2 document ID returned by diagnosis');
    plan.expectedDocumentId = args.expectedDocumentId;
  }
  let binary = '';
  for (const byte of new TextEncoder().encode(JSON.stringify(plan))) binary += String.fromCharCode(byte);
  return `${program}\nimport base64 as _g2v_base64\n_g2v_plan = _g2v_json.loads(_g2v_base64.b64decode('${btoa(binary)}').decode('utf-8'))\nprint('${GH2_MODEL_MARKER}' + _g2v_json.dumps(${repair ? '_g2v_repair_outputs' : '_g2v_audit'}(_g2v_plan), ensure_ascii=True))\n`;
}

export function parseGh2ModelReport(blocks: Array<{type: string; text?: string}>): Record<string, unknown> | undefined {
  for (const block of blocks) {
    if (block.type !== 'text') continue;
    try {
      const outer = JSON.parse(block.text || '{}');
      const line = String(outer.stdout || '').split(/\r?\n/).find(line => line.startsWith(GH2_MODEL_MARKER));
      if (!line) continue;
      const report = JSON.parse(line.slice(GH2_MODEL_MARKER.length));
      if (report.version === 1 && Array.isArray(report.issues) && Array.isArray(report.outputs) && ['passed', 'needs_attention'].includes(report.status)) return report;
    } catch { /* Missing/invalid native receipts cannot pass the completion gate. */ }
  }
}

export function gh2CompletionState(calls: ChatToolCall[], isWrite: (name: string) => boolean) {
  let latestWriteIndex = -1;
  for (let index = 0; index < calls.length; index++) {
    const call = calls[index];
    if (!['completed', 'error'].includes(call.status) || !isWrite(call.toolName) || call.toolName === 'rhino_native_get_viewport_image' || call.toolName === 'rhino_review_viewport' || call.toolName.endsWith('_start')) continue;
    if (latestWriteIndex >= 0 || call.toolName.startsWith('rhino_native_g2_')) latestWriteIndex = index;
  }
  if (latestWriteIndex < 0) return undefined;
  const latestWrite = calls[latestWriteIndex];
  const audit = calls.slice(latestWriteIndex + 1).reverse().find(call => call.toolName === GH2_VERIFY_MODEL_TOOL && call.status === 'completed');
  let report: Record<string, unknown> | undefined;
  try { report = JSON.parse(audit?.resultJson || '{}').gh2Verification; } catch { /* Keep unverified. */ }
  const passed = report?.version === 1 && report.status === 'passed' && report.graphChanged === false && report.previewAvailable === true
    && Array.isArray(report.issues) && report.issues.length === 0 && Array.isArray(report.outputs) && report.outputs.length > 0
    && report.outputs.every((row: any) => row?.validGeometryItems > 0 && row.invalidGeometryItems === 0 && row.items > 0
      && row.rawItemTypes && !Object.keys(row.rawItemTypes).some(name => name.includes('Python.Runtime.PyObject')));
  return { latestWriteId: latestWrite.id, passed: Boolean(passed), report };
}

export function gh2IssueSummary(report: Record<string, unknown> | undefined): string {
  const labels: Record<string, string> = {
    python_output_not_marshaled: 'Python 输出仍是原始对象，尚未转换成原生几何',
    geometry_output_empty: '最终几何输出为空', no_native_geometry: '最终输出未找到有效原生几何',
    invalid_geometry: '最终输出含有无效几何', preview_cache_empty: '最终输出没有可绘制的预览数据',
    output_preview_hidden: '最终组件或输出的预览处于隐藏状态', document_preview_disabled: 'GH2 文档预览已关闭',
    preview_selection_filter: '仅预览选中对象的设置排除了最终组件', connected_input_empty: '有数据的来源未能传入下游端口',
    component_unavailable: '组件未加载，当前只是占位节点', component_fault: '组件存在实际运行错误',
    inspection_incomplete: '输出规模超出本次完整检查范围，尚未验证全部数据',
  };
  const issues = Array.isArray(report?.issues) ? report.issues as Array<{code?: string}> : [];
  return [...new Set(issues.map(issue => labels[issue.code || ''] || '存在尚未解决的原生验收问题'))].join('；') || '尚未取得有效的原生验收记录';
}
