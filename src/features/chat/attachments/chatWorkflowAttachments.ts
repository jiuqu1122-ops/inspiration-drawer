import type { PendingChatAttachment } from '../model/chatTypes';
import { createChatId } from '../model/chatTypes';

export type ChatWorkflowAttachmentSource = 'canvas' | 'selection' | 'template' | 'file';

export type ChatWorkflowAttachmentSnapshot = {
  schema: 'inspiration-workflow-snapshot';
  version: 1;
  source: ChatWorkflowAttachmentSource;
  label: string;
  nodes: unknown[];
  edges: unknown[];
  metadata?: Record<string, unknown>;
};

export type ChatWorkflowAttachmentOption = {
  id: string;
  label: string;
  source: Exclude<ChatWorkflowAttachmentSource, 'file'>;
  snapshot: ChatWorkflowAttachmentSnapshot;
};

/** Stable identity for a canvas selection. It changes only when the selected
 * node set changes, not when the host rebuilds equivalent selection objects. */
export const getWorkflowSelectionKey = (items: Array<{ id?: string; sourceItemId?: string; name?: string }>) => (
  items
    .map((item, index) => String(item.id || item.sourceItemId || item.name || `selection-${index}`).trim())
    .filter(Boolean)
    .sort()
    .join('|')
);

export const getSelectedWorkflowAttachmentLabel = (items: Array<{ name?: string }>) => {
  const names = items.map(item => String(item.name || '').trim()).filter(Boolean);
  if (items.length === 1) return names[0] || '当前选中节点';
  if (names[0]) return `${names[0]} 等 ${items.length} 个节点`;
  return `当前选中节点组（${items.length}）`;
};

const stableSerialize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)
    .join(',')}}`;
};

export const workflowSnapshotHash = (snapshot: ChatWorkflowAttachmentSnapshot) => {
  let hash = 2166136261;
  for (const char of stableSerialize(snapshot)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

export const createWorkflowAttachment = (
  snapshot: ChatWorkflowAttachmentSnapshot,
  label = snapshot.label,
): PendingChatAttachment => {
  const hash = workflowSnapshotHash(snapshot);
  return {
    id: createChatId('workflow-attachment'),
    type: 'workflow',
    path: `workflow://${hash}`,
    mimeType: 'application/json',
    metadataJson: JSON.stringify({ snapshot: { ...snapshot, label }, structureHash: hash }),
  };
};

export const createCanvasWorkflowSnapshot = (
  nodes: unknown[],
  label: string,
  source: ChatWorkflowAttachmentSource = 'selection',
): ChatWorkflowAttachmentSnapshot => {
  const edges = nodes.flatMap(node => {
    if (!node || typeof node !== 'object') return [];
    const record = node as Record<string, unknown>;
    const target = String(record.id || '').trim();
    const inputs = Array.isArray(record.inputs) ? record.inputs.map(String).filter(Boolean) : [];
    return target ? inputs.map(sourceId => ({ source: sourceId, target })) : [];
  });
  const snapshot = { schema: 'inspiration-workflow-snapshot' as const, version: 1 as const, source, label, nodes, edges };
  return { ...snapshot, metadata: { structureHash: workflowSnapshotHash(snapshot) } };
};

export const parseWorkflowAttachmentSnapshot = (attachment: PendingChatAttachment) => {
  if (attachment.type !== 'workflow' || !attachment.metadataJson) return null;
  try {
    const parsed = JSON.parse(attachment.metadataJson) as { snapshot?: ChatWorkflowAttachmentSnapshot };
    const snapshot = parsed.snapshot;
    if (!snapshot || snapshot.schema !== 'inspiration-workflow-snapshot' || snapshot.version !== 1) return null;
    if (!Array.isArray(snapshot.nodes) || !Array.isArray(snapshot.edges)) return null;
    return snapshot;
  } catch (_) {
    return null;
  }
};

const attachmentPathName = (path: string) => {
  const normalized = String(path || '').trim();
  if (!normalized) return '';
  const name = normalized.split(/[\\/]/).pop() || '';
  return name.trim();
};

/**
 * Returns the user-facing label for an attachment without changing its
 * persisted shape. Workflow attachments use the snapshot label because their
 * path is intentionally only a stable workflow:// hash.
 */
export const getChatAttachmentDisplayName = (attachment: PendingChatAttachment) => {
  if (attachment.type === 'workflow') {
    const snapshot = parseWorkflowAttachmentSnapshot(attachment);
    const label = String(snapshot?.label || '').trim();
    if (label) return label;
  }
  return attachmentPathName(attachment.path) || '附件';
};
