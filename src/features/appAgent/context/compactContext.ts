import type { AgentCanvasContext, AgentCanvasVisualReference } from '../../agentModel';
import type { ContextScope } from '../skills/types';

const compactText = (value?: string, max = 220) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const compactImageSource = (value?: string) => {
  const source = String(value || '').trim();
  if (!source) return undefined;
  if (/^data:image\//i.test(source)) return '[image data omitted]';
  return source.length > 180 ? `${source.slice(0, 180)}...` : source;
};

const compactReference = (reference: AgentCanvasVisualReference) => ({
  id: reference.id,
  nodeId: reference.nodeId,
  sourceItemId: reference.sourceItemId,
  outputId: reference.outputId,
  name: reference.name,
  mediaType: reference.mediaType,
  source: compactImageSource(reference.source || reference.thumbnail),
  hasLocalPath: !!reference.path,
});

const getCompactDrawerItems = (context: AgentCanvasContext) => {
  const drawer = context.drawer;
  if (!drawer) return [];
  const selectedIds = new Set([
    ...(context.selectedIds || []),
    ...(context.selectedItems || []).map(item => item.id),
    ...(context.selectedItems || []).map(item => item.sourceItemId || '').filter(Boolean),
    ...(context.visualReferences || []).map(reference => reference.sourceItemId || '').filter(Boolean),
  ]);
  const query = String(drawer.searchQuery || '').trim().toLowerCase();
  return drawer.items
    .filter(item => {
      if (selectedIds.has(item.id)) return true;
      if (!query) return false;
      const searchable = [
        item.id,
        item.name,
        item.content,
        item.folderId,
        ...(item.remarks || []),
      ].filter(Boolean).join(' ').toLowerCase();
      return searchable.includes(query);
    })
    .slice(0, 40);
};

export function compactAgentCanvasContext(
  context: AgentCanvasContext,
  scopes: ContextScope[] = ['minimal'],
) {
  const scopeSet = new Set<ContextScope>(scopes.includes('full') ? [
    'minimal',
    'app',
    'drawer',
    'canvas',
    'calendar',
    'settings',
    'server',
    'ui',
    'full',
  ] : scopes);
  const base = {
    scopes: Array.from(scopeSet),
    surface: context.surface,
    selectedIds: context.selectedIds || [],
    selectedItems: (context.selectedItems || []).map(item => ({
      id: item.id,
      sourceItemId: item.sourceItemId,
      name: item.name,
      type: item.type,
      status: item.status,
      prompt: compactText(item.prompt),
      thumbnail: compactImageSource(item.thumbnail),
      referenceCount: item.referenceCount || item.references?.length || 0,
      references: item.references?.map(compactReference),
    })),
    visualReferences: (context.visualReferences || []).map(compactReference),
  };
  const compactDrawerItems = getCompactDrawerItems(context);
  return {
    ...base,
    ...(scopeSet.has('app') || scopeSet.has('minimal') ? {
      app: {
        surface: context.surface,
        selectedCount: context.selectedIds?.length || 0,
      },
    } : {}),
    ...(scopeSet.has('drawer') && context.drawer ? {
      drawer: {
        activeTab: context.drawer.activeTab,
        activeFolderId: context.drawer.activeFolderId,
        searchQuery: context.drawer.searchQuery,
        pinned: context.drawer.pinned,
        folders: context.drawer.folders.map(folder => ({
          id: folder.id,
          name: folder.name,
          parentId: folder.parentId,
        })),
        itemCount: context.drawer.items.length,
        returnedItemCount: compactDrawerItems.length,
        items: compactDrawerItems.map(item => ({
          id: item.id,
          type: item.type,
          name: item.name,
          folderId: item.folderId,
          quickAccess: item.quickAccess,
          content: compactText(item.content),
          remarks: item.remarks?.slice(0, 3).map(remark => compactText(remark, 120)),
        })),
      },
    } : {}),
    ...(scopeSet.has('canvas') ? {
      nodes: context.nodes.map(node => ({
        id: node.id,
        sourceItemId: node.sourceItemId,
        type: node.type,
        name: node.name,
        prompt: compactText(node.prompt),
        inputs: node.inputs,
        status: node.status,
      })),
      presets: context.presets,
      workflows: context.workflows,
    } : {}),
    ...(scopeSet.has('calendar') && context.calendar ? {
      calendar: {
        activeDate: context.calendar.activeDate,
        activeMonth: context.calendar.activeMonth,
        tagFilter: context.calendar.tagFilter,
        events: context.calendar.events?.map(event => ({
          id: event.id,
          noteLabel: event.noteLabel,
          scheduleId: event.scheduleId,
          title: event.title,
          done: event.done,
          priority: event.priority,
          startAt: event.startAt,
          tagIds: event.tagIds,
          sourceTitle: event.sourceTitle,
        })),
      },
    } : {}),
  };
}
