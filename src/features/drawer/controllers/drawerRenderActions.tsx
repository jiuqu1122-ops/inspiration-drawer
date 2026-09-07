import { ChevronDown,ChevronRight,FolderOpen,Plus,X } from 'lucide-react';
import React from 'react';
import { Folder } from '../../../types';
import type { CanvasFolderMediaPickerState } from '../../../types/canvasRuntime';
import { isCanvasAiGeneratorType } from '../../canvasAiRuntime';
import { type CanvasImageItem,type CanvasItemBox } from '../../canvasModel';
import { fitCanvasBoxToDesign } from '../../canvasResizeGeometry';
import { getDrawerFolderPathName } from '../../folderModel';

type derivedUiActionContext = { getCanvasAiNodeDesignSizeForItem: (canvasItem: CanvasImageItem, promptExpanded?: boolean, outputsExpanded?: boolean) => { width: number; height: number; }; DRAWER_FOLDER_TONES: { active: string; soft: string; drag: string; label: string; badge: string; }[]; isCanvasMode: boolean; canvasFolderImportPrompt: CanvasFolderMediaPickerState | null; activeFolderId: string; dragOverFolderId: string | null; folderMoveDragOverId: string | null; folders: Folder[]; folderItemCounts: Map<string, number>; folderChildrenByParent: Map<string, Folder[]>; collapsedFolderIds: string[]; startDrawerFolderPointerDrag: (event: React.PointerEvent, folderId: string) => void; handleDrawerFolderDragStart: (event: React.DragEvent, folderId: string) => void; handleDrawerFolderDragEnd: () => void; handleFolderContextMenu: (event: React.MouseEvent, folderId: string) => void; handleDrawerFolderPointerEnter: (folderId: string) => void; handleDrawerFolderPointerLeave: (folderId: string) => void; handleDrawerFolderPointerUp: (folderId?: string, folderName?: string) => void; handleDrawerItemDragOverFolder: (e: React.DragEvent, folderId: string) => void; handleDrawerItemDragLeaveFolder: (e: React.DragEvent, folderId: string) => void; handleDrawerItemDropToFolder: (e: React.DragEvent, folderId?: string, folderName?: string) => void; suppressNextFolderClickRef: React.RefObject<boolean>; requestAddFolderMediaToCanvas: (folderId?: string, folderName?: string, anchor?: { x: number; y: number; }) => void; handleDrawerFolderSelectionClick: (folderId: string, event: React.MouseEvent) => boolean; setActiveFolderId: React.Dispatch<React.SetStateAction<string>>; drag: string; active: string; soft: string; badge: string; deleteDrawerFolders: (folderIds: string[]) => void; getFolderActionIds: (folderId?: string | null) => string[]; handleOpenFolderModal: (parentId?: string) => void; setCollapsedFolderIds: React.Dispatch<React.SetStateAction<string[]>>; editingFolderId: string | null; renameValue: string; setRenameValue: React.Dispatch<React.SetStateAction<string>>; handleRenameFolder: (id: string) => void; setEditingFolderId: React.Dispatch<React.SetStateAction<string | null>>; label: string; };

export const getCanvasItemRenderedBoxImpl = (ctx: Pick<derivedUiActionContext, 'getCanvasAiNodeDesignSizeForItem'>, canvasItem: CanvasImageItem): CanvasItemBox => {
  const { getCanvasAiNodeDesignSizeForItem } = ctx;
    const isCanvasAiNodeItem = isCanvasAiGeneratorType(canvasItem.ai?.type) || canvasItem.ai?.type === 'workflow';
    if (!isCanvasAiNodeItem) {
      return {
        x: canvasItem.x,
        y: canvasItem.y,
        width: canvasItem.width,
        height: canvasItem.height,
      };
    }
    const designSize = getCanvasAiNodeDesignSizeForItem(canvasItem);
    return fitCanvasBoxToDesign(canvasItem, designSize);

};

