import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

type RoundedSelectOption = {
  value: string;
  label: string;
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
    const minWidth = Math.max(menuMinWidth || 0, rect.width);
    const availableBelow = window.innerHeight - rect.bottom - 8;
    const estimatedHeight = Math.min(240, Math.max(42, options.length * 34 + 8));
    const openUp = availableBelow < estimatedHeight && rect.top > availableBelow;
    const top = openUp
      ? Math.max(8, rect.top - estimatedHeight - 6)
      : Math.min(window.innerHeight - 8, rect.bottom + 6);
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - minWidth - 8),
    );

    setMenuStyle({
      left,
      top,
      minWidth,
      maxHeight: Math.min(240, openUp ? rect.top - 14 : window.innerHeight - rect.bottom - 14),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPosition();
  }, [open, options.length]);

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
  }, [open]);

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
        className={`inline-flex min-w-0 items-center gap-1.5 transition-colors ${className}`}
      >
        {icon}
        <span className={hideLabel ? 'sr-only' : `min-w-0 flex-1 truncate ${labelClassName}`}>{selected?.label || ''}</span>
        <ChevronDown className={`${chevronClassName || 'h-3.5 w-3.5'} shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          style={menuStyle}
          className={`fixed z-[1000000] overflow-y-auto rounded-[14px] border border-stone-200/80 bg-white/96 p-1 text-[11px] font-bold text-stone-600 shadow-xl shadow-black/10 backdrop-blur-xl dark:border-stone-700/70 dark:bg-stone-900/96 dark:text-stone-200 ${menuClassName}`}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {options.map(option => {
            const active = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center rounded-[10px] px-2.5 py-2 text-left transition-colors ${
                  active
                    ? (selectedOptionClassName || 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-900')
                    : 'hover:bg-stone-100/78 dark:hover:bg-stone-800'
                } ${optionClassName}`}
              >
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
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
