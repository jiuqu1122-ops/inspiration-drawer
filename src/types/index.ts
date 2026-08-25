// src/types/index.ts
import { LucideIcon } from 'lucide-react';
import type { InspirationProfile } from '../features/appAgent/inspirationMemory/types';

export type Folder = { 
  id: string; 
  name: string; 
  color: string; 
  parentId?: string;
};

export type BufferItem = { 
  id: string; 
  type: 'text' | 'image' | 'file' | 'video'; 
  content: string; 
  name?: string; 
  path?: string; 
  url?: string; 
  thumbnail?: string; 
  fileSize?: number;
  modifiedAt?: number;
  fingerprint?: string;
  width?: number;
  height?: number;
  createdAt: number; 
  updatedAt?: number;
  importedAt?: number;
  rating?: number;
  isQuickAccess?: boolean; 
  remark?: string; 
  remarks?: string[];
  folderId?: string;
  sourceItemId?: string;

  // 扩展字段：用于文件夹、网址、网页图片来源和 AI 图片分析。
  isDirectory?: boolean;
  isUrl?: boolean;
  sourceUrl?: string;
  pageUrl?: string;
  originalUrl?: string;
  inspirationProfile?: InspirationProfile;
  inspirationAnalysisFailure?: {
    attemptedAt: number;
    attempts: number;
    message: string;
  };
};


export type FloatingNoteSnapshot = {
  id: string;
  itemId: string;
  type: BufferItem['type'];
  name?: string;
  content?: string;
  path?: string;
  url?: string;
  thumbnail?: string;
  folderId?: string;
  tagIds?: string[];
  noteColor?: string;
  noteMode?: 'text' | 'schedule';
  scheduleItems?: FloatingNoteScheduleItem[];
  createdAt: number;
  updatedAt?: number;
  zoom?: number;
  width?: number;
  height?: number;
  mediumWidth?: number;
  topmost?: boolean;
};

export type FloatingNoteScheduleItem = {
  id: string;
  text: string;
  done: boolean;
  priority?: 'S' | 'A' | 'B' | 'C';
  startAt?: number;
  endAt?: number;
  allDay?: boolean;
  tagIds?: string[];
  sourceItemId?: string;
  createdAt: number;
  updatedAt?: number;
};

export type TabItem = {
  id: 'all' | 'image' | 'text' | 'video' | 'file';
  label: string;
  icon: LucideIcon;
};

export type TabType = TabItem['id'];
