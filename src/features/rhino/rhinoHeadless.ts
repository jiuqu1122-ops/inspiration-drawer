import { invoke } from '@tauri-apps/api/core';
import { lockRhinoCanvas, registerRhinoNativeTools, RHINO_REFERENCE_REVIEW_TOOL, rhinoToolDefinitions, type RhinoNativeTool } from './rhinoProtocol';
import { RHINO_MODELING_SKILL_RESOURCE_TOOL } from './rhinoProductModelingKnowledge';
import { readRhinoModelingSkillResource } from './rhinoRuntime';
import { rhinoToolObservation } from './rhinoGhSafety';
import { RhinoNativeArgumentError } from './rhinoArgumentRecovery';

export const RHINO_HEADLESS_BUILD_TOOL = 'rhino_native_headless_build';
export const RHINO_HEADLESS_INSPECT_TOOL = 'rhino_native_headless_inspect';
export const RHINO_HEADLESS_EXPORT_TOOL = 'rhino_headless_export';
export class RhinoHeadlessGeometryError extends RhinoNativeArgumentError {}

const xyz = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const points = { type: 'array', items: xyz, minItems: 3, maxItems: 80 };
const backgroundTools: RhinoNativeTool[] = [
  {
    name: RHINO_HEADLESS_INSPECT_TOOL,
    description: 'Read the saved background Rhino model. Returns real object IDs, dimensions, closed-solid flags and volumes in millimeters.',
    readOnly: true, destructive: false, workflowPhase: 'context',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: RHINO_HEADLESS_BUILD_TOOL,
    description: 'Commit one verified, closed-solid modeling step in the background 3DM. Use Rhino object IDs from receipts. Primitive, extrude, loft or revolve can replace one existing part if supplied one ID. For difference, ids[0] is the housing and following IDs are sacrificial cutters, which are consumed. Create the actual separate insert with clearance after cutting its matching seat. For union all IDs are consumed. Use only when geometry relationships call for it.',
    readOnly: false, destructive: false, workflowPhase: 'build',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['operation'],
      properties: {
        operation: { type: 'string', enum: ['box', 'cylinder', 'sphere', 'extrude', 'loft', 'revolve', 'difference', 'union', 'move', 'rotate', 'remove'] },
        name: { type: 'string', maxLength: 100 },
        origin: { ...xyz, description: 'Base origin, sphere center or rotation pivot.' },
        axis: { ...xyz, description: 'Plane normal for box/cylinder or rotation/revolution axis.' },
        size: { ...xyz, description: 'Positive XYZ dimensions for box.' },
        radius: { type: 'number', minimum: 0.05 },
        height: { type: 'number', minimum: 0.05 },
        points: { ...points, description: 'Ordered XYZ profile for extrude; ordered meridian for revolve.' },
        sections: { type: 'array', items: points, minItems: 2, maxItems: 12, description: 'Ordered planar loft profiles with corresponding vertices and consistent winding.' },
        vector: { ...xyz, description: 'Extrusion direction and length, or translation for move.' },
        angleDegrees: { type: 'number', minimum: -360, maximum: 360 },
        ids: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 16 },
        color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
      },
    },
  },
];

type Target = { canvasId: string; workspaceId: string };
const active = new Map<string, Target>();

function workspaceFor(conversationId: string, canvasId: string) {
  const key = `rhino-headless-workspace:${conversationId}:${canvasId}`;
  try {
    const saved = localStorage.getItem(key);
    if (saved && /^[a-f0-9-]{36}$/.test(saved)) return saved;
    const created = crypto.randomUUID();
    localStorage.setItem(key, created);
    return created;
  } catch { return crypto.randomUUID(); }
}

const call = (conversationId: string, target: Target, tool: string, args: Record<string, unknown> = {}) =>
  invoke<Record<string, unknown>>('rhino_headless_mcp_call', {
    conversationId, workspaceId: target.workspaceId, tool, arguments: args,
  });

export const hasHeadlessRhinoTurn = (conversationId: string) => active.has(conversationId);

export function getHeadlessRhinoTools() {
  return [
    ...rhinoToolDefinitions.filter(tool => [RHINO_REFERENCE_REVIEW_TOOL, RHINO_MODELING_SKILL_RESOURCE_TOOL].some(name => name === tool.function.name)),
    ...backgroundTools.map(tool => ({ type: 'function' as const, function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })),
  ];
}

export async function prepareBackgroundRhinoTurn(conversationId: string, canvasId: string) {
  const target = { canvasId, workspaceId: workspaceFor(conversationId, canvasId) };
  const unlock = lockRhinoCanvas(`rhino-headless:${conversationId}`);
  try {
    const context = await call(conversationId, target, 'context');
    active.set(conversationId, target);
    registerRhinoNativeTools(conversationId, backgroundTools);
    return {
      context: JSON.stringify(context),
      documentName: '本机后台 Rhino',
      modelingInstruction: 'This turn uses local headless Rhino. Use the exposed background Rhino inspect/build tools for the same working document. The host saves every validated modeling step and automatically exports a 3DM and mesh preview. Use measured bounds, volumes, and the fresh model raster to verify fit, openings and assembly. Do not promise interactive Rhino/Grasshopper commands or settings in this background mode.',
      exportModel: () => call(conversationId, target, 'export'),
      release: () => {
        if (active.get(conversationId) === target) {
          active.delete(conversationId);
          registerRhinoNativeTools(conversationId, []);
        }
        unlock();
      },
    };
  } catch (error) {
    unlock();
    throw error;
  }
}

export async function executeHeadlessRhinoTool(conversationId: string, canvasId: string, name: string, args: Record<string, unknown>) {
  const target = active.get(conversationId);
  if (!target || target.canvasId !== canvasId) throw new Error('后台 Rhino 任务的画布或会话已切换。');
  switch (name) {
    case RHINO_MODELING_SKILL_RESOURCE_TOOL: return readRhinoModelingSkillResource(args.resourcePath);
    case RHINO_HEADLESS_INSPECT_TOOL: return call(conversationId, target, 'inspect');
    case RHINO_HEADLESS_BUILD_TOOL:
      try { return await call(conversationId, target, 'build', args); }
      catch (error) {
        const message = String(error);
        const prefix = 'RHINO_HEADLESS_GEOMETRY_REJECTED: ';
        if (message.startsWith(prefix)) throw new RhinoHeadlessGeometryError(message.slice(prefix.length));
        throw error;
      }
    case RHINO_REFERENCE_REVIEW_TOOL: {
      const result = await call(conversationId, target, 'preview');
      return rhinoToolObservation(name, [{ type: 'image', mimeType: 'image/png', data: String(result.data || '') }], 0);
    }
    default: throw new Error('当前后台 Rhino 没有开放这个工具。');
  }
}
