import type React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ArrowUpRight, Download, LoaderCircle, Music, Play, Plus } from 'lucide-react';
import { RoundedSelect } from '../components/RoundedSelect';
import { CANVAS_AI_NODE_CHEVRON_CLASS, CANVAS_AI_NODE_SELECT_ACTIVE_CLASS, CANVAS_AI_NODE_SELECT_MENU_CLASS, CANVAS_AI_NODE_SELECT_OPTION_CLASS, CANVAS_AI_NODE_TEXT_SELECT_CLASS } from '../components/canvasAiNodeControlStyles';
import { createCanvasAiClientRequestId } from './canvasAiRunGuard';
import type { AiCatalogModel } from '../types/license';
import type { CanvasAiGeneratedOutput, CanvasAiItemData, CanvasImageItem } from './canvasModel';
import { estimateCanvasMusicGenerationCredits, type CanvasAiCreditPricing } from './canvasGenerationCredits';

export async function generateCanvasMusic(target: CanvasImageItem, options: {
  updateAi: (patch: Partial<CanvasAiItemData>, content?: string) => void;
  forceUpdateAi?: (patch: Partial<CanvasAiItemData>, content?: string) => void;
  sourceItems?: () => CanvasImageItem[];
  clientRequestId?: string;
}) {
  const update = options.forceUpdateAi || options.updateAi;
  const prompt = [target.ai?.prompt, ...(options.sourceItems?.() || []).filter(item => target.inputs?.includes(item.id) && item.item.type === 'text').map(item => item.item.content)].filter(Boolean).join('\n\n').trim();
  if (!target.ai?.musicClientRequestId && (!prompt || !target.ai?.model)) { update({ status: 'error', error: '请选择音乐模型并输入音乐描述' }); return []; }
  const recovering = Boolean(target.ai?.musicClientRequestId);
  const clientRequestId = target.ai?.musicClientRequestId || options.clientRequestId || createCanvasAiClientRequestId(target.id);
  update({ status: 'working', error: undefined, outputs: [], musicClientRequestId: clientRequestId, musicChargedCredits: undefined });
  try {
    type MusicResult = { audioUrls?: string[]; assets?: Array<{ url: string; name?: string }>; chargedCredits?: string; status?: string };
    const result = recovering
      ? await invoke<MusicResult>('get_cloud_music_generation_by_request', { clientRequestId })
      : await invoke<MusicResult>('generate_cloud_music', { request: { clientRequestId, model: target.ai?.model, prompt } });
    if (!result.audioUrls?.length) {
      if (result.status === 'failed') {
        update({ musicClientRequestId: undefined });
        throw new Error('音乐生成已失败，可以重新生成');
      }
      throw new Error('音乐结果尚未确认，请稍后恢复结果；不会重复提交生成请求');
    }
    const outputs: CanvasAiGeneratedOutput[] = result.audioUrls.map((url, index) => ({
      id: `${clientRequestId}-${index}`, clientRequestId, assetType: 'audio', url, sourceUrl: url,
      name: result.assets?.[index]?.name || `音乐 ${index + 1}.${url.match(/\.(mp3|wav|ogg|m4a|aac|flac|opus)(?:[?#]|$)/i)?.[1] || 'mp3'}`, status: 'success', generatedAt: Date.now(),
    }));
    if (!outputs.length) throw new Error('音乐服务没有返回音频资产');
    update({ status: 'success', outputs, generatedAt: Date.now(), musicClientRequestId: undefined, musicChargedCredits: result.chargedCredits });
    return outputs;
  } catch (error) {
    const message = String(error);
    if (/music_provider_rejected|insufficient_credits|MODEL_ROUTE_NOT_AVAILABLE|invalid_request|audio_storage_unavailable|not_found/.test(message)) update({ musicClientRequestId: undefined });
    update({ status: 'error', error: message.includes('music_storage_pending') ? '音乐已生成，音频保存暂未完成。点击「恢复结果」继续保存，无需重复生成。' : message });
    return [];
  }
}

export function getCanvasMusicDownloadUrl(source: string) {
  try {
    const url = new URL(source);
    if (/^\/v1\/ai\/audio-results\/[a-f0-9]{64}\.(mp3|wav|ogg|m4a|aac|flac|opus)$/.test(url.pathname)) url.searchParams.set('download', '1');
    return url.toString();
  } catch { return source; }
}

