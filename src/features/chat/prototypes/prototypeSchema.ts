/** Versioned, data-only contract shared by the preview and offline Figma importer. */
export const PROTOTYPE_VERSION = 1;
export const MAX_PROTOTYPE_BYTES = 2_000_000;
export type PrototypeKind = 'frame' | 'rect' | 'text' | 'button' | 'image' | 'stateGroup' | 'state';
export type PrototypeScreen = { id: string; name: string; width: number; height: number; background?: string; overlay?: boolean };
export type PrototypeNode = {
  id: string; parentId: string; kind: PrototypeKind; name?: string;
  x?: number; y?: number; width: number; height: number;
  fill?: string; stroke?: string; strokeWidth?: number; radius?: number; opacity?: number;
  layout?: 'absolute' | 'horizontal' | 'vertical'; gap?: number; padding?: number;
  align?: 'start' | 'center' | 'end'; justify?: 'start' | 'center' | 'end' | 'space-between';
  text?: string; color?: string; fontFamily?: string; fontSize?: number; fontWeight?: 400 | 500 | 600 | 700;
  textAlign?: 'left' | 'center' | 'right'; lineHeight?: number;
  imageData?: string; initialStateId?: string;
};
export type PrototypeInteraction = {
  sourceId: string; action: 'navigate' | 'openOverlay' | 'closeOverlay' | 'back' | 'setState';
  targetId?: string; stateId?: string;
};
export type PrototypeDocument = {
  schemaVersion: 1; id: string; name: string; startScreenId: string;
  screens: PrototypeScreen[]; nodes: PrototypeNode[]; interactions: PrototypeInteraction[];
};
const idSchema = { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,79}$', maxLength: 80 };
const dimension = { type: 'number', minimum: 1, maximum: 8192 };
const colorSchema = { type: 'string', pattern: '^(#[0-9a-fA-F]{6}|transparent)$' };
const object = (properties: Record<string, unknown>, required: string[]) => ({ type: 'object', properties, required, additionalProperties: false });
export const PROTOTYPE_JSON_SCHEMA = object({
  schemaVersion: { type: 'integer', enum: [1] }, id: idSchema, name: { type: 'string', maxLength: 120 }, startScreenId: idSchema,
  screens: { type: 'array', minItems: 1, maxItems: 24, items: object({ id: idSchema, name: { type: 'string', maxLength: 120 }, width: dimension, height: dimension, background: colorSchema, overlay: { type: 'boolean' } }, ['id', 'name', 'width', 'height']) },
  nodes: { type: 'array', minItems: 1, maxItems: 2000, items: object({
    id: idSchema, parentId: idSchema, kind: { type: 'string', enum: ['frame', 'rect', 'text', 'button', 'image', 'stateGroup', 'state'] },
    name: { type: 'string', maxLength: 120 }, x: { type: 'number', minimum: -8192, maximum: 8192 }, y: { type: 'number', minimum: -8192, maximum: 8192 }, width: dimension, height: dimension,
    fill: colorSchema, stroke: colorSchema, strokeWidth: { type: 'number', minimum: 0, maximum: 24 }, radius: { type: 'number', minimum: 0, maximum: 4096 }, opacity: { type: 'number', minimum: 0, maximum: 1 },
    layout: { type: 'string', enum: ['absolute', 'horizontal', 'vertical'] }, gap: { type: 'number', minimum: 0, maximum: 1024 }, padding: { type: 'number', minimum: 0, maximum: 1024 },
    align: { type: 'string', enum: ['start', 'center', 'end'] }, justify: { type: 'string', enum: ['start', 'center', 'end', 'space-between'] },
    text: { type: 'string', maxLength: 12000 }, color: colorSchema, fontFamily: { type: 'string', maxLength: 80 }, fontSize: { type: 'number', minimum: 8, maximum: 256 }, fontWeight: { type: 'integer', enum: [400, 500, 600, 700] },
    textAlign: { type: 'string', enum: ['left', 'center', 'right'] }, lineHeight: { type: 'number', minimum: 8, maximum: 512 },
    imageData: { type: 'string', maxLength: 1400000, description: '仅 data:image/png;base64 或 data:image/jpeg;base64；禁止远程/本地路径和 SVG。' }, initialStateId: idSchema,
  }, ['id', 'parentId', 'kind', 'width', 'height']) },
  interactions: { type: 'array', maxItems: 2000, items: object({ sourceId: idSchema, action: { type: 'string', enum: ['navigate', 'openOverlay', 'closeOverlay', 'back', 'setState'] }, targetId: idSchema, stateId: idSchema }, ['sourceId', 'action']) },
}, ['schemaVersion', 'id', 'name', 'startScreenId', 'screens', 'nodes', 'interactions']);

