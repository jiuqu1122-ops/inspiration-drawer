import { Download, Music } from 'lucide-react';
import type { BufferItem } from '../types';

export function CanvasAudioContent({ item, source, onDownload }: { item: BufferItem; source: string; onDownload?: () => void }) {
  return <section aria-label="音频节点" className="flex h-full w-full flex-col overflow-hidden rounded-[18px] border border-stone-200/70 bg-white/90 text-stone-700 shadow-[0_8px_22px_rgba(15,23,42,0.08)] dark:border-white/[0.08] dark:bg-stone-900/92 dark:text-white/80">
    <header className="flex items-center gap-2 pb-1 pl-3 pr-12 pt-3">
      <Music className="h-4 w-4 shrink-0 text-stone-500 dark:text-white/60" />
      <span className="min-w-0 flex-1 truncate text-[12px] font-semibold" title={item.name || item.content}>{item.name || item.content || '音频'}</span>
      {onDownload && <button type="button" data-no-drag="true" aria-label="下载音频" title="下载音频" onPointerDown={event => event.stopPropagation()} onClick={onDownload} className="rounded p-1 text-stone-400 hover:text-stone-800 dark:hover:text-white"><Download className="h-3.5 w-3.5" /></button>}
    </header>
    <div data-no-drag="true" className="flex min-h-0 flex-1 items-center px-3 pb-3" onPointerDown={event => event.stopPropagation()}>
      {source ? <audio controls preload="metadata" aria-label={`试听 ${item.name || '音频'}`} src={source} className="h-9 w-full [color-scheme:light] dark:[color-scheme:dark]" /> : <p className="text-[11px] text-stone-400">音频地址不可用</p>}
    </div>
  </section>;
}
