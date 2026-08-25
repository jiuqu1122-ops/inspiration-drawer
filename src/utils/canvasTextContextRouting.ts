const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const normalizeStrings = (values: unknown): string[] => {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  return values.flatMap(value => {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) return [];
    seen.add(normalized);
    return [normalized];
  });
};

const findFirstJsonObject = (text: string) => {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] || '';
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      continue;
    }
    if (character === '{') {
      if (depth === 0) start = index;
      depth += 1;
      continue;
    }
    if (character !== '}' || depth === 0) continue;
    depth -= 1;
    if (depth === 0 && start >= 0) return text.slice(start, index + 1);
  }
  return '';
};

const parseContextObject = (text: string): Record<string, unknown> | null => {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const candidates = [
    trimmed,
    trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim(),
    findFirstJsonObject(trimmed),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (isRecord(parsed)) return parsed;
    } catch {
      // Malformed output deliberately falls back to the complete Agent text.
    }
  }
  return null;
};

const getOwnPathValue = (source: Record<string, unknown>, path: string) => {
  const segments = path.split('.').map(segment => segment.trim()).filter(Boolean);
  if (segments.length === 0) return { found: false, value: undefined as unknown };
  let current: unknown = source;
  for (const segment of segments) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false, value: undefined as unknown };
    }
    current = current[segment];
  }
  return { found: true, value: current };
};

export type CanvasContextRoutingTarget = {
  id: string;
  label?: string;
  task?: string;
};

export const buildCanvasContextRoutingInstruction = (rawTargets: CanvasContextRoutingTarget[]) => {
  const targets = rawTargets.flatMap(target => {
    const id = String(target.id || '').trim();
    if (!id) return [];
    return [{
      id,
      label: String(target.label || '').trim().slice(0, 120),
      task: String(target.task || '').trim().slice(0, 1_200),
    }];
  });
  if (targets.length === 0) return '';

  const targetShape = Object.fromEntries(targets.map(target => [target.id, '仅供这个下游节点使用的上下文']));
  return [
    '上下文自动路由协议：',
    '只输出一个可被 JSON.parse 直接解析的 JSON 对象，不要输出 Markdown 代码块、标题或 JSON 之外的文字。',
    '`global` 写所有下游节点共享且不可缺少的信息；`targets` 必须使用下面给出的稳定节点 ID，并分别写只与该节点任务有关的信息。',
    '不要在每个 targets 字段里重复 global。所有列出的目标 ID 都必须存在。',
    '输出结构：',
    JSON.stringify({ global: '所有目标共享的上下文', targets: targetShape }, null, 2),
    '下游目标及任务：',
    ...targets.map(target => [
      `- ID: ${target.id}`,
      target.label ? `  名称: ${target.label}` : '',
      target.task ? `  任务: ${target.task}` : '',
    ].filter(Boolean).join('\n')),
  ].join('\n');
};

export const applyCanvasTextContextRouting = (
  text: string,
  options: { bindings?: unknown; targetKeys?: unknown } = {},
) => {
  const originalText = String(text || '').trim();
  if (!originalText) return originalText;

  const bindings = normalizeStrings(options.bindings);
  const targetKeys = normalizeStrings(options.targetKeys);
  if (bindings.length === 0 && targetKeys.length === 0) return originalText;

  const parsed = parseContextObject(originalText);
  if (!parsed) return originalText;

  // Explicit bindings remain available as an escape hatch for custom schemas.
  if (bindings.length > 0) {
    const selected: Record<string, unknown> = {};
    bindings.forEach(binding => {
      const result = getOwnPathValue(parsed, binding);
      if (result.found) selected[binding] = result.value;
    });
    if (Object.keys(selected).length !== bindings.length) return originalText;
    return `Selected upstream context fields:\n${JSON.stringify(selected, null, 2)}`;
  }

  if (!Object.prototype.hasOwnProperty.call(parsed, 'global') || !isRecord(parsed.targets)) {
    return originalText;
  }
  const matchedTargetKey = targetKeys.find(key => Object.prototype.hasOwnProperty.call(parsed.targets, key));
  if (!matchedTargetKey) return originalText;

  return `Automatically routed upstream context:\n${JSON.stringify({
    global: parsed.global,
    target: parsed.targets[matchedTargetKey],
  }, null, 2)}`;
};