// Small strict JSON-schema interpreter keeps the app and Figma importer's validation
// identical without bundling a runtime dependency or executing user code.
function validate(value: unknown, schema: Record<string, any>, path: string): void {
  const fail = (reason: string): never => { throw new Error(`原型 ${path}: ${reason}`); };
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('需要对象');
    const record = value as Record<string, unknown>;
    for (const key of schema.required || []) if (!(key in record)) fail(`缺少 ${key}`);
    for (const key of Object.keys(record)) {
      if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) fail(`不支持字段 ${key}`);
      validate(record[key], schema.properties[key], `${path}.${key}`);
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) fail('需要数组');
    const items = value as unknown[];
    if (items.length > schema.maxItems || items.length < (schema.minItems || 0)) fail('数量超出限制');
    items.forEach((item, index) => validate(item, schema.items, `${path}[${index}]`));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') fail('需要字符串');
    const text = value as string;
    if (schema.maxLength && text.length > schema.maxLength) fail('文字过长');
    if (schema.pattern && !new RegExp(schema.pattern).test(text)) fail('格式无效');
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < schema.minimum || value > schema.maximum || (schema.type === 'integer' && !Number.isInteger(value))) fail('尺寸或数值无效');
  } else if (schema.type === 'boolean' && typeof value !== 'boolean') fail('需要布尔值');
  if (schema.enum && !schema.enum.includes(value)) fail('不支持的选项');
}
export const prototypeUtf8Length = (text: string) => {
  let bytes = 0;
  for (const char of text) { const code = char.codePointAt(0)!; bytes += code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4; }
  return bytes;
};
export function parsePrototype(input: unknown): PrototypeDocument {
  const serialized = typeof input === 'string' ? input : JSON.stringify(input);
  if (!serialized || serialized.length > MAX_PROTOTYPE_BYTES || prototypeUtf8Length(serialized) > MAX_PROTOTYPE_BYTES) throw new Error('原型内容不能超过 2 MB');
  let value: unknown;
  try { value = JSON.parse(serialized); } catch { throw new Error('原型不是有效的 JSON'); }
  validate(value, PROTOTYPE_JSON_SCHEMA, 'document');
  const doc = value as PrototypeDocument;
  if (!doc.name.trim()) throw new Error('原型名称不能为空');
  const all = new Map<string, PrototypeScreen | PrototypeNode>();
  for (const item of [...doc.screens, ...doc.nodes]) {
    if (all.has(item.id)) throw new Error(`原型 ID 重复: ${item.id}`);
    all.set(item.id, item);
  }
  const screenById = new Map(doc.screens.map(screen => [screen.id, screen]));
  if (!screenById.has(doc.startScreenId) || screenById.get(doc.startScreenId)?.overlay) throw new Error('原型起始页面不存在或被设为弹窗');
  const parents = new Map<string, string>();
  const nearestGroup = new Map<string, string | undefined>();
  for (const node of doc.nodes) {
    const parent = all.get(node.parentId);
    if (!parent || ('kind' in parent && !['frame', 'state', 'stateGroup'].includes(parent.kind))) throw new Error(`原型 ${node.id}: parentId 不是页面或容器`);
    if (node.kind === 'state' && (!('kind' in parent) || parent.kind !== 'stateGroup')) throw new Error(`原型 ${node.id}: state 必须属于 stateGroup`);
    if ('kind' in parent && parent.kind === 'stateGroup' && node.kind !== 'state') throw new Error(`原型 ${node.id}: stateGroup 只能包含 state`);
    parents.set(node.id, node.parentId);
    const seen = new Set([node.id]);
    let cursor: PrototypeScreen | PrototypeNode | undefined = parent;
    let depth = 0;
    while (cursor && 'kind' in cursor) {
      if (seen.has(cursor.id) || ++depth > 12) throw new Error(`原型 ${node.id}: 层级循环或超过 12 层`);
      seen.add(cursor.id);
      if (cursor.kind === 'stateGroup') {
        if (node.kind === 'stateGroup') throw new Error('首版不支持嵌套 stateGroup，请合并状态或拆为页面');
        nearestGroup.set(node.id, cursor.id);
      }
      cursor = all.get(cursor.parentId);
    }
    if (!cursor || !screenById.has(cursor.id)) throw new Error(`原型 ${node.id}: 容器未连接到页面`);
    if (node.kind === 'image' && !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(node.imageData || '')) throw new Error(`原型 ${node.id}: 图片必须是内嵌 PNG/JPEG，不能使用远程或本地路径`);
    if (node.kind !== 'image' && node.imageData) throw new Error(`原型 ${node.id}: 仅 image 可以携带图片`);
    if (['text', 'button'].includes(node.kind) && !node.text?.trim()) throw new Error(`原型 ${node.id}: 需要文字`);
  }
  for (const group of doc.nodes.filter(node => node.kind === 'stateGroup')) {
    const states = doc.nodes.filter(node => node.parentId === group.id && node.kind === 'state');
    if (states.length < 2 || states.length > 12 || !states.some(state => state.id === group.initialStateId)) throw new Error(`原型 ${group.id}: 需要 2～12 个状态与有效 initialStateId`);
    if (states.some(state => state.width !== group.width || state.height !== group.height)) throw new Error(`原型 ${group.id}: 状态尺寸必须与 stateGroup 一致`);
  }
  const sources = new Set<string>();
  for (const action of doc.interactions) {
    const source = all.get(action.sourceId);
    if (!source || !('kind' in source) || source.kind === 'stateGroup' || sources.has(action.sourceId)) throw new Error(`原型交互来源无效或重复: ${action.sourceId}`);
    sources.add(action.sourceId);
    if (action.action === 'navigate' || action.action === 'openOverlay') {
      const target = screenById.get(action.targetId || '');
      if (!target || Boolean(target.overlay) !== (action.action === 'openOverlay')) throw new Error(`原型 ${action.sourceId}: 跳转/弹窗目标不匹配`);
      if (action.stateId) throw new Error('页面跳转不能带 stateId');
    } else if (action.action === 'setState') {
      const group = all.get(action.targetId || '');
      const state = all.get(action.stateId || '');
      if (!group || !('kind' in group) || group.kind !== 'stateGroup' || !state || !('kind' in state) || state.kind !== 'state' || parents.get(state.id) !== group.id || nearestGroup.get(action.sourceId) !== group.id) throw new Error(`原型 ${action.sourceId}: setState 只能切换当前组件组内的状态`);
      let ancestor = all.get(action.sourceId);
      while (ancestor && 'kind' in ancestor) {
        if (ancestor.kind === 'state' && ancestor.id === state.id) throw new Error(`原型 ${action.sourceId}: 当前选中状态不需要绑定到自身的 setState`);
        ancestor = all.get(ancestor.parentId);
      }
    } else if (action.targetId || action.stateId) throw new Error('返回/关闭弹窗不接受目标参数');
  }
  return doc;
}
