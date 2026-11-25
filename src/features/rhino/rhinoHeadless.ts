import { invoke } from '@tauri-apps/api/core';
import { lockRhinoCanvas, registerRhinoNativeTools, RHINO_REFERENCE_REVIEW_TOOL, rhinoToolDefinitions, type RhinoNativeTool } from './rhinoProtocol';
import { RHINO_MODELING_SKILL_RESOURCE_TOOL } from './rhinoProductModelingKnowledge';
import { readRhinoModelingSkillResource } from './rhinoRuntime';
import { rhinoToolObservation } from './rhinoGhSafety';
import { RhinoNativeArgumentError } from './rhinoArgumentRecovery';

export const RHINO_HEADLESS_BUILD_TOOL = 'rhino_native_headless_build';
export const RHINO_HEADLESS_INSPECT_TOOL = 'rhino_native_headless_inspect';
export const RHINO_HEADLESS_EXPORT_TOOL = 'rhino_headless_export';
export class RhinoHeadlessGeometryError extends RhinoNativeArgumentError {
  constructor(message: string, readonly dispatched = true) { super(message); }
}

const xyz = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 };
const points = { type: 'array', items: xyz, minItems: 3, maxItems: 80 };
const cageIndex = { type: 'integer', minimum: 0, maximum: 383 };
const componentId = { type: 'integer', minimum: 1, maximum: 4294967295 };
const backgroundTools: RhinoNativeTool[] = [
  {
    name: RHINO_HEADLESS_INSPECT_TOOL,
    description: 'Read geometry types, object IDs, dimensions, closure and Brep volumes in millimeters. With subdId, inspect one native SubD cage and return stable native vertex and edge IDs, XYZ control points and crease states.',
    readOnly: true, destructive: false, workflowPhase: 'context',
    inputSchema: { type: 'object', properties: { subdId: { type: 'string', description: 'Existing SubD object ID from the inventory.' } }, additionalProperties: false },
  },
  {
    name: RHINO_HEADLESS_BUILD_TOOL,
    description: 'Commit one verified modeling step in the background 3DM. Use subd to create native Rhino SubD from a consistently wound control cage, with optional crease edges and closure. Use edit_subd to move control points or edit creases on one SubD, using native component IDs from inspect(subdId). SubD stays editable. Primitive, extrude, loft or revolve create closed Breps. These constructions and subd can replace one existing part via ids. Brep difference consumes the housing at ids[0] and the sacrificial cutters after it. Use matching seats and clearance for separate inserts. Brep union consumes all supplied IDs.',
    readOnly: false, destructive: false, workflowPhase: 'build',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['operation'],
      properties: {
        operation: { type: 'string', enum: ['box', 'cylinder', 'sphere', 'extrude', 'loft', 'revolve', 'subd', 'edit_subd', 'difference', 'union', 'move', 'rotate', 'remove'] },
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
        cageVertices: { type: 'array', items: xyz, minItems: 3, maxItems: 384, description: 'For subd: XYZ control cage coordinates in millimeters. Adjacent faces share vertex indices.' },
        cageFaces: { type: 'array', items: { type: 'array', items: cageIndex, minItems: 3, maxItems: 4 }, minItems: 1, maxItems: 512, description: 'For subd: ordered triangles or quads of zero-based cageVertices indices. Use opposite directions on shared edges. Prefer quads for continuous surface flow.' },
        creaseEdges: { type: 'array', items: { type: 'array', items: cageIndex, minItems: 2, maxItems: 2 }, maxItems: 128, description: 'For subd: pairs of zero-based cageVertices indices identifying actual edges to crease.' },
        requireClosed: { type: 'boolean', description: 'For SubD operations: set true for a closed part; omit for intentional open surfaces. Editing a closed part preserves closure.' },
        cageEdits: {
          type: 'array', minItems: 1, maxItems: 384, description: 'For edit_subd: replace selected control point locations using native vertex IDs from inspection.',
          items: { type: 'object', additionalProperties: false, required: ['vertexId', 'point'], properties: { vertexId: componentId, point: xyz } },
        },
        creaseEdits: {
          type: 'array', minItems: 1, maxItems: 128, description: 'For edit_subd: change the crease state using native edge IDs from inspection.',
          items: { type: 'object', additionalProperties: false, required: ['edgeId', 'crease'], properties: { edgeId: componentId, crease: { type: 'boolean' } } },
        },
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

const call = (conversationId: string, target: Target, tool: string, args: Record<string, unknown> = {}, requestedMajor?: 8 | 9) =>
  invoke<Record<string, unknown>>('rhino_headless_mcp_call', {
    conversationId, workspaceId: target.workspaceId, tool, arguments: args,
    ...(requestedMajor && { requestedMajor }),
  });

export const hasHeadlessRhinoTurn = (conversationId: string) => active.has(conversationId);

export function getHeadlessRhinoTools() {
  return [
    ...rhinoToolDefinitions.filter(tool => [RHINO_REFERENCE_REVIEW_TOOL, RHINO_MODELING_SKILL_RESOURCE_TOOL].some(name => name === tool.function.name)),
    ...backgroundTools.map(tool => ({ type: 'function' as const, function: { name: tool.name, description: tool.description, parameters: tool.inputSchema } })),
  ];
}

export async function prepareBackgroundRhinoTurn(conversationId: string, canvasId: string, requestedMajor?: 8 | 9) {
  const target = { canvasId, workspaceId: workspaceFor(conversationId, canvasId) };
  const unlock = lockRhinoCanvas(`rhino-headless:${conversationId}`);
  try {
    const context = await call(conversationId, target, 'context', {}, requestedMajor);
    active.set(conversationId, target);
    registerRhinoNativeTools(conversationId, backgroundTools);
    return {
      context: JSON.stringify(context),
      documentName: typeof context.rhinoVersion === 'string' ? `本机后台 Rhino ${context.rhinoVersion}` : '本机后台 Rhino',
      modelingInstruction: 'This turn uses local headless Rhino. The background build tool can create and edit native Rhino SubD in the same working document. For SubD or 细分建模 requests, use operation subd with an explicit control cage, then inspect its native control points and edges with subdId and refine with edit_subd. Plan matching openings and mating surfaces into the cage topology. Model separate parts separately as required by the assembly. Preserve native SubD through the exported 3DM. The host saves each validated step and automatically exports a 3DM and a preview. Verify geometry type, bounds, closure where required, fit and silhouette with inspection and fresh previews. Interactive Rhino and Grasshopper commands are unavailable in this mode.',
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
    case RHINO_HEADLESS_INSPECT_TOOL: return call(conversationId, target, 'inspect', args);
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
