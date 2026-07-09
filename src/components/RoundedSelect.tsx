import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Plus, Settings2 } from 'lucide-react';

type RoundedSelectOption = {
  value: string;
  label: string;
  hint?: string;
  meta?: string;
  section?: string;
  sectionHint?: string;
  kind?: 'default' | 'action';
  hiddenInMenu?: boolean;
};

type RoundedSelectProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'value' | 'onChange' | 'className' | 'title'> & {
  value: string;
  options: RoundedSelectOption[];
  onChange: (value: string) => void;
  className?: string;
  menuClassName?: string;
  optionClassName?: string;
  selectedOptionClassName?: string;
  icon?: React.ReactNode;
  hideLabel?: boolean;
  labelClassName?: string;
  chevronClassName?: string;
  title?: string;
  menuMinWidth?: number;
  menuScale?: number;
  menuPlacement?: 'auto' | 'left';
  revealLabelOnHover?: boolean;
  collapsedLabel?: string;
  expandedLabel?: string;
};

function RoundedSelect({
  value,
  options,
  onChange,
  className = '',
  menuClassName = '',
  optionClassName = '',
  selectedOptionClassName = '',
  icon,
  hideLabel = false,
  labelClassName = '',
  chevronClassName = '',
  title,
  menuMinWidth,
  menuScale = 1,
  menuPlacement = 'auto',
  revealLabelOnHover = false,
  collapsedLabel,
  expandedLabel,
  ...buttonProps
}: RoundedSelectProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const selected = options.find(option => option.value === value) || options[0];

  const updateMenuPosition = () => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const scale = Math.max(0.2, Number(menuScale) || 1);
    const minWidth = Math.max(menuMinWidth || 0, rect.width);
    const visualMinWidth = minWidth * scale;
    const estimatedHeight = Math.min(380, Math.max(56, options.length * 52 + 14));
    const visualEstimatedHeight = estimatedHeight * scale;
    if (menuPlacement === 'left') {
      const left = Math.max(8, rect.left - visualMinWidth - 8 * scale);
      const top = Math.min(
        Math.max(8, rect.top + rect.height / 2 - visualEstimatedHeight / 2),
        Math.max(8, window.innerHeight - visualEstimatedHeight - 8),
      );
      setMenuStyle({
        left,
        top,
        width: minWidth,
        minWidth,
        maxWidth: minWidth,
        maxHeight: Math.min(380, (window.innerHeight - 16) / scale),
        transform: scale === 1 ? undefined : `scale(${scale})`,
        transformOrigin: 'right center',
      });
      return;
    }

    const availableBelow = window.innerHeight - rect.bottom - 8 * scale;
    const openUp = availableBelow < visualEstimatedHeight && rect.top > availableBelow;
    const top = openUp
      ? Math.max(8, rect.top - visualEstimatedHeight - 6 * scale)
      : Math.min(window.innerHeight - 8, rect.bottom + 6 * scale);
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - visualMinWidth - 8),
    );

    setMenuStyle({
      left,
      top,
      minWidth,
      maxHeight: Math.min(380, (openUp ? rect.top - 14 : window.innerHeight - rect.bottom - 14) / scale),
      transform: scale === 1 ? undefined : `scale(${scale})`,
      transformOrigin: openUp ? 'left bottom' : 'left top',
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, options.length, menuScale, menuPlacement]);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const handleLayoutChange = () => updateMenuPosition();

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    window.addEventListener('resize', handleLayoutChange);
    window.addEventListener('scroll', handleLayoutChange, true);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      window.removeEventListener('resize', handleLayoutChange);
      window.removeEventListener('scroll', handleLayoutChange, true);
    };
  }, [open, menuScale, menuPlacement]);

  const hasSwappedLabel = !hideLabel && (collapsedLabel || expandedLabel);
  const labelClasses = hideLabel
    ? 'sr-only'
    : hasSwappedLabel
      ? `relative min-w-0 flex-1 truncate whitespace-nowrap ${labelClassName}`
    : revealLabelOnHover
      ? `min-w-0 flex-none truncate whitespace-nowrap max-w-0 opacity-0 transition-[max-width,opacity] duration-200 group-hover/rounded-select:max-w-[98px] group-hover/rounded-select:opacity-100 ${labelClassName}`
      : `min-w-0 flex-1 truncate ${labelClassName}`;
  const chevronClasses = `${chevronClassName || 'h-3.5 w-3.5'} shrink-0 transition-all ${open ? 'rotate-180' : ''} ${revealLabelOnHover ? 'max-w-0 opacity-0 group-hover/rounded-select:max-w-3 group-hover/rounded-select:opacity-100' : ''}`;
  const menuOptions = options.filter(option => !option.hiddenInMenu);
  const actionOptions = menuOptions.filter(option => option.kind === 'action');
  const regularOptions = menuOptions.filter(option => option.kind !== 'action');
  const renderOption = (option: RoundedSelectOption, index: number, list: RoundedSelectOption[]) => {
    const active = option.value === value;
    const showSection = option.section && option.section !== list[index - 1]?.section;
    const isAction = option.kind === 'action';
    const ActionIcon = /manage|管理/i.test(option.value + option.label) ? Settings2 : Plus;

    return (
      <React.Fragment key={option.value}>
        {showSection && (
          <div className="px-3 pb-1.5 pt-2.5 first:pt-1.5">
            <div className="flex items-baseline justify-between gap-3 border-b border-stone-100 pb-1.5 dark:border-white/8">
              <span className="text-[9px] font-black uppercase tracking-[0.12em] text-stone-400 dark:text-stone-500">{option.section}</span>
              {option.sectionHint && (
                <span className="min-w-0 truncate text-[9px] font-semibold text-stone-400/80 dark:text-stone-500/80">
                  {option.sectionHint}
                </span>
              )}
            </div>
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onChange(option.value);
            setOpen(false);
          }}
          className={`group/rounded-select-option flex w-full min-w-0 items-center gap-2.5 overflow-hidden rounded-[10px] px-2.5 py-2 text-left transition-colors ${
            active
              ? (selectedOptionClassName || 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900')
              : isAction
                ? 'text-stone-700 hover:bg-stone-100 dark:text-stone-200 dark:hover:bg-white/8'
                : 'hover:bg-stone-100/78 dark:hover:bg-white/8'
          } ${optionClassName}`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] border transition-colors ${
            active
              ? 'border-white/20 bg-white/14 text-current dark:border-stone-900/10 dark:bg-stone-900/10'
              : isAction
                ? 'border-stone-200 bg-white text-stone-500 group-hover/rounded-select-option:border-stone-300 dark:border-white/10 dark:bg-white/6 dark:text-stone-300'
                : 'border-stone-200/80 bg-stone-50 text-stone-400 group-hover/rounded-select-option:border-stone-300 dark:border-white/10 dark:bg-white/6 dark:text-stone-400'
          }`}>
            {active ? (
              <Check className="h-3.5 w-3.5" strokeWidth={2.7} />
            ) : isAction ? (
              <ActionIcon className="h-3.5 w-3.5" strokeWidth={2.4} />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
            )}
          </span>
          <span className="min-w-0 flex-1 overflow-hidden">
            <span className="block truncate text-[12px] font-black leading-4">{option.label}</span>
            {option.hint && (
              <span className={`mt-0.5 block truncate text-[10px] font-medium leading-4 ${
                active
                  ? 'text-current opacity-70'
                  : 'text-stone-400 dark:text-stone-500'
              }`}>
                {option.hint}
              </span>
            )}
          </span>
          {option.meta && (
            <span className={`shrink-0 rounded-[7px] px-1.5 py-0.5 text-[9px] font-black ${
              active
                ? 'bg-white/18 text-current dark:bg-stone-900/15'
                : 'bg-stone-100 text-stone-500 dark:bg-white/8 dark:text-stone-400'
            }`}>
              {option.meta}
            </span>
          )}
        </button>
      </React.Fragment>
    );
  };

  return (
    <>
      <button
        {...buttonProps}
        ref={buttonRef}
        type="button"
        title={title}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(prev => !prev);
        }}
        className={`inline-flex min-w-0 items-center transition-colors ${revealLabelOnHover || hasSwappedLabel ? 'group/rounded-select gap-0 overflow-hidden hover:gap-1.5' : 'gap-1.5'} ${className}`}
      >
        {icon}
        <span className={labelClasses}>
          {hasSwappedLabel ? (
            <>
              <span className="block truncate group-hover/rounded-select:hidden">{collapsedLabel || selected?.label || ''}</span>
              <span className="hidden truncate group-hover/rounded-select:block">{expandedLabel || selected?.label || ''}</span>
            </>
          ) : selected?.label || ''}
        </span>
        <ChevronDown className={chevronClasses} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          data-canvas-floating-layer="true"
          style={menuStyle}
          className={`fixed z-[1000000] overflow-y-auto overflow-x-hidden rounded-[14px] border border-stone-200/80 bg-white/97 p-1.5 text-[11px] font-bold text-stone-600 shadow-[0_18px_48px_rgba(15,23,42,0.18)] backdrop-blur-xl dark:border-stone-700/70 dark:bg-stone-950/97 dark:text-stone-200 ${menuClassName}`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <div className="grid gap-0.5">
            {regularOptions.map((option, index) => renderOption(option, index, regularOptions))}
          </div>
          {actionOptions.length > 0 && (
            <div className="mt-1.5 border-t border-stone-100 pt-1.5 dark:border-white/8">
              <div className="grid gap-0.5">
                {actionOptions.map((option, index) => renderOption(option, index, actionOptions))}
              </div>
            </div>
          )}
        </div>,
        document.body,
      )}
    </>
  );
}

export { RoundedSelect };
export type { RoundedSelectOption };
