import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

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
    const availableBelow = window.innerHeight - rect.bottom - 8 * scale;
    const estimatedHeight = Math.min(320, Math.max(42, options.length * 46 + 8));
    const visualEstimatedHeight = estimatedHeight * scale;
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
      maxHeight: Math.min(320, (openUp ? rect.top - 14 : window.innerHeight - rect.bottom - 14) / scale),
      transform: scale === 1 ? undefined : `scale(${scale})`,
      transformOrigin: openUp ? 'left bottom' : 'left top',
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, options.length, menuScale]);

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
  }, [open, menuScale]);

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
          className={`fixed z-[1000000] overflow-y-auto rounded-[14px] border border-stone-200/80 bg-white/96 p-1 text-[11px] font-bold text-stone-600 shadow-xl shadow-black/10 backdrop-blur-xl dark:border-stone-700/70 dark:bg-stone-900/96 dark:text-stone-200 ${menuClassName}`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {menuOptions.map((option, index) => {
            const active = option.value === value;
            const showSection = option.section && option.section !== menuOptions[index - 1]?.section;
            return (
              <React.Fragment key={option.value}>
                {showSection && (
                  <div className="px-2.5 pb-1 pt-2 text-[9px] font-black uppercase tracking-wide text-stone-400 first:pt-1 dark:text-stone-500">
                    {option.section}
                    {option.sectionHint && (
                      <span className="ml-1 normal-case tracking-normal text-stone-400/80 dark:text-stone-500/80">
                        {option.sectionHint}
                      </span>
                    )}
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
                  className={`flex w-full items-center gap-2 rounded-[11px] px-2.5 py-2 text-left transition-colors ${
                    active
                      ? (selectedOptionClassName || 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900')
                      : option.kind === 'action'
                        ? 'text-amber-700 hover:bg-amber-50 dark:text-amber-200 dark:hover:bg-amber-400/10'
                        : 'hover:bg-stone-100/78 dark:hover:bg-stone-800'
                  } ${optionClassName}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{option.label}</span>
                    {option.hint && (
                      <span className={`mt-0.5 block truncate text-[10px] font-medium ${
                        active
                          ? 'text-current opacity-70'
                          : 'text-stone-400 dark:text-stone-500'
                      }`}>
                        {option.hint}
                      </span>
                    )}
                  </span>
                  {option.meta && (
                    <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                      active
                        ? 'bg-white/18 text-current dark:bg-stone-900/15'
                        : 'bg-stone-100 text-stone-400 dark:bg-white/8 dark:text-stone-500'
                    }`}>
                      {option.meta}
                    </span>
                  )}
                </button>
              </React.Fragment>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}

export { RoundedSelect };
export type { RoundedSelectOption };
