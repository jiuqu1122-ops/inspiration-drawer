export function ThreeReferenceOverlay({
  source,
  opacity,
  guides,
}: {
  source: string;
  opacity: number;
  guides: boolean;
}) {
  return (
    <div
      data-three-reference-overlay="true"
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
    >
      <img
        src={source}
        alt=""
        draggable={false}
        className="h-full w-full object-contain"
        style={{ opacity: Math.min(1, Math.max(0, opacity)) }}
      />
      {guides && (
        <div className="absolute inset-0 text-stone-900/28 dark:text-white/34">
          <span className="absolute inset-y-0 left-1/3 w-px bg-current" />
          <span className="absolute inset-y-0 left-2/3 w-px bg-current" />
          <span className="absolute inset-x-0 top-1/3 h-px bg-current" />
          <span className="absolute inset-x-0 top-2/3 h-px bg-current" />
          <span className="absolute left-1/2 top-1/2 h-5 w-px -translate-x-1/2 -translate-y-1/2 bg-current" />
          <span className="absolute left-1/2 top-1/2 h-px w-5 -translate-x-1/2 -translate-y-1/2 bg-current" />
        </div>
      )}
    </div>
  );
}
