import { assertRhinoScriptPreflight, isConfirmedRhinoScriptFailure, RhinoNativeMcpToolError } from './rhinoScriptPreflight';
import { buildDocumentGeometrySnapshotScript, SNAPSHOT_DOCUMENT_GEOMETRY_TOOL } from './rhinoDocumentGeometry';
import { buildGhVerificationScript, guardRhinoGhScript, ghVerificationTool, VERIFY_GH_TOOL } from './rhinoGhSafety';
import { buildSafeProfileScript, canUseSafeProfileTool, SAFE_PROFILE_TOOL, safeProfileTool } from './rhinoSafeModeling';
import { invoke } from '@tauri-apps/api/core';
import {
  registerRhinoNativeTools,
  validateRhinoConnection,
  type RhinoBinding,
  type RhinoConnection,
  type RhinoNativeBinding,
  type RhinoNativeTool,
} from './rhinoProtocol';
import { describeRhinoNativeTool, getRhinoNativeWorkflowPhase, isRhinoNativeReadOnlyPhase } from './rhinoWorkflow';

export async function discoverRhino(): Promise<RhinoConnection> {
  return validateRhinoConnection(await invoke('rhino_beta_get_connection'));
}

export async function discoverRhinoConnections(): Promise<RhinoConnection[]> {
  const values = await invoke<unknown[]>('rhino_beta_get_connections');
  if (!Array.isArray(values)) throw new Error('Rhino instance discovery returned an invalid list');
  const connections = values.slice(0, 128).flatMap(value => {
    try { return [validateRhinoConnection(value)]; } catch { return []; }
  });
  return [...new Map(connections.map(connection => [connection.instanceId, connection])).values()];
}

export async function rhinoRequest<T>(connection: RhinoConnection, path: string, body?: unknown): Promise<T> {
  validateRhinoConnection(connection);
  if (!/^\/(drawer\/(?:heartbeat|ack)|mcp)$/.test(path)) throw new Error('Rhino Beta \u8def\u5f84\u65e0\u6548');
  return invoke<T>('rhino_beta_request', { instanceId: connection.instanceId, path, body: body ?? {} });
}

const reservedNativeNames = new Set(['safe_profile_solids', 'verify_gh_geometry', 'snapshot_document_geometry']);
/** MCP names and provider function names have different alphabets/length limits. */
export function rhinoNativeFunctionName(rawName: string) {
  if (/^[A-Za-z0-9_-]{1,51}$/.test(rawName) && !reservedNativeNames.has(rawName)) return 'rhino_native_' + rawName;
  let hash = 2166136261;
  for (const code of rawName) hash = Math.imul(hash ^ code.charCodeAt(0), 16777619);
  return 'rhino_native_' + rawName.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) + '_' + (hash >>> 0).toString(16).padStart(8, '0');
}
function nativeToolDefinitions(value: unknown): RhinoNativeTool[] {
  const payload = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const tools = Array.isArray(payload.tools) ? payload.tools : [];
  const seen = new Set<string>();
  return tools.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const record = item as Record<string, unknown>;
    const rawName = typeof record.name === 'string' ? record.name : '';
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(rawName) || /^_router_/i.test(rawName) || seen.has(rawName)) return [];
    seen.add(rawName);
    const name = rhinoNativeFunctionName(rawName);
    const schema = record.inputSchema;
    const annotations = record.annotations && typeof record.annotations === 'object' ? record.annotations as Record<string, unknown> : {};
    const inputSchema = schema && typeof schema === 'object' && !Array.isArray(schema)
      ? schema as Record<string, unknown> : { type: 'object', properties: {}, additionalProperties: false };
    const phase = getRhinoNativeWorkflowPhase(rawName);
    const readOnly = typeof annotations.readOnlyHint === 'boolean' ? annotations.readOnlyHint : isRhinoNativeReadOnlyPhase(phase);
    return [{ name, rawName, inputSchema, readOnly, destructive: annotations.destructiveHint === true, workflowPhase: phase,
      description: describeRhinoNativeTool({ name:rawName,
        description:'Native RhinoAI MCP: ' + String(record.description || record.title || rawName), readOnly, destructive:annotations.destructiveHint === true }),
    } satisfies RhinoNativeTool];
  });
}

/** All advertised mutations count, including future tools not in phase heuristics. */
export const hasRhinoNativeWriteTools = (binding: RhinoNativeBinding | undefined): boolean => Boolean(binding?.tools.some(tool =>
  tool.readOnly === false,
));

