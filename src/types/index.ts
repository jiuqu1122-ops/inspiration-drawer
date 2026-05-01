// src/types/index.ts
import { LucideIcon } from 'lucide-react';

export type Folder = { 
  id: string; 
  name: string; 
  color: string; 
};

export type AlchemyState = 'raw' | 'analyzing' | 'alchemy' | 'error';

export type AlchemyResult = {
  title?: string;
  colors: string[];
  keywords: string[];
  form: string;
  cmf: string;
  summary?: string;
  borrow: string[];
  avoid: string[];
  materials: string[];
  analysisMode?: 'palette' | 'ai' | 'mock';
  colorSource?: string;
  apiStatus?: string;
  generatedAt?: number;
};

export type AlchemyData = {
  state: AlchemyState;
  note?: string;
  result?: AlchemyResult;
  createdAt?: number;
  analyzedAt?: number;
  error?: string;
};

export type BufferItem = { 
  id: string; 
  type: 'text' | 'image' | 'file' | 'video'; 
  content: string; 
  name?: string; 
  path?: string; 
  url?: string; 
  thumbnail?: string; 
  createdAt: number; 
  isQuickAccess?: boolean; 
  remark?: string; 
  folderId?: string;

  // 扩展字段：用于文件夹、网址、网页图片来源和 CMF 炼金卡。
  isDirectory?: boolean;
  isUrl?: boolean;
  sourceUrl?: string;
  pageUrl?: string;
  originalUrl?: string;
  alchemy?: AlchemyData;
};

export type TabItem = {
  id: 'all' | 'image' | 'text' | 'video' | 'file' | 'alchemy';
  label: string;
  icon: LucideIcon;
};

export type TabType = TabItem['id'];
