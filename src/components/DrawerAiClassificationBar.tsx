import React from 'react';
import { Sparkles } from 'lucide-react';
import {
  AI_CLASSIFICATION_DIMENSIONS,
  type AiClassificationDimension,
  type AiClassificationGroup,
} from '../features/aiClassification';

type DrawerAiClassificationBarProps = {
  dimension: AiClassificationDimension;
  activeLabel: string;
  total: number;
  groups: AiClassificationGroup[];
  onDimensionChange: (dimension: AiClassificationDimension) => void;
  onLabelChange: (label: string) => void;
};

export const DrawerAiClassificationBar = React.memo(function DrawerAiClassificationBar({
  dimension,
  activeLabel,
  total,
  groups,
  onDimensionChange,
  onLabelChange,
}: DrawerAiClassificationBarProps) {
  return (
    <div
      className="z-10 shrink-0 border-b border-violet-100/80 bg-violet-50/45 px-2.5 py-2 dark:border-violet-400/15 dark:bg-violet-400/8"
      onMouseDown={event => event.stopPropagation()}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-black text-violet-600 dark:text-violet-200">
          <Sparkles className="h-3.5 w-3.5" /> AI 分类
        </span>
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-[12px] border border-violet-100/90 bg-white/72 p-1 shadow-sm dark:border-violet-400/18 dark:bg-stone-900/48">
          {AI_CLASSIFICATION_DIMENSIONS.map(option => (
            <button
              key={option.id}
              type="button"
              aria-pressed={dimension === option.id}
              onClick={() => {
                onDimensionChange(option.id);
                onLabelChange('all');
              }}
              className={`h-7 truncate rounded-[9px] px-2 text-[10px] font-black transition-all ${dimension === option.id ? 'bg-violet-500 text-white shadow-sm shadow-violet-500/20' : 'text-stone-400 hover:bg-violet-50 hover:text-violet-600 dark:text-stone-500 dark:hover:bg-violet-400/10 dark:hover:text-violet-200'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2 flex w-full gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          aria-pressed={activeLabel === 'all'}
          onClick={() => onLabelChange('all')}
          className={`flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[10px] font-black transition-all ${activeLabel === 'all' ? 'border-violet-500 bg-violet-500 text-white shadow-sm' : 'border-violet-100 bg-white/75 text-stone-500 hover:border-violet-300 hover:text-violet-600 dark:border-violet-400/20 dark:bg-stone-900/45 dark:text-stone-400 dark:hover:text-violet-200'}`}
        >
          全部 <span className="opacity-70">{total}</span>
        </button>
        {groups.map(group => (
          <button
            key={group.label}
            type="button"
            aria-pressed={activeLabel === group.label}
            onClick={() => onLabelChange(group.label)}
            className={`flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[10px] font-black transition-all ${activeLabel === group.label ? 'border-stone-900 bg-stone-900 text-white shadow-sm dark:border-white dark:bg-white dark:text-stone-900' : 'border-stone-200/80 bg-white/75 text-stone-500 hover:border-violet-300 hover:text-violet-600 dark:border-stone-700 dark:bg-stone-900/45 dark:text-stone-400 dark:hover:border-violet-400/40 dark:hover:text-violet-200'}`}
          >
            {group.label} <span className="opacity-65">{group.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
