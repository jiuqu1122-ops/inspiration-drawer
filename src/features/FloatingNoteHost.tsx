import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  File as FileIcon, X, Check, Pin, Image as ImageIcon, Film, LayoutGrid,
  CheckSquare, ChevronLeft, ChevronRight, Palette, Plus, StickyNote,
  Clock, Tag,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listen, emitTo } from '@tauri-apps/api/event';

import { Folder, FloatingNoteSnapshot, FloatingNoteScheduleItem } from '../types';
import { RoundedSelect } from '../components/RoundedSelect';
import { clamp } from './common';
import { getDrawerFolderPathName } from './folderModel';
import {
  SCHEDULE_PRIORITY_OPTIONS,
  addLocalDays,
  buildScheduleItemsFromText,
  formatDateInputValue,
  formatScheduleDateLabel,
  getSchedulePriorityClass,
  getScheduleTextContent,
  getTodayInputValue,
  normalizeSchedulePriority,
  parseDateInputValue,
  startOfLocalDay,
  type SchedulePriority,
} from './calendarModel';
import {
  FLOATING_NOTE_DESTROY_BRIDGE_KEY,
  FLOATING_NOTE_SOURCE_BRIDGE_KEY,
  FLOATING_NOTE_TEXT_BRIDGE_KEY,
  FLOATING_NOTE_TITLE_BRIDGE_KEY,
  FOLDERS_CACHE_STORAGE_KEY,
  TEXT_FLOATING_NOTE_COLORS,
  TEXT_FLOATING_NOTE_SIZES,
  TEXT_FLOATING_NOTE_SIZE_ORDER,
  deleteFloatingNoteSnapshot,
  floatingNoteStorageKey,
  getFolderTagIds,
  getTextFloatingNoteColor,
  readCachedFolders,
  readFloatingNoteSnapshot,
  readFloatingNoteViewState,
  rememberOpenFloatingNoteLabel,
  resolveTextFloatingNoteSizeMode,
  writeFloatingNoteViewState,
  type TextFloatingNoteColorId,
  type TextFloatingNoteSizeMode,
} from './floatingNotes';

const appWindow = getCurrentWindow();
const TEXT_NOTE_STORAGE_DEBOUNCE_MS = 350;
const TEXT_NOTE_DRAWER_SYNC_DEBOUNCE_MS = 900;

type FloatingNoteHostProps = {
  getStoredDrawerSize: () => { width: number; height: number };
  getStoredTriggerMode: () => string;
};