export const renderDrawerFolderRailItemImpl = (ctx: Pick<derivedUiActionContext, 'DRAWER_FOLDER_TONES' | 'activeFolderId' | 'canvasFolderImportPrompt' | 'collapsedFolderIds' | 'deleteDrawerFolders' | 'dragOverFolderId' | 'editingFolderId' | 'folderChildrenByParent' | 'folderItemCounts' | 'folderMoveDragOverId' | 'folders' | 'getFolderActionIds' | 'handleDrawerFolderDragEnd' | 'handleDrawerFolderDragStart' | 'handleDrawerFolderPointerEnter' | 'handleDrawerFolderPointerLeave' | 'handleDrawerFolderPointerUp' | 'handleDrawerFolderSelectionClick' | 'handleDrawerItemDragLeaveFolder' | 'handleDrawerItemDragOverFolder' | 'handleDrawerItemDropToFolder' | 'handleFolderContextMenu' | 'handleOpenFolderModal' | 'handleRenameFolder' | 'isCanvasMode' | 'renameValue' | 'requestAddFolderMediaToCanvas' | 'setActiveFolderId' | 'setCollapsedFolderIds' | 'setEditingFolderId' | 'setRenameValue' | 'startDrawerFolderPointerDrag' | 'suppressNextFolderClickRef'>, folder: Folder, folderIndex: number, depth: number = 0) => {
  const { DRAWER_FOLDER_TONES, activeFolderId, canvasFolderImportPrompt, collapsedFolderIds, deleteDrawerFolders, dragOverFolderId, editingFolderId, folderChildrenByParent, folderItemCounts, folderMoveDragOverId, folders, getFolderActionIds, handleDrawerFolderDragEnd, handleDrawerFolderDragStart, handleDrawerFolderPointerEnter, handleDrawerFolderPointerLeave, handleDrawerFolderPointerUp, handleDrawerFolderSelectionClick, handleDrawerItemDragLeaveFolder, handleDrawerItemDragOverFolder, handleDrawerItemDropToFolder, handleFolderContextMenu, handleOpenFolderModal, handleRenameFolder, isCanvasMode, renameValue, requestAddFolderMediaToCanvas, setActiveFolderId, setCollapsedFolderIds, setEditingFolderId, setRenameValue, startDrawerFolderPointerDrag, suppressNextFolderClickRef } = ctx;
    const folderTone = DRAWER_FOLDER_TONES[folderIndex % DRAWER_FOLDER_TONES.length];
    const isFolderActive = isCanvasMode
      ? canvasFolderImportPrompt?.folderId === folder.id
      : activeFolderId === folder.id;
    const isFolderDragOver = dragOverFolderId === folder.id;
    const isInvalidDropTarget = folderMoveDragOverId === folder.id;
    const folderPathName = getDrawerFolderPathName(folders, folder.id) || folder.name;
    const folderItemCount = folderItemCounts.get(folder.id) || 0;
    const childFolders = folderChildrenByParent.get(folder.id) || [];
    const isCollapsed = collapsedFolderIds.includes(folder.id);
    const isNested = depth > 0;
    const nestedOffset = Math.min(depth, 3) * 5;
    return (
      <div
        data-folder-row="true"
        data-folder-active={isFolderActive ? 'true' : 'false'}
        data-folder-depth={depth}
        key={folder.id}
        className="relative shrink-0 flex flex-col items-center w-full group/folder"
        style={isNested ? { paddingLeft: nestedOffset } : undefined}
        data-folder-drop-id={folder.id}
        data-folder-drop-name={folderPathName}
        draggable={false}
        onPointerDown={(event) => startDrawerFolderPointerDrag(event, folder.id)}
        onDragStart={(event) => handleDrawerFolderDragStart(event, folder.id)}
        onDragEnd={handleDrawerFolderDragEnd}
        onContextMenu={(event) => handleFolderContextMenu(event, folder.id)}
        onPointerEnter={() => handleDrawerFolderPointerEnter(folder.id)}
        onPointerLeave={() => handleDrawerFolderPointerLeave(folder.id)}
        onPointerUp={() => handleDrawerFolderPointerUp(folder.id, folderPathName)}
        onDragEnter={(event) => handleDrawerItemDragOverFolder(event, folder.id)}
        onDragOver={(event) => handleDrawerItemDragOverFolder(event, folder.id)}
        onDragLeave={(event) => handleDrawerItemDragLeaveFolder(event, folder.id)}
        onDrop={(event) => handleDrawerItemDropToFolder(event, folder.id, folderPathName)}
      >
        <div
          onClick={(event) => {
            if (suppressNextFolderClickRef.current) {
              suppressNextFolderClickRef.current = false;
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (isCanvasMode) {
              const rect = event.currentTarget.getBoundingClientRect();
              requestAddFolderMediaToCanvas(folder.id, folderPathName, { x: rect.right + 10, y: rect.top });
              return;
            }
            if (handleDrawerFolderSelectionClick(folder.id, event)) {
              setActiveFolderId(folder.id);
            }
          }}
          className={`relative mb-1 flex items-center justify-center cursor-pointer transition-all shadow-sm ${isNested ? 'h-8 w-8 rounded-[12px]' : 'h-10 w-10 rounded-[16px]'} ${isInvalidDropTarget ? 'bg-red-50 text-red-600 ring-2 ring-red-300 dark:bg-red-500/15 dark:text-red-200 dark:ring-red-400/35' : isFolderDragOver ? `${folderTone.drag} scale-105` : isFolderActive ? `${folderTone.active} scale-105` : `bg-white/70 dark:bg-stone-800/65 backdrop-blur-md text-stone-500 dark:text-stone-400 ${folderTone.soft} hover:scale-105`}`}
          title={isCanvasMode ? `${folderPathName}：点击把图片或视频加入画布` : folderPathName}
        >
          <FolderOpen className={`${isNested ? 'h-4 w-4' : 'h-5 w-5'} ${isFolderActive ? 'opacity-100' : 'opacity-85'}`} />
          <span className={`absolute -right-1.5 -top-1.5 ${folderTone.badge} min-w-[16px] rounded-full px-1 text-center text-[9px] font-bold text-white shadow-sm ring-2 ring-white/80 pointer-events-none dark:ring-stone-900/70`}>
            {folderItemCount}
          </span>
          <button
            type="button"
            data-folder-control="true"
            onClick={(event) => { event.stopPropagation(); deleteDrawerFolders(getFolderActionIds(folder.id)); }}
            className="absolute -left-1.5 -top-1.5 z-10 rounded-full bg-red-500 p-0.5 text-white opacity-0 shadow-sm transition-opacity hover:scale-110 group-hover/folder:opacity-100"
            title={childFolders.length > 0 ? '删除文件夹及子目录（不删内容）' : '删除文件夹（不删内容）'}
          ><X className="h-2.5 w-2.5" /></button>
          <button
            type="button"
            data-folder-control="true"
            onClick={(event) => { event.stopPropagation(); handleOpenFolderModal(folder.id); }}
            className="absolute -bottom-1.5 -left-1.5 z-10 rounded-full bg-emerald-500 p-0.5 text-white opacity-0 shadow-sm transition-opacity hover:scale-110 group-hover/folder:opacity-100"
            title={`在「${folder.name}」中新建子目录`}
          ><Plus className="h-2.5 w-2.5" /></button>
          {childFolders.length > 0 && (
            <button
              type="button"
              data-folder-control="true"
              onClick={(event) => {
                event.stopPropagation();
                setCollapsedFolderIds(prev => (
                  prev.includes(folder.id) ? prev.filter(id => id !== folder.id) : [...prev, folder.id]
                ));
              }}
              className="absolute -bottom-1.5 -right-1.5 z-10 rounded-full bg-white p-0.5 text-stone-500 shadow-sm ring-1 ring-stone-200 transition-transform hover:scale-110 dark:bg-stone-800 dark:text-stone-300 dark:ring-stone-700"
              title={isCollapsed ? '展开子目录' : '收起子目录'}
            >{isCollapsed ? <ChevronRight className="h-2.5 w-2.5" /> : <ChevronDown className="h-2.5 w-2.5" />}</button>
          )}
        </div>

        {editingFolderId === folder.id ? (
          <input
            autoFocus
            value={renameValue}
            onChange={event => setRenameValue(event.target.value)}
            onBlur={() => handleRenameFolder(folder.id)}
            onKeyDown={event => {
              if (event.key === 'Enter') handleRenameFolder(folder.id);
              if (event.key === 'Escape') setEditingFolderId(null);
            }}
            onClick={event => event.stopPropagation()}
            data-folder-control="true"
            className={`${isNested ? 'w-12' : 'w-14'} rounded bg-stone-200 pb-0.5 text-center text-[10px] text-stone-800 outline-none focus:ring-1 focus:ring-emerald-500 dark:bg-stone-700 dark:text-stone-200`}
          />
        ) : (
          <span
            onDoubleClick={(event) => { event.stopPropagation(); setEditingFolderId(folder.id); setRenameValue(folder.name); }}
            className={`${isNested ? 'flex w-14 items-center justify-start gap-0.5 px-0.5' : 'w-14 truncate px-0.5 text-center'} pb-1 text-[10px] cursor-default ${isFolderActive ? `${folderTone.label} font-bold` : isNested ? 'text-sky-600 hover:text-sky-700 dark:text-sky-300 dark:hover:text-sky-200' : 'text-stone-500 hover:text-blue-500 dark:text-stone-400 dark:hover:text-blue-300'}`}
            title={`${folderPathName}；双击重命名，右键更多操作`}
          >
            {isNested ? (
              <>
                <span aria-hidden="true" className="w-2.5 shrink-0 text-right leading-none">↳</span>
                <span className="min-w-0 flex-1 truncate text-left">{folder.name}</span>
              </>
            ) : folder.name}
          </span>
        )}
      </div>
    );

};

export const renderDrawerFolderListItemImpl = (ctx: Pick<derivedUiActionContext, 'activeFolderId' | 'canvasFolderImportPrompt' | 'collapsedFolderIds' | 'deleteDrawerFolders' | 'dragOverFolderId' | 'editingFolderId' | 'folderChildrenByParent' | 'folderItemCounts' | 'folderMoveDragOverId' | 'folders' | 'getFolderActionIds' | 'handleDrawerFolderDragEnd' | 'handleDrawerFolderDragStart' | 'handleDrawerFolderPointerEnter' | 'handleDrawerFolderPointerLeave' | 'handleDrawerFolderPointerUp' | 'handleDrawerFolderSelectionClick' | 'handleDrawerItemDragLeaveFolder' | 'handleDrawerItemDragOverFolder' | 'handleDrawerItemDropToFolder' | 'handleFolderContextMenu' | 'handleOpenFolderModal' | 'handleRenameFolder' | 'isCanvasMode' | 'renameValue' | 'requestAddFolderMediaToCanvas' | 'setActiveFolderId' | 'setCollapsedFolderIds' | 'setEditingFolderId' | 'setRenameValue' | 'startDrawerFolderPointerDrag' | 'suppressNextFolderClickRef'>, folder: Folder, _folderIndex: number, depth: number = 0) => {
  const { activeFolderId, canvasFolderImportPrompt, collapsedFolderIds, deleteDrawerFolders, dragOverFolderId, editingFolderId, folderChildrenByParent, folderItemCounts, folderMoveDragOverId, folders, getFolderActionIds, handleDrawerFolderDragEnd, handleDrawerFolderDragStart, handleDrawerFolderPointerEnter, handleDrawerFolderPointerLeave, handleDrawerFolderPointerUp, handleDrawerFolderSelectionClick, handleDrawerItemDragLeaveFolder, handleDrawerItemDragOverFolder, handleDrawerItemDropToFolder, handleFolderContextMenu, handleOpenFolderModal, handleRenameFolder, isCanvasMode, renameValue, requestAddFolderMediaToCanvas, setActiveFolderId, setCollapsedFolderIds, setEditingFolderId, setRenameValue, startDrawerFolderPointerDrag, suppressNextFolderClickRef } = ctx;
    const isFolderActive = isCanvasMode
      ? canvasFolderImportPrompt?.folderId === folder.id
      : activeFolderId === folder.id;
    const isFolderDragOver = dragOverFolderId === folder.id;
    const isInvalidDropTarget = folderMoveDragOverId === folder.id;
    const folderPathName = getDrawerFolderPathName(folders, folder.id) || folder.name;
    const folderItemCount = folderItemCounts.get(folder.id) || 0;
    const childFolders = folderChildrenByParent.get(folder.id) || [];
    const isCollapsed = collapsedFolderIds.includes(folder.id);
    const rowPaddingLeft = 8 + Math.min(depth, 6) * 16;
    const rowClassName = isFolderDragOver
      ? isInvalidDropTarget
        ? 'bg-red-50 text-red-700 ring-1 ring-red-200 dark:bg-red-400/14 dark:text-red-100 dark:ring-red-300/25'
        : 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-400/14 dark:text-blue-100 dark:ring-blue-300/25'
      : isFolderActive
        ? 'bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-950'
        : 'text-stone-700 hover:bg-white/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.07] dark:hover:text-white';

    return (
      <div
        key={folder.id}
        data-folder-row="true"
        data-folder-active={isFolderActive ? 'true' : 'false'}
        data-folder-depth={depth}
        className="group/folder-list relative w-full shrink-0"
        data-folder-drop-id={folder.id}
        data-folder-drop-name={folderPathName}
        draggable={false}
        onPointerDown={(event) => startDrawerFolderPointerDrag(event, folder.id)}
        onDragStart={(event) => handleDrawerFolderDragStart(event, folder.id)}
        onDragEnd={handleDrawerFolderDragEnd}
        onContextMenu={(event) => handleFolderContextMenu(event, folder.id)}
        onPointerEnter={() => handleDrawerFolderPointerEnter(folder.id)}
        onPointerLeave={() => handleDrawerFolderPointerLeave(folder.id)}
        onPointerUp={() => handleDrawerFolderPointerUp(folder.id, folderPathName)}
        onDragEnter={(event) => handleDrawerItemDragOverFolder(event, folder.id)}
        onDragOver={(event) => handleDrawerItemDragOverFolder(event, folder.id)}
        onDragLeave={(event) => handleDrawerItemDragLeaveFolder(event, folder.id)}
        onDrop={(event) => handleDrawerItemDropToFolder(event, folder.id, folderPathName)}
      >
        <button
          type="button"
          onClick={(event) => {
            if (suppressNextFolderClickRef.current) {
              suppressNextFolderClickRef.current = false;
              event.preventDefault();
              event.stopPropagation();
              return;
            }
            if (isCanvasMode) {
              const rect = event.currentTarget.getBoundingClientRect();
              requestAddFolderMediaToCanvas(folder.id, folderPathName, { x: rect.right + 10, y: rect.top });
              return;
            }
            if (handleDrawerFolderSelectionClick(folder.id, event)) {
              setActiveFolderId(folder.id);
            }
          }}
          className={`flex h-9 w-full min-w-0 items-center gap-2 rounded-[10px] pr-2 text-left text-[13px] font-semibold transition-all ${rowClassName}`}
          style={{ paddingLeft: rowPaddingLeft }}
          title={isCanvasMode ? `${folderPathName}：点击把图片或视频加入画布` : folderPathName}
        >
          {childFolders.length > 0 ? (
            <span
              data-folder-control="true"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setCollapsedFolderIds(prev => (
                  prev.includes(folder.id) ? prev.filter(id => id !== folder.id) : [...prev, folder.id]
                ));
              }}
              className={`-ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md transition-colors ${isFolderActive ? 'text-white/70 hover:bg-white/12 hover:text-white dark:text-stone-700 dark:hover:bg-black/10 dark:hover:text-stone-950' : 'text-stone-400 hover:bg-stone-200/70 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-white/10 dark:hover:text-stone-200'}`}
              title={isCollapsed ? '展开子目录' : '收起子目录'}
            >
              {isCollapsed ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </span>
          ) : (
            <span className="h-5 w-5 shrink-0" />
          )}
          {depth > 0 && <span aria-hidden="true" className="h-px w-3 shrink-0 bg-stone-300 dark:bg-stone-700" />}
          <FolderOpen className={`h-4 w-4 shrink-0 ${isFolderActive ? 'text-white/90 dark:text-stone-800' : 'text-stone-500 dark:text-stone-400'}`} />
          {editingFolderId === folder.id ? (
            <input
              autoFocus
              value={renameValue}
              onChange={event => setRenameValue(event.target.value)}
              onBlur={() => handleRenameFolder(folder.id)}
              onKeyDown={event => {
                if (event.key === 'Enter') handleRenameFolder(folder.id);
                if (event.key === 'Escape') setEditingFolderId(null);
              }}
              onClick={event => event.stopPropagation()}
              data-folder-control="true"
              className="min-w-0 flex-1 rounded bg-white/90 px-1.5 py-0.5 text-[12px] text-stone-800 outline-none ring-1 ring-emerald-400 dark:bg-stone-800 dark:text-stone-100"
            />
          ) : (
            <span
              onDoubleClick={(event) => { event.stopPropagation(); setEditingFolderId(folder.id); setRenameValue(folder.name); }}
              className="min-w-0 flex-1 truncate"
              title={`${folderPathName}；双击重命名，右键更多操作`}
            >
              {folder.name}
            </span>
          )}
          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${isFolderActive ? 'bg-white/16 text-white/80 dark:bg-black/10 dark:text-stone-700' : 'bg-stone-200/75 text-stone-500 dark:bg-white/[0.08] dark:text-stone-400'}`}>
            {folderItemCount}
          </span>
        </button>

        <button
          type="button"
          data-folder-control="true"
          onClick={(event) => { event.stopPropagation(); deleteDrawerFolders(getFolderActionIds(folder.id)); }}
          className="absolute right-1 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-red-500 p-1 text-white shadow-sm transition-transform hover:scale-110 group-hover/folder-list:block"
          title={childFolders.length > 0 ? '删除文件夹及子目录（不删内容）' : '删除文件夹（不删内容）'}
        >
          <X className="h-2.5 w-2.5" />
        </button>
        <button
          type="button"
          data-folder-control="true"
          onClick={(event) => { event.stopPropagation(); handleOpenFolderModal(folder.id); }}
          className="absolute right-7 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-emerald-500 p-1 text-white shadow-sm transition-transform hover:scale-110 group-hover/folder-list:block"
          title={`在「${folder.name}」中新建子目录`}
        >
          <Plus className="h-2.5 w-2.5" />
        </button>
      </div>
    );

};
