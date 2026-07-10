import { useEffect, useRef, type MouseEvent } from 'react';
import { ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react';
import {
  IMAGE_RULE_DEFINITIONS,
  IMAGE_RULE_KEYS,
  type ImageRuleKey,
  type ImageRuleState,
} from '../../appAgent/imageQuality/imageRuleCapsules';

type ImageRuleSwitchPanelProps = {
  rules: ImageRuleState;
  expanded: boolean;
  onToggle: (key: ImageRuleKey) => void;
  onToggleExpanded: () => void;
};

export const ImageRuleSwitchPanel = ({
  rules,
  expanded,
  onToggle,
  onToggleExpanded,
}: ImageRuleSwitchPanelProps) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!expanded) return undefined;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || panelRef.current?.contains(target)) return;
      onToggleExpanded();
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown, true);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true);
  }, [expanded, onToggleExpanded]);

  const handleTogglePanel = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleExpanded();
  };

  const handleBlankCollapse = (event: MouseEvent<HTMLElement>) => {
    if (event.currentTarget !== event.target) return;
    event.preventDefault();
    event.stopPropagation();
    onToggleExpanded();
  };

  if (!expanded) {
    return (
      <div
        ref={panelRef}
        data-no-drag="true"
        className="relative z-[110] flex h-full min-h-0 shrink-0 flex-col rounded-[14px] border border-stone-950/[0.055] bg-white/58 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-white/[0.075] dark:bg-white/[0.045]"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
        onWheel={(event) => event.stopPropagation()}
      >
        <button
          data-no-drag="true"
          type="button"
          title="展开图像规则"
          className="flex h-full w-full min-w-0 flex-col items-center justify-center gap-2 rounded-[10px] text-stone-400 transition-colors hover:bg-stone-950/[0.035] hover:text-cyan-600 dark:text-white/34 dark:hover:bg-white/[0.055] dark:hover:text-cyan-100"
          onPointerDown={(event) => event.stopPropagation()}
          onMouseDown={(event) => event.stopPropagation()}
          onClick={handleTogglePanel}
        >
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
          <span className="text-[10px] font-black leading-3 [writing-mode:vertical-rl]">规则</span>
        </button>
      </div>
    );
  }

  return (
    <div
      ref={panelRef}
      data-no-drag="true"
      className="relative z-[110] flex h-full min-h-0 shrink-0 overflow-hidden rounded-[14px] border border-stone-950/[0.055] bg-white/58 shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] dark:border-white/[0.075] dark:bg-white/[0.045]"
      onPointerDown={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <div
        className="flex min-w-0 flex-1 flex-col px-3 py-2"
        onClick={handleBlankCollapse}
      >
        <div className="mb-2 flex h-5 w-full shrink-0 items-center gap-1.5 text-[11px] font-black text-stone-600 dark:text-white/70">
          <SlidersHorizontal className="h-3.5 w-3.5 shrink-0 text-cyan-500 dark:text-cyan-200" />
          <span className="min-w-0 flex-1 truncate">图像规则</span>
        </div>
        <div
          data-canvas-wheel-scroll="true"
          className="grid min-h-0 flex-1 content-start gap-1.5 overflow-y-auto pr-1"
          onClick={handleBlankCollapse}
        >
          {IMAGE_RULE_KEYS.map((key) => {
            const definition = IMAGE_RULE_DEFINITIONS[key];
            const enabled = rules[key] === true;

            return (
              <div
                key={key}
                data-no-drag="true"
                title={definition.description}
                className="flex h-8 min-w-0 items-center justify-between gap-2 rounded-[9px] bg-stone-950/[0.035] pl-2.5 pr-2 text-[11px] font-black text-stone-500 transition-colors hover:bg-stone-950/[0.055] dark:bg-black/14 dark:text-white/48 dark:hover:bg-white/[0.06]"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <span className="min-w-0 flex-1 truncate text-left">{definition.label}</span>
                <button
                  data-no-drag="true"
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={definition.label}
                  className={`relative h-[18px] w-9 shrink-0 appearance-none rounded-full border-0 p-0 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-cyan-300/60 ${
                    enabled ? 'bg-cyan-500/80 dark:bg-cyan-300/78' : 'bg-stone-300/70 dark:bg-white/16'
                  }`}
                  onPointerDown={(event) => event.stopPropagation()}
                  onMouseDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onToggle(key);
                  }}
                >
                  <span
                    className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                      enabled ? 'translate-x-[18px]' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      <button
        data-no-drag="true"
        type="button"
        title="收起图像规则"
        className="flex h-full w-[30px] shrink-0 flex-col items-center justify-center gap-2 border-l border-stone-950/[0.055] text-stone-400 transition-colors hover:bg-stone-950/[0.035] hover:text-cyan-600 dark:border-white/[0.075] dark:text-white/34 dark:hover:bg-white/[0.055] dark:hover:text-cyan-100"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={handleTogglePanel}
      >
        <ChevronLeft className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[10px] font-black leading-3 [writing-mode:vertical-rl]">规则</span>
      </button>
    </div>
  );
};