export function FloatingNoteHost({ getStoredDrawerSize, getStoredTriggerMode }: FloatingNoteHostProps) {
  const noteLabel = ((appWindow as any).label || 'note_1') as string;
  const noteStorageKey = floatingNoteStorageKey(noteLabel);
  const initialNote = readFloatingNoteSnapshot(noteLabel);
  const [note, setNote] = useState<FloatingNoteSnapshot | null>(() => initialNote);
  const [text, setText] = useState(() => initialNote?.content || '');
  const [topmost, setTopmost] = useState(() => !!initialNote?.topmost);
  const [zoom, setZoom] = useState(() => {
    const view = readFloatingNoteViewState(initialNote?.itemId);
    return clamp(Number((initialNote as any)?.zoom ?? view.zoom ?? 1), 0.45, 3);
  });
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [showTextNoteColorPicker, setShowTextNoteColorPicker] = useState(false);
  const [isNoteHovered, setIsNoteHovered] = useState(false);
  const [isEditingNoteText, setIsEditingNoteText] = useState(false);
  const [isEditingNoteTitle, setIsEditingNoteTitle] = useState(false);
  const [noteTitleDraft, setNoteTitleDraft] = useState(() => initialNote?.name || '');
  const [scheduleDraft, setScheduleDraft] = useState('');
  const [scheduleDateDraft, setScheduleDateDraft] = useState(getTodayInputValue);
  const [schedulePriorityDraft, setSchedulePriorityDraft] = useState<SchedulePriority>('B');
  const [scheduleTagDraft, setScheduleTagDraft] = useState(() => getFolderTagIds(initialNote?.folderId, initialNote?.tagIds)[0] || '');
  const [isScheduleComposerActive, setIsScheduleComposerActive] = useState(false);
  const [scheduleDatePicker, setScheduleDatePicker] = useState<{
    target: 'new' | string;
    month: number;
    selected?: number;
    x: number;
    y: number;
  } | null>(null);
  const [cachedFolders, setCachedFolders] = useState<Folder[]>(() => readCachedFolders());
  const [textNoteSizeMode, setTextNoteSizeMode] = useState<TextFloatingNoteSizeMode>(() => {
    const view = readFloatingNoteViewState(initialNote?.itemId);
    return resolveTextFloatingNoteSizeMode((initialNote as any)?.width ?? view.width, (initialNote as any)?.height ?? view.height);
  });
  const noteTextAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const noteTitleInputRef = useRef<HTMLInputElement | null>(null);
  const noteRef = useRef<FloatingNoteSnapshot | null>(note);
  const noteTitleDraftRef = useRef(noteTitleDraft);
  const isNoteHoveredRef = useRef(false);
  const isEditingNoteTextRef = useRef(false);
  const noteResizeAnimationRef = useRef<number | null>(null);
  const noteResizeAnimationTokenRef = useRef(0);
  const noteResizeTargetModeRef = useRef<TextFloatingNoteSizeMode | null>(null);
  const textNoteSizeModeRef = useRef<TextFloatingNoteSizeMode>(textNoteSizeMode);
  const hoverResizeTimerRef = useRef<number | null>(null);
  const imageWheelSizeRef = useRef<{ width: number; height: number } | null>(null);
  const imageWheelResizeFrameRef = useRef<number | null>(null);
  const hoverExpandedFromModeRef = useRef<TextFloatingNoteSizeMode | null>(null);
  const notePointerOperationRef = useRef(false);
  const noteProgrammaticResizeUntilRef = useRef(0);
  const noteWindowResizeTimerRef = useRef<number | null>(null);
  const noteTextPersistTimerRef = useRef<number | null>(null);
  const noteTextDrawerSyncTimerRef = useRef<number | null>(null);
  const lastWindowResizeSizeRef = useRef<any>(null);
  const isDark = localStorage.getItem('theme') === 'dark';

  useEffect(() => {
    noteRef.current = note;
  }, [note]);

  useEffect(() => {
    noteTitleDraftRef.current = noteTitleDraft;
  }, [noteTitleDraft]);

  useEffect(() => {
    isEditingNoteTextRef.current = isEditingNoteText;
  }, [isEditingNoteText]);

  useEffect(() => () => {
    if (noteTextPersistTimerRef.current !== null) {
      window.clearTimeout(noteTextPersistTimerRef.current);
      noteTextPersistTimerRef.current = null;
    }
    if (noteTextDrawerSyncTimerRef.current !== null) {
      window.clearTimeout(noteTextDrawerSyncTimerRef.current);
      noteTextDrawerSyncTimerRef.current = null;
    }
    const current = noteRef.current;
    if (current?.type === 'text') {
      localStorage.setItem(noteStorageKey, JSON.stringify(current));
      syncTextToDrawer(current, current.content || '');
    }
  }, []);

  useEffect(() => {
    textNoteSizeModeRef.current = textNoteSizeMode;
  }, [textNoteSizeMode]);

  useEffect(() => () => {
    cancelNoteResizeAnimation();
    if (hoverResizeTimerRef.current !== null) {
      window.clearTimeout(hoverResizeTimerRef.current);
      hoverResizeTimerRef.current = null;
    }
    if (imageWheelResizeFrameRef.current !== null) {
      cancelAnimationFrame(imageWheelResizeFrameRef.current);
      imageWheelResizeFrameRef.current = null;
    }
    if (noteWindowResizeTimerRef.current !== null) {
      window.clearTimeout(noteWindowResizeTimerRef.current);
      noteWindowResizeTimerRef.current = null;
    }
    hoverExpandedFromModeRef.current = null;
  }, []);

  useEffect(() => {
    setText(note?.content || '');
    const view = readFloatingNoteViewState(note?.itemId);
    setZoom(clamp(Number((note as any)?.zoom ?? view.zoom ?? 1), 0.45, 3));
    setTextNoteSizeMode(resolveTextFloatingNoteSizeMode((note as any)?.width ?? view.width, (note as any)?.height ?? view.height));
    isEditingNoteTextRef.current = false;
    setIsEditingNoteText(false);
    setIsEditingNoteTitle(false);
    setShowTextNoteColorPicker(false);
    setNoteTitleDraft(note?.name || '');
    setTopmost(!!note?.topmost);
    setScheduleTagDraft(getFolderTagIds(note?.folderId, note?.tagIds)[0] || '');
    setScheduleDatePicker(null);
    setIsScheduleComposerActive(false);
    imageWheelSizeRef.current = null;
    hoverExpandedFromModeRef.current = null;
    // 只在切换便签时退出编辑模式。
    // 之前依赖 note?.content，文字便签每输入一个字都会更新 note.content，
    // 触发这里 setIsEditingNoteText(false)，所以会自动失焦退出输入。
  }, [note?.id]);

  useEffect(() => {
    const syncFolders = () => setCachedFolders(readCachedFolders());
    const onStorage = (event: StorageEvent) => {
      if (event.key === FOLDERS_CACHE_STORAGE_KEY) syncFolders();
    };
    window.addEventListener('storage', onStorage);
    syncFolders();
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      const next = readFloatingNoteSnapshot(noteLabel);
      setNote(next);
      setNoteTitleDraft(next?.name || '');
    };

    const onStorage = (event: StorageEvent) => {
      if (event.key === noteStorageKey) {
        syncFromStorage();
        return;
      }

      if (event.key === FLOATING_NOTE_SOURCE_BRIDGE_KEY && event.newValue) {
        try {
          const payload = JSON.parse(event.newValue);
          const current = noteRef.current;
          if (!current || current.type !== 'text' || current.itemId !== payload.itemId) return;

          const hasContent = typeof payload.content === 'string';
          const nextContent = hasContent ? payload.content : current.content;
          const nextName = typeof payload.name === 'string' ? payload.name : current.name;
          const nextScheduleItems = Array.isArray(payload.scheduleItems)
            ? payload.scheduleItems
            : (hasContent && current.noteMode === 'schedule'
              ? buildScheduleItemsFromText(nextContent || '', current.scheduleItems || [], {
                tagIds: getFolderTagIds(current.folderId, current.tagIds),
                sourceItemId: current.itemId,
                defaultPriority: 'B',
              })
              : current.scheduleItems);
          const next = {
            ...current,
            content: nextContent,
            name: nextName,
            scheduleItems: nextScheduleItems,
            updatedAt: Date.now(),
          };

          noteRef.current = next;
          setNote(next);
          if (hasContent) setText(nextContent || '');
          setNoteTitleDraft(nextName || '');
          localStorage.setItem(noteStorageKey, JSON.stringify(next));
        } catch (_) {}
      }
    };

    let unlistenNote: (() => void) | undefined;
    let unlistenSourceText: (() => void) | undefined;

    listen('floating-note-updated', (event: any) => {
      const payload = event.payload as FloatingNoteSnapshot;
      if ((payload as any)?.targetLabel && (payload as any).targetLabel !== noteLabel) return;
      if (payload && payload.itemId) {
        const isSameSource = noteRef.current?.itemId === payload.itemId;
        setNote(payload);
        setText(payload.content || '');
        setNoteTitleDraft(payload.name || '');
        if (!isSameSource) setZoom(1);
        localStorage.setItem(noteStorageKey, JSON.stringify(payload));
        rememberOpenFloatingNoteLabel(noteLabel);
      } else {
        syncFromStorage();
      }
    }).then((fn) => { unlistenNote = fn; }).catch(() => {});

    listen('floating-note-source-updated', (event: any) => {
      const payload = event.payload || {};
      if (payload?.targetLabel && payload.targetLabel !== noteLabel) return;
      const current = noteRef.current;
      if (!current || current.type !== 'text' || current.itemId !== payload.itemId) return;

      const hasContent = typeof payload.content === 'string';
      const nextContent = hasContent ? payload.content : current.content;
      const nextName = typeof payload.name === 'string' ? payload.name : current.name;
      const nextScheduleItems = Array.isArray(payload.scheduleItems)
        ? payload.scheduleItems
        : (hasContent && current.noteMode === 'schedule'
          ? buildScheduleItemsFromText(nextContent || '', current.scheduleItems || [], {
            tagIds: getFolderTagIds(current.folderId, current.tagIds),
            sourceItemId: current.itemId,
            defaultPriority: 'B',
          })
          : current.scheduleItems);
      const next = {
        ...current,
        content: nextContent,
        name: nextName,
        scheduleItems: nextScheduleItems,
        updatedAt: Date.now(),
      };

      noteRef.current = next;
      setNote(next);
      if (hasContent) setText(nextContent || '');
      setNoteTitleDraft(nextName || '');
      localStorage.setItem(noteStorageKey, JSON.stringify(next));
    }).then((fn) => { unlistenSourceText = fn; }).catch(() => {});

    window.addEventListener('storage', onStorage);
    syncFromStorage();

    return () => {
      window.removeEventListener('storage', onStorage);
      if (unlistenNote) unlistenNote();
      if (unlistenSourceText) unlistenSourceText();
    };
  }, [noteLabel, noteStorageKey]);

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener('blur', closeContextMenu);
    return () => window.removeEventListener('blur', closeContextMenu);
  }, []);

  const hideNote = async () => {
    setContextMenu(null);
    // 这里只关闭/隐藏当前便签窗口，不删除便签记录。
    // 之后仍可在抽屉侧栏的“便签”列表里重新显示。
    try {
      await invoke('hide_note_window', { label: noteLabel });
    } catch (err) {
      console.warn('hide_note_window failed, fallback to frontend hide:', err);
      await appWindow.hide().catch(() => {});
    }
  };

  const toggleTopmost = async () => {
    const next = !topmost;
    setTopmost(next);
    persistFloatingNotePatch({ topmost: next });
    await invoke('set_topmost', { topmost: next }).catch(() => {});
  };

  const openDrawerFromNote = async () => {
    setContextMenu(null);
    if (localStorage.getItem('drawer_anti_touch_mode') === 'true') return;
    const { width, height } = getStoredDrawerSize();
    await invoke('open_drawer', { width, height, mode: getStoredTriggerMode() }).catch(() => {});
  };

  const openSource = async () => {
    const target = note?.path || note?.url || '';
    if (!target) return;
    await invoke('open_file', { path: target }).catch(() => {});
  };

  const destroyCurrentSnipNote = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const current = noteRef.current;
    if (!current || current.type !== 'image' || !current.itemId.startsWith('snip_')) return;

    const payload = {
      itemId: current.itemId,
      label: noteLabel,
      updatedAt: Date.now(),
    };
    localStorage.setItem(FLOATING_NOTE_DESTROY_BRIDGE_KEY, JSON.stringify(payload));
    emitTo('main', 'floating-note-destroyed', payload).catch(() => {});
    deleteFloatingNoteSnapshot(noteLabel);
    await invoke('hide_note_window', { label: noteLabel }).catch(() => appWindow.hide().catch(() => {}));
  };

  const persistFloatingNoteView = (patch: { zoom?: number; width?: number; height?: number; mediumWidth?: number }) => {
    const current = noteRef.current;
    if (!current) return;

    const nextView = writeFloatingNoteViewState(current.itemId, patch);
    const next = {
      ...current,
      ...nextView,
      updatedAt: Date.now(),
    } as FloatingNoteSnapshot;

    noteRef.current = next;
    setNote(next);
    localStorage.setItem(noteStorageKey, JSON.stringify(next));
  };

  useEffect(() => {
    let unlistenResize: (() => void) | undefined;

    const persistWindowSize = async () => {
      noteWindowResizeTimerRef.current = null;
      if (Date.now() < noteProgrammaticResizeUntilRef.current || notePointerOperationRef.current) return;

      const current = noteRef.current;
      const physicalSize = lastWindowResizeSizeRef.current;
      if (!current || !physicalSize) return;

      const factor = await appWindow.scaleFactor().catch(() => window.devicePixelRatio || 1);
      const logicalSize = typeof physicalSize.toLogical === 'function'
        ? physicalSize.toLogical(factor)
        : {
          width: Number(physicalSize.width) / factor,
          height: Number(physicalSize.height) / factor,
        };
      const width = Math.max(48, Math.round(Number(logicalSize.width)));
      const height = Math.max(48, Math.round(Number(logicalSize.height)));
      if (!Number.isFinite(width) || !Number.isFinite(height)) return;

      if (current.type === 'text') {
        const nextMode = resolveTextFloatingNoteSizeMode(width, height);
        setTextNoteSizeMode(nextMode);
        textNoteSizeModeRef.current = nextMode;
        persistFloatingNoteView({
          width,
          height,
          ...(nextMode === 'medium' ? { mediumWidth: width } : {}),
        });
        return;
      }

      persistFloatingNoteView({ width, height });
    };

    appWindow.onResized(({ payload }) => {
      if (Date.now() < noteProgrammaticResizeUntilRef.current || notePointerOperationRef.current) return;
      lastWindowResizeSizeRef.current = payload;
      if (noteWindowResizeTimerRef.current !== null) {
        window.clearTimeout(noteWindowResizeTimerRef.current);
      }
      noteWindowResizeTimerRef.current = window.setTimeout(persistWindowSize, 180);
    }).then((fn) => { unlistenResize = fn; }).catch(() => {});

    return () => {
      if (unlistenResize) unlistenResize();
      if (noteWindowResizeTimerRef.current !== null) {
        window.clearTimeout(noteWindowResizeTimerRef.current);
        noteWindowResizeTimerRef.current = null;
      }
    };
  }, []);

  const persistFloatingNotePatch = (patch: Partial<FloatingNoteSnapshot>) => {
    const current = noteRef.current;
    if (!current) return null;

    const merged = {
      ...current,
      ...patch,
      updatedAt: Date.now(),
    } as FloatingNoteSnapshot;
    const shouldSyncScheduleContent = (
      merged.type === 'text' &&
      merged.noteMode === 'schedule' &&
      Object.prototype.hasOwnProperty.call(patch, 'scheduleItems') &&
      Array.isArray(merged.scheduleItems)
    );
    const nextContent = shouldSyncScheduleContent ? getScheduleTextContent(merged.scheduleItems) : merged.content;
    const next = {
      ...merged,
      content: nextContent,
    } as FloatingNoteSnapshot;

    noteRef.current = next;
    setNote(next);
    if (shouldSyncScheduleContent) setText(nextContent || '');
    localStorage.setItem(noteStorageKey, JSON.stringify(next));
    if (shouldSyncScheduleContent && typeof nextContent === 'string') {
      syncTextToDrawer(next, nextContent);
    }
    return next;
  };

  const cancelNoteResizeAnimation = () => {
    noteResizeAnimationTokenRef.current += 1;
    noteResizeTargetModeRef.current = null;
    if (noteResizeAnimationRef.current !== null) {
      cancelAnimationFrame(noteResizeAnimationRef.current);
      noteResizeAnimationRef.current = null;
    }
    invoke('cancel_current_window_resize_animation').catch(() => {});
  };

  const getTextNoteTargetSize = (mode: TextFloatingNoteSizeMode) => {
    const preset = TEXT_FLOATING_NOTE_SIZES[mode];
    if (mode !== 'medium') return preset;

    const current = noteRef.current;
    const storedMediumWidth = Number((current as any)?.mediumWidth);
    const currentWidth = Number((current as any)?.width);
    const liveWidth = Number(window.innerWidth);
    const width = Number.isFinite(storedMediumWidth)
      ? storedMediumWidth
      : (textNoteSizeModeRef.current === 'medium' && Number.isFinite(currentWidth)
        ? currentWidth
        : (Number.isFinite(liveWidth) ? liveWidth : preset.width));

    return {
      ...preset,
      width: Math.max(48, Math.round(width)),
    };
  };

  const animateTextNoteSize = (
    mode: TextFloatingNoteSizeMode,
    options: { persist?: boolean; durationMs?: number; force?: boolean } = {},
  ) => {
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;
    const shouldPersist = options.persist !== false;
    if (!options.force && noteResizeTargetModeRef.current === mode && textNoteSizeModeRef.current === mode) return;

    cancelNoteResizeAnimation();
    setShowTextNoteColorPicker(false);
    noteResizeTargetModeRef.current = mode;
    setContextMenu(null);
    setTextNoteSizeMode(mode);
    textNoteSizeModeRef.current = mode;

    const target = getTextNoteTargetSize(mode);
    const durationMs = options.durationMs ?? 110;
    noteProgrammaticResizeUntilRef.current = Date.now() + durationMs + 220;
    if (shouldPersist) {
      persistFloatingNoteView({
        width: target.width,
        height: target.height,
        ...(mode === 'medium' ? { mediumWidth: target.width } : {}),
      });
    }
    invoke('animate_current_window_resize', {
      width: target.width,
      height: target.height,
      durationMs,
    }).then(() => {
      if (noteResizeTargetModeRef.current === mode) noteResizeTargetModeRef.current = null;
    }).catch((err) => {
      if (noteResizeTargetModeRef.current === mode) noteResizeTargetModeRef.current = null;
      console.warn('文字便签尺寸动画失败:', err);
      invoke('resize_current_window', { width: target.width, height: target.height }).catch(() => {});
    });
  };

  const cycleTextNoteSize = () => {
    setShowTextNoteColorPicker(false);
    if (hoverResizeTimerRef.current !== null) {
      window.clearTimeout(hoverResizeTimerRef.current);
      hoverResizeTimerRef.current = null;
    }
    const baseMode = hoverExpandedFromModeRef.current || textNoteSizeModeRef.current;
    hoverExpandedFromModeRef.current = null;
    const currentIndex = TEXT_FLOATING_NOTE_SIZE_ORDER.indexOf(baseMode);
    const nextMode = TEXT_FLOATING_NOTE_SIZE_ORDER[(currentIndex + 1) % TEXT_FLOATING_NOTE_SIZE_ORDER.length];
    animateTextNoteSize(nextMode, { durationMs: 150, force: !!baseMode && baseMode !== textNoteSizeModeRef.current });
  };

  const changeTextNoteColor = (colorId: TextFloatingNoteColorId) => {
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;
    persistFloatingNotePatch({ noteColor: colorId });
    setShowTextNoteColorPicker(false);
  };

  const syncTextToDrawer = (current: FloatingNoteSnapshot, nextContent: string) => {
    if (current.type !== 'text') return;
    const scheduleItems = current.noteMode === 'schedule' && Array.isArray(current.scheduleItems)
      ? current.scheduleItems
      : undefined;
    const payload = {
      itemId: current.itemId,
      content: nextContent,
      noteMode: current.noteMode || 'text',
      ...(scheduleItems ? { scheduleItems } : {}),
      sourceLabel: noteLabel,
      updatedAt: Date.now(),
    };

    // 双通道同步：Tauri 事件 + localStorage storage 事件。
    // 有些隐藏/透明窗口下 emitTo 可能被时序影响，localStorage 兜底更稳。
    localStorage.setItem(FLOATING_NOTE_TEXT_BRIDGE_KEY, JSON.stringify(payload));
    emitTo('main', 'floating-note-text-updated', payload).catch(() => {});
  };

  const syncTitleToDrawer = (current: FloatingNoteSnapshot, nextTitle: string) => {
    if (current.type !== 'text') return;
    const payload = {
      itemId: current.itemId,
      name: nextTitle,
      sourceLabel: noteLabel,
      updatedAt: Date.now(),
    };

    localStorage.setItem(FLOATING_NOTE_TITLE_BRIDGE_KEY, JSON.stringify(payload));
    emitTo('main', 'floating-note-title-updated', payload).catch(() => {});
  };

  const persistTextSnapshotNow = (current = noteRef.current) => {
    if (!current || current.type !== 'text') return;
    if (noteTextPersistTimerRef.current !== null) {
      window.clearTimeout(noteTextPersistTimerRef.current);
      noteTextPersistTimerRef.current = null;
    }
    localStorage.setItem(noteStorageKey, JSON.stringify(current));
  };

  const syncTextToDrawerNow = (current = noteRef.current) => {
    if (!current || current.type !== 'text') return;
    if (noteTextDrawerSyncTimerRef.current !== null) {
      window.clearTimeout(noteTextDrawerSyncTimerRef.current);
      noteTextDrawerSyncTimerRef.current = null;
    }
    syncTextToDrawer(current, current.content || '');
  };

  const persistAndSyncTextNow = (current = noteRef.current) => {
    persistTextSnapshotNow(current);
    syncTextToDrawerNow(current);
  };

  const schedulePersistAndSyncText = () => {
    if (noteTextPersistTimerRef.current !== null) {
      window.clearTimeout(noteTextPersistTimerRef.current);
    }
    noteTextPersistTimerRef.current = window.setTimeout(() => {
      noteTextPersistTimerRef.current = null;
      persistTextSnapshotNow();
    }, TEXT_NOTE_STORAGE_DEBOUNCE_MS);

    if (noteTextDrawerSyncTimerRef.current !== null) {
      window.clearTimeout(noteTextDrawerSyncTimerRef.current);
    }
    noteTextDrawerSyncTimerRef.current = window.setTimeout(() => {
      noteTextDrawerSyncTimerRef.current = null;
      syncTextToDrawerNow();
    }, TEXT_NOTE_DRAWER_SYNC_DEBOUNCE_MS);
  };

  const updateTextLive = (nextContent: string) => {
    const current = noteRef.current;
    if (!current) return;

    const next = {
      ...current,
      content: nextContent,
      scheduleItems: current.noteMode === 'schedule'
        ? buildScheduleItemsFromText(nextContent, current.scheduleItems || [], {
          tagIds: getFolderTagIds(current.folderId, current.tagIds),
          sourceItemId: current.itemId,
          defaultPriority: 'B',
        })
        : current.scheduleItems,
      updatedAt: Date.now(),
    } as FloatingNoteSnapshot;
    noteRef.current = next;
    schedulePersistAndSyncText();
  };

  const saveText = () => {
    const current = noteRef.current;
    if (!current) return;
    const latestText = noteTextAreaRef.current?.value ?? text;
    const next = current.content === latestText ? current : {
      ...current,
      content: latestText,
      scheduleItems: current.noteMode === 'schedule'
        ? buildScheduleItemsFromText(latestText, current.scheduleItems || [], {
          tagIds: getFolderTagIds(current.folderId, current.tagIds),
          sourceItemId: current.itemId,
          defaultPriority: 'B',
        })
        : current.scheduleItems,
      updatedAt: Date.now(),
    } as FloatingNoteSnapshot;
    noteRef.current = next;
    setText(latestText);
    setNote(next);
    persistAndSyncTextNow(next);
  };

  const saveTitle = () => {
    const current = noteRef.current;
    if (!current) return;
    const fallback = current.name || current.content || '文字便签';
    const nextTitle = noteTitleDraftRef.current.trim() || fallback;
    const next = { ...current, name: nextTitle, updatedAt: Date.now() };
    noteRef.current = next;
    setNote(next);
    setNoteTitleDraft(nextTitle);
    localStorage.setItem(noteStorageKey, JSON.stringify(next));
    syncTitleToDrawer(next, nextTitle);
    setIsEditingNoteTitle(false);
  };

  const getDefaultScheduleTagIds = (current: FloatingNoteSnapshot) => (
    scheduleTagDraft ? [scheduleTagDraft] : getFolderTagIds(current.folderId, current.tagIds)
  );

  const updateScheduleItem = (id: string, patch: Partial<FloatingNoteScheduleItem>) => {
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;

    persistFloatingNotePatch({
      noteMode: 'schedule',
      scheduleItems: (current.scheduleItems || []).map(item => (
        item.id === id ? { ...item, ...patch, updatedAt: Date.now() } : item
      )),
    });
  };

  const openScheduleDatePicker = (
    target: 'new' | string,
    value: number | undefined,
    event?: React.MouseEvent,
  ) => {
    event?.preventDefault();
    event?.stopPropagation();

    const rect = (event?.currentTarget as HTMLElement | null)?.getBoundingClientRect();
    const popupWidth = 244;
    const popupHeight = 288;
    const fallbackX = Math.max(8, (window.innerWidth - popupWidth) / 2);
    const fallbackY = Math.max(8, (window.innerHeight - popupHeight) / 2);
    const selected = Number.isFinite(Number(value)) ? startOfLocalDay(Number(value)) : undefined;
    const month = selected || startOfLocalDay(Date.now());
    const rawX = rect ? rect.left : fallbackX;
    const belowY = rect ? rect.bottom + 8 : fallbackY;
    const aboveY = rect ? rect.top - popupHeight - 8 : fallbackY;
    const x = clamp(rawX, 8, Math.max(8, window.innerWidth - popupWidth - 8));
    const y = belowY + popupHeight <= window.innerHeight - 8
      ? belowY
      : clamp(aboveY, 8, Math.max(8, window.innerHeight - popupHeight - 8));

    setScheduleDatePicker(prev => (
      prev?.target === target ? null : { target, month, selected, x, y }
    ));
  };

  const moveScheduleDatePickerMonth = (delta: number) => {
    setScheduleDatePicker(prev => {
      if (!prev) return prev;
      const date = new Date(prev.month);
      return {
        ...prev,
        month: new Date(date.getFullYear(), date.getMonth() + delta, 1).getTime(),
      };
    });
  };

  const chooseScheduleDate = (day?: number) => {
    if (!scheduleDatePicker) return;

    if (scheduleDatePicker.target === 'new') {
      setScheduleDateDraft(formatDateInputValue(day || Date.now()));
    } else {
      updateScheduleItem(scheduleDatePicker.target, { startAt: day, allDay: true });
    }
    setScheduleDatePicker(null);
  };

  const toggleScheduleMode = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;

    const nextMode = current.noteMode === 'schedule' ? 'text' : 'schedule';
    const existingItems = Array.isArray(current.scheduleItems) ? current.scheduleItems : [];
    const latestContent = isEditingNoteTextRef.current
      ? (noteTextAreaRef.current?.value ?? text)
      : (current.content || text || '');
    const defaultTagIds = getDefaultScheduleTagIds(current);
    const itemsFromText = buildScheduleItemsFromText(latestContent, existingItems, {
      tagIds: defaultTagIds,
      sourceItemId: current.itemId,
      defaultPriority: 'B',
    });

    const next = persistFloatingNotePatch({
      content: latestContent,
      noteMode: nextMode,
      scheduleItems: nextMode === 'schedule' ? itemsFromText : existingItems,
    });
    if (nextMode === 'text') {
      const nextContent = next?.content || current.content || '';
      setText(nextContent);
      syncTextToDrawer(next || { ...current, noteMode: 'text' }, nextContent);
    }
    isEditingNoteTextRef.current = false;
    setIsEditingNoteText(false);
    setIsEditingNoteTitle(false);
  };

  const addScheduleItem = () => {
    const current = noteRef.current;
    const text = scheduleDraft.trim();
    if (!current || current.type !== 'text' || !text) return;

    const nextItem: FloatingNoteScheduleItem = {
      id: `schedule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text,
      done: false,
      priority: schedulePriorityDraft,
      startAt: parseDateInputValue(scheduleDateDraft) ?? startOfLocalDay(Date.now()),
      allDay: true,
      tagIds: getDefaultScheduleTagIds(current),
      sourceItemId: current.itemId,
      createdAt: Date.now(),
    };
    persistFloatingNotePatch({
      noteMode: 'schedule',
      scheduleItems: [...(current.scheduleItems || []), nextItem],
    });
    setScheduleDraft('');
    setIsScheduleComposerActive(false);
  };

  const toggleScheduleItem = (id: string) => {
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;

    persistFloatingNotePatch({
      scheduleItems: (current.scheduleItems || []).map(item => (
        item.id === id ? { ...item, done: !item.done, updatedAt: Date.now() } : item
      )),
    });
  };

  const removeScheduleItem = (id: string) => {
    const current = noteRef.current;
    if (!current || current.type !== 'text') return;

    persistFloatingNotePatch({
      scheduleItems: (current.scheduleItems || []).filter(item => item.id !== id),
    });
  };

  const startTitleEdit = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const current = noteRef.current;
    setContextMenu(null);
    hoverExpandedFromModeRef.current = null;
    isEditingNoteTextRef.current = false;
    setIsEditingNoteText(false);
    setNoteTitleDraft(current?.name || current?.content || '');
    setIsEditingNoteTitle(true);
  };

  useEffect(() => {
    if (!isEditingNoteText) return;
    window.setTimeout(() => {
      noteTextAreaRef.current?.focus();
      const length = noteTextAreaRef.current?.value.length ?? text.length;
      noteTextAreaRef.current?.setSelectionRange(length, length);
    }, 0);
  }, [isEditingNoteText]);

  useEffect(() => {
    if (!isEditingNoteTitle) return;
    window.setTimeout(() => {
      noteTitleInputRef.current?.focus();
      noteTitleInputRef.current?.select();
    }, 0);
  }, [isEditingNoteTitle]);

  useEffect(() => {
    if (!isEditingNoteTitle) return;

    const handlePointerDownOutside = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (target && noteTitleInputRef.current?.contains(target)) return;
      saveTitle();
    };

    window.addEventListener('pointerdown', handlePointerDownOutside, true);
    document.addEventListener('pointerdown', handlePointerDownOutside, true);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDownOutside, true);
      document.removeEventListener('pointerdown', handlePointerDownOutside, true);
    };
  }, [isEditingNoteTitle]);

  useEffect(() => {
    if (!showTextNoteColorPicker) return;

    const closeOnOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-note-color-transient="true"]')) return;
      setShowTextNoteColorPicker(false);
    };

    window.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    document.addEventListener('pointerdown', closeOnOutsidePointerDown, true);
    return () => {
      window.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
      document.removeEventListener('pointerdown', closeOnOutsidePointerDown, true);
    };
  }, [showTextNoteColorPicker]);

  const startTextEdit = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setContextMenu(null);
    isEditingNoteTextRef.current = true;
    setIsEditingNoteText(true);
  };

  const handleTextDisplayMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    startTextEdit(e);
  };

  const handleTextNoteTitleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.detail >= 2) return;
    startManualMove(e);
  };

  const expandMediumTextNote = (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (noteRef.current?.type !== 'text' || textNoteSizeModeRef.current !== 'medium') return;
    setContextMenu(null);
    hoverExpandedFromModeRef.current = 'medium';
    animateTextNoteSize('large', { persist: false, durationMs: 160 });
  };

  const handleTextNoteTitleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    cycleTextNoteSize();
  };

  const finishTextEdit = () => {
    saveText();
    isEditingNoteTextRef.current = false;
    setIsEditingNoteText(false);
    const previousMode = hoverExpandedFromModeRef.current;
    if (previousMode && !isNoteHoveredRef.current) {
      hoverExpandedFromModeRef.current = null;
      animateTextNoteSize(previousMode, { persist: false, durationMs: 145 });
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const menuWidth = 148;
    const menuHeight = 92;
    setContextMenu({
      x: Math.min(e.clientX, Math.max(8, window.innerWidth - menuWidth - 8)),
      y: Math.min(e.clientY, Math.max(8, window.innerHeight - menuHeight - 8)),
    });
  };

  const handleWheelZoom = (e: React.WheelEvent) => {
    if (!note) return;
    if (note.type !== 'image' && !e.altKey) return;

    e.preventDefault();
    e.stopPropagation();

    if (note.type === 'image') {
      const current = imageWheelSizeRef.current || {
        width: Number(note.width) || window.innerWidth || 360,
        height: Number(note.height) || window.innerHeight || 320,
      };
      const scale = e.deltaY < 0 ? 1.08 : 0.92;
      const aspect = current.width / Math.max(1, current.height);
      let nextWidth = current.width * scale;
      let nextHeight = current.height * scale;

      if (nextWidth < 80) {
        nextWidth = 80;
        nextHeight = nextWidth / aspect;
      }
      if (nextHeight < 80) {
        nextHeight = 80;
        nextWidth = nextHeight * aspect;
      }

      const nextSize = {
        width: Math.round(nextWidth),
        height: Math.round(nextHeight),
      };
      imageWheelSizeRef.current = nextSize;
      setZoom(1);
      persistFloatingNoteView({ zoom: 1, width: nextSize.width, height: nextSize.height });

      if (imageWheelResizeFrameRef.current === null) {
        imageWheelResizeFrameRef.current = requestAnimationFrame(() => {
          imageWheelResizeFrameRef.current = null;
          const latest = imageWheelSizeRef.current || nextSize;
          invoke('resize_current_window', latest).catch(() => {});
        });
      }
      return;
    }

    const delta = e.deltaY < 0 ? 0.08 : -0.08;

    setZoom(prev => {
      const nextZoom = clamp(Number((prev + delta).toFixed(2)), 0.45, 3);
      persistFloatingNoteView({ zoom: nextZoom });
      return nextZoom;
    });
  };

  const startManualMove = (e: React.PointerEvent | React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setContextMenu(null);

    let disposed = false;
    let lastX = e.screenX;
    let lastY = e.screenY;
    let pendingDx = 0;
    let pendingDy = 0;
    let raf: number | null = null;
    const usePointerEvents = (e as any).pointerId !== undefined;
    const moveEventName = usePointerEvents ? 'pointermove' : 'mousemove';
    const upEventName = usePointerEvents ? 'pointerup' : 'mouseup';
    notePointerOperationRef.current = true;

    try {
      const target = e.currentTarget as HTMLElement | null;
      const pointerId = (e as any).pointerId;
      if (target && pointerId !== undefined && 'setPointerCapture' in target) {
        target.setPointerCapture(pointerId);
      }
    } catch (_) {}

    const applyMove = () => {
      raf = null;
      if (disposed) return;

      const dx = pendingDx;
      const dy = pendingDy;
      pendingDx = 0;
      pendingDy = 0;

      if (dx || dy) {
        invoke('move_current_window_by', { dx, dy }).catch((err) => {
          console.warn('移动便签失败:', err);
        });
      }
    };

    const requestMove = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(applyMove);
    };

    const cleanup = () => {
      window.removeEventListener(moveEventName, handleMove, true);
      window.removeEventListener(upEventName, handleUp, true);
      if (usePointerEvents) window.removeEventListener('pointercancel', handleUp, true);
    };

    const finish = () => {
      if (disposed) return;
      disposed = true;
      notePointerOperationRef.current = false;
      cleanup();
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      if (pendingDx || pendingDy) applyMove();
    };

    const handleMove: EventListener = (event) => {
      if (disposed) return;
      const me = event as PointerEvent | MouseEvent;
      if ('buttons' in me && (me.buttons & 1) !== 1) {
        finish();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const dx = me.screenX - lastX;
      const dy = me.screenY - lastY;
      lastX = me.screenX;
      lastY = me.screenY;

      if (dx || dy) {
        pendingDx += dx;
        pendingDy += dy;
        requestMove();
      }
    };

    const handleUp: EventListener = (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish();
    };

    window.addEventListener(moveEventName, handleMove, true);
    window.addEventListener(upEventName, handleUp, true);
    if (usePointerEvents) window.addEventListener('pointercancel', handleUp, true);
  };

  const startNoteDrag = (e: React.PointerEvent | React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-no-drag="true"], textarea, button, input, select, [data-text-note-display="true"]')) return;
    startManualMove(e);
  };

  const startNoteResize = (e: React.PointerEvent | React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    hoverExpandedFromModeRef.current = null;
    setContextMenu(null);
    cancelNoteResizeAnimation();

    const startX = e.screenX;
    const startY = e.screenY;
    const isResizingMediumTextNote = noteRef.current?.type === 'text' && textNoteSizeModeRef.current === 'medium';
    const startW = Math.max(isResizingMediumTextNote ? 48 : 220, window.innerWidth);
    const startH = isResizingMediumTextNote
      ? TEXT_FLOATING_NOTE_SIZES.medium.height
      : Math.max(160, window.innerHeight);

    let disposed = false;
    let latestW = startW;
    let latestH = startH;
    let raf: number | null = null;
    const usePointerEvents = (e as any).pointerId !== undefined;
    const moveEventName = usePointerEvents ? 'pointermove' : 'mousemove';
    const upEventName = usePointerEvents ? 'pointerup' : 'mouseup';
    notePointerOperationRef.current = true;

    try {
      const target = e.currentTarget as HTMLElement | null;
      const pointerId = (e as any).pointerId;
      if (target && pointerId !== undefined && 'setPointerCapture' in target) {
        target.setPointerCapture(pointerId);
      }
    } catch (_) {}

    const applySize = () => {
      raf = null;
      if (disposed) return;
      void invoke('resize_current_window', { width: latestW, height: latestH }).catch((err) => {
        console.warn('缩放便签失败:', err);
      });
    };

    const requestSize = () => {
      if (raf !== null) return;
      raf = requestAnimationFrame(applySize);
    };

    const cleanup = () => {
      window.removeEventListener(moveEventName, handleMove, true);
      window.removeEventListener(upEventName, handleUp, true);
      if (usePointerEvents) window.removeEventListener('pointercancel', handleUp, true);
    };

    const finish = () => {
      if (disposed) return;
      disposed = true;
      notePointerOperationRef.current = false;
      cleanup();
      if (raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
      persistFloatingNoteView({
        width: latestW,
        height: latestH,
        ...(isResizingMediumTextNote ? { mediumWidth: latestW } : {}),
      });
      if (noteRef.current?.type === 'text') {
        setTextNoteSizeMode(resolveTextFloatingNoteSizeMode(latestW, latestH));
      }
      void invoke('resize_current_window', { width: latestW, height: latestH }).catch(() => {});
    };

    const handleMove: EventListener = (event) => {
      if (disposed) return;
      const me = event as PointerEvent | MouseEvent;
      if ('buttons' in me && (me.buttons & 1) !== 1) {
        finish();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      latestW = Math.max(48, startW + me.screenX - startX);
      latestH = isResizingMediumTextNote
        ? TEXT_FLOATING_NOTE_SIZES.medium.height
        : Math.max(48, startH + me.screenY - startY);
      requestSize();
    };

    const handleUp: EventListener = (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish();
    };

    window.addEventListener(moveEventName, handleMove, true);
    window.addEventListener(upEventName, handleUp, true);
    if (usePointerEvents) window.addEventListener('pointercancel', handleUp, true);
  };

  const imageSrc = note?.url || (note?.path ? convertFileSrc(note.path) : '');
  const displayName = note?.name || note?.content || '桌面便签';
  const zoomTitle = note?.type === 'image'
    ? '滚轮缩放便签'
    : `Alt + 滚轮缩放：${Math.round(zoom * 100)}%`;
  const isTextNoteMedium = note?.type === 'text' && textNoteSizeMode === 'medium';
  const textNoteTitle = note?.name || text || '文字便签';
  const isScheduleMode = note?.type === 'text' && note.noteMode === 'schedule';
  const scheduleItems = Array.isArray(note?.scheduleItems) ? note.scheduleItems : [];
  const textNoteColor = getTextFloatingNoteColor(note?.noteColor);
  const isCharcoalTextNote = note?.type === 'text' && textNoteColor.id === 'charcoal';
  const textNoteAccentColor = textNoteColor.icon;
  const textNoteTextColor = textNoteColor.text;
  const textNoteMutedTextColor = isCharcoalTextNote
    ? 'rgba(242, 239, 230, 0.64)'
    : 'rgba(82, 79, 72, 0.56)';
  const schedulePriorityOptions = SCHEDULE_PRIORITY_OPTIONS.map(priority => ({ value: priority, label: priority }));
  const scheduleTagOptions = [
    { value: '', label: '无标签' },
    ...cachedFolders.map(folder => ({
      value: folder.id,
      label: getDrawerFolderPathName(cachedFolders, folder.id),
    })),
  ];
  const shouldShowScheduleComposerOptions = isScheduleComposerActive || scheduleDraft.trim().length > 0;
  const scheduleTextClass = isCharcoalTextNote
    ? 'text-stone-100'
    : 'text-stone-700 dark:text-stone-100';
  const scheduleDoneTextClass = isCharcoalTextNote
    ? 'text-stone-300/62 line-through'
    : 'text-stone-400 line-through dark:text-stone-500';
  const scheduleInputClass = isCharcoalTextNote
    ? 'bg-white/13 text-stone-100 placeholder:text-stone-300/62 focus:bg-white/18'
    : 'bg-white/30 text-stone-700 placeholder:text-stone-400 focus:bg-white/46 dark:bg-stone-900/22 dark:text-stone-100 dark:placeholder:text-stone-500 dark:focus:bg-stone-900/38';
  const scheduleMutedPillClass = isCharcoalTextNote
    ? 'bg-white/14 text-stone-200/82 hover:bg-white/20 hover:text-stone-100'
    : 'bg-stone-100/70 text-stone-500 hover:bg-stone-200/70 dark:bg-stone-800/50 dark:text-stone-300 dark:hover:bg-stone-800';
  const scheduleWeakPillClass = isCharcoalTextNote
    ? 'bg-white/12 text-stone-300/72 hover:bg-white/18 hover:text-stone-100'
    : 'bg-stone-100/54 text-stone-400 hover:bg-white hover:text-stone-500 dark:bg-stone-800/36 dark:text-stone-400 dark:hover:bg-stone-800';
  const scheduleTagPillClass = isCharcoalTextNote
    ? 'bg-white/14 text-stone-100 hover:bg-white/20'
    : 'bg-stone-100/70 text-stone-500 dark:bg-stone-800/50 dark:text-stone-300';
  const scheduleDividerClass = isCharcoalTextNote
    ? 'divide-white/12'
    : 'divide-stone-300/34 dark:divide-stone-700/38';
  const scheduleRowHoverClass = isCharcoalTextNote
    ? ''
    : 'hover:bg-white/22 dark:hover:bg-stone-900/24';
  const scheduleCheckboxClass = isCharcoalTextNote
    ? 'border-stone-200/68 bg-white/18 text-transparent hover:border-stone-100'
    : 'border-stone-300 bg-white/70 text-transparent hover:border-stone-400 dark:border-stone-600 dark:bg-stone-900/70';
  const scheduleDeleteClass = isCharcoalTextNote
    ? 'text-stone-300/56 hover:bg-white/12 hover:text-stone-100'
    : 'text-stone-300 hover:bg-red-50 hover:text-red-500 dark:text-stone-600 dark:hover:bg-red-900/20 dark:hover:text-red-300';
  const noteToolIdleClass = isCharcoalTextNote
    ? 'border-transparent bg-transparent text-stone-200/72 shadow-none hover:border-white/14 hover:bg-white/16 hover:text-stone-50'
    : 'border-transparent bg-transparent text-stone-500/72 shadow-none hover:border-stone-200/70 hover:bg-white/70 hover:text-stone-900 dark:text-stone-300/72 dark:hover:border-stone-700/70 dark:hover:bg-stone-900/62 dark:hover:text-stone-100';
  const noteToolActiveClass = isCharcoalTextNote
    ? 'border-white/18 bg-white/20 text-white shadow-sm'
    : 'border-stone-900/10 bg-stone-900/86 text-white shadow-sm dark:border-white/10 dark:bg-stone-100/90 dark:text-stone-900';
  const noteToolButtonBaseClass = 'group rounded-full border p-1.5 backdrop-blur-xl transition-all duration-150';
  const noteCloseToolClass = isCharcoalTextNote
    ? 'border-transparent bg-transparent text-stone-200/58 shadow-none hover:border-white/12 hover:bg-white/14 hover:text-stone-50'
    : 'border-transparent bg-transparent text-stone-500/66 shadow-none hover:border-stone-200/70 hover:bg-white/70 hover:text-stone-700 dark:text-stone-400/68 dark:hover:border-stone-700/70 dark:hover:bg-stone-900/62 dark:hover:text-stone-100';
  const noteDeleteToolClass = isCharcoalTextNote
    ? 'border-transparent bg-transparent text-stone-200/50 shadow-none hover:border-red-200/20 hover:bg-red-50/12 hover:text-red-100'
    : 'border-transparent bg-transparent text-stone-400/68 shadow-none hover:border-red-200/70 hover:bg-red-50/60 hover:text-red-400 dark:text-stone-500/70 dark:hover:border-red-900/40 dark:hover:bg-red-950/24 dark:hover:text-red-300/80';
  const titleInputClass = isCharcoalTextNote
    ? 'border-white/18 bg-white/14 text-stone-50 ring-white/10 placeholder:text-stone-300/60'
    : 'border-stone-300/70 bg-white/82 text-stone-800 ring-stone-300/20 dark:border-stone-600 dark:bg-stone-900/80 dark:text-stone-100 dark:ring-stone-500/20';
  const textNoteNeutralBody = '#fbfaf7';
  const textNoteNeutralHeader = '#fffefa';
  const textNoteSoftBodyColor = isCharcoalTextNote
    ? '#3f3f3c'
    : `color-mix(in srgb, ${textNoteColor.body} 62%, ${textNoteNeutralBody})`;
  const textNoteSoftHeaderColor = isCharcoalTextNote
    ? '#4a4945'
    : `color-mix(in srgb, ${textNoteColor.header} 48%, ${textNoteNeutralHeader})`;
  const textNoteBodyStyle = note?.type === 'text'
    ? {
      backgroundColor: textNoteSoftBodyColor,
    }
    : undefined;
  const textNoteHeaderStyle = note?.type === 'text'
    ? {
      backgroundColor: textNoteSoftHeaderColor,
      borderColor: isCharcoalTextNote
        ? 'rgba(255, 255, 255, 0.11)'
        : 'rgba(74, 70, 62, 0.08)',
      color: textNoteTextColor,
    }
    : undefined;
  const scheduleDatePickerDays = scheduleDatePicker
    ? (() => {
      const monthDate = new Date(scheduleDatePicker.month);
      const firstOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const firstOffset = (firstOfMonth.getDay() + 6) % 7;
      const gridStart = addLocalDays(firstOfMonth.getTime(), -firstOffset);
      return Array.from({ length: 42 }, (_, index) => addLocalDays(gridStart, index));
    })()
    : [];
  const isSnipImageNote = note?.type === 'image' && !!note.itemId?.startsWith('snip_');

  const handleNoteMouseEnter = () => {
    isNoteHoveredRef.current = true;
    setIsNoteHovered(true);
    if (hoverResizeTimerRef.current !== null) {
      window.clearTimeout(hoverResizeTimerRef.current);
      hoverResizeTimerRef.current = null;
    }
  };

  const handleNoteMouseLeave = () => {
    if (notePointerOperationRef.current) return;
    isNoteHoveredRef.current = false;
    setIsNoteHovered(false);
    if (hoverResizeTimerRef.current !== null) {
      window.clearTimeout(hoverResizeTimerRef.current);
      hoverResizeTimerRef.current = null;
    }
    if (isEditingNoteTextRef.current) return;
    const previousMode = hoverExpandedFromModeRef.current;
    hoverExpandedFromModeRef.current = null;
    if (!previousMode) return;
    animateTextNoteSize(previousMode, { persist: false, durationMs: 145 });
  };

  const noteCornerClass = note?.type === 'image' ? 'rounded-[6px]' : 'rounded-[24px]';

  return (
    <div
      className={`${isDark && note?.type !== 'text' ? 'dark ' : ''}w-screen h-screen overflow-hidden ${noteCornerClass} bg-white/96 text-stone-800 dark:bg-stone-950/96 dark:text-stone-100 font-sans select-none ${
        isSnipImageNote
          ? 'border-2 border-emerald-400/90 dark:border-emerald-300/85'
          : 'border border-black/10 dark:border-white/10'
      }`}
      onContextMenu={handleContextMenu}
      onWheel={handleWheelZoom}
      onMouseDown={startNoteDrag}
      onMouseEnter={handleNoteMouseEnter}
      onMouseLeave={handleNoteMouseLeave}
      title={zoomTitle}
    >
      <div className={`relative h-full w-full overflow-hidden ${noteCornerClass}`}>
        {note && !isTextNoteMedium && (
          <div className="absolute right-3 top-3 z-40 flex gap-1.5">
            {note?.type === 'text' && (
              <div data-no-drag="true" data-note-color-transient="true" className="relative">
                <button
                  data-no-drag="true"
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  onClick={() => {
                    setContextMenu(null);
                    setShowTextNoteColorPicker(prev => !prev);
                  }}
                  title="更换便签颜色"
                  className={`${noteToolButtonBaseClass} ${showTextNoteColorPicker ? noteToolActiveClass : noteToolIdleClass} ${
                    isNoteHovered || showTextNoteColorPicker ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'
                  }`}
                  style={{ color: textNoteAccentColor }}
                >
                  <Palette className={`h-3.5 w-3.5 transition-all group-hover:fill-current group-hover:stroke-[2.4] ${showTextNoteColorPicker ? 'fill-current' : 'fill-transparent'}`} />
                </button>
                <AnimatePresence>
                  {showTextNoteColorPicker && (
                    <motion.div
                      data-no-drag="true"
                      data-note-color-transient="true"
                      initial={{ opacity: 0, scale: 0.96, y: -2 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.96, y: -2 }}
                      transition={{ type: 'tween', duration: 0.12 }}
                      className="absolute right-0 top-8 z-50 grid w-[142px] grid-cols-4 gap-1.5 rounded-[16px] border border-white/80 bg-white/92 p-2 shadow-2xl backdrop-blur-xl dark:border-stone-700/70 dark:bg-stone-900/92"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {TEXT_FLOATING_NOTE_COLORS.map(color => (
                        <button
                          key={color.id}
                          data-no-drag="true"
                          type="button"
                          onClick={() => changeTextNoteColor(color.id)}
                          title={color.label}
                          className={`h-7 w-7 rounded-full border transition-transform hover:scale-105 ${
                            textNoteColor.id === color.id ? 'border-stone-700 ring-2 ring-stone-900/10 dark:border-stone-100 dark:ring-white/15' : 'border-white/90 dark:border-stone-700/80'
                          }`}
                          style={{ backgroundColor: color.swatch }}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
            {note?.type === 'text' && (
              <button
                data-no-drag="true"
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDoubleClick={(e) => e.stopPropagation()}
                onClick={toggleScheduleMode}
                title={isScheduleMode ? '切回文字便签' : '转为日程便签'}
                className={`${noteToolButtonBaseClass} ${
                  isNoteHovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'
                } ${
                  isScheduleMode
                    ? noteToolActiveClass
                    : noteToolIdleClass
                }`}
                style={isScheduleMode ? undefined : { color: textNoteAccentColor }}
              >
                <CheckSquare className={`h-3.5 w-3.5 transition-all group-hover:fill-current group-hover:stroke-[2.4] ${isScheduleMode ? 'fill-current' : 'fill-transparent'}`} />
              </button>
            )}
        <button
          data-no-drag="true"
          onClick={toggleTopmost}
          title={topmost ? '取消置顶' : '置顶'}
          className={`${noteToolButtonBaseClass} ${
            isNoteHovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'
          } ${
            topmost
              ? noteToolActiveClass
              : noteToolIdleClass
          }`}
        >
          <Pin className={`h-3.5 w-3.5 transition-all group-hover:fill-current group-hover:stroke-[2.4] ${topmost ? 'fill-current opacity-90' : 'fill-transparent'}`} />
        </button>
        <button
          data-no-drag="true"
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDoubleClick={(e) => e.stopPropagation()}
          onClick={isSnipImageNote ? destroyCurrentSnipNote : hideNote}
          title={isSnipImageNote ? '删除截图便签' : '关闭便签'}
          className={`${noteToolButtonBaseClass} ${isSnipImageNote ? noteDeleteToolClass : noteCloseToolClass} ${
            isNoteHovered ? 'opacity-100 translate-y-0 pointer-events-auto' : 'opacity-0 -translate-y-1 pointer-events-none'
          }`}
        >
          <X className="h-3.5 w-3.5 transition-all group-hover:stroke-[2.6]" />
        </button>
          </div>
        )}
        {!note ? (
          <div className="flex h-full items-center justify-center p-6 text-center text-xs leading-5 text-stone-500 dark:text-stone-400">
            还没有便签内容。回到抽屉，在卡片右上角点击“便签”按钮。
          </div>
        ) : note.type === 'image' ? (
          <div className="flex h-full w-full items-center justify-center overflow-hidden bg-stone-950">
            {imageSrc ? (
              <img
                src={imageSrc}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-contain pointer-events-none select-none"
                draggable={false}
                alt={displayName}
              />
            ) : (
              <ImageIcon className="h-10 w-10 text-stone-600" />
            )}
          </div>
        ) : note.type === 'text' ? (
          <div
            className="flex h-full w-full flex-col overflow-hidden bg-stone-50/96 transition-colors duration-200 ease-linear dark:bg-stone-900/96"
            style={textNoteBodyStyle}
          >
            <div
              onMouseDown={handleTextNoteTitleMouseDown}
              onDoubleClick={handleTextNoteTitleDoubleClick}
              title="拖动移动便签，双击切换尺寸"
              className={`flex shrink-0 items-center border-stone-200/70 bg-white/70 text-stone-800 shadow-sm backdrop-blur-xl transition-[height,width,padding,background-color,border-color,border-radius] duration-200 ease-linear dark:border-stone-700/70 dark:bg-stone-800/76 dark:text-stone-100 ${
                isTextNoteMedium
                  ? 'h-full w-full gap-2 border-0 px-4 pr-11'
                  : 'h-12 w-full gap-2 border-b px-4 pr-14'
              }`}
              style={textNoteHeaderStyle}
            >
              <>
                  {isTextNoteMedium ? (
                    <button
                      data-no-drag="true"
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      onDoubleClick={(e) => e.stopPropagation()}
                      onClick={expandMediumTextNote}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-transparent transition-colors hover:bg-black/5"
                      title="单击展开便签"
                    >
                      <StickyNote className="h-4 w-4 text-stone-500 dark:text-stone-300" style={{ color: textNoteAccentColor }} />
                    </button>
                  ) : (
                    <StickyNote className="h-4 w-4 shrink-0 text-stone-500 dark:text-stone-300" style={{ color: textNoteAccentColor }} />
                  )}
                  <div className={`flex h-full min-w-0 shrink items-center ${isTextNoteMedium ? 'max-w-[calc(100%-56px)]' : 'max-w-[50%]'}`}>
                    {isEditingNoteTitle ? (
                      <input
                        ref={noteTitleInputRef}
                        data-no-drag="true"
                        value={noteTitleDraft}
                        onChange={(e) => setNoteTitleDraft(e.target.value)}
                        onBlur={saveTitle}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.stopPropagation();
                            saveTitle();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            e.stopPropagation();
                            setNoteTitleDraft(noteRef.current?.name || '');
                            setIsEditingNoteTitle(false);
                          }
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        className={`h-7 max-w-full rounded-[10px] border px-2 text-xs font-black outline-none ring-2 ${titleInputClass}`}
                        style={{ width: `min(${Math.max(4, Math.min(Array.from(noteTitleDraft || textNoteTitle).length + 2, 24))}em, calc(100vw - 96px))` }}
                      />
                    ) : (
                      <button
                        type="button"
                        data-no-drag="true"
                        onMouseDown={(e) => {
                          if (e.detail >= 2) e.stopPropagation();
                        }}
                        onDoubleClick={startTitleEdit}
                        className="inline-flex h-8 max-w-full cursor-text items-center truncate bg-transparent p-0 text-left text-xs font-black leading-none"
                        title="双击修改标题"
                      >
                        {textNoteTitle}
                      </button>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 self-stretch" />
              </>
            </div>

            {!isTextNoteMedium && (
            <div className="min-h-0 flex-1 p-5 pt-4 transition-[padding] duration-200 ease-linear">
              {isScheduleMode ? (
                <div data-no-drag="true" className="flex h-full min-h-0 flex-col gap-2">
                  <div
                    className="shrink-0 transition-all"
                    onBlur={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                      if (!scheduleDraft.trim()) setIsScheduleComposerActive(false);
                    }}
                  >
                    <div className="flex gap-2">
                      <input
                        value={scheduleDraft}
                        onChange={(e) => setScheduleDraft(e.target.value)}
                        onFocus={() => setIsScheduleComposerActive(true)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addScheduleItem();
                            return;
                          }
                          if (e.key === 'Escape' && !scheduleDraft.trim()) {
                            setIsScheduleComposerActive(false);
                          }
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        placeholder="添加日程..."
                        className={`min-w-0 flex-1 rounded-[12px] border border-transparent px-3 py-2 text-xs font-semibold outline-none transition-colors ${scheduleInputClass}`}
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                        onClick={addScheduleItem}
                        disabled={!scheduleDraft.trim()}
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[12px] transition-colors ${
                          isCharcoalTextNote
                            ? 'bg-white/24 text-white hover:bg-white/32 disabled:bg-white/10 disabled:text-stone-300/42'
                            : 'bg-stone-900 text-white hover:bg-stone-800 disabled:bg-stone-200/62 disabled:text-stone-400 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-white dark:disabled:bg-stone-800/62 dark:disabled:text-stone-600'
                        }`}
                        title="添加日程"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                    <AnimatePresence initial={false}>
                      {shouldShowScheduleComposerOptions && (
                        <motion.div
                          initial={{ height: 0, opacity: 0, y: -4 }}
                          animate={{ height: 'auto', opacity: 1, y: 0 }}
                          exit={{ height: 0, opacity: 0, y: -4 }}
                          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="mt-1.5 flex flex-wrap items-center gap-1">
                            <button
                              type="button"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => openScheduleDatePicker('new', parseDateInputValue(scheduleDateDraft), e)}
                              className={`inline-flex h-6 min-w-[74px] items-center gap-1 rounded-full px-2 text-left text-[10px] font-bold transition-colors ${scheduleWeakPillClass}`}
                              title="点击修改日期"
                            >
                              <Clock className="h-3 w-3 shrink-0 opacity-80" style={{ color: textNoteAccentColor }} />
                              <span className="min-w-0 flex-1 truncate">
                                {formatScheduleDateLabel(parseDateInputValue(scheduleDateDraft))}
                              </span>
                            </button>
                            <RoundedSelect
                              value={schedulePriorityDraft}
                              options={schedulePriorityOptions}
                              onChange={(next) => setSchedulePriorityDraft(normalizeSchedulePriority(next))}
                              className={`h-6 rounded-full border px-2 text-[10px] font-black opacity-86 ${getSchedulePriorityClass(schedulePriorityDraft)}`}
                              menuMinWidth={68}
                              title="优先级"
                            />
                            <RoundedSelect
                              value={scheduleTagDraft}
                              options={scheduleTagOptions}
                              onChange={setScheduleTagDraft}
                              icon={<Tag className="h-3 w-3 shrink-0 opacity-80" style={{ color: textNoteAccentColor }} />}
                              className={`h-6 max-w-[132px] rounded-full px-2 text-[10px] font-bold ${scheduleWeakPillClass}`}
                              menuMinWidth={148}
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="min-h-0 flex-1 overflow-hidden">
                    {scheduleItems.length === 0 ? (
                      <div className="flex h-full items-center justify-center px-4 text-center text-xs font-medium text-stone-400 dark:text-stone-500">
                        今天还没有安排
                      </div>
                    ) : (
                      <div className={`h-full overflow-y-auto divide-y pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/70 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600 ${scheduleDividerClass}`}>
                        {scheduleItems.map(item => (
                          <div key={item.id} className={`group/schedule flex items-start gap-2 px-1 py-2.5 transition-colors ${scheduleRowHoverClass}`}>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={() => toggleScheduleItem(item.id)}
                              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
                                item.done
                                  ? (isCharcoalTextNote ? 'border-white/84 bg-white/86 text-stone-950' : 'border-stone-800 bg-stone-800 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-900')
                                  : scheduleCheckboxClass
                              }`}
                              title={item.done ? '标记为未完成' : '标记为完成'}
                            >
                              <Check className="h-3 w-3" strokeWidth={3} />
                            </button>
                            <div className="min-w-0 flex-1">
                              <div className={`whitespace-pre-wrap break-words text-[13px] leading-5 ${item.done ? scheduleDoneTextClass : scheduleTextClass}`}>
                                {item.text}
                              </div>
                              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 opacity-0 transition-opacity duration-150 group-hover/schedule:opacity-100 group-focus-within/schedule:opacity-100">
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.stopPropagation()}
                                  onClick={(e) => openScheduleDatePicker(item.id, item.startAt, e)}
                                  className={`inline-flex h-5 items-center gap-1 rounded-full px-2 text-[10px] font-bold transition-colors ${scheduleMutedPillClass}`}
                                  title="点击修改日期"
                                >
                                  <Clock className="h-3 w-3 shrink-0" style={{ color: textNoteAccentColor }} />
                                  <span>{formatScheduleDateLabel(item.startAt)}</span>
                                </button>
                                <RoundedSelect
                                  value={normalizeSchedulePriority(item.priority)}
                                  options={schedulePriorityOptions}
                                  onChange={(next) => updateScheduleItem(item.id, { priority: normalizeSchedulePriority(next) })}
                                  className={`h-5 rounded-full border px-2 text-[10px] font-black ${getSchedulePriorityClass(item.priority)}`}
                                  menuMinWidth={58}
                                  title="优先级"
                                />
                                <RoundedSelect
                                  value={(item.tagIds || [])[0] || ''}
                                  options={scheduleTagOptions}
                                  onChange={(next) => updateScheduleItem(item.id, { tagIds: next ? [next] : [] })}
                                  icon={<Tag className="h-3 w-3 shrink-0" style={{ color: textNoteAccentColor }} />}
                                  className={`h-5 max-w-[128px] rounded-full px-2 text-[10px] font-bold ${scheduleTagPillClass}`}
                                  menuMinWidth={136}
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                              }}
                              onClick={() => removeScheduleItem(item.id)}
                              className={`shrink-0 rounded-[10px] p-1 opacity-0 transition-all group-hover/schedule:opacity-100 ${scheduleDeleteClass}`}
                              title="删除日程"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : isEditingNoteText ? (
                <textarea
                  ref={noteTextAreaRef}
                  data-no-drag="true"
                  defaultValue={text}
                  onChange={(e) => updateTextLive(e.target.value)}
                  onBlur={finishTextEdit}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') finishTextEdit();
                    if (e.key === 'Escape') finishTextEdit();
                  }}
                  onContextMenu={handleContextMenu}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="h-full w-full resize-none bg-transparent outline-none text-stone-700 transition-[font-size,line-height] duration-200 ease-linear dark:text-stone-100 placeholder:text-stone-400 dark:placeholder:text-stone-500"
                  style={{ fontSize: `${14 * zoom}px`, lineHeight: 1.65, color: textNoteTextColor }}
                  placeholder="写点灵感..."
                />
              ) : (
                <div
                  data-text-note-display="true"
                  onMouseDown={handleTextDisplayMouseDown}
                  onDoubleClick={(e) => e.stopPropagation()}
                  className="h-full w-full overflow-y-auto whitespace-pre-wrap break-words text-stone-700 transition-[font-size,line-height] duration-200 ease-linear dark:text-stone-100"
                  style={{ fontSize: `${14 * zoom}px`, lineHeight: 1.65, color: textNoteTextColor }}
                  title="单击编辑文字"
                >
                  {text.trim() ? text : <span style={{ color: textNoteMutedTextColor }}>单击写点灵感...</span>}
                </div>
              )}
            </div>
            )}
          </div>
        ) : (
          <button
            data-no-drag="true"
            onDoubleClick={openSource}
            className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden p-6 text-center transition-colors hover:bg-stone-50 dark:hover:bg-stone-900"
          >
            <div className="transition-transform duration-100" style={{ transform: `scale(${zoom})` }}>
              {note.type === 'video' ? <Film className="h-12 w-12 text-emerald-500" /> : <FileIcon className="h-12 w-12 text-amber-500" />}
            </div>
            <span className="max-w-full truncate text-sm font-bold">{note.name || '文件便签'}</span>
            <span className="max-w-full truncate text-[11px] text-stone-500 dark:text-stone-400">双击打开源文件</span>
          </button>
        )}

        <AnimatePresence>
          {scheduleDatePicker && (
            <>
              <motion.div
                data-no-drag="true"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-40 bg-transparent"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setScheduleDatePicker(null);
                }}
              />
              <motion.div
                data-no-drag="true"
                initial={{ opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: -4 }}
                transition={{ type: 'tween', duration: 0.13 }}
                className="fixed z-50 w-[244px] overflow-hidden rounded-[22px] border border-white/75 bg-white/75 p-3 text-stone-500 shadow-2xl shadow-black/10 backdrop-blur-2xl dark:border-white/10 dark:bg-stone-900/75 dark:text-stone-300"
                style={{ left: scheduleDatePicker.x, top: scheduleDatePicker.y }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <div className="mb-2 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => moveScheduleDatePickerMonth(-1)}
                    className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-white/70 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                    title="上个月"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="text-xs font-black text-stone-600 dark:text-stone-200">
                    {new Date(scheduleDatePicker.month).getFullYear()}年 {new Date(scheduleDatePicker.month).getMonth() + 1}月
                  </div>
                  <button
                    type="button"
                    onClick={() => moveScheduleDatePickerMonth(1)}
                    className="rounded-full p-1.5 text-stone-400 transition-colors hover:bg-white/70 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                    title="下个月"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-stone-400/90 dark:text-stone-500">
                  {['一', '二', '三', '四', '五', '六', '日'].map(day => (
                    <div key={day} className="py-1">{day}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {scheduleDatePickerDays.map(day => {
                    const currentMonth = new Date(scheduleDatePicker.month).getMonth();
                    const date = new Date(day);
                    const isCurrentMonth = date.getMonth() === currentMonth;
                    const isSelected = scheduleDatePicker.selected === startOfLocalDay(day);
                    const isToday = startOfLocalDay(day) === startOfLocalDay(Date.now());

                    return (
                      <button
                        key={formatDateInputValue(day)}
                        type="button"
                        onClick={() => chooseScheduleDate(startOfLocalDay(day))}
                        className={`flex h-7 items-center justify-center rounded-[10px] text-[11px] font-bold transition-colors ${
                          isSelected
                            ? 'bg-stone-800 text-white shadow-sm dark:bg-stone-100 dark:text-stone-900'
                            : isToday
                              ? 'bg-white/80 text-stone-700 ring-1 ring-stone-200 dark:bg-stone-800/80 dark:text-stone-100 dark:ring-stone-700'
                              : 'text-stone-500 hover:bg-white/72 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800/72 dark:hover:text-stone-100'
                        } ${isCurrentMonth ? '' : 'opacity-40'}`}
                      >
                        {date.getDate()}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-stone-200/55 pt-2 dark:border-stone-700/55">
                  <button
                    type="button"
                    onClick={() => chooseScheduleDate(startOfLocalDay(Date.now()))}
                    className="rounded-full bg-white/70 px-3 py-1.5 text-[11px] font-bold text-stone-500 transition-colors hover:bg-white hover:text-stone-700 dark:bg-stone-800/60 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                  >
                    今天
                  </button>
                  {scheduleDatePicker.target !== 'new' && (
                    <button
                      type="button"
                      onClick={() => chooseScheduleDate(undefined)}
                      className="rounded-full px-3 py-1.5 text-[11px] font-bold text-stone-400 transition-colors hover:bg-white/70 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800/60 dark:hover:text-stone-300"
                    >
                      清除
                    </button>
                  )}
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {note && (
        <div
          data-no-drag="true"
          onPointerDown={startNoteResize}
          title="拖动缩放便签"
          className={`absolute bottom-1 right-1 z-40 h-7 w-7 cursor-nwse-resize rounded-br-[20px] transition-opacity duration-150 ${
            isNoteHovered ? 'opacity-65' : 'opacity-15'
          }`}
        >
          <div className="absolute bottom-1.5 right-1.5 h-3.5 w-3.5 rounded-br-[12px] border-b border-r border-stone-500/40 dark:border-stone-200/40" />
          <div className="absolute bottom-1.5 right-1.5 h-2 w-2 rounded-br-[8px] border-b border-r border-stone-500/25 dark:border-stone-200/25" />
        </div>
        )}

        <AnimatePresence>
          {contextMenu && (
            <motion.div
              data-no-drag="true"
              initial={{ opacity: 0, scale: 0.96, y: -2 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: -2 }}
              transition={{ type: 'tween', duration: 0.12 }}
              className="fixed z-50 w-[148px] overflow-hidden rounded-[16px] border border-stone-200/80 bg-white/95 p-1.5 text-xs font-bold text-stone-700 shadow-2xl backdrop-blur-xl dark:border-stone-700/70 dark:bg-stone-900/95 dark:text-stone-200"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void openDrawerFromNote();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
              >
                <LayoutGrid className="h-3.5 w-3.5 text-amber-500" />
                打开抽屉
              </button>
              <button
                type="button"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void hideNote();
                }}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                className="flex w-full items-center gap-2 rounded-[12px] px-3 py-2 text-left hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-300"
              >
                <X className="h-3.5 w-3.5" />
                关闭窗口
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
