import { convertFileSrc,invoke } from '@tauri-apps/api/core';
import { AnimatePresence,motion } from 'framer-motion';
import { BookOpen,Compass,File as FileIcon,Film,HardDrive,Image as ImageIcon,Layers,LayoutGrid,Lightbulb,Monitor,Plus,StickyNote,Trash2,Type,X } from 'lucide-react';
import { SystemQuickAccessIcon } from '../../../components/QuickIcons';
import type { BufferItem, FloatingNoteSnapshot } from '../../../types';
import type { DrawerFolderTreeEntry } from '../../folderModel';

export type DrawerSidebarScope = Record<string, any> & {
  visibleFolderEntries: DrawerFolderTreeEntry[];
  quickAccessItems: BufferItem[];
  openFloatingNoteEntries: Array<{ label: string; snapshot: FloatingNoteSnapshot | null }>;
};

export function DrawerSidebar({ scope }: { scope: DrawerSidebarScope }) {
  const { activeFolderId, activeTab, canvasListItems, canvasRailItems, canvasTrashCount, closeFloatingNoteByLabel, createBlankFloatingNote, createNewCanvasPage, deletedCanvasItems, dragOverFolderId, drawerFolderSidebarWidth, drawerSidebarClassName, finishMainDrawerPress, focusFloatingNote, folderRailHeight, getQuickAccessVisual, handleDrawerFolderPointerEnter, handleDrawerFolderPointerLeave, handleDrawerFolderPointerUp, handleDrawerItemDragLeaveFolder, handleDrawerItemDragOverFolder, handleDrawerItemDropToFolder, handleOpenFolderModal, isCanvasMode, isCanvasTrashOpen, isCreatingBlankNote, isFolderSidebarLayout, isLoadingCanvasTrash, mainDrawerItemCount, mainDrawerLongPressTriggeredRef, noteShortcut, openCanvasTrash, openFloatingNoteCount, openFloatingNoteEntries, openQuickAccessItem, pushDrawerUndoSnapshot, quickAccessItems, quickRailMode, refreshNoteManager, renderDrawerFolderListItem, renderDrawerFolderRailItem, requestAddFolderMediaToCanvas, setActiveFolderId, setActiveTab, setDrawerItemQuickAccess, setIsCanvasTrashOpen, setQuickRailMode, showFolderModal, startMainDrawerLongPress, startResizingFolderSidebarWidth, startResizingSidebarAreas, visibleFolderEntries, visibleFolderRailEntryCount } = scope;
  return (
<div
              data-drawer-sidebar="true"
              className={drawerSidebarClassName}
              style={isFolderSidebarLayout ? { width: drawerFolderSidebarWidth } : undefined}
            >
              {isFolderSidebarLayout && (
                <div
                  data-no-drag="true"
                  onPointerDown={startResizingFolderSidebarWidth}
                  className="absolute right-0 top-0 z-20 h-full w-2 cursor-col-resize transition-colors hover:bg-blue-400/28 dark:hover:bg-blue-300/20"
                  title="拖动调整侧边栏宽度"
                />
              )}
              {isFolderSidebarLayout ? (
                <div className="flex h-full min-w-0 flex-col px-2">
                  <div
                    className="relative w-full shrink-0"
                    data-folder-drop-id="all"
                    data-folder-drop-name="主抽屉"
                    onPointerEnter={() => handleDrawerFolderPointerEnter('all')}
                    onPointerLeave={() => handleDrawerFolderPointerLeave('all')}
                    onPointerUp={() => handleDrawerFolderPointerUp(undefined)}
                    onPointerDown={startMainDrawerLongPress}
                    onPointerCancel={finishMainDrawerPress}
                    onDragEnter={(e) => handleDrawerItemDragOverFolder(e, 'all')}
                    onDragOver={(e) => handleDrawerItemDragOverFolder(e, 'all')}
                    onDragLeave={(e) => handleDrawerItemDragLeaveFolder(e, 'all')}
                    onDrop={(e) => handleDrawerItemDropToFolder(e, undefined)}
                  >
                    <button
                      data-sidebar-home="true"
                      data-sidebar-home-active={activeFolderId === 'all' || isCanvasMode ? 'true' : 'false'}
                      type="button"
                      onClick={(e) => {
                        if (mainDrawerLongPressTriggeredRef.current) {
                          e.preventDefault();
                          e.stopPropagation();
                          return;
                        }
                        if (isCanvasMode) {
                          const rect = e.currentTarget.getBoundingClientRect();
                          requestAddFolderMediaToCanvas(undefined, '主抽屉', { x: rect.right + 10, y: rect.top });
                          return;
                        }
                        setActiveFolderId('all');
                      }}
                      onPointerUp={finishMainDrawerPress}
                      onPointerLeave={finishMainDrawerPress}
                      className={`flex h-10 w-full min-w-0 items-center gap-2 rounded-[12px] px-2 text-left text-[13px] font-black transition-all ${isCanvasMode ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20 dark:bg-blue-400 dark:text-stone-950' : dragOverFolderId === 'all' ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-200 dark:bg-blue-400/14 dark:text-blue-100 dark:ring-blue-300/25' : activeFolderId === 'all' ? 'bg-stone-900 text-white shadow-sm dark:bg-white/14 dark:text-white' : 'text-stone-700 hover:bg-white/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.07] dark:hover:text-white'}`}
                      title={isCanvasMode ? '点击把主抽屉图片或视频加入画布，长按退出画布' : '长按进入无限画布'}
                    >
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[10px] ${isCanvasMode ? 'bg-white/18 text-white dark:bg-stone-950/82 dark:text-blue-200 dark:ring-1 dark:ring-white/15' : activeFolderId === 'all' ? 'bg-white/14 text-blue-200' : 'bg-blue-50 text-blue-600 dark:bg-blue-400/12 dark:text-blue-200'}`}>
                        {isCanvasMode ? <LayoutGrid className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{isCanvasMode ? '无限画布' : '主抽屉'}</span>
                      <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black leading-none ${activeFolderId === 'all' || isCanvasMode ? 'bg-white/16 text-white/78 dark:text-stone-950/70' : 'bg-stone-200/75 text-stone-500 dark:bg-white/[0.08] dark:text-stone-400'}`}>
                        {mainDrawerItemCount}
                      </span>
                    </button>
                  </div>

                  <div className="my-2 h-px w-full shrink-0 bg-stone-300/75 dark:bg-stone-700/80" />

                  <div className="relative w-full shrink-0 overflow-hidden" style={{ height: folderRailHeight }}>
                    <div
                      className="flex h-full w-full flex-col gap-1 overflow-y-auto overflow-x-hidden pr-0.5 [&::-webkit-scrollbar]:hidden"
                      style={{
                        WebkitMaskImage: visibleFolderRailEntryCount > 7
                          ? 'linear-gradient(to bottom, black 0%, black calc(100% - 34px), transparent 100%)'
                          : undefined,
                        maskImage: visibleFolderRailEntryCount > 7
                          ? 'linear-gradient(to bottom, black 0%, black calc(100% - 34px), transparent 100%)'
                          : undefined,
                      }}
                    >
                      <button
                        data-new-folder="true"
                        type="button"
                        onClick={() => handleOpenFolderModal()}
                        className="mb-1 flex h-9 w-full shrink-0 items-center gap-2 rounded-[10px] border border-stone-200 bg-stone-100 px-2 text-left text-[12px] font-bold text-stone-700 shadow-none transition-all hover:bg-stone-200 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700"
                        title="新建收纳夹"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span className="min-w-0 flex-1 truncate">新建文件夹</span>
                      </button>

                      {visibleFolderEntries.map((entry, index) => (
                        <div key={entry.folder.id} className="flex w-full shrink-0 flex-col gap-1">
                          {renderDrawerFolderListItem(entry.folder, index, entry.depth)}
                        </div>
                      ))}
                    </div>

                  </div>

                  <div
                    data-no-drag="true"
                    onPointerDown={startResizingSidebarAreas}
                    className="group relative flex w-full shrink-0 cursor-row-resize items-center justify-center py-1.5"
                    title="拖动调整文件夹 / 快速导航区域高度"
                  >
                    <div className="h-1 w-10 rounded-full bg-stone-300/75 transition-all group-hover:w-14 group-hover:bg-emerald-400/80 dark:bg-stone-700/80 dark:group-hover:bg-emerald-500/70" />
                  </div>

                  <div className="mb-2 flex w-full shrink-0 flex-col gap-1">
                    <div className="flex items-center justify-between px-1">
                      <span className="flex items-center gap-1.5 text-[11px] font-black text-stone-500 dark:text-stone-400">
                        <Layers className="h-3.5 w-3.5 text-indigo-500" />
                        画布
                      </span>
                      <button
                        type="button"
                        onClick={() => void createNewCanvasPage()}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition-colors hover:bg-indigo-100 dark:bg-indigo-400/12 dark:text-indigo-200 dark:hover:bg-indigo-400/20"
                        title="新建画布"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="max-h-40 overflow-y-auto overflow-x-visible pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                      <div className="flex flex-col gap-1">
                        {canvasListItems}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void openCanvasTrash()}
                      className={`mt-1 flex h-8 w-full items-center gap-2 rounded-[10px] px-2 text-left text-[11px] font-bold transition-colors ${isCanvasTrashOpen ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950' : 'text-stone-500 hover:bg-white/70 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-white/[0.07] dark:hover:text-white'}`}
                      title="打开画布回收站"
                    >
                      <Trash2 className="h-3.5 w-3.5 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">回收站</span>
                      {canvasTrashCount > 0 && (
                        <span className="min-w-[18px] rounded-full bg-red-500 px-1.5 text-center text-[9px] leading-[18px] text-white">
                          {canvasTrashCount}
                        </span>
                      )}
                    </button>
                    {isCanvasTrashOpen && (
                      <div className="mt-1 rounded-[12px] border border-stone-200/80 bg-white/58 p-2 dark:border-stone-700/70 dark:bg-stone-800/40">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-black text-stone-600 dark:text-stone-300">画布回收站</span>
                          <button
                            type="button"
                            onClick={() => setIsCanvasTrashOpen(false)}
                            className="flex h-6 w-6 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-stone-700 dark:hover:text-white"
                            title="关闭回收站"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="max-h-44 overflow-y-auto pr-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                          {isLoadingCanvasTrash ? (
                            <div className="rounded-[10px] border border-dashed border-stone-200 px-2 py-3 text-center text-[11px] font-semibold text-stone-400 dark:border-stone-700 dark:text-stone-500">
                              读取中...
                            </div>
                          ) : deletedCanvasItems.length > 0 ? (
                            <div className="flex flex-col gap-2">{deletedCanvasItems}</div>
                          ) : (
                            <div className="rounded-[10px] border border-dashed border-stone-200 px-2 py-3 text-center text-[11px] font-semibold text-stone-400 dark:border-stone-700 dark:text-stone-500">
                              回收站为空
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden">
                    <div
                      data-no-drag="true"
                      data-quick-switch="true"
                      className="mb-2 grid shrink-0 grid-cols-2 gap-1 rounded-[12px] border border-white/70 bg-white/55 p-1 shadow-sm backdrop-blur-md dark:border-stone-700/60 dark:bg-stone-800/50"
                    >
                      <button
                        data-quick-mode="quick"
                        data-active={quickRailMode === 'quick' ? 'true' : 'false'}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setQuickRailMode('quick');
                          if (activeTab === 'notes') setActiveTab('all');
                        }}
                        className={`flex h-7 items-center justify-center gap-1 rounded-[9px] border text-[11px] font-black transition-all ${quickRailMode === 'quick' ? 'border-stone-200 bg-white text-stone-800 shadow-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100' : 'border-transparent text-stone-500 hover:bg-white/60 hover:text-stone-800 dark:text-stone-500 dark:hover:bg-white/[0.06] dark:hover:text-stone-200'}`}
                        title="快速访问"
                      >
                        <Compass className="h-3.5 w-3.5" />
                        快捷
                      </button>
                      <button
                        data-quick-mode="notes"
                        data-active={quickRailMode === 'notes' ? 'true' : 'false'}
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setQuickRailMode('notes');
                          refreshNoteManager();
                          if (activeTab === 'notes') setActiveTab('all');
                        }}
                        className={`relative flex h-7 items-center justify-center gap-1 rounded-[9px] border text-[11px] font-black transition-all ${quickRailMode === 'notes' ? 'border-stone-200 bg-white text-stone-800 shadow-sm dark:border-stone-700 dark:bg-stone-800 dark:text-stone-100' : 'border-transparent text-stone-500 hover:bg-white/60 hover:text-stone-800 dark:text-stone-500 dark:hover:bg-white/[0.06] dark:hover:text-stone-200'}`}
                        title={openFloatingNoteCount > 0 ? `便签（${openFloatingNoteCount} 个）` : '便签'}
                      >
                        <BookOpen className="h-3.5 w-3.5" />
                        便签
                        {openFloatingNoteCount > 0 && (
                          <span data-quick-badge="true" className="absolute right-1 top-1 min-w-[14px] rounded-full bg-stone-700 px-1 text-[8px] leading-[14px] text-white dark:bg-stone-200 dark:text-stone-900">
                            {openFloatingNoteCount}
                          </span>
                        )}
                      </button>
                    </div>

                    <div className="flex min-h-0 w-full flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden pr-0.5 [&::-webkit-scrollbar]:hidden">
                      {quickRailMode === 'quick' ? (
                        <>
                          <button
                            type="button"
                            onClick={(event) => { event.preventDefault(); event.stopPropagation(); invoke('open_file', { path: 'SYSTEM_COMPUTER' }).catch(() => {}); }}
                            className="flex h-9 w-full shrink-0 items-center gap-2 rounded-[10px] px-2 text-left text-[12px] font-semibold text-stone-700 transition-all hover:bg-white/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
                            title="打开此电脑"
                          >
                            <HardDrive className="h-4 w-4 shrink-0 text-blue-500/90 dark:text-blue-400/90" />
                            <span className="min-w-0 flex-1 truncate">此电脑</span>
                          </button>
                          <button
                            type="button"
                            onClick={(event) => { event.preventDefault(); event.stopPropagation(); invoke('open_file', { path: 'SYSTEM_DESKTOP' }).catch(() => {}); }}
                            className="flex h-9 w-full shrink-0 items-center gap-2 rounded-[10px] px-2 text-left text-[12px] font-semibold text-stone-700 transition-all hover:bg-white/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
                            title="打开桌面"
                          >
                            <Monitor className="h-4 w-4 shrink-0 text-cyan-500/90 dark:text-cyan-300/90" />
                            <span className="min-w-0 flex-1 truncate">桌面</span>
                          </button>
                          <AnimatePresence>
                            {quickAccessItems.map(item => {
                              const visual = getQuickAccessVisual(item as BufferItem & { isDirectory?: boolean; isUrl?: boolean });
                              const quickName = item.name || item.content || item.path || '快速访问';
                              return (
                                <motion.div
                                  key={item.id}
                                  layout
                                  initial={{ opacity: 0, scale: 0.98 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  exit={{ opacity: 0, scale: 0.98 }}
                                  transition={{ layout: { type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] }, default: { type: 'tween', duration: 0.14, ease: [0.16, 1, 0.3, 1] } }}
                                  className="group/quick-list relative w-full shrink-0"
                                >
                                  <button
                                    type="button"
                                    onClick={(e) => openQuickAccessItem(item as BufferItem & { isDirectory?: boolean; isUrl?: boolean }, e)}
                                    className="flex h-9 w-full min-w-0 items-center gap-2 rounded-[10px] px-2 pr-7 text-left text-[12px] font-semibold text-stone-700 transition-all hover:bg-white/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
                                    title={`${visual.label}：${quickName}`}
                                  >
                                    <span className="flex h-4 w-4 shrink-0 items-center justify-center">{visual.icon}</span>
                                    <span className="min-w-0 flex-1 truncate">{quickName}</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      pushDrawerUndoSnapshot('取消快速访问');
                                      setDrawerItemQuickAccess(item, false);
                                    }}
                                    className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-red-500 p-1 text-white shadow-sm transition-transform hover:scale-110 group-hover/quick-list:block"
                                    title="取消快速访问"
                                  >
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </motion.div>
                              );
                            })}
                          </AnimatePresence>
                        </>
                      ) : (
                        <>
                          <button
                            data-new-note="true"
                            type="button"
                            onClick={createBlankFloatingNote}
                            disabled={isCreatingBlankNote}
                            className="flex h-9 w-full shrink-0 items-center gap-2 rounded-[10px] border border-stone-200 bg-white px-2 text-left text-[12px] font-bold text-stone-700 shadow-none transition-all hover:bg-stone-100 disabled:opacity-55 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200 dark:hover:bg-stone-800"
                            title={`新增便签（${noteShortcut}）`}
                          >
                            <Plus className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                            <span className="min-w-0 flex-1 truncate">新增便签</span>
                          </button>
                          {openFloatingNoteEntries.length === 0 ? (
                            <div className="flex h-9 w-full shrink-0 items-center gap-2 rounded-[10px] border border-dashed border-stone-300 px-2 text-[12px] font-semibold text-stone-400 opacity-75 dark:border-stone-700 dark:text-stone-500">
                              <StickyNote className="h-4 w-4 shrink-0 text-stone-400" />
                              <span className="min-w-0 flex-1 truncate">无便签</span>
                            </div>
                          ) : (
                            <AnimatePresence>
                              {openFloatingNoteEntries.map(({ label, snapshot }) => {
                                if (!snapshot) return null;
                                const noteName = snapshot.name || snapshot.content || '桌面便签';
                                const thumb = snapshot.thumbnail || snapshot.url || (snapshot.path && snapshot.type === 'image' ? convertFileSrc(snapshot.path) : '');
                                const noteIcon = snapshot.type === 'image'
                                  ? (thumb ? <img src={thumb} alt={noteName} loading="lazy" decoding="async" className="h-5 w-5 rounded-md object-cover" draggable={false} /> : <ImageIcon className="h-4 w-4 text-stone-500" />)
                                  : snapshot.type === 'text'
                                    ? <Type className="h-4 w-4 text-amber-500" />
                                    : snapshot.type === 'video'
                                      ? <Film className="h-4 w-4 text-emerald-500" />
                                      : <FileIcon className="h-4 w-4 text-stone-400" />;
                                return (
                                  <motion.div
                                    key={label}
                                    layout
                                    initial={{ opacity: 0, scale: 0.98 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.98 }}
                                    transition={{ layout: { type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] }, default: { type: 'tween', duration: 0.14, ease: [0.16, 1, 0.3, 1] } }}
                                    className="group/note-list relative w-full shrink-0"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => focusFloatingNote(label, snapshot)}
                                      className="flex h-9 w-full min-w-0 items-center gap-2 rounded-[10px] px-2 pr-7 text-left text-[12px] font-semibold text-stone-700 transition-all hover:bg-white/70 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-white/[0.07] dark:hover:text-white"
                                      title={`显示便签：${noteName}`}
                                    >
                                      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{noteIcon}</span>
                                      <span className="min-w-0 flex-1 truncate">{noteName}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        closeFloatingNoteByLabel(label);
                                      }}
                                      className="absolute right-1 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/85 p-1 text-stone-400 shadow-sm ring-1 ring-stone-200/80 transition-all hover:bg-red-50 hover:text-red-400 group-hover/note-list:block dark:bg-stone-800/82 dark:text-stone-500 dark:ring-stone-700/80 dark:hover:bg-red-950/30 dark:hover:text-red-300/80"
                                      title="删除便签"
                                    >
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  </motion.div>
                                );
                              })}
                            </AnimatePresence>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <>
              {/* 主抽屉：固定在侧边栏顶部，不参与文件夹滚动 */}
              <div
                className="relative shrink-0 flex flex-col items-center w-full px-1 pt-0"
                data-folder-drop-id="all"
                data-folder-drop-name="主抽屉"
                onPointerEnter={() => handleDrawerFolderPointerEnter('all')}
                onPointerLeave={() => handleDrawerFolderPointerLeave('all')}
                onPointerUp={() => handleDrawerFolderPointerUp(undefined)}
                onPointerDown={startMainDrawerLongPress}
                onPointerCancel={finishMainDrawerPress}
                onDragEnter={(e) => handleDrawerItemDragOverFolder(e, 'all')}
                onDragOver={(e) => handleDrawerItemDragOverFolder(e, 'all')}
                onDragLeave={(e) => handleDrawerItemDragLeaveFolder(e, 'all')}
                onDrop={(e) => handleDrawerItemDropToFolder(e, undefined)}
              >
                <div
                  onClick={(e) => {
                    if (mainDrawerLongPressTriggeredRef.current) {
                      e.preventDefault();
                      e.stopPropagation();
                      return;
                    }
                    if (isCanvasMode) {
                      const rect = e.currentTarget.getBoundingClientRect();
                      requestAddFolderMediaToCanvas(undefined, '主抽屉', { x: rect.right + 10, y: rect.top });
                      return;
                    }
                    setActiveFolderId('all');
                  }}
                  onPointerUp={finishMainDrawerPress}
                  onPointerLeave={finishMainDrawerPress}
                  className={`relative mb-1 flex h-10 w-10 items-center justify-center overflow-visible rounded-[16px] cursor-pointer transition-all shadow-sm ${isCanvasMode ? 'bg-blue-500 text-white shadow-md shadow-blue-500/20 scale-105 dark:bg-blue-400 dark:text-stone-950' : dragOverFolderId === 'all' ? 'ring-2 ring-blue-300 bg-blue-50 text-blue-600 dark:ring-blue-400/40 dark:bg-blue-400/14 dark:text-blue-200 scale-105' : activeFolderId === 'all' ? 'bg-blue-500 text-white dark:bg-blue-400 dark:text-stone-950 shadow-md shadow-blue-500/20 scale-105' : 'bg-white/65 dark:bg-stone-800/65 backdrop-blur-md text-stone-500 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-400/12 dark:hover:text-blue-200 hover:scale-105'}`}
                  title={isCanvasMode ? '点击把主抽屉图片或视频加入画布，长按退出画布' : '长按进入无限画布'}
                >
                    <span className="pointer-events-none absolute -right-1.5 -top-1.5 z-0 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-blue-600 ring-1 ring-blue-100 shadow-[0_4px_10px_rgba(37,99,235,0.28)] dark:bg-stone-950 dark:text-blue-300 dark:ring-blue-300/25">
                      {isCanvasMode ? (
                      <Lightbulb className="h-[12px] w-[12px]" strokeWidth={2.5} />
                    ) : (
                      <LayoutGrid className="h-[12px] w-[12px]" strokeWidth={2.5} />
                    )}
                  </span>
                  <span className="relative z-10 flex h-7 w-7 items-center justify-center drop-shadow-[0_2px_4px_rgba(15,23,42,0.2)]">
                    {isCanvasMode ? (
                      <LayoutGrid className="h-[22px] w-[22px]" strokeWidth={2.25} />
                    ) : (
                      <Lightbulb className="h-[22px] w-[22px]" strokeWidth={2.25} />
                    )}
                  </span>
                </div>
                <span className={`text-[10px] w-14 text-center truncate px-0.5 cursor-default pb-1 ${activeFolderId === 'all' ? 'text-stone-800 dark:text-stone-200 font-bold' : 'text-stone-500 dark:text-stone-400'}`}>主抽屉</span>
              </div>

              <div className="w-6 h-px bg-stone-300 dark:bg-stone-700/80 shrink-0 my-2 rounded-full" />

              {/* 文件夹区域：只滚动收纳夹和新建按钮 */}
              <div className="relative w-full shrink-0 overflow-hidden" style={{ height: folderRailHeight }}>
                <div
                  className="h-full w-full overflow-y-auto overflow-x-hidden flex flex-col items-center space-y-3 [&::-webkit-scrollbar]:hidden px-1 pt-3 pb-8"
                  style={{
                    WebkitMaskImage: visibleFolderRailEntryCount > 4
                      ? 'linear-gradient(to bottom, black 0%, black calc(100% - 34px), transparent 100%)'
                      : undefined,
                    maskImage: visibleFolderRailEntryCount > 4
                      ? 'linear-gradient(to bottom, black 0%, black calc(100% - 34px), transparent 100%)'
                      : undefined,
                  }}
                >
                  {/* 新建收纳夹按钮固定在文件夹区域顶部 */}
                  <div className="relative shrink-0 flex flex-col items-center w-full mb-1">
                    <button
                      onClick={() => handleOpenFolderModal()}
                      className={`w-10 h-10 mb-1 rounded-[16px] flex items-center justify-center border-2 border-dashed transition-all hover:scale-105 shrink-0 ${showFolderModal ? 'border-blue-300 bg-blue-500 text-white shadow-md shadow-blue-500/20 dark:border-blue-300/55 dark:bg-blue-400 dark:text-stone-950 dark:shadow-blue-950/30' : 'border-blue-200 bg-blue-50/30 text-blue-400 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 dark:border-blue-400/28 dark:bg-blue-400/10 dark:text-blue-300 dark:hover:border-blue-300/55 dark:hover:bg-blue-400/18'}`}
                      title="新建收纳夹"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] w-14 text-center truncate px-0.5 cursor-default pb-1 text-stone-400 dark:text-stone-500">新增</span>
                  </div>

                  {visibleFolderEntries.map((entry, index) => (
                    <div key={entry.folder.id} className="relative flex w-full shrink-0 flex-col items-center gap-2">
                      {renderDrawerFolderRailItem(entry.folder, index, entry.depth)}
                    </div>
                  ))}
                </div>

                {visibleFolderRailEntryCount > 4 && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-b from-transparent via-stone-100/45 to-stone-100/90 dark:via-stone-900/35 dark:to-stone-900/80" />
                )}
              </div>

              <div
                data-no-drag="true"
                onPointerDown={startResizingSidebarAreas}
                className="group relative w-full shrink-0 flex items-center justify-center py-1.5 cursor-row-resize"
                title="拖动调整文件夹 / 快速导航区域高度"
              >
                <div className="h-1 w-7 rounded-full bg-stone-300/75 dark:bg-stone-700/80 transition-all group-hover:w-9 group-hover:bg-emerald-400/80 dark:group-hover:bg-emerald-500/70" />
              </div>

              {/* 快速访问 / 便签区域：独立滚动 */}
              <div className="w-full shrink-0 px-1 pb-2">
                <div className="mb-2 flex flex-col items-center">
                  <span className="mb-1 flex items-center gap-1 text-[10px] font-black text-stone-400 dark:text-stone-500">
                    <Layers className="h-3 w-3 text-indigo-400" />
                    画布
                  </span>
                  <button
                    type="button"
                    onClick={() => void createNewCanvasPage()}
                    className="flex h-9 w-9 items-center justify-center rounded-[14px] border border-dashed border-indigo-200 bg-indigo-50/40 text-indigo-500 transition-all hover:scale-105 hover:bg-indigo-50 dark:border-indigo-400/25 dark:bg-indigo-400/10 dark:text-indigo-200"
                    title="新建画布"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-44 overflow-y-auto overflow-x-visible [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  <div className="flex flex-col items-center gap-2">
                    {canvasRailItems}
                    <button
                      type="button"
                      onClick={() => void openCanvasTrash()}
                      className={`relative flex h-9 w-9 items-center justify-center rounded-[14px] border transition-colors ${isCanvasTrashOpen ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950' : 'border-stone-200 bg-white/65 text-stone-500 hover:bg-stone-100 dark:border-stone-700/60 dark:bg-stone-800/65 dark:text-stone-300 dark:hover:bg-stone-700'}`}
                      title="画布回收站"
                    >
                      <Trash2 className="h-4 w-4" />
                      {canvasTrashCount > 0 && (
                        <span className="absolute -right-1 -top-1 min-w-[16px] rounded-full bg-red-500 px-1 text-center text-[8px] leading-[16px] text-white">
                          {canvasTrashCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="w-full min-h-0 flex-1 flex flex-col items-center overflow-hidden px-1">
                <div className="relative shrink-0 flex flex-col items-center w-full mb-4 mt-1">
                  <div
                    data-no-drag="true"
                    data-quick-switch-compact="true"
                    className="relative flex flex-col items-center gap-1 rounded-full bg-white/60 dark:bg-stone-800/60 border border-white/75 dark:border-stone-700/60 p-1 shadow-sm backdrop-blur-md"
                    title={quickRailMode === 'quick' ? '当前：快速访问' : '当前：便签'}
                  >
                    <button
                      data-quick-mode="quick"
                      data-active={quickRailMode === 'quick' ? 'true' : 'false'}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setQuickRailMode('quick');
                        if (activeTab === 'notes') setActiveTab('all');
                      }}
                      className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-all overflow-visible ${
                        quickRailMode === 'quick'
                          ? 'bg-white text-stone-800 shadow-sm ring-1 ring-stone-200 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-700'
                          : 'text-stone-500 hover:bg-white/60 hover:text-stone-800 dark:text-stone-500 dark:hover:bg-white/[0.06] dark:hover:text-stone-200'
                      }`}
                      title="快速访问"
                    >
                      <Compass className="h-4 w-4" />
                    </button>

                    <button
                      data-quick-mode="notes"
                      data-active={quickRailMode === 'notes' ? 'true' : 'false'}
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setQuickRailMode('notes');
                        refreshNoteManager();
                        if (activeTab === 'notes') setActiveTab('all');
                      }}
                      className={`relative flex h-8 w-8 items-center justify-center rounded-full transition-all overflow-visible ${
                        quickRailMode === 'notes'
                          ? 'bg-white text-stone-800 shadow-sm ring-1 ring-stone-200 dark:bg-stone-800 dark:text-stone-100 dark:ring-stone-700'
                          : 'text-stone-500 hover:bg-white/60 hover:text-stone-800 dark:text-stone-500 dark:hover:bg-white/[0.06] dark:hover:text-stone-200'
                      }`}
                      title={openFloatingNoteCount > 0 ? `便签（${openFloatingNoteCount} 个）` : '便签'}
                    >
                      <BookOpen className="h-4 w-4" />
                      {openFloatingNoteCount > 0 && (
                        <span data-quick-badge="true" className="absolute right-0 top-0 z-30 min-w-[15px] h-[15px] translate-x-1/3 -translate-y-1/3 rounded-full bg-stone-700 px-1 text-[9px] font-bold leading-[15px] text-white shadow-sm ring-2 ring-white/80 dark:bg-stone-200 dark:text-stone-900 dark:ring-stone-800/80">
                          {openFloatingNoteCount}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                <div className="w-full min-h-0 flex-1 overflow-y-auto overflow-x-hidden flex flex-col items-center gap-2 [&::-webkit-scrollbar]:hidden pt-3 pb-2">
                  {quickRailMode === 'quick' ? (
                    <>
                      <SystemQuickAccessIcon title="此电脑" icon={<HardDrive className="w-5 h-5 text-blue-500/90 dark:text-blue-400/90" />} path="SYSTEM_COMPUTER" />
                      <SystemQuickAccessIcon title="桌面" icon={<Monitor className="w-5 h-5 text-cyan-500/90 dark:text-cyan-300/90" />} path="SYSTEM_DESKTOP" />
                      <AnimatePresence>
                        {quickAccessItems.map(item => {
                          const visual = getQuickAccessVisual(item as BufferItem & { isDirectory?: boolean; isUrl?: boolean });
                          const quickName = item.name || item.content || item.path || '快速访问';
                          return (
                            <motion.div
                              key={item.id}
                              layout
                              initial={{ opacity: 0, scale: 0.96 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.96 }}
                              transition={{ layout: { type: 'tween', duration: 0.22, ease: [0.16, 1, 0.3, 1] }, default: { type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] } }}
                              className="relative shrink-0 group/quick flex flex-col items-center w-full"
                            >
                              <button
                                onClick={(e) => openQuickAccessItem(item as BufferItem & { isDirectory?: boolean; isUrl?: boolean }, e)}
                                title={`${visual.label}：${quickName}`}
                                className="w-10 h-10 mb-1 rounded-[16px] bg-white/65 dark:bg-stone-800/65 backdrop-blur-md border border-white/70 dark:border-stone-700/60 shadow-sm flex items-center justify-center hover:scale-105 hover:bg-white dark:hover:bg-stone-700 transition-all"
                              >
                                {visual.icon}
                              </button>
                              <span
                                className="text-[10px] w-14 text-center truncate px-0.5 cursor-default pb-1 text-stone-500 dark:text-stone-400 group-hover/quick:text-blue-500 dark:group-hover/quick:text-blue-300"
                                title={quickName}
                              >
                                {quickName}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  pushDrawerUndoSnapshot('取消快速访问');
                                  setDrawerItemQuickAccess(item, false);
                                }}
                                className="absolute -top-1.5 right-1 opacity-0 group-hover/quick:opacity-100 bg-red-500 text-white rounded-full p-0.5 shadow-sm transition-opacity hover:scale-110"
                                title="取消快速访问"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </>
                  ) : (
                    <>
                      <button
                        data-new-note="compact"
                        type="button"
                        onClick={createBlankFloatingNote}
                        disabled={isCreatingBlankNote}
                        title={`新增便签（${noteShortcut}）`}
                        className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-[16px] border border-stone-200 bg-white text-blue-600 shadow-none transition-all hover:scale-105 hover:bg-stone-100 disabled:scale-100 disabled:opacity-55 dark:border-stone-700 dark:bg-stone-900 dark:text-blue-400 dark:hover:bg-stone-800"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                      {openFloatingNoteEntries.length === 0 ? (
                        <div className="flex flex-col items-center w-full opacity-70">
                          <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-[16px] border border-dashed border-stone-300 bg-white/45 dark:border-stone-700 dark:bg-stone-900/45">
                            <StickyNote className="h-5 w-5 text-stone-400" />
                          </div>
                          <span className="text-[10px] w-14 text-center text-stone-400 dark:text-stone-500 pb-1">无便签</span>
                        </div>
                      ) : (
                        <AnimatePresence>
                          {openFloatingNoteEntries.map(({ label, snapshot }) => {
                            if (!snapshot) return null;
                            const noteName = snapshot.name || snapshot.content || '桌面便签';
                            const thumb = snapshot.thumbnail || snapshot.url || (snapshot.path && snapshot.type === 'image' ? convertFileSrc(snapshot.path) : '');
                            const noteIcon = snapshot.type === 'image'
                              ? (thumb ? <img src={thumb} alt={noteName} loading="lazy" decoding="async" className="w-full h-full object-cover rounded-[16px]" draggable={false} /> : <ImageIcon className="w-5 h-5 text-stone-500" />)
                              : snapshot.type === 'text'
                                ? <Type className="w-5 h-5 text-amber-500" />
                                : snapshot.type === 'video'
                                  ? <Film className="w-5 h-5 text-emerald-500" />
                                  : <FileIcon className="w-5 h-5 text-stone-400" />;
                            return (
                              <motion.div
                                key={label}
                                layout
                                initial={{ opacity: 0, scale: 0.96 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.96 }}
                                transition={{ layout: { type: 'tween', duration: 0.22, ease: [0.16, 1, 0.3, 1] }, default: { type: 'tween', duration: 0.18, ease: [0.16, 1, 0.3, 1] } }}
                                className="relative shrink-0 group/note flex flex-col items-center w-full"
                              >
                                <button
                                  onClick={() => focusFloatingNote(label, snapshot)}
                                  title={`显示便签：${noteName}`}
                                  className="relative w-10 h-10 mb-1 rounded-[16px] bg-white/70 dark:bg-stone-800/70 backdrop-blur-md border border-amber-100/80 dark:border-amber-800/40 shadow-sm flex items-center justify-center overflow-hidden hover:scale-105 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                                >
                                  {noteIcon}
                                </button>
                                <span
                                  className="text-[10px] w-14 text-center truncate px-0.5 cursor-default pb-1 text-stone-500 dark:text-stone-400 group-hover/note:text-amber-600 dark:group-hover/note:text-amber-300"
                                  title={noteName}
                                >
                                  {noteName}
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    closeFloatingNoteByLabel(label);
                                  }}
                                  className="absolute top-0 right-1 z-30 rounded-full bg-white/80 p-0.5 text-stone-400 opacity-0 shadow-sm ring-1 ring-stone-200/80 transition-all hover:bg-red-50 hover:text-red-400 group-hover/note:opacity-100 dark:bg-stone-800/82 dark:text-stone-500 dark:ring-stone-700/80 dark:hover:bg-red-950/30 dark:hover:text-red-300/80"
                                  title="删除便签"
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      )}
                    </>
                  )}
                </div>
              </div>
                </>
              )}
            </div>
  );
}
