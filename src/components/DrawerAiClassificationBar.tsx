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
      data-ai-classification-bar="true"
      className="z-10 shrink-0 border-b border-stone-200 bg-white px-3 py-2.5 dark:border-stone-800 dark:bg-stone-950"
      onMouseDown={event => event.stopPropagation()}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold text-stone-700 dark:text-stone-200">
          <Sparkles className="h-3.5 w-3.5" /> AI 分类
        </span>
        <div className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-[10px] border border-stone-200 bg-stone-100 p-1 dark:border-stone-700 dark:bg-stone-900">
          {AI_CLASSIFICATION_DIMENSIONS.map(option => (
            <button
              key={option.id}
              type="button"
              aria-pressed={dimension === option.id}
              onClick={() => {
                onDimensionChange(option.id);
                onLabelChange('all');
              }}
              className={`h-7 truncate rounded-[7px] px-2 text-[10px] font-semibold transition-colors ${dimension === option.id ? 'bg-stone-900 text-white shadow-sm dark:bg-stone-100 dark:text-stone-950' : 'text-stone-500 hover:bg-white hover:text-stone-900 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100'}`}
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
          className={`flex h-7 shrink-0 items-center gap-1 rounded-[8px] border px-2.5 text-[10px] font-semibold transition-colors ${activeLabel === 'all' ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950' : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:bg-stone-100 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100'}`}
        >
          全部 <span className="opacity-70">{total}</span>
        </button>
        {groups.map(group => (
          <button
            key={group.label}
            type="button"
            aria-pressed={activeLabel === group.label}
            onClick={() => onLabelChange(group.label)}
            className={`flex h-7 shrink-0 items-center gap-1 rounded-[8px] border px-2.5 text-[10px] font-semibold transition-colors ${activeLabel === group.label ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950' : 'border-stone-200 bg-white text-stone-500 hover:border-stone-300 hover:bg-stone-100 hover:text-stone-900 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-400 dark:hover:bg-stone-900 dark:hover:text-stone-100'}`}
          >
            {group.label} <span className="opacity-65">{group.count}</span>
          </button>
        ))}
      </div>
    </div>
  );
});
