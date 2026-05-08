// src/components/BufferItemCard.tsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from "framer-motion";
import {
  Tag, Star, FolderMinus, FolderOpen, Download, Copy,
  Check, X, ShieldCheck, Film, Play, File as FileIcon, Link, Sparkles, StickyNote
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { writeImage } from '@tauri-apps/plugin-clipboard-manager';
import { Image as TauriImage } from '@tauri-apps/api/image';
import { save } from '@tauri-apps/plugin-dialog';

export default function BufferItemCard({
  item, cardWidth, mediaHeight, isResizing,
  onResizeStart, onResizeEnd, onResize,
  onRemove, onRemoveFromFolder, onTogglePin,
  onImageClick, onVideoClick, isSelectMode,
  isSelected, onToggleSelect, onUpdateRemark, onUpdateText, showToast,
  showAlchemy = false, onAlchemy, onCreateFloatingNote, onLiveTextChange
}: any) {
  const [copied, setCopied] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const isLongText = item.type === 'text' && item.content && item.content.length > 80;
  const [isEditingRemark, setIsEditingRemark] = useState(false);
  const [editRemarkText, setEditRemarkText] = useState(item.remark || '');
  const [isEditingText, setIsEditingText] = useState(false);
  const [editContentText, setEditContentText] = useState(item.content || '');
  const [isHovered, setIsHovered] = useState(false);
  const openUrlTimerRef = useRef<any | null>(null);
  const editStartContentRef = useRef(item.content || '');
  const editContentDirtyRef = useRef(false);
  const skipTextEditSaveRef = useRef(false);
  const finishingTextEditRef = useRef(false);

  const isExternalHttpUrl = (value?: unknown) => (
    typeof value === 'string' &&
    /^https?:\/\//i.test(value.trim()) &&
    !value.includes('asset.localhost')
  );

  const isLocalPathLike = (value?: unknown) => (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    !isExternalHttpUrl(value) &&
    !value.trim().startsWith('data:') &&
    !value.includes('asset.localhost')
  );

  // 只把文本网址当作可打开链接；图片卡不再显示“打开原网址”。
  // 本地图片的 item.url 通常是 asset.localhost，不应被误判成网页来源。
  const webSourceUrl = [item.sourceUrl, item.pageUrl, item.originalUrl, item.type === 'text' ? item.path : '', item.type === 'text' ? item.url : '', item.content]
    .find((value) => isExternalHttpUrl(value)) || '';
  const isUrlText = item.type === 'text' && !!webSourceUrl && (item.isUrl || (item.content || '').trim() === webSourceUrl);
  const canShowInFolder = !!item.path && !isExternalHttpUrl(item.path) && !String(item.path).startsWith('data:');

  useEffect(() => {
    setEditRemarkText(item.remark || '');
  }, [item?.id, item?.remark]);

  useEffect(() => {
    const nextContent = item.content || '';
    editStartContentRef.current = nextContent;
    editContentDirtyRef.current = false;
    setEditContentText(nextContent);
    setIsEditingText(false);
  }, [item?.id]);

  useEffect(() => {
    if (isEditingText) return;
    const nextContent = item.content || '';
    editStartContentRef.current = nextContent;
    editContentDirtyRef.current = false;
    setEditContentText(nextContent);
  }, [item?.content, isEditingText]);

  useEffect(() => () => {
    if (openUrlTimerRef.current) window.clearTimeout(openUrlTimerRef.current);
  }, []);

  const normalizeImageToPng = (url: string, callback: (pngUrl: string) => void) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        callback(canvas.toDataURL('image/png'));
      } else {
        callback(url);
      }
    };
    img.onerror = () => callback(url); img.src = url;
  };

  const handleOpenFile = (e: React.MouseEvent | any) => {
    e.preventDefault(); e.stopPropagation();
    if (item.path) {
        invoke('open_file', { path: item.path }).catch(()=>{});
    }
  };

  const handleShowInFolder = async (e: React.MouseEvent | any) => {
    e.preventDefault(); e.stopPropagation();
    if (!item.path) return;

    const cachePath = String(item.path || '');
    const originalPath = [item.sourceUrl, item.originalUrl, item.sourcePath, item.originalPath]
      .find((value) => isLocalPathLike(value) && String(value) !== cachePath) as string | undefined;

    let targetPath = cachePath;
    let usedOriginal = false;

    if (originalPath) {
      try {
        const kind = await invoke<'file' | 'directory' | 'missing'>('path_kind', { path: originalPath });
        if (kind === 'file' || kind === 'directory') {
          targetPath = originalPath;
          usedOriginal = true;
        }
      } catch (err) {
        console.warn('检查原文件路径失败，改用缓存路径:', err);
      }
    }

    invoke('show_in_folder', { path: targetPath }).then(() => {
      if (!usedOriginal && originalPath) showToast?.('原文件已不存在，已定位缓存副本');
    }).catch((err) => {
      console.warn('在文件夹中显示失败:', err);
      showToast?.('无法定位原文件或缓存文件');
    });
  };

  const handleOpenSourceUrl = (e: React.MouseEvent | any) => {
    e.preventDefault();
    e.stopPropagation();
    if (!webSourceUrl) return;
    if (e.detail && e.detail > 1) return;
    if (openUrlTimerRef.current) window.clearTimeout(openUrlTimerRef.current);
    openUrlTimerRef.current = window.setTimeout(() => {
      openUrlTimerRef.current = null;
      invoke('open_file', { path: webSourceUrl }).catch(() => {
        showToast?.('无法打开网址');
      });
    }, 220);
  };

  const handleSaveFile = async (e: React.MouseEvent | any) => {
    e.preventDefault(); e.stopPropagation();
    try {
      const isImage = item.type === 'image';
      const isText = item.type === 'text';
      const defaultName = isImage
        ? (item.name || `图片_${Date.now()}.png`)
        : isText
          ? `${item.name || '文本片段'}_${Date.now()}.txt`
          : (item.name || `文件_${Date.now()}`);

      const savePath = await save({
        defaultPath: defaultName,
        filters: isImage
          ? [{ name: 'Image', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'] }]
          : isText
            ? [{ name: 'Text', extensions: ['txt'] }]
            : [{ name: 'All Files', extensions: ['*'] }]
      });

      if (!savePath) return;

      await invoke('save_item_source_as', {
        source: item.path || item.url || '',
        dest: savePath,
        content: item.content || '',
        itemType: item.type,
      });
      showToast('💾 保存成功');
    } catch (err) {
      console.error('另存为失败:', err);
      showToast('❌ 保存失败');
    }
  };

  const markCopied = (msg: string) => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast(msg);
  };

  const dataUrlToBlob = async (dataUrl: string) => {
    const res = await fetch(dataUrl);
    return await res.blob();
  };

  const copyPngDataUrl = async (pngUrl: string) => {
    const blob = await dataUrlToBlob(pngUrl);

    // 首选浏览器原生 ClipboardItem：这是“复制图片本体”，不是复制路径。
    const ClipboardItemCtor = (window as any).ClipboardItem;
    if (navigator.clipboard && ClipboardItemCtor) {
      try {
        await navigator.clipboard.write([
          new ClipboardItemCtor({ 'image/png': blob })
        ]);
        return;
      } catch (err) {
        console.warn('navigator.clipboard.write image failed:', err);
      }
    }

    // 再走 Tauri clipboard-manager。Tauri v2 下先转成 Image 对象更稳。
    try {
      const buffer = await blob.arrayBuffer();
      const image = await TauriImage.fromBytes(new Uint8Array(buffer));
      await writeImage(image);
      return;
    } catch (err) {
      console.warn('tauri writeImage failed:', err);
    }

    // 最后走 Rust 后端。后端负责把 data:image 写入系统图片剪贴板。
    await invoke('copy_image', { dataUrl: pngUrl });
  };

  const copyImageSource = async (source: string) => {
    if (!source) throw new Error('empty image source');

    await new Promise<void>((resolve, reject) => {
      normalizeImageToPng(source, async (pngUrl) => {
        try {
          if (pngUrl.startsWith('data:image/')) {
            await copyPngDataUrl(pngUrl);
          } else {
            // canvas 受跨域限制时会回退到原始 URL/path，此时交给 Rust 处理下载/本地读取。
            await invoke('copy_image', { dataUrl: source });
          }
          resolve();
        } catch (err) {
          try {
            await invoke('copy_image', { dataUrl: source });
            resolve();
          } catch (backendErr) {
            reject(backendErr || err);
          }
        }
      });
    });
  };

  const handleCopy = async (e: React.MouseEvent | any) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      if (item.type === 'text') {
        await navigator.clipboard.writeText(item.content || '');
        markCopied('📋 文本已复制');
        return;
      }

      if (item.type === 'image') {
        const source = item.url || item.path || item.content || '';
        if (!source) throw new Error('没有可复制的图片');

        await copyImageSource(source);
        markCopied('📋 图片已复制');
        return;
      }

      await navigator.clipboard.writeText(item.path || item.name || '');
      markCopied('📋 路径已复制');
    } catch (err) {
      console.error('复制失败:', err);
      showToast(item.type === 'image' ? '❌ 图片复制失败' : '❌ 复制失败');
    }
  };


  useEffect(() => {
    if (!isHovered) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName;
      if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;
      if (e.repeat) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        e.stopPropagation();
        handleCopy(e);
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isHovered, item]);

  const startResizingCard = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    onResizeStart();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = e.currentTarget.parentElement?.offsetWidth || 320;
    const startH = mediaHeight;

    const onMouseMove = (me: MouseEvent) => {
      const deltaX = me.clientX - startX;
      const deltaY = me.clientY - startY;
      const newW = Math.max(100, Math.min(800, startW + deltaX));
      const newH = Math.max(40, Math.min(600, startH + deltaY));
      onResize(newW, newH);
    };

    const onMouseUp = () => {
      onResizeEnd();
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const isSmallCard = cardWidth < 200;
  const btnClass = `${isSmallCard ? 'p-1 rounded-[10px]' : 'p-1.5 rounded-[12px]'} bg-white/80 dark:bg-stone-700/80 backdrop-blur-xl text-stone-500 dark:text-stone-300 hover:text-amber-500 hover:bg-white dark:hover:bg-stone-700 shadow-[0_2px_10px_rgba(0,0,0,0.08)] transition-all pointer-events-auto`;
  const iconClass = isSmallCard ? 'w-3 h-3' : 'w-3.5 h-3.5';
  const alchemyState = item.alchemy?.state || 'raw';
  const alchemyResult = item.alchemy?.result;
  const isAlchemyDone = alchemyState === 'alchemy' && !!alchemyResult;
  const isAlchemyLoading = alchemyState === 'analyzing';
  const canShowAlchemy = !!showAlchemy && item.type === 'image' && !isSelectMode;
  const alchemyColors = Array.isArray(alchemyResult?.colors) ? alchemyResult.colors.slice(0, 4) : [];
  const alchemyKeywords = Array.isArray(alchemyResult?.keywords) ? alchemyResult.keywords.slice(0, 3) : [];
  const isPaletteOnlyAlchemy = alchemyResult?.analysisMode === 'palette';
  const hasCompactPalette = item.type === 'image' && (isAlchemyLoading || alchemyColors.length > 0);
  const hasAiAlchemyDone = isAlchemyDone && !isPaletteOnlyAlchemy;
  const videoThumbnail = item.thumbnail || item.cover || (typeof item.url === 'string' && item.url.startsWith('data:image/') ? item.url : '');

  const handleAlchemyClick = (e: React.MouseEvent | any) => {
    e.preventDefault();
    e.stopPropagation();
    if (isAlchemyLoading) return;
    if (typeof onAlchemy === 'function') onAlchemy(item);
  };

  const saveTextContent = () => {
    if (skipTextEditSaveRef.current) {
      skipTextEditSaveRef.current = false;
      return;
    }
    if (finishingTextEditRef.current) return;

    finishingTextEditRef.current = true;
    window.setTimeout(() => {
      finishingTextEditRef.current = false;
    }, 0);

    const originalText = editStartContentRef.current;
    const nextText = editContentText.trim();
    if (!nextText) {
      showToast?.('文本不能为空');
      setEditContentText(originalText);
      if (typeof onLiveTextChange === 'function') onLiveTextChange(item.id, originalText);
      setIsEditingText(false);
      return;
    }

    setIsEditingText(false);
    setEditContentText(nextText);
    editStartContentRef.current = nextText;
    const shouldCommit = editContentDirtyRef.current && (
      nextText !== originalText.trim() ||
      nextText !== (item.content || '')
    );
    editContentDirtyRef.current = false;

    if (shouldCommit && typeof onUpdateText === 'function') {
      onUpdateText(item.id, nextText);
      showToast?.('文本已更新');
    } else if (shouldCommit && typeof onLiveTextChange === 'function') {
      onLiveTextChange(item.id, nextText);
    }
  };

  const cancelTextEdit = () => {
    const originalText = editStartContentRef.current;
    skipTextEditSaveRef.current = true;
    editContentDirtyRef.current = false;
    setEditContentText(originalText);
    if (typeof onLiveTextChange === 'function') onLiveTextChange(item.id, originalText);
    setIsEditingText(false);
  };

  const startTextEditFromCard = (e: React.MouseEvent | any) => {
    if (item.type !== 'text' || isSelectMode) return;
    e.preventDefault();
    e.stopPropagation();
    if (openUrlTimerRef.current) {
      window.clearTimeout(openUrlTimerRef.current);
      openUrlTimerRef.current = null;
    }
    skipTextEditSaveRef.current = false;
    setIsEditingRemark(false);
    setIsExpanded(true);
    editStartContentRef.current = item.content || '';
    editContentDirtyRef.current = false;
    setEditContentText(editStartContentRef.current);
    setIsEditingText(true);
  };

return (
    <motion.div
      layout transition={{ layout: { type: 'tween', duration: isResizing ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }, default: { type: 'tween', duration: 0.2, ease: [0.16, 1, 0.3, 1] } }}
      initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }}
      onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}
      onPointerEnter={() => setIsHovered(true)} onPointerLeave={() => setIsHovered(false)}
      draggable={false}
      onDragStart={(e: any) => e.preventDefault()}
      className={`group relative bg-white/90 dark:bg-stone-800/90 rounded-[22px] shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:shadow-black/20 backdrop-blur-xl transition-colors will-change-transform flex flex-col overflow-hidden ${isSelectMode && isSelected ? 'ring-2 ring-emerald-500 border-transparent' : 'border border-white/70 dark:border-stone-700/60 hover:shadow-[0_12px_34px_rgba(0,0,0,0.10)] hover:z-50'}`}
    >
      {!isSelectMode && (
        <div className="absolute bottom-0 right-0 w-7 h-7 cursor-nwse-resize z-[40] flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity rounded-br-[22px]" onMouseDown={startResizingCard} title="拖动调整所有卡片尺寸">
          <svg viewBox="0 0 6 6" className="w-2.5 h-2.5 text-stone-400/80 dark:text-stone-500/80"><path d="M6 0 L6 6 L0 6 Z" fill="currentColor"/></svg>
        </div>
      )}

      {isSelectMode && <div className="absolute inset-0 z-50 bg-black/5 dark:bg-black/20 cursor-pointer flex items-start justify-end p-2.5 rounded-[22px]" onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleSelect(); }}><div className={`w-4 h-4 rounded-[6px] shadow-sm border flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-stone-300 dark:border-stone-500 bg-white/80 dark:bg-stone-800/80'}`}>{isSelected && <Check className="w-3 h-3 text-white" strokeWidth={3} />}</div></div>}

      {!isSelectMode && (
        <div data-no-drag="true" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-[80] flex flex-wrap justify-end gap-1.5 min-w-[160px] pointer-events-auto">
          <button
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (isEditingRemark) { setIsEditingRemark(false); onUpdateRemark(item.id, editRemarkText.trim()); } else { setIsEditingRemark(true); } }}
            onClick={e => { e.preventDefault(); e.stopPropagation(); }} title={item.remark ? "修改/收起备注" : "添加备注"} className={btnClass}
          ><Tag className={iconClass} /></button>

          <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTogglePin(); }} title={item.isQuickAccess ? "取消快速访问" : "固定到快速访问"} className={`${btnClass} ${item.isQuickAccess ? 'text-amber-500' : ''}`}><Star className={`${iconClass} ${item.isQuickAccess ? 'fill-amber-400 text-amber-500' : ''}`} /></button>

          {typeof onCreateFloatingNote === 'function' && (
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCreateFloatingNote(item); }}
              title="固定为桌面便签"
              className={`${btnClass} hover:text-amber-600`}
            ><StickyNote className={iconClass} /></button>
          )}

          {canShowAlchemy && (
            <button
              type="button"
              onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
              onClick={handleAlchemyClick}
              title={isAlchemyLoading ? 'AI 炼金中' : hasAiAlchemyDone ? '重新 AI 炼金' : 'AI 炼金'}
              className={`${btnClass} ${hasAiAlchemyDone ? 'text-amber-500' : ''}`}
            ><Sparkles className={`${iconClass} ${hasAiAlchemyDone ? 'fill-amber-300/60 text-amber-500' : ''}`} /></button>
          )}

          {item.folderId && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemoveFromFolder(); }}
              title="移出当前文件夹"
              className={`${btnClass} hover:text-amber-500`}
            ><FolderMinus className={iconClass} /></button>
          )}

          {canShowInFolder && <button onClick={handleShowInFolder} title="在文件夹中显示（原文件优先，丢失则定位缓存）" className={`${btnClass} hover:text-blue-600`}><FolderOpen className={iconClass} /></button>}
          <button onClick={handleSaveFile} title="另存为文件" className={`${btnClass} hover:text-blue-500`}><Download className={iconClass} /></button>
          <button type="button" data-no-drag="true" onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }} onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }} onClick={handleCopy} title="复制 (Ctrl+C)" className={`${btnClass} hover:text-emerald-600`}>{copied ? <Check className={`${iconClass} text-emerald-500`} /> : <Copy className={iconClass} />}</button>
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
            title={item.isQuickAccess ? "该项目已锁定保护" : "删除"}
            className={`${btnClass} ${item.isQuickAccess ? 'text-amber-500 dark:text-amber-400 cursor-default opacity-80 hover:text-amber-500' : 'hover:text-red-600'}`}
          >{item.isQuickAccess ? <ShieldCheck className={iconClass} /> : <X className={iconClass} />}</button>
        </div>
      )}

      {item.type === 'image' && <img src={item.url} className="w-full object-cover cursor-pointer rounded-t-[22px]" style={{ height: mediaHeight }} title="点击预览" onClick={(e) => { e.preventDefault(); e.stopPropagation(); !isSelectMode && onImageClick?.(item.url); }} />}

      {item.type === 'video' && (
        <div
          className="relative w-full group/video cursor-pointer bg-stone-900 rounded-t-[22px] overflow-hidden"
          style={{ height: mediaHeight }}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); !isSelectMode && onVideoClick?.(item); }}
          title="点击在抽屉内播放"
        >
          {videoThumbnail ? <img src={videoThumbnail} className="w-full h-full object-cover opacity-80 group-hover/video:opacity-100 transition-opacity" /> : <div className="w-full h-full bg-gradient-to-br from-stone-800 to-stone-900 flex items-center justify-center"><Film className="w-12 h-12 text-stone-700/60" /></div>}
          <div className="absolute inset-0 flex items-center justify-center bg-black/10 group-hover/video:bg-black/30 transition-colors"><div className="w-12 h-12 bg-white/20 backdrop-blur-md rounded-[18px] flex items-center justify-center text-white shadow-lg transition-transform group-hover/video:scale-110 border border-white/20"><Play className="w-5 h-5 ml-1 fill-white opacity-90" /></div></div>
        </div>
      )}

      <div className="p-3.5 flex flex-col justify-start">
        {(item.type === 'file' || item.type === 'video') ? (
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-70 transition-opacity mt-auto mb-auto" onClick={(e) => { e.preventDefault(); e.stopPropagation(); !isSelectMode && handleOpenFile(e); }} title="使用系统默认软件打开">
            {item.type === 'video' ? <Film className="w-4 h-4 text-emerald-500 dark:text-emerald-400 shrink-0" /> : <FileIcon className="w-4 h-4 text-stone-400 dark:text-stone-500 shrink-0" />}
            <span className="text-xs font-medium text-stone-600 dark:text-stone-300 truncate">{item.name}</span>
          </div>
        ) : (
          <div
            className={`relative flex flex-col ${isExpanded ? 'max-h-[500px] overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-600 [&::-webkit-scrollbar-thumb]:rounded-full' : 'max-h-[150px] overflow-hidden'}`}
            onDoubleClick={startTextEditFromCard}
            title={item.type === 'text' && !isEditingText ? '双击编辑文本' : undefined}
          >
            {isEditingText ? (
              <div
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                className="space-y-2"
              >
                <textarea
                  autoFocus
                  value={editContentText}
                  onChange={(e) => {
                    const nextValue = e.target.value;
                    editContentDirtyRef.current = nextValue !== editStartContentRef.current;
                    setEditContentText(nextValue);
                    if (typeof onLiveTextChange === 'function') onLiveTextChange(item.id, nextValue);
                  }}
                  onBlur={saveTextContent}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      saveTextContent();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      cancelTextEdit();
                    }
                  }}
                  placeholder="编辑文本内容..."
                  className="min-h-[96px] w-full resize-y rounded-[16px] border border-emerald-200/80 dark:border-emerald-800/55 bg-white/85 dark:bg-stone-900/45 p-2.5 text-xs leading-5 text-stone-700 dark:text-stone-200 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-500/15"
                />
                <div className="text-[10px] text-stone-400 dark:text-stone-500">Ctrl + Enter 保存，Esc 取消；失焦自动保存</div>
              </div>
            ) : isUrlText ? (
              <button
                onClick={handleOpenSourceUrl}
                onDoubleClick={startTextEditFromCard}
                title="单击打开网址，双击编辑文本"
                className="group/link flex items-center gap-2 text-left rounded-[16px] bg-sky-50/80 dark:bg-sky-900/20 border border-sky-100 dark:border-sky-800/40 px-3 py-2 hover:bg-sky-100 dark:hover:bg-sky-900/35 transition-colors"
              >
                <Link className="w-4 h-4 text-sky-500 dark:text-sky-400 shrink-0" />
                <span className="text-xs font-medium text-sky-700 dark:text-sky-300 leading-relaxed truncate underline-offset-2 group-hover/link:underline">{webSourceUrl}</span>
              </button>
            ) : (
              <p className={`text-xs text-stone-600 dark:text-stone-300 leading-relaxed ${isExpanded ? 'whitespace-pre-wrap' : 'line-clamp-5'}`}>{item.content}</p>
            )}
            {!isEditingText && !isUrlText && isLongText && <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsExpanded(!isExpanded); }} className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1.5 font-medium hover:underline z-10 relative self-start shrink-0 bg-white/90 dark:bg-stone-800/90 w-full text-left pt-1 rounded-[10px]">{isExpanded ? '收起全文' : '展开阅读全文...'}</button>}
          </div>
        )}
      </div>

      <AnimatePresence initial={false}>
        {hasCompactPalette && (
          <motion.div
            key="compact-palette"
            data-no-drag="true"
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className="px-3.5 pb-3 -mt-1"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ type: 'tween', duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="rounded-[16px] border border-stone-200/70 dark:border-stone-700/60 bg-stone-50/75 dark:bg-stone-900/28 px-2.5 py-2 shadow-sm">
              {isAlchemyLoading ? (
                <div className="flex items-center gap-1.5">
                  {[0, 1, 2, 3].map((idx) => (
                    <span key={idx} className="h-[18px] w-[18px] rounded-full bg-stone-200/80 dark:bg-stone-700/80 animate-pulse" />
                  ))}
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex items-center gap-1.5">
                    {alchemyColors.map((color: string, idx: number) => (
                      <motion.span
                        key={`${color}-${idx}`}
                        className="h-[18px] w-[18px] rounded-full border border-black/10 dark:border-white/10 shadow-inner"
                        style={{ backgroundColor: color }}
                        title={color}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: 'tween', duration: 0.22, delay: idx * 0.03, ease: [0.16, 1, 0.3, 1] }}
                      />
                    ))}
                  </div>
                  {alchemyKeywords.length > 0 && (
                    <motion.div
                      className="mt-2 flex flex-wrap gap-1 overflow-hidden"
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'tween', duration: 0.22, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {alchemyKeywords.map((tag: string) => (
                        <span key={tag} className="rounded-full bg-white/75 dark:bg-stone-800/75 border border-white/80 dark:border-stone-700/60 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300">{tag}</span>
                      ))}
                    </motion.div>
                  )}
                </motion.div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isEditingRemark && (
          <motion.div
            key="remark-editor"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'tween', duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden rounded-b-[22px] will-change-transform mt-auto shrink-0" onClick={e => { e.preventDefault(); e.stopPropagation(); }}
          >
            <div className="px-3 pb-3 pt-1">
              <input
                autoFocus value={editRemarkText} onChange={e => setEditRemarkText(e.target.value)}
                onBlur={() => { setIsEditingRemark(false); onUpdateRemark(item.id, editRemarkText.trim()); }}
                onKeyDown={e => {
                  if (e.key === 'Enter') { setIsEditingRemark(false); onUpdateRemark(item.id, editRemarkText.trim()); }
                  if (e.key === 'Escape') { setIsEditingRemark(false); setEditRemarkText(item.remark || ''); }
                }}
                placeholder="写点备注方便搜索..."
                className="w-full text-xs bg-amber-50/80 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-[14px] p-2 outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400/50 text-amber-900 dark:text-amber-100 placeholder:text-amber-400/70 dark:placeholder:text-amber-500/50 transition-all shadow-inner"
              />
            </div>
          </motion.div>
        )}

        {!isEditingRemark && item.remark && (
          <motion.div
            key="remark-display"
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ type: 'tween', duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden rounded-b-[22px] will-change-transform mt-auto shrink-0"
          >
            <div className="px-3 pb-3 pt-1">
              <div
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/30 rounded-[14px] border border-amber-100 dark:border-amber-800/50 cursor-pointer hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors shadow-sm"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setIsEditingRemark(true); }}
                title="点击修改备注"
              >
                <Tag className="w-3 h-3 text-amber-500 dark:text-amber-400 shrink-0" />
                <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium leading-none truncate">{item.remark}</span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
