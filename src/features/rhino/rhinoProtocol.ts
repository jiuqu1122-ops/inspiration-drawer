/** Versioned contract shared by the desktop Chat and the Rhino Beta host. */
export const RHINO_PROTOCOL = 1;
const activeRuns = new Set<string>();
export const isRhinoCanvasLocked = () => activeRuns.size > 0;
export function lockRhinoCanvas(requestId: string) {
  activeRuns.add(requestId);
  return () => { activeRuns.delete(requestId); };
}
export type RhinoConnection = { protocol: number; url: string; token: string; instanceId: string };
export type RhinoBinding = { connection: RhinoConnection; documentId: number; canvasId: string };
export type RhinoCommand = {
  id: string;
  kind: 'send' | 'stop' | 'new' | 'select' | 'model' | 'image-model';
  conversationId?: string;
  content?: string;
  value?: string;
  includeViewport?: boolean;
  includeCanvasSelection?: boolean;
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
] as const;

export const isRhinoReadTool = (name: string) => RHINO_READ_TOOLS.some(([id]) => id === name);
export const rhinoToolDefinitions = RHINO_READ_TOOLS.map(([name, description]) => ({
  type: 'function' as const,
  function: {
    name, description,
    parameters: {
      type: 'object',
      properties: { layer: { type: 'string', description: '可选的完整图层路径' }, limit: { type: 'integer', minimum: 1, maximum: 200 } },
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
