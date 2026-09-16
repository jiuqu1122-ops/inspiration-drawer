import { convertFileSrc } from '@tauri-apps/api/core';
import { CalendarDays,ChevronLeft,ChevronRight,Clock,Download,File as FileIcon,Film,Plus,Search,StickyNote,Tag,Type } from 'lucide-react';
import BufferItemCard from '../../../components/BufferItemCard';
import { DrawerAssetGrid } from '../../../components/drawer/DrawerAssetGrid';
import { RoundedSelect } from '../../../components/RoundedSelect';
import { SCHEDULE_PRIORITY_OPTIONS,formatCalendarPreviewTitle,formatScheduleDateLabel,getCalendarDayMeta,getLocalDateKey,normalizeSchedulePriority,startOfLocalDay } from '../../calendarModel';
import { isProbablyUrl } from '../../dragData';
import { getImagePreviewGallery } from '../../mediaSources';
import type { BufferItem, FloatingNoteSnapshot } from '../../../types';
import type { CalendarScheduleEvent } from '../../calendarModel';

export type DrawerAssetContentScope = Record<string, any> & {
  openFloatingNoteEntries: Array<{ label: string; snapshot: FloatingNoteSnapshot | null }>;
  items: BufferItem[];
  displayItems: BufferItem[];
  calendarMonthDays: number[];
  calendarEventsByDay: Map<string, CalendarScheduleEvent[]>;
  setItems: React.Dispatch<React.SetStateAction<BufferItem[]>>;
};