export function CanvasMusicNode({ item, catalog, pricing, onCopyOutput, update, onRun, onDrag, onConnect, selected = false, menuScale = 1, onPointerEnter, onPointerLeave, onContextMenu }: {
  item: CanvasImageItem; catalog: AiCatalogModel[];
  pricing?: CanvasAiCreditPricing | null;
  onCopyOutput?: (output: CanvasAiGeneratedOutput, index: number) => void;
  update: (patch: Partial<CanvasAiItemData>) => void;
  onRun: (event: React.MouseEvent) => void;
  onDrag: (event: React.PointerEvent) => void;
  onConnect: (event: React.PointerEvent) => void;
  selected?: boolean;
  menuScale?: number;
  onPointerEnter?: () => void;
  onPointerLeave?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
}) {
  const working = item.ai?.status === 'working';
  const estimate = estimateCanvasMusicGenerationCredits(item.ai?.model, pricing);
  const creditLabel = estimate.available ? `${estimate.totalCredits} 积分/次` : estimate.reason === 'pricing_loading' ? '价格加载中' : '价格待同步';
  const chargedCredits = item.ai?.musicChargedCredits?.trim() ? Number(item.ai.musicChargedCredits) : NaN;
  const outputs = (item.ai?.outputs || []).filter(output => output.assetType === 'audio' && output.url);
  const scale = Math.max(0.1, Math.min(item.width / 400, item.height / 320));
  const statusLabel = working ? '生成中' : item.ai?.status === 'error' ? '生成失败' : outputs.length ? `${outputs.length} 首已完成${Number.isFinite(chargedCredits) && chargedCredits >= 0 ? ` · 扣费 ${chargedCredits} 积分` : ''}` : '待机';
  const disabled = working || (!item.ai?.musicClientRequestId && (!catalog.some(model => model.id === item.ai?.model) || (!item.ai?.prompt?.trim() && !item.inputs?.length)));
  return <div data-canvas-item-id={item.id} data-canvas-selected-state={selected ? 'true' : undefined}
    className="group/canvas-item absolute isolate overflow-visible"
    style={{ left: item.x, top: item.y, width: item.width, height: item.height, zIndex: selected ? 2 : 0, touchAction: 'none' }}
    onPointerDown={onDrag} onPointerEnter={onPointerEnter} onPointerLeave={onPointerLeave} onContextMenu={onContextMenu}>
    <section aria-label="音乐生成节点" className="flex flex-col overflow-hidden rounded-[20px] border border-white/80 bg-gradient-to-br from-white/88 via-white/76 to-stone-100/72 text-stone-800 shadow-[0_8px_22px_rgba(15,23,42,0.08)] backdrop-blur-2xl dark:border-white/[0.08] dark:from-[#272727]/96 dark:via-[#222222]/96 dark:to-[#1d1d1d]/96 dark:text-white"
      style={{ width: item.width / scale, height: item.height / scale, transform: `scale(${scale})`, transformOrigin: 'left top' }}>
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-4">
        <div className="flex items-center gap-2 text-[12px] font-semibold"><Music className="h-4 w-4 text-stone-500 dark:text-white/60" /><span>音乐生成</span></div>
        <span role="status" className={`text-[10px] font-medium ${item.ai?.status === 'error' ? 'text-red-600 dark:text-red-300' : outputs.length ? 'text-emerald-700 dark:text-emerald-300' : 'text-stone-400 dark:text-white/45'}`}>{statusLabel}</span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-3">
        <div className={`flex ${outputs.length ? 'min-h-[64px]' : 'min-h-[96px]'} flex-1 flex-col rounded-[12px] bg-stone-950/[0.035] px-3 py-2.5 dark:bg-white/[0.045]`}>
          <label htmlFor={`music-prompt-${item.id}`} className="mb-1.5 text-[10px] font-semibold text-stone-400 dark:text-white/40">音乐描述</label>
          <textarea id={`music-prompt-${item.id}`} data-no-drag="true" data-canvas-wheel-scroll="true" aria-label="音乐描述" value={item.ai?.prompt || ''} onChange={event => update({ prompt: event.target.value })}
            placeholder="轻快的钢琴与弦乐，温暖、舒缓，适合作为视频配乐…"
            className="min-h-0 w-full flex-1 resize-none border-0 bg-transparent text-[12px] leading-relaxed text-stone-700 outline-none placeholder:text-stone-400 focus-visible:ring-1 focus-visible:ring-stone-400/40 dark:text-white/80 dark:placeholder:text-white/30" />
        </div>
        {item.ai?.error && <p role="alert" data-no-drag="true" className="max-h-14 shrink-0 overflow-auto text-[11px] leading-relaxed text-red-600 dark:text-red-300">{item.ai.error}</p>}
        {working && <div role="status" className="flex shrink-0 items-center gap-2 text-[11px] text-stone-400 dark:text-white/45"><LoaderCircle className="h-3.5 w-3.5 animate-spin" />正在创作音乐，完成后可试听与下载</div>}
        {outputs.length > 0 && <div data-no-drag="true" data-canvas-wheel-scroll="true" aria-label="生成的音乐" className="max-h-[140px] shrink-0 space-y-3 overflow-y-auto">
          {outputs.map((output, index) => <div key={output.id} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px]"><span className="truncate font-medium">{output.name || `音乐 ${index + 1}`}</span>
              {onCopyOutput && <button type="button" aria-label={`将音乐 ${index + 1} 放到画布`} onClick={() => onCopyOutput(output, (item.ai?.outputs || []).findIndex(candidate => candidate.id === output.id))} className="ml-auto flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-stone-500 hover:text-stone-800 dark:text-white/60 dark:hover:text-white"><Plus className="h-3 w-3" />放到画布</button>}
              <a href={getCanvasMusicDownloadUrl(output.url!)} download={output.name} target="_blank" rel="noreferrer" title="下载音频" className="flex shrink-0 items-center gap-1 rounded px-1 py-0.5 text-stone-400 transition-colors hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 dark:text-white/45 dark:hover:text-white"><Download className="h-3 w-3" />下载</a></div>
            <audio controls preload="metadata" aria-label={`试听音乐 ${index + 1}`} src={output.url} className="h-9 w-full [color-scheme:light] dark:[color-scheme:dark]" />
          </div>)}
        </div>}
        {!working && !outputs.length && !item.ai?.error && <p className="shrink-0 text-[10px] text-stone-400 dark:text-white/40">支持连接文字节点，也可将生成音乐用作视频参考</p>}
      </div>
      <footer data-no-drag="true" className="flex shrink-0 items-center gap-1 border-t border-stone-200/60 px-3 py-2 dark:border-white/[0.06]">
        <RoundedSelect data-no-drag="true" aria-label="音乐模型" value={catalog.some(model => model.id === item.ai?.model) ? item.ai!.model! : ''}
          options={[{ value: '', label: catalog.length ? '选择音乐模型' : '暂无音乐模型', disabled: true }, ...catalog.map(model => ({ value: model.id, label: model.displayName }))]}
          onChange={model => update({ model })} disabled={working || !catalog.length} menuScale={menuScale * scale}
          className={`${CANVAS_AI_NODE_TEXT_SELECT_CLASS} max-w-[140px] min-w-0 flex-1 !justify-start !font-semibold`}
          labelClassName="truncate" chevronClassName={CANVAS_AI_NODE_CHEVRON_CLASS} menuClassName={CANVAS_AI_NODE_SELECT_MENU_CLASS} optionClassName={CANVAS_AI_NODE_SELECT_OPTION_CLASS} selectedOptionClassName={CANVAS_AI_NODE_SELECT_ACTIVE_CLASS} />
        <button type="button" title="连接音频参考" aria-label="连接音频参考" onPointerDown={onConnect} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-stone-400 transition-colors hover:bg-stone-950/[0.04] hover:text-stone-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 dark:text-white/45 dark:hover:bg-white/[0.07] dark:hover:text-white"><ArrowUpRight className="h-3.5 w-3.5" /></button>
        <span aria-label="预计音乐积分" title={estimate.available ? '按每次请求计费，生成多段音乐仅计费一次' : '音乐售价暂未同步，请刷新模型列表'} className="shrink-0 text-[10px] text-stone-400 dark:text-white/45">{creditLabel}</span>
        <button type="button" data-canvas-run-control="true" disabled={disabled} onClick={onRun} className="ml-auto flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-2.5 text-[12px] font-semibold text-stone-600 transition-colors hover:bg-stone-950/[0.05] hover:text-stone-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 disabled:cursor-not-allowed disabled:opacity-40 dark:text-white/70 dark:hover:bg-white/[0.07] dark:hover:text-white">
          <Play className={`h-3.5 w-3.5 fill-current ${working ? 'animate-pulse' : ''}`} />{working ? '生成中…' : item.ai?.musicClientRequestId ? '恢复结果' : outputs.length ? '再次生成' : '生成音乐'}
        </button>
      </footer>
    </section>
  </div>;
}
