import { useState } from 'react';
import { motion } from "framer-motion";
import { X } from 'lucide-react';
// 🌟 引入 Tauri 核心 API
import { invoke } from '@tauri-apps/api/core';

export function ImagePreviewer({ url, width, onClose, onDragWindow }: any) {
  const [scale, setScale] = useState(1);
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="absolute inset-y-0 right-0 z-[99999] bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center p-4 rounded-l-[24px] pointer-events-auto overflow-hidden" 
      style={{ width }} onClick={onClose} onWheel={(e) => setScale(prev => Math.min(Math.max(0.5, prev - e.deltaY * 0.002), 5))} onContextMenu={(e) => e.preventDefault()}
      onMouseDown={(e) => { if (e.button === 2) { e.stopPropagation(); onDragWindow(e); } }}
    >
      <button className="absolute top-4 right-4 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors" onClick={onClose}><X className="w-5 h-5" /></button>
      <motion.img 
        initial={{ opacity: 0, scale: 1 }} 
        animate={{ scale, opacity: 1 }} 
        transition={{ type: 'tween', duration: 0.2, ease: "easeOut" }} 
        src={url} drag dragMomentum={false} 
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl cursor-grab active:cursor-grabbing" 
        style={{ imageRendering: '-webkit-optimize-contrast' }}
        onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => { e.stopPropagation(); setScale(1); }} onContextMenu={(e) => e.preventDefault()} onMouseDown={(e) => { if (e.button === 2) { e.stopPropagation(); onDragWindow(e); } }} 
      />
    </motion.div>
  );
}

export function VideoPreviewer({ videoInfo, width, onClose, onDragWindow, showToast }: any) {
  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
      className="absolute inset-y-0 right-0 z-[99999] bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-6 rounded-l-[24px] pointer-events-auto overflow-hidden" 
      style={{ width }} onClick={onClose}
      onMouseDown={(e) => { if (e.button === 2) { e.stopPropagation(); onDragWindow(e); } }}
    >
      <button className="absolute top-4 right-4 z-10 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors" onClick={onClose}><X className="w-5 h-5" /></button>
      <video 
        src={videoInfo.url} controls autoPlay 
        onError={() => {
          showToast('🎬 编码不兼容(如H.265)，已自动唤起系统播放器');
          // 🌟 Tauri 化：调用系统默认播放器打开
          if (videoInfo.path) {
            invoke('open_file', { path: videoInfo.path }).catch(()=>{});
          }
          onClose(); 
        }}
        className="max-w-full max-h-full rounded-lg shadow-2xl outline-none bg-black" 
        onClick={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()} 
        onMouseDown={(e) => { if (e.button === 2) { e.stopPropagation(); onDragWindow(e); } }} 
      />
    </motion.div>
  );
}