import React from 'react';
import { motion } from "framer-motion";
import { X, Film, Type, FolderOpen } from 'lucide-react';
// 🌟 引入 Tauri 核心 API
import { invoke } from '@tauri-apps/api/core';

export function SystemQuickAccessIcon({ title, icon, path }: { title: string, icon: React.ReactNode, path: string }) {
  const handleOpen = (e: React.MouseEvent) => { 
    // 🌟 拦截事件冒泡，防止点击穿透导致抽屉乱动
    e.preventDefault();
    e.stopPropagation();
    // Tauri 化：调用后端打开路径
    invoke('open_file', { path }).catch(()=>{}); 
  };
  
  return (
    <div className="relative shrink-0 flex flex-col items-center w-full">
      <div className="relative mb-1">
        <button onClick={handleOpen} title={`打开${title}`} className="w-10 h-10 bg-white/60 dark:bg-stone-800/60 rounded-[10px] shadow-sm border border-stone-200/50 dark:border-stone-700/50 flex items-center justify-center hover:bg-white dark:hover:bg-stone-700 hover:shadow-md transition-all hover:scale-105 active:scale-95">{icon}</button>
      </div>
      <span className="text-[10px] text-stone-500 dark:text-stone-400 w-14 text-center truncate px-0.5 cursor-default pb-1" title={title}>{title}</span>
    </div>
  );
}

export function QuickAccessIcon({ item, onRemove, onImageClick }: any) {
  const handleOpen = (e: React.MouseEvent) => {
    // 🌟 拦截事件冒泡
    e.preventDefault();
    e.stopPropagation();
    
    if (item.type === 'image') {
      onImageClick(item.url); 
    } else if (item.path) {
      // Tauri 化：打开本地文件
      invoke('open_file', { path: item.path }).catch(()=>{}); 
    } else if (item.type === 'text') {
      navigator.clipboard.writeText(item.content); 
    }
  };

  const renderContent = () => {
    if (item.thumbnail) return <img src={item.thumbnail} className="w-full h-full object-cover rounded-[10px]" />;
    if ((item.type === 'image' || item.type === 'video') && item.url) return <img src={item.url} className="w-full h-full object-cover rounded-[10px]" />;
    if (item.type === 'video') return <Film className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />;
    if (item.type === 'text') return <Type className="w-5 h-5 text-stone-500 dark:text-stone-400" />;
    return <FolderOpen className="w-5 h-5 fill-amber-400/20 text-amber-500" />;
  };

  let displayName = item.name || '未命名';
  if (item.type === 'text' && displayName === '文本片段') displayName = item.content.slice(0, 4); 
  else displayName = displayName.replace(/\.[^/.]+$/, "");

  return (
    <motion.div layout transition={{ type: 'tween', duration: 0.15, ease: "easeOut" }} initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} className="relative group/qa shrink-0 flex flex-col items-center w-full">
      <div className="relative mb-1">
        <button onClick={handleOpen} title={item.name || '快速访问'} className="w-10 h-10 bg-white/60 dark:bg-stone-800/60 rounded-[10px] shadow-sm border border-stone-200/50 dark:border-stone-700/50 flex items-center justify-center hover:bg-white dark:hover:bg-stone-700 hover:shadow-md transition-all hover:scale-105 active:scale-95">
          {renderContent()}
        </button>
        <button 
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(e); }} 
          title="取消星标" 
          className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-stone-800 text-white rounded-full flex items-center justify-center opacity-0 group-hover/qa:opacity-100 transition-opacity shadow-sm z-10 hover:bg-red-500"
        ><X className="w-2.5 h-2.5" /></button>
      </div>
      <span className="text-[10px] text-stone-500 dark:text-stone-400 w-14 text-center truncate px-0.5 cursor-default pb-1" title={item.name}>{displayName}</span>
    </motion.div>
  );
}