const initialized = new Map<string, Promise<void>>();
export async function discoverNativeRhino(binding: RhinoBinding, conversationId: string, onNotice?: (message: string) => void): Promise<RhinoNativeBinding | undefined> {
  try {
    registerRhinoNativeTools(conversationId, []);
    const blocks = await callRhinoTool(binding, 'rhino_list_native_tools');
    const payload = blocks.flatMap(block => {
      if (block.type !== 'text') return [];
      try { const value = JSON.parse(block.text || ''); return value && typeof value === 'object' ? [value as Record<string, unknown>] : []; } catch { return []; }
    })[0];
    if (!payload || payload.available !== true) {
      const reason = typeof payload?.reason === 'string' ? payload.reason : 'No matching RhinoAI native MCP listener was found.';
      onNotice?.(`RhinoAI MCP unavailable: ${reason}`);
      return undefined;
    }
    const tools = nativeToolDefinitions(payload);
    if (canUseSafeProfileTool(tools)) tools.push(safeProfileTool(), ghVerificationTool());
    if (!tools.length) { onNotice?.("RhinoAI MCP returned no usable tools"); return undefined; }
    registerRhinoNativeTools(conversationId, tools);
    return { tools };
  } catch (error) {
    onNotice?.(`RhinoAI MCP connection failed: ${String(error)}`);
    return undefined;
  }
}

export async function callRhinoTool(binding: RhinoBinding, name: string, args: Record<string, unknown> = {}) {
  assertRhinoScriptPreflight(name, args);
  if (name === SNAPSHOT_DOCUMENT_GEOMETRY_TOOL) {
    return callRhinoTool(binding, 'rhino_call_native_tool', { toolName: 'run_python', arguments: { script: buildDocumentGeometrySnapshotScript() } });
  }
  if (name === VERIFY_GH_TOOL) {
    return callRhinoTool(binding, 'rhino_call_native_tool', { toolName: 'run_python', arguments: { script: buildGhVerificationScript(args) } });
  }
  if (name === 'rhino_native_run_python' && typeof args.script === 'string') args = { ...args, script: guardRhinoGhScript(args.script) };
  if (name === SAFE_PROFILE_TOOL) {
    return callRhinoTool(binding, 'rhino_native_run_python', { script: buildSafeProfileScript(args) });
  }
  if (name.startsWith('rhino_native_')) {
    return callRhinoTool(binding, 'rhino_call_native_tool', { toolName: binding.native?.tools.find(tool => tool.name === name)?.rawName || name.slice('rhino_native_'.length), arguments: args });
  }
  const { connection, documentId } = binding;
  if (!initialized.has(connection.instanceId)) {
    const init = (async () => {
      const response = await rhinoRequest<{ result?: unknown; error?: { message: string } }>(connection, '/mcp', {
        jsonrpc: '2.0', id: crypto.randomUUID(), method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'inspiration-drawer', version: '8.0.27-beta.32' } },
      });
      if (response.error || !response.result) throw new Error(response.error?.message || 'Rhino MCP \u521d\u59cb\u5316\u5931\u8d25');
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
  if (response.error || !response.result) throw new Error(response.error?.message || 'Rhino MCP \u6ca1\u6709\u8fd4\u56de\u7ed3\u679c');
  if (response.result.isError) throw new RhinoNativeMcpToolError(response.result.content.map(item => item.text || '').join('\n'));
  if (name === 'rhino_call_native_tool' && args.toolName === 'run_python') {
    // Some MCP hosts report tool completion but put the Python exception in
    // stderr. A traceback is not a successful geometry receipt.
    for (const block of response.result.content) {
      if (block.type !== 'text') continue;
      let stderr: unknown;
      try { stderr = JSON.parse(block.text || '{}').stderr; } catch { continue; }
      if (typeof stderr === 'string') {
        const failure = new RhinoNativeMcpToolError(stderr);
        if (isConfirmedRhinoScriptFailure(failure)) throw failure;
      }
    }
  }
  return response.result.content;
}

/** RhinoAI's C# host currently fails before script execution when its Roslyn
 * loader requests System.Collections.Immutable 9 inside Rhino's .NET 8 process. */
export const isRhinoCSharpImmutableV9LoadFailure = (error: unknown) =>
  /Could not load file or assembly[\s\S]{0,240}System\.Collections\.Immutable[\s\S]{0,180}Version=9\.0\.0\.0[\s\S]{0,240}(?:could not find or load a specific file|0x80131621)/i.test(String(error));
