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
    <div data-drawer-organization-panel="true" className="rounded-[12px] border border-stone-200 bg-white p-2.5 dark:border-stone-700 dark:bg-stone-900">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] font-black text-stone-700 dark:text-stone-200">
          <Sparkles className="h-3.5 w-3.5 text-stone-500" /> 素材分类方式
        </span>
        <span className="text-[9px] font-medium text-stone-400 dark:text-stone-500">不改文件夹</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-[10px] border border-stone-200 bg-stone-100 p-1 dark:border-stone-700 dark:bg-stone-950">
        <button
          type="button"
          aria-pressed={classificationView === 'folders'}
          onClick={() => selectView('folders')}
          className={`h-8 rounded-[7px] text-[10px] font-semibold transition-colors ${classificationView === 'folders' ? 'bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-950' : 'text-stone-500 hover:bg-white hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'}`}
        >
          文件夹
        </button>
        <button
          type="button"
          aria-pressed={classificationView === 'ai'}
          onClick={() => selectView('ai')}
          className={`h-8 rounded-[7px] text-[10px] font-semibold transition-colors ${classificationView === 'ai' ? 'bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-950' : 'text-stone-500 hover:bg-white hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'}`}
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