export function DrawerAssetContent({ scope }: { scope: DrawerAssetContentScope }) {
  const { activeDrawerAiClassificationLabel, activeFolderId, activeTab, addCalendarScheduleItem, aiGeneratedImageFolderIds, assetWindowOffset, beginDrawerTextEditUndo, broadcastFloatingNoteTextUpdate, broadcastFloatingNoteTitleUpdate, calendarDraftPriority, calendarDraftText, calendarEvents, calendarEventsByDay, calendarMonth, calendarMonthDays, calendarOpenCount, calendarPageStyle, calendarScheduleNoteOptions, calendarSelectedDate, calendarTagFilter, calendarTagFilterLabel, calendarTagOptions, calendarTargetNoteLabel, canvasShortcut, cardMediaHeight, cardWidth, closeAllFloatingNotes, closeFloatingNoteByLabel, createBlankFloatingNote, createFloatingNote, deferredSearchQuery, displayItems, draggingItemId, DRAWER_VIRTUALIZATION_THRESHOLD, drawerAiClassificationDimension, drawerAssetQueryKey, drawerCardActionContext, drawerClassificationView, drawerScrollNode, endDrawerTextEditUndo, ensureMediaThumbnail, filteredCalendarEvents, focusFloatingNote, generatedImageCachePendingIdsRef, handleDrawerCardWheel, handleDrawerItemSelect, hasMoreAssets, isAssetPageLoading, isCreatingBlankNote, isDataLoaded, isDrawerAiClassificationMode, isResizingCards, isSelectMode, isUtilityActiveTab, items, jumpCalendarToday, loadNextDrawerAssetPage, loadPreviousDrawerAssetPage, moveCalendarMonth, noteShortcut, openFloatingNoteCount, openFloatingNoteEntries, openSelectedImagePreview, openSelectedVideoPreview, pushDrawerUndoSnapshot, removeDrawerItemsFromDrawer, renderCalendarEvent, requestDeleteDrawerItems, searchShortcut, selectedCalendarEvents, selectedCalendarOpenCount, selectedIds, setCalendarDraftPriority, setCalendarDraftText, setCalendarMonth, setCalendarSelectedDate, setCalendarTagFilter, setCalendarTargetNoteLabel, setCardMediaHeight, setCardWidth, setDrawerItemQuickAccess, setIsResizingCards, setIsSelectMode, setItems, showToast, snipShortcut, startDrawerItemPointerDrag, textShortcut, totalAssetCount, triggerShortcut, unscheduledCalendarEvents } = scope;
  return (
<>
{activeTab === 'notes' && (
                    <div className="flex-1 flex flex-col gap-3">
                      <div className="rounded-[24px] bg-white/75 dark:bg-stone-900/55 border border-white/80 dark:border-stone-700/60 px-4 py-3 shadow-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
                              <StickyNote className="w-4 h-4 text-amber-500" />
                              桌面便签
                            </div>
                            <p className="mt-1 text-[11px] leading-5 text-stone-500 dark:text-stone-400">
                              管理当前保存的桌面便签。便签窗口不会出现在任务栏；需要找回时可以在这里重新显示。
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button
                              onClick={createBlankFloatingNote}
                              disabled={isCreatingBlankNote}
                              className="inline-flex items-center gap-1.5 rounded-[16px] bg-amber-100 px-3 py-2 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-900/35 dark:text-amber-300 dark:hover:bg-amber-900/55"
                              title={`快捷键：${noteShortcut}`}
                            >
                              <Plus className="h-3.5 w-3.5" />
                              新增
                            </button>
                            <button
                              onClick={closeAllFloatingNotes}
                              disabled={openFloatingNoteCount === 0}
                              className="rounded-[16px] bg-stone-100 px-3 py-2 text-[11px] font-bold text-stone-600 transition-colors hover:bg-stone-200 disabled:opacity-45 disabled:hover:bg-stone-100 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-stone-700"
                            >
                              全部删除
                            </button>
                          </div>
                        </div>
                      </div>

                      {openFloatingNoteEntries.length === 0 ? (
                        <div className="flex-1 flex flex-col items-center justify-center rounded-[28px] border border-dashed border-stone-200 dark:border-stone-700/70 bg-white/45 dark:bg-stone-900/30 px-6 py-10 text-center text-stone-400 dark:text-stone-500">
                          <StickyNote className="w-8 h-8 mb-3 text-amber-400/80" />
                          <p className="text-xs font-bold text-stone-500 dark:text-stone-400">还没有保存的桌面便签</p>
                          <p className="mt-2 text-[11px] leading-5">回到素材页，鼠标悬停卡片后点击右上角的便签按钮即可固定到桌面。</p>
                        </div>
                      ) : (
                        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 220px), 1fr))' }}>
                          {openFloatingNoteEntries.map(({ label, snapshot }) => {
                            const itemName = snapshot?.name || snapshot?.content || '桌面便签';
                            const sourceItem = snapshot ? items.find(item => item.id === snapshot.itemId) : null;
                            const kindLabel = snapshot?.type === 'image' ? '图片便签' : snapshot?.type === 'text' ? '文字便签' : snapshot?.type === 'video' ? '视频便签' : '文件便签';
                            const thumb = snapshot?.thumbnail || snapshot?.url || (snapshot?.path && snapshot.type === 'image' ? convertFileSrc(snapshot.path) : '');
                            return (
                              <div key={label} className="rounded-[24px] bg-white/82 dark:bg-stone-900/62 border border-white/80 dark:border-stone-700/60 p-3 shadow-sm">
                                <div className="flex items-start gap-3">
                                  <button
                                    onClick={() => focusFloatingNote(label, snapshot)}
                                    className="h-14 w-14 shrink-0 overflow-hidden rounded-[18px] bg-stone-100 dark:bg-stone-800 border border-stone-200/60 dark:border-stone-700/60 flex items-center justify-center"
                                    title="显示便签"
                                  >
                                    {thumb ? (
                                      <img src={thumb} alt={itemName} loading="lazy" decoding="async" className="h-full w-full object-cover" draggable={false} />
                                    ) : snapshot?.type === 'text' ? (
                                      <Type className="w-5 h-5 text-amber-500" />
                                    ) : snapshot?.type === 'video' ? (
                                      <Film className="w-5 h-5 text-emerald-500" />
                                    ) : (
                                      <FileIcon className="w-5 h-5 text-stone-400" />
                                    )}
                                  </button>
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-xs font-bold text-stone-800 dark:text-stone-100" title={itemName}>{itemName}</div>
                                    <div className="mt-1 flex items-center gap-1.5">
                                      <span className="rounded-full bg-amber-50 dark:bg-amber-900/25 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300">{kindLabel}</span>
                                      <span className="text-[10px] text-stone-400 dark:text-stone-500">{label.replace('note_', '#')}</span>
                                    </div>
                                    {sourceItem ? (
                                      <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-stone-500 dark:text-stone-400">{sourceItem.remark || sourceItem.content || sourceItem.name || '来自抽屉卡片'}</p>
                                    ) : (
                                      <p className="mt-1 text-[11px] leading-4 text-amber-500">原卡片可能已删除，便签内容仍可显示。</p>
                                    )}
                                  </div>
                                </div>
                                <div className="mt-3 flex gap-2">
                                  <button onClick={() => focusFloatingNote(label, snapshot)} className="flex-1 rounded-[16px] bg-stone-900 px-3 py-2 text-[11px] font-bold text-white hover:bg-stone-800 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white">显示</button>
                                  <button onClick={() => closeFloatingNoteByLabel(label)} className="rounded-[16px] bg-stone-100 px-3 py-2 text-[11px] font-bold text-stone-500 hover:bg-red-50 hover:text-red-600 dark:bg-stone-800 dark:text-stone-300 dark:hover:bg-red-900/25 dark:hover:text-red-300">关闭</button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                  {activeTab === 'calendar' && (
                    <div data-calendar-page="true" className="mx-auto flex w-full flex-1 origin-top flex-col gap-3" style={calendarPageStyle}>
                      <div className="rounded-[16px] border border-stone-200 bg-white px-4 py-3 shadow-none dark:border-stone-700 dark:bg-stone-900">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 text-sm font-bold text-stone-800 dark:text-stone-100">
                              <CalendarDays className="w-4 h-4 text-stone-500 dark:text-stone-300" />
                              日历
                            </div>
                            <p className="mt-1 text-[11px] leading-5 text-stone-400 dark:text-stone-500">
                              {filteredCalendarEvents.length === 0 ? '还没有日程' : `${calendarOpenCount} 项待办 / ${filteredCalendarEvents.length} 项总计`}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <RoundedSelect
                              value={calendarTagFilter}
                              options={calendarTagOptions}
                              onChange={setCalendarTagFilter}
                              icon={<Tag className="h-3.5 w-3.5 shrink-0 text-stone-400" />}
                              className="h-8 max-w-[118px] rounded-[9px] border border-stone-200 bg-stone-50 pl-2.5 pr-2 text-[11px] font-bold text-stone-600 shadow-none hover:border-stone-300 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-200 dark:hover:border-stone-600 dark:hover:bg-stone-700"
                              menuMinWidth={150}
                              title={`筛选：${calendarTagFilterLabel}`}
                            />
                            <button
                              onClick={jumpCalendarToday}
                              className="shrink-0 rounded-[9px] bg-stone-900 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-stone-800 active:translate-y-px dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
                            >
                              今天
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-[16px] border border-stone-200 bg-white p-3 shadow-none dark:border-stone-700 dark:bg-stone-900">
                        <div className="mb-2.5 flex items-center justify-between px-1">
                          <button
                            type="button"
                            onClick={() => moveCalendarMonth(-1)}
                            className="rounded-[8px] border border-transparent p-1.5 text-stone-400 transition-colors hover:border-stone-200 hover:bg-stone-100 hover:text-stone-700 dark:hover:border-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                            title="上个月"
                          >
                            <ChevronLeft className="h-4 w-4" />
                          </button>
                          <div className="text-sm font-black text-stone-800 dark:text-stone-100">
                            {new Date(calendarMonth).getFullYear()}年 {new Date(calendarMonth).getMonth() + 1}月
                          </div>
                          <button
                            type="button"
                            onClick={() => moveCalendarMonth(1)}
                            className="rounded-[8px] border border-transparent p-1.5 text-stone-400 transition-colors hover:border-stone-200 hover:bg-stone-100 hover:text-stone-700 dark:hover:border-stone-700 dark:hover:bg-stone-800 dark:hover:text-stone-200"
                            title="下个月"
                          >
                            <ChevronRight className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-stone-400/80 dark:text-stone-500">
                          {['日', '一', '二', '三', '四', '五', '六'].map(day => (
                            <div key={day} className="py-1">{day}</div>
                          ))}
                        </div>
                        <div className="grid grid-cols-7 gap-1">
                          {calendarMonthDays.map(day => {
                            const date = new Date(day);
                            const key = getLocalDateKey(day);
                            const dayEvents = calendarEventsByDay.get(key) || [];
                            const isCurrentMonth = date.getMonth() === new Date(calendarMonth).getMonth();
                            const isSelected = startOfLocalDay(day) === startOfLocalDay(calendarSelectedDate);
                            const isToday = startOfLocalDay(day) === startOfLocalDay(Date.now());
                            const visibleDayEvents = dayEvents.slice(0, 4);
                            const displayDay = !isCurrentMonth && date.getDate() === 1
                              ? `${date.getMonth() + 1}/${date.getDate()}`
                              : `${date.getDate()}`;
                            const dayMeta = getCalendarDayMeta(day);

                            return (
                              <button
                                key={key}
                                type="button"
                                onClick={() => {
                                  setCalendarSelectedDate(startOfLocalDay(day));
                                  setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1).getTime());
                                }}
                                data-calendar-day="true"
                                data-selected={isSelected ? 'true' : 'false'}
                                className={`group/day flex min-h-[92px] flex-col rounded-[10px] border px-1 py-1.5 text-left transition-[background-color,border-color,color] ${
                                  isSelected
                                    ? 'border-blue-300 bg-blue-50/70 text-stone-900 dark:border-blue-500/55 dark:bg-blue-500/10 dark:text-stone-100'
                                    : 'border-transparent text-stone-700 hover:border-stone-200 hover:bg-stone-50 dark:text-stone-300 dark:hover:border-stone-700 dark:hover:bg-stone-800/65'
                                } ${isCurrentMonth ? '' : 'opacity-38'}`}
                              >
                                <div className="w-full rounded-[8px] px-1 py-0.5">
                                  <div className="flex min-w-0 items-center gap-0.5 overflow-hidden">
                                    <span className={`shrink-0 text-[16px] font-black leading-[18px] ${isToday ? 'text-blue-600 dark:text-blue-300' : ''}`}>
                                      {displayDay}
                                    </span>
                                    <span className="flex shrink-0 items-center gap-0.5">
                                      {dayMeta.isPublicRestDay && (
                                        <span className="rounded-full bg-rose-50 px-[3px] text-[8px] font-black leading-[13px] text-rose-500 dark:bg-rose-900/26 dark:text-rose-200">
                                          休
                                        </span>
                                      )}
                                      {isToday && (
                                        <span className="rounded-full bg-rose-50/70 px-[3px] text-[8px] font-black leading-[13px] text-rose-500/80 dark:bg-rose-900/22 dark:text-rose-200/80">
                                          今
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className={`mt-px h-3 overflow-hidden whitespace-nowrap text-[9px] font-semibold leading-3 ${
                                    dayMeta.isNamedDay
                                      ? 'text-stone-600 dark:text-stone-300'
                                      : 'text-stone-400 dark:text-stone-500'
                                  }`}>
                                    {dayMeta.label}
                                  </div>
                                </div>
                                <div className="mt-0.5 flex h-[54px] w-full min-w-0 flex-col gap-0.5 overflow-hidden">
                                  {visibleDayEvents.map(event => {
                                    const priority = normalizeSchedulePriority(event.schedule.priority);
                                    return (
                                      <span
                                        key={event.id}
                                        data-calendar-mini-event="true"
                                        data-calendar-priority={priority}
                                        data-done={event.schedule.done ? 'true' : 'false'}
                                        className="block h-[13px] w-full overflow-hidden whitespace-nowrap rounded-[4px] px-1 text-[8px] font-black leading-[13px]"
                                        title={`${priority} ${event.title}`}
                                      >
                                        {formatCalendarPreviewTitle(event.title)}
                                      </span>
                                    );
                                  })}
                                  {visibleDayEvents.length === 0 && (
                                    <span
                                      className="block h-[13px]"
                                      aria-hidden="true"
                                    />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="rounded-[16px] border border-stone-200 bg-white p-3 shadow-none dark:border-stone-700 dark:bg-stone-900">
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-2 text-xs font-black text-stone-700 dark:text-stone-100">
                            <Clock className="h-4 w-4 text-stone-400" />
                            {formatScheduleDateLabel(calendarSelectedDate)}
                          </div>
                          <span className="rounded-[7px] bg-stone-100 px-2 py-0.5 text-[10px] font-bold tabular-nums text-stone-500 dark:bg-stone-800 dark:text-stone-400">
                            {selectedCalendarEvents.length === 0 ? '0 项' : `${selectedCalendarOpenCount}/${selectedCalendarEvents.length}`}
                          </span>
                        </div>
                        <div data-calendar-composer="true" className="mb-3 flex items-center gap-2 rounded-[12px] border border-stone-200 bg-stone-50 p-2 transition-colors focus-within:border-blue-300 focus-within:bg-white dark:border-stone-700 dark:bg-stone-800/70 dark:focus-within:border-blue-500/60 dark:focus-within:bg-stone-800">
                          <input
                            value={calendarDraftText}
                            onChange={(e) => setCalendarDraftText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                addCalendarScheduleItem();
                              }
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            placeholder="添加日程..."
                            className="h-7 min-w-0 flex-1 bg-transparent px-1 text-xs font-semibold text-stone-800 outline-none placeholder:font-medium placeholder:text-stone-500 dark:text-stone-100 dark:placeholder:text-stone-400"
                          />
                          <RoundedSelect
                            value={calendarTargetNoteLabel}
                            options={calendarScheduleNoteOptions}
                            onChange={setCalendarTargetNoteLabel}
                            icon={<StickyNote className="h-3 w-3 shrink-0 text-stone-400" />}
                            className="max-w-[112px] shrink-0 rounded-[8px] border border-stone-200 bg-white px-2 py-1 text-[10px] font-bold text-stone-600 hover:border-stone-300 hover:bg-stone-100 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
                            menuMinWidth={150}
                            title="选择写入的日程便签"
                          />
                          <RoundedSelect
                            value={calendarDraftPriority}
                            options={SCHEDULE_PRIORITY_OPTIONS.map(priority => ({ value: priority, label: priority }))}
                            onChange={(next) => setCalendarDraftPriority(normalizeSchedulePriority(next))}
                            data-calendar-priority={calendarDraftPriority}
                            className="shrink-0 rounded-[7px] px-2 py-1 text-[10px] font-black"
                            menuMinWidth={58}
                            title="优先级"
                          />
                          <button
                            type="button"
                            onClick={addCalendarScheduleItem}
                            disabled={!calendarDraftText.trim()}
                            className="shrink-0 rounded-[8px] bg-stone-900 p-1.5 text-white transition-colors hover:bg-stone-800 active:translate-y-px disabled:translate-y-0 disabled:bg-stone-200 disabled:text-stone-400 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white dark:disabled:bg-stone-700 dark:disabled:text-stone-500"
                            title="添加日程"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {selectedCalendarEvents.length === 0 ? (
                          <div className="rounded-[12px] border border-dashed border-stone-200 bg-stone-50/70 px-4 py-6 text-center text-xs font-semibold text-stone-400 dark:border-stone-700 dark:bg-stone-800/45 dark:text-stone-500">
                            这天还没有安排
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {selectedCalendarEvents.map(renderCalendarEvent)}
                          </div>
                        )}
                      </div>

                      {unscheduledCalendarEvents.length > 0 && (
                        <div className="rounded-[16px] border border-stone-200 bg-white p-3 shadow-none dark:border-stone-700 dark:bg-stone-900">
                          <div className="mb-2 flex items-center gap-2 text-xs font-black text-stone-600 dark:text-stone-300">
                            <StickyNote className="h-4 w-4 text-stone-400" />
                            未安排日期
                          </div>
                          <div className="space-y-2">
                            {unscheduledCalendarEvents.map(renderCalendarEvent)}
                          </div>
                        </div>
                      )}

                      {calendarEvents.length === 0 && (
                        <div className="flex flex-1 flex-col items-center justify-center rounded-[28px] border border-dashed border-stone-200 bg-white/38 px-6 py-10 text-center text-stone-400 dark:border-stone-700 dark:bg-stone-900/22 dark:text-stone-500">
                          <CalendarDays className="mb-3 h-8 w-8 text-stone-300 dark:text-stone-600" />
                          <p className="text-xs font-bold text-stone-500 dark:text-stone-400">还没有日程</p>
                          <p className="mt-2 text-[11px] leading-5">打开文字便签，切到日程模式并添加日期后，这里会自动汇总。</p>
                        </div>
                      )}
                    </div>
                  )}
                  {!isUtilityActiveTab && isDataLoaded && !isAssetPageLoading && totalAssetCount === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-stone-400 dark:text-stone-600 space-y-3 opacity-80 px-6">
                      <Download className="w-7 h-7 opacity-70" />
                      <div className="space-y-2 text-center">
                        <p className="text-xs font-bold text-stone-500 dark:text-stone-400">把灵感先丢进抽屉</p>
                        <p className="text-[11px] leading-5">拖入文件/图片/网页图 · {snipShortcut} 截图 · {textShortcut} 快速记录 · {searchShortcut} 搜索</p>
                        <p className="text-[11px] leading-5">
                          <span className="rounded-full bg-amber-100/70 px-2 py-0.5 font-mono font-black text-amber-700 dark:bg-amber-400/12 dark:text-amber-200">{canvasShortcut}</span>
                          <span className="ml-1.5">进入画布</span>
                        </p>
                        <p className="text-[11px] leading-5">侧边小条：悬停展开，按住左键经过不触发，Ctrl + 左键可移动位置。</p>
                        <p className="text-[11px] leading-5">悬浮方块：默认右下角，悬停 0.8s 展开，左键拖动位置，{triggerShortcut} 切换入口。</p>
                      </div>
                    </div>
                  )}
                  {!isUtilityActiveTab && totalAssetCount > 0 && displayItems.length === 0 && (
                    <div className="flex-1 flex flex-col items-center justify-center text-stone-400 dark:text-stone-600 space-y-3 opacity-80 px-6">
                      <Search className="w-7 h-7 opacity-70" />
                      <div className="space-y-2 text-center">
                        <p className="text-xs font-bold text-stone-500 dark:text-stone-400">
                          {isDrawerAiClassificationMode && activeDrawerAiClassificationLabel !== 'all'
                            ? `AI 分类“${activeDrawerAiClassificationLabel}”没有匹配素材`
                            : '当前分类没有匹配卡片'}
                        </p>
                        <p className="text-[11px] leading-5">
                          {isDrawerAiClassificationMode
                            ? '切换上方分类标签、清空搜索，或选择“未分析”查看尚未生成标签的素材。'
                            : '试试切到“全部”、清空搜索，或把素材拖到当前文件夹。'}
                        </p>
                        <p className="text-[11px] leading-5">
                          也可以按 <span className="rounded-full bg-amber-100/70 px-2 py-0.5 font-mono font-black text-amber-700 dark:bg-amber-400/12 dark:text-amber-200">{canvasShortcut}</span> 进入画布整理参考。
                        </p>
                        <p className="text-[11px] leading-5">常用：右上角星标固定、备注便于搜索，多选可批量导出/移动/删除。</p>
                      </div>
                    </div>
                  )}
                  {!isUtilityActiveTab && displayItems.length > 0 && (
                    <DrawerAssetGrid
                      items={displayItems}
                      windowOffset={assetWindowOffset}
                      hasMore={hasMoreAssets}
                      isLoading={isAssetPageLoading}
                      cardWidth={cardWidth}
                      mediaHeight={cardMediaHeight}
                      resetKey={drawerAssetQueryKey}
                      scrollContainer={drawerScrollNode}
                      onLoadMore={loadNextDrawerAssetPage}
                      onLoadPrevious={loadPreviousDrawerAssetPage}
                      onWheel={handleDrawerCardWheel}
                      onVisibleItemsChange={visibleItems => visibleItems.forEach(ensureMediaThumbnail)}
                      renderItem={(item, optimizeLargeDrawerList, onMediaDimensionsResolved) => (
                          <div
                            key={item.id}
                            className={`${draggingItemId === item.id ? 'opacity-50 scale-[0.99]' : ''} transition-opacity`}
                            draggable={false}
                            onDragStart={(e) => e.preventDefault()}
                            onPointerDown={(e) => {
                              if (e.shiftKey && !isSelectMode) {
                                e.preventDefault();
                                e.stopPropagation();
                                setIsSelectMode(true);
                                handleDrawerItemSelect(item.id, e as unknown as React.MouseEvent);
                                return;
                              }
                              startDrawerItemPointerDrag(e, item.id);
                            }}
                          >
                            <BufferItemCard
                                  item={item} cardWidth={cardWidth} mediaHeight={cardMediaHeight} isResizing={isResizingCards}
                                  onResizeStart={() => setIsResizingCards(true)} onResizeEnd={() => setIsResizingCards(false)}
                                  onResize={(w: number, h: number) => { setCardWidth(w); setCardMediaHeight(h); }}
                                  onRemove={() => {
                                    if (item.isQuickAccess) { showToast('⚠️ 已开启星标保护，请先取消星标再删除'); return; }

                                    if (item.type === 'image') {

                                      requestDeleteDrawerItems([item], { label: '删除图片' });

                                      return;

                                    }

                                    removeDrawerItemsFromDrawer([item], '删除卡片');
                                  }}
                                  onRemoveFromFolder={() => {
                                    pushDrawerUndoSnapshot('移出文件夹');
                                    setItems(prev => prev.map(i => i.id === item.id ? { ...i, folderId: undefined } : i));
                                  }}
                                  onTogglePin={() => {
                                    pushDrawerUndoSnapshot(item.isQuickAccess ? '取消快速访问' : '固定快速访问');
                                    setDrawerItemQuickAccess(item, !item.isQuickAccess);
                                  }}
                                  onImageClick={() => {
                                    const gallery = getImagePreviewGallery(displayItems, item.id);
                                    openSelectedImagePreview(item, gallery || undefined);
                                  }}
                                  onVideoClick={() => {
                                    if (item.path) openSelectedVideoPreview({ url: convertFileSrc(item.path), path: item.path });
                                  }}
                                  isSelectMode={isSelectMode} isSelected={selectedIds.includes(item.id)}
                                  onToggleSelect={(event?: React.MouseEvent) => handleDrawerItemSelect(item.id, event)}
                                  onTextEditStart={beginDrawerTextEditUndo}
                                  onTextEditEnd={endDrawerTextEditUndo}
                                  optimizeLargeList={optimizeLargeDrawerList}
                                  onMediaDimensionsResolved={onMediaDimensionsResolved}
                                  preferFullImageSource={
                                    !generatedImageCachePendingIdsRef.current.has(item.id) && (
                                      displayItems.length < DRAWER_VIRTUALIZATION_THRESHOLD
                                      || item.type !== 'image'
                                      || !!item.thumbnail
                                      || aiGeneratedImageFolderIds.has(item.folderId || '')
                                      || String(item.sourceUrl || item.originalUrl || '').startsWith('data:image/')
                                    )
                                  }
                                  onUpdateRemark={(id: string, newRemark: string, nextRemarks?: string[]) => {
                                    const cleanRemarks = Array.isArray(nextRemarks) ? nextRemarks.filter(Boolean) : undefined;
                                    pushDrawerUndoSnapshot('修改标签备注');
                                    setItems(prev => prev.map(i => i.id === id ? { ...i, remark: newRemark, remarks: cleanRemarks && cleanRemarks.length > 0 ? cleanRemarks : undefined } : i));
                                    if (item.type === 'text') broadcastFloatingNoteTitleUpdate(id, cleanRemarks?.[0] || newRemark.split(/\r?\n/)[0] || '');
                                  }}
                                  onUpdateText={(id: string, nextText: string) => {
                                    const text = nextText.trim();
                                    if (!text) { showToast('文本不能为空'); return; }
                                    setItems(prev => prev.map(i => {
                                      if (i.id !== id) return i;
                                      const urlLike = isProbablyUrl(text);
                                      if (urlLike) {
                                        return { ...i, type: 'text', content: text, name: '网址链接', url: text, path: text, isUrl: true } as BufferItem;
                                      }
                                      return {
                                        ...i,
                                        type: 'text',
                                        content: text,
                                        name: i.isUrl || i.name === '网址链接' ? '文本片段' : i.name,
                                        url: undefined,
                                        path: undefined,
                                        sourceUrl: undefined,
                                        pageUrl: undefined,
                                        originalUrl: undefined,
                                        isUrl: false,
                                      } as BufferItem;
                                    }));
                                    broadcastFloatingNoteTextUpdate(id, text);
                                  }}
                                  showToast={showToast}
                                  onEnsureThumbnail={ensureMediaThumbnail}
                                  onCreateFloatingNote={createFloatingNote}
                                  selectionScopeKey={`${activeTab}|${activeFolderId}|${deferredSearchQuery}|${drawerClassificationView}|${drawerAiClassificationDimension}|${activeDrawerAiClassificationLabel}`}
                                  actionContext={drawerCardActionContext}
                            />
                          </div>
                      )}
                    />
                  )}
                  {!isUtilityActiveTab && displayItems.length > 0 && (
                    <div className="mt-4 mb-1 rounded-[22px] bg-stone-50/70 dark:bg-stone-900/30 border border-stone-200/60 dark:border-stone-700/60 px-3 py-2 text-[11px] leading-5 text-stone-500 dark:text-stone-400">
                      提示：拖入文件/图片/网页图添加素材；{canvasShortcut} 进入画布；{triggerShortcut} 切换触发入口。
                    </div>
                  )}
</>
  );
}
