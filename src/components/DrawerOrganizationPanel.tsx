import React from 'react';
import { Sparkles } from 'lucide-react';

export type DrawerClassificationView = 'folders' | 'ai';

type DrawerOrganizationPanelProps = {
  classificationView: DrawerClassificationView;
  onChange: (view: DrawerClassificationView) => void;
  onResetLabel: () => void;
  onToast: (message: string) => void;
};

export const DrawerOrganizationPanel = React.memo(function DrawerOrganizationPanel({
  classificationView,
  onChange,
  onResetLabel,
  onToast,
}: DrawerOrganizationPanelProps) {
  const selectView = (view: DrawerClassificationView) => {
    onChange(view);
    onResetLabel();
    onToast(view === 'ai' ? '已开启 AI 分类视图，原文件夹保持不变' : '已切回原文件夹分类');
  };

  return (
    <div className="rounded-[16px] border border-violet-100 bg-violet-50/45 p-2.5 dark:border-violet-400/20 dark:bg-violet-400/8">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-black text-stone-700 dark:text-stone-200">
          <Sparkles className="h-3.5 w-3.5 text-violet-500" /> 素材分类方式
        </span>
        <span className="text-[9px] font-bold text-violet-500 dark:text-violet-300">不改文件夹</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-[12px] border border-white/80 bg-white/70 p-1 shadow-sm dark:border-stone-700/70 dark:bg-stone-900/45">
        <button
          type="button"
          aria-pressed={classificationView === 'folders'}
          onClick={() => selectView('folders')}
          className={`h-8 rounded-[9px] text-[10px] font-black transition-all ${classificationView === 'folders' ? 'bg-stone-900 text-white shadow-sm dark:bg-white dark:text-stone-900' : 'text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-200'}`}
        >
          文件夹
        </button>
        <button
          type="button"
          aria-pressed={classificationView === 'ai'}
          onClick={() => selectView('ai')}
          className={`h-8 rounded-[9px] text-[10px] font-black transition-all ${classificationView === 'ai' ? 'bg-violet-500 text-white shadow-sm shadow-violet-500/20' : 'text-stone-400 hover:bg-violet-50 hover:text-violet-600 dark:text-stone-500 dark:hover:bg-violet-400/10 dark:hover:text-violet-200'}`}
        >
          AI 分类
        </button>
      </div>
      <p className="mt-2 text-[9px] leading-4 text-stone-400 dark:text-stone-500">
        AI 分类只按分析标签筛选当前文件夹内容，不移动素材、不新建组合目录。
      </p>
    </div>
  );
});
