import { invoke } from '@tauri-apps/api/core';
import { validateRhinoConnection, type RhinoBinding, type RhinoConnection } from './rhinoProtocol';

export async function discoverRhino(): Promise<RhinoConnection> {
  return validateRhinoConnection(await invoke('rhino_beta_get_connection'));
}

export async function rhinoRequest<T>(connection: RhinoConnection, path: string, body?: unknown): Promise<T> {
  validateRhinoConnection(connection);
  if (!/^\/(drawer\/(?:heartbeat|ack)|mcp)$/.test(path)) throw new Error('Rhino Beta 路径无效');
  return invoke<T>('rhino_beta_request', { instanceId: connection.instanceId, path, body: body ?? {} });
}

const initialized = new Map<string, Promise<void>>();
export async function callRhinoTool(binding: RhinoBinding, name: string, args: Record<string, unknown> = {}) {
  const { connection, documentId } = binding;
  if (!initialized.has(connection.instanceId)) {
    const init = (async () => {
      const response = await rhinoRequest<{ result?: unknown; error?: { message: string } }>(connection, '/mcp', {
        jsonrpc: '2.0', id: crypto.randomUUID(), method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'inspiration-drawer', version: '0.1.0-beta.1' } },
      });
      if (response.error || !response.result) throw new Error(response.error?.message || 'Rhino MCP 初始化失败');
      await rhinoRequest(connection, '/mcp', { jsonrpc: '2.0', method: 'notifications/initialized' });
    })().catch(error => { initialized.delete(connection.instanceId); throw error; });
    initialized.set(connection.instanceId, init);
  }
  await initialized.get(connection.instanceId);
  const response = await rhinoRequest<{
    error?: { message: string };
    result?: { isError?: boolean; content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> };
  }>(connection, '/mcp', {
    jsonrpc: '2.0', id: crypto.randomUUID(), method: 'tools/call',
    params: { name, arguments: { ...args, documentId } },
  });
  if (response.error || !response.result) throw new Error(response.error?.message || 'Rhino MCP 没有返回结果');
  if (response.result.isError) throw new Error(response.result.content.map(item => item.text || '').join('\n'));
  return response.result.content;
}
