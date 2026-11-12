/** Versioned contract shared by the desktop Chat and the Rhino Beta host. */
export const RHINO_PROTOCOL = 1;
const activeRuns = new Set<string>();
export const isRhinoCanvasLocked = () => activeRuns.size > 0;
export function lockRhinoCanvas(requestId: string) {
  activeRuns.add(requestId);
  return () => { activeRuns.delete(requestId); };
}
export type RhinoConnection = { protocol: number; url: string; token: string; instanceId: string };
export type RhinoNativeTool = {
  name: string;
  rawName?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  readOnly: boolean;
  destructive: boolean;
  workflowPhase?: string;
};
export type RhinoNativeBinding = { tools: RhinoNativeTool[] };
export type RhinoBinding = { connection: RhinoConnection; documentId: number; canvasId: string; native?: RhinoNativeBinding };

const nativeToolsByConversation = new Map<string, Map<string, RhinoNativeTool>>();
export function registerRhinoNativeTools(conversationId: string, tools: RhinoNativeTool[]) {
  nativeToolsByConversation.set(conversationId, new Map(tools.map(tool => [tool.name, tool])));
}
export function getRhinoNativeTools(conversationId: string) {
  return [...(nativeToolsByConversation.get(conversationId)?.values() || [])];
}
export function getRhinoNativeTool(name: string, conversationId: string) {
  return nativeToolsByConversation.get(conversationId)?.get(name);
}
export function isRhinoNativeTool(name: string, conversationId: string) {
  return nativeToolsByConversation.get(conversationId)?.has(name) === true;
}
export type RhinoCommand = {
  id: string;
  kind: 'send' | 'stop' | 'new' | 'select' | 'delete' | 'model' | 'image-model' | 'image-aspect-ratio' | 'image-resolution' | 'image-quality' | 'mask-mode' | 'approve-tool' | 'preview-image';
  conversationId?: string;
  content?: string;
  value?: string;
  maskLayer?: string;
  includeViewport?: boolean;
  includeCanvasSelection?: boolean;
  toolCallId?: string;
  approved?: boolean;
  messageId?: string;
  imageIndex?: number;
  documentId: number;
};

export function validateRhinoConnection(value: unknown): RhinoConnection {
  const data = value as Partial<RhinoConnection> | null;
  if (!data || data.protocol !== RHINO_PROTOCOL || typeof data.url !== 'string'
    || typeof data.token !== 'string' || !/^[a-f0-9]{64}$/.test(data.token)
    || typeof data.instanceId !== 'string' || !/^[a-f0-9]{32}$/.test(data.instanceId)) {
    throw new Error('Rhino Beta 连接信息无效');
  }
  const url = new URL(data.url);
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || !url.port
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('Rhino Beta 只允许连接本机回环地址');
  }
  return data as RhinoConnection;
}

export const RHINO_READ_TOOLS = [
  ['rhino_get_context', '读取本会话绑定的 Rhino 文档、相机和当前选择。'],
  ['rhino_list_objects', '查询绑定文档的对象 ID、图层、名称和类型，可按图层过滤。'],
  ['rhino_list_layers', '查询绑定文档的图层路径、可见性与对象数。'],
  ['rhino_list_parts', '读取当前选中对象的稳定分件 ID、有效简单材质、面级材质、图层和块实例变换。返回真实模型数据，不包含可见区遮罩；对父级材质继承仅报告 RhinoCommon 可验证的值。'],
] as const;

export const isRhinoReadTool = (name: string) => RHINO_READ_TOOLS.some(([id]) => id === name);
export const rhinoToolDefinitions = RHINO_READ_TOOLS.map(([name, description]) => ({
  type: 'function' as const,
  function: {
    name, description,
    parameters: {
      type: 'object',
      properties: name === 'rhino_list_objects'
        ? { layer: { type: 'string', description: '可选的完整图层路径' }, limit: { type: 'integer', minimum: 1, maximum: 200 } }
        : name === 'rhino_list_parts' ? { limit: { type: 'integer', minimum: 1, maximum: 200, description: '分件上限' } } : {},
      additionalProperties: false,
    },
  },
}));

/** Pins the original target. A late tool/result must never use a newly selected canvas. */
export function assertRhinoCanvas(binding: RhinoBinding, canvasId: string) {
  if (binding.canvasId !== canvasId) throw new Error('画布已切换。为避免写入错误画布，本轮操作已暂停；请返回原画布继续。');
}

export class RhinoCommandLedger {
  private ids = new Set<string>();
  claim(id: string) {
    if (!/^[a-zA-Z0-9-]{8,100}$/.test(id) || this.ids.has(id)) return false;
    this.ids.add(id);
    return true;
  }
}
