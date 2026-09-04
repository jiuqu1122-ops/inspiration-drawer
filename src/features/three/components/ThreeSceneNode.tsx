import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Camera,
  Grid3X3,
  Images,
  Plus,
  RefreshCw,
  RotateCcw,
  Settings2,
  Sun,
  X,
} from 'lucide-react';
import type { CanvasThreeSceneData, SceneSpecV1, ThreeSceneCameraState, ThreeVector3 } from '../model/threeSceneTypes';
import { updateThreeSceneCamera, updateThreeSceneEnvironment, updateThreeSceneMainLight } from '../model/threeSceneUpdates';
import type { ThreeSceneViewportApi } from '../renderer/ThreeSceneRenderer';
import { ThreeReferenceOverlay } from './ThreeReferenceOverlay';
import { ThreeSceneRenderBoundary } from './ThreeSceneRenderBoundary';
import './threeScene.css';

const LazyThreeSceneViewport = React.lazy(() => import('../renderer/ThreeSceneViewport'));

const stop = (event: React.SyntheticEvent) => event.stopPropagation();
const stopContextMenu = (event: React.SyntheticEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export type ThreeSceneReferencePreview = {
  id: string;
  name?: string;
  source?: string;
};

export function ThreeSceneNode({
  data,
  references,
  active,
  analyzing,
  onOpenReferences,
  onRemoveReference,
  onGenerate,
  onInteractionStart,
  onInteractionEnd,
  onSceneSpecChange,
  onPreviewChange,
  onOverlayChange,
  onCapture,
  onReanalyze,
}: {
  data: CanvasThreeSceneData;
  references: ThreeSceneReferencePreview[];
  active: boolean;
  analyzing: boolean;
  onOpenReferences: () => void;
  onRemoveReference: (id: string) => void;
  onGenerate: () => void | Promise<void>;
  onInteractionStart: (label: string) => void;
  onInteractionEnd: () => void;
  onSceneSpecChange: (sceneSpec: SceneSpecV1) => void;
  onPreviewChange: (dataUrl: string) => void;
  onOverlayChange: (patch: Partial<{ visible: boolean; opacity: number; guides: boolean }>) => void;
  onCapture: (dataUrl: string) => void | Promise<void>;
  onReanalyze: () => void | Promise<void>;
}) {
  const apiRef = useRef<ThreeSceneViewportApi | null>(null);
  const previewChangeRef = useRef(onPreviewChange);
  const previewFrameRef = useRef<number | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const status = analyzing ? 'working' : data.status || 'success';
  const overlay = data.referenceOverlay || { visible: true, opacity: 0.4, guides: false };
  const referenceSource = references[0]?.source;
  const hasScene = status === 'success'
    || (!!data.analysisCamera && status !== 'idle');
  useEffect(() => {
    if (!active) setInspectorOpen(false);
  }, [active]);
  useEffect(() => {
    previewChangeRef.current = onPreviewChange;
  }, [onPreviewChange]);
  useEffect(() => () => {
    if (previewFrameRef.current !== null) window.cancelAnimationFrame(previewFrameRef.current);
  }, []);
  const capturePreviewSoon = useCallback(() => {
    if (previewFrameRef.current !== null) window.cancelAnimationFrame(previewFrameRef.current);
    previewFrameRef.current = window.requestAnimationFrame(() => {
      previewFrameRef.current = null;
      const image = apiRef.current?.capture();
      if (image) previewChangeRef.current(image);
    });
  }, []);
  const handleViewportReady = useCallback((api: ThreeSceneViewportApi) => {
    apiRef.current = api;
    capturePreviewSoon();
  }, [capturePreviewSoon]);
  useEffect(() => {
    if (active && apiRef.current) capturePreviewSoon();
  }, [active, capturePreviewSoon, data.sceneSpec]);
  const mainLight = useMemo(
    () => data.sceneSpec.lights.find(light => light.type !== 'ambient'),
    [data.sceneSpec.lights],
  );
  const commitCamera = useCallback((camera: ThreeSceneCameraState) => {
    // The outer canvas snapshot is intentionally deferred until OrbitControls ends.
    // Capturing it on pointer-down stalls the first interactive frame on large boards.
    onInteractionStart('调整 3D 相机');
    onSceneSpecChange(updateThreeSceneCamera(data.sceneSpec, camera));
    onInteractionEnd();
    capturePreviewSoon();
  }, [capturePreviewSoon, data.sceneSpec, onInteractionEnd, onInteractionStart, onSceneSpecChange]);
  const setLightPosition = (axis: number, value: number) => {
    const position = [...(mainLight?.position || [4, 6, 4])] as ThreeVector3;
    position[axis] = value;
    onSceneSpecChange(updateThreeSceneMainLight(data.sceneSpec, { position }));
  };

  return (
    <section
      data-three-scene-node="true"
      data-three-scene-interactive={active ? 'true' : undefined}
      className="relative h-full w-full overflow-hidden rounded-[18px] border border-stone-200/80 bg-[#f4f4f3] text-stone-700 shadow-[0_8px_22px_rgba(15,23,42,0.08)] dark:border-white/[0.09] dark:bg-[#252525] dark:text-stone-100 dark:shadow-[0_10px_26px_rgba(0,0,0,0.20)]"
    >
      <div className="absolute inset-x-0 top-0 z-20 flex h-11 items-center gap-1.5 border-b border-black/[0.06] bg-white/84 px-3 backdrop-blur-xl dark:border-white/[0.07] dark:bg-[#222]/90">
        <span className="mr-auto flex min-w-0 items-center gap-2 text-[11px] font-black text-stone-700 dark:text-white/82">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-stone-900/[0.06] dark:bg-white/[0.08]">
            <Box className="h-3.5 w-3.5" />
          </span>
          <span className="truncate">3D 场景节点</span>
          <span className="rounded-[6px] bg-stone-900/[0.045] px-1.5 py-0.5 font-mono text-[9px] text-stone-400 dark:bg-white/[0.06] dark:text-white/38">
            {references.length}/8
          </span>
        </span>
        {hasScene && (
          <>
            <button
              data-no-drag="true"
              type="button"
              title="重置视角"
              disabled={!active}
              className="three-node-tool"
              onPointerDown={stop}
              onClick={(event) => {
                stop(event);
                const resetCamera = data.analysisCamera || data.sceneSpec.camera;
                onInteractionStart('重置 3D 视角');
                apiRef.current?.resetCamera(resetCamera);
                onSceneSpecChange(updateThreeSceneCamera(data.sceneSpec, resetCamera));
                onInteractionEnd();
                capturePreviewSoon();
              }}
            ><RotateCcw size={13} /></button>
            <button data-no-drag="true" type="button" title="生成当前视角图片" disabled={!active} className="three-node-tool" onPointerDown={stop} onClick={(event) => { stop(event); const image = apiRef.current?.capture(); if (image) void onCapture(image); }}><Camera size={13} /></button>
            <button data-no-drag="true" type="button" title="重新匹配原图" disabled={analyzing || references.length === 0} className="three-node-tool" onPointerDown={stop} onClick={(event) => { stop(event); void onReanalyze(); }}><RefreshCw size={13} className={analyzing ? 'animate-spin' : ''} /></button>
            <button data-no-drag="true" type="button" title="场景设置" disabled={!active} className={`three-node-tool ${inspectorOpen ? 'is-active' : ''}`} onPointerDown={stop} onClick={(event) => { stop(event); setInspectorOpen(value => !value); }}><Settings2 size={13} /></button>
          </>
        )}
      </div>

      {hasScene ? (
        <div
          data-no-drag={active ? 'true' : undefined}
          className="absolute inset-0 top-11"
          onPointerDown={active ? stop : undefined}
          onPointerMove={active ? stop : undefined}
          onPointerUp={active ? stop : undefined}
          onWheel={active ? stop : undefined}
          onContextMenu={active ? stopContextMenu : undefined}
        >
          {active ? (
            <>
              <ThreeSceneRenderBoundary resetKey={String(data.updatedAt || data.createdAt)}>
                <Suspense fallback={<div className="flex h-full items-center justify-center text-[11px] font-bold text-stone-500">正在载入 3D 视图…</div>}>
                  <LazyThreeSceneViewport
                    sceneSpec={data.sceneSpec}
                    onReady={handleViewportReady}
                    onInteractionStart={() => {}}
                    onCameraCommit={commitCamera}
                  />
                </Suspense>
              </ThreeSceneRenderBoundary>
              {referenceSource && overlay.visible && (
                <ThreeReferenceOverlay
                  source={referenceSource}
                  opacity={overlay.opacity}
                  guides={overlay.guides}
                />
              )}
              {referenceSource && (
                <div data-no-drag="true" className="absolute bottom-3 left-3 z-20 flex h-8 items-center gap-2 rounded-[10px] border border-white/55 bg-white/88 px-2 text-[9px] font-bold text-stone-600 shadow-[0_8px_22px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/[0.10] dark:bg-[#222]/88 dark:text-white/62">
                  <button
                    type="button"
                    className={`flex h-6 items-center gap-1 rounded-[7px] px-1.5 ${overlay.visible ? 'bg-stone-900/[0.08] text-stone-800 dark:bg-white/[0.10] dark:text-white/88' : 'text-stone-400 dark:text-white/38'}`}
                    onPointerDown={stop}
                    onClick={(event) => {
                      stop(event);
                      onInteractionStart('切换参考图叠加');
                      onOverlayChange({ visible: !overlay.visible });
                      onInteractionEnd();
                    }}
                  ><Images size={11} />参考图</button>
                  <input
                    aria-label="参考图透明度"
                    title={`参考图透明度 ${Math.round(overlay.opacity * 100)}%`}
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={Math.round(overlay.opacity * 100)}
                    disabled={!overlay.visible}
                    className="three-overlay-range w-[76px]"
                    onPointerDown={(event) => { stop(event); onInteractionStart('调整参考图透明度'); }}
                    onPointerUp={onInteractionEnd}
                    onPointerCancel={onInteractionEnd}
                    onBlur={onInteractionEnd}
                    onChange={event => onOverlayChange({ opacity: Number(event.target.value) / 100 })}
                  />
                  <output className="w-6 text-right font-mono tabular-nums text-stone-400 dark:text-white/38">{Math.round(overlay.opacity * 100)}%</output>
                  <button
                    type="button"
                    title="构图辅助线"
                    className={`flex h-6 w-6 items-center justify-center rounded-[7px] ${overlay.guides ? 'bg-stone-900/[0.08] text-stone-800 dark:bg-white/[0.10] dark:text-white/88' : 'text-stone-400 dark:text-white/38'}`}
                    onPointerDown={stop}
                    onClick={(event) => {
                      stop(event);
                      onInteractionStart('切换构图辅助线');
                      onOverlayChange({ guides: !overlay.guides });
                      onInteractionEnd();
                    }}
                  ><Grid3X3 size={12} /></button>
                </div>
              )}
            </>
          ) : (
            <div className="h-full w-full cursor-default overflow-hidden" title="选中节点后可旋转、缩放视角">
              <img src={data.preview} alt="3D 构图预览" draggable={false} className="h-full w-full object-cover" />
            </div>
          )}
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 top-11 flex flex-col p-3.5">
          <button
            data-no-drag="true"
            type="button"
            onPointerDown={stop}
            onClick={(event) => { stop(event); onOpenReferences(); }}
            disabled={status === 'working'}
            className="group/references flex h-[92px] w-full items-center gap-2 overflow-hidden rounded-[14px] border border-stone-200/75 bg-white/72 px-2.5 text-left transition-colors hover:border-stone-300 hover:bg-white disabled:cursor-wait dark:border-white/[0.07] dark:bg-white/[0.035] dark:hover:border-white/[0.12] dark:hover:bg-white/[0.055]"
            title="添加同一主体的不同角度图片"
          >
            {references.slice(0, 5).map((reference, index) => (
              <span key={reference.id} className="group/reference relative flex h-[68px] w-[68px] shrink-0 items-center justify-center overflow-hidden rounded-[11px] bg-stone-100 text-stone-400 dark:bg-white/[0.05] dark:text-white/40">
                {reference.source ? <img src={reference.source} alt={reference.name || `参考图 ${index + 1}`} className="h-full w-full object-cover" draggable={false} /> : <Images className="h-5 w-5" />}
                <span className="pointer-events-none absolute left-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-[5px] bg-black/62 px-1 font-mono text-[8px] font-black text-white">{index + 1}</span>
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`移除参考图 ${index + 1}`}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-[6px] bg-black/78 text-white opacity-0 transition-opacity hover:bg-black group-hover/reference:opacity-100"
                  onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
                  onClick={(event) => { event.preventDefault(); event.stopPropagation(); onRemoveReference(reference.id); }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    onRemoveReference(reference.id);
                  }}
                ><X className="h-3 w-3" /></span>
              </span>
            ))}
            {references.length > 5 && <span className="flex h-[68px] w-10 shrink-0 items-center justify-center font-mono text-[10px] font-bold text-stone-400">+{references.length - 5}</span>}
            {references.length < 8 && (
              <span className="flex h-[68px] min-w-[68px] flex-1 flex-col items-center justify-center gap-1 rounded-[11px] border border-dashed border-stone-300/80 text-[9px] font-bold text-stone-400 transition-colors group-hover/references:border-stone-400 group-hover/references:text-stone-600 dark:border-white/[0.12] dark:text-white/34 dark:group-hover/references:border-white/22 dark:group-hover/references:text-white/56">
                <Plus className="h-4 w-4" />
                添加参考图
              </span>
            )}
          </button>

          <div className="flex min-h-0 flex-1 flex-col justify-center px-1">
            <div className="text-[12px] font-black text-stone-700 dark:text-white/78">
              {status === 'working' ? '正在综合分析所有视角…' : references.length > 1 ? `已添加 ${references.length} 个视角` : references.length === 1 ? '已添加 1 张参考图' : '等待参考图片'}
            </div>
            <div className="mt-1 text-[10px] font-medium leading-4 text-stone-400 dark:text-white/38">
              {status === 'working' ? '正在识别主体体块、比例、朝向、材质与光线关系' : '建议添加同一产品的正面、侧面和背面图；不同产品请分开生成。'}
            </div>
            {status === 'error' && data.error && (
              <div className="mt-2 rounded-[9px] bg-red-500/[0.07] px-2.5 py-1.5 text-[10px] font-bold leading-4 text-red-600 dark:bg-red-400/[0.08] dark:text-red-200">{data.error}</div>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-stone-950/[0.055] pt-2.5 dark:border-white/[0.06]">
            <span className="text-[9px] font-semibold text-stone-400 dark:text-white/32">简化构图 · 非精确 3D 重建</span>
            <button
              data-no-drag="true"
              data-canvas-run-control="true"
              type="button"
              disabled={status === 'working' || references.length === 0}
              onPointerDown={stop}
              onClick={(event) => { stop(event); void onGenerate(); }}
              className="flex h-9 items-center gap-1.5 rounded-[10px] bg-stone-900 px-3.5 text-[11px] font-black text-white transition-[background-color,transform] hover:bg-stone-800 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-white"
            >
              {status === 'working' ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Box className="h-3.5 w-3.5" />}
              {status === 'working' ? '生成中' : status === 'error' ? '重新生成' : '生成场景'}
            </button>
          </div>
        </div>
      )}

      {hasScene && status === 'error' && data.error && (
        <div className="pointer-events-none absolute inset-x-3 bottom-3 z-20 rounded-[9px] bg-red-950/72 px-2.5 py-1.5 text-[10px] font-bold leading-4 text-red-50 backdrop-blur-md">
          {data.error}
        </div>
      )}

      {inspectorOpen && hasScene && (
        <aside data-no-drag="true" className="absolute bottom-3 right-3 top-12 z-30 w-[168px] overflow-y-auto rounded-[14px] border border-white/55 bg-white/88 p-3 text-[10px] text-stone-600 shadow-[0_14px_34px_rgba(0,0,0,0.18)] backdrop-blur-2xl dark:border-white/[0.10] dark:bg-[#222]/90 dark:text-white/62" onPointerDown={stop} onWheel={stop}>
          <div className="mb-3 flex items-center gap-1.5 font-black text-stone-800 dark:text-white/86"><Settings2 size={12} />场景设置</div>
          <label className="three-node-field"><span>相机 FOV</span><output>{Math.round(data.sceneSpec.camera.fov)}°</output></label>
          <input className="three-node-range" type="range" min="15" max="100" value={data.sceneSpec.camera.fov} onFocus={() => onInteractionStart('调整 3D 相机 FOV')} onPointerDown={() => onInteractionStart('调整 3D 相机 FOV')} onPointerUp={onInteractionEnd} onPointerCancel={onInteractionEnd} onBlur={onInteractionEnd} onChange={event => onSceneSpecChange(updateThreeSceneCamera(data.sceneSpec, { fov: Number(event.target.value) }))} />
          <label className="three-node-field mt-3"><span>背景</span><input type="color" value={data.sceneSpec.environment.background.startsWith('#') ? data.sceneSpec.environment.background.slice(0, 7) : '#d9d9d9'} onFocus={() => onInteractionStart('调整 3D 背景')} onBlur={onInteractionEnd} onChange={event => onSceneSpecChange(updateThreeSceneEnvironment(data.sceneSpec, { background: event.target.value }))} /></label>
          <label className="three-node-field mt-3"><span>地面</span><input className="three-node-check" type="checkbox" checked={data.sceneSpec.environment.ground.enabled} onPointerDown={() => onInteractionStart('切换 3D 地面')} onPointerUp={onInteractionEnd} onChange={event => onSceneSpecChange(updateThreeSceneEnvironment(data.sceneSpec, { groundEnabled: event.target.checked }))} /></label>
          {mainLight && <>
            <div className="my-3 h-px bg-black/[0.07] dark:bg-white/[0.08]" />
            <label className="three-node-field"><span className="flex items-center gap-1"><Sun size={11} />主光</span><output>{mainLight.intensity.toFixed(1)}</output></label>
            <input className="three-node-range" type="range" min="0" max="12" step="0.1" value={mainLight.intensity} onFocus={() => onInteractionStart('调整 3D 主光')} onPointerDown={() => onInteractionStart('调整 3D 主光')} onPointerUp={onInteractionEnd} onPointerCancel={onInteractionEnd} onBlur={onInteractionEnd} onChange={event => onSceneSpecChange(updateThreeSceneMainLight(data.sceneSpec, { intensity: Number(event.target.value) }))} />
            <div className="mt-2 grid grid-cols-3 gap-1">
              {(['X', 'Y', 'Z'] as const).map((axis, index) => <label key={axis} className="text-center text-[8px] font-bold text-stone-400">{axis}<input type="number" min="-20" max="20" step="0.5" value={(mainLight.position || [4, 6, 4])[index]} onFocus={() => onInteractionStart('调整 3D 主光位置')} onBlur={onInteractionEnd} onChange={event => setLightPosition(index, Number(event.target.value))} className="mt-1 w-full rounded-md bg-black/[0.05] px-1 py-1 text-center text-[9px] outline-none dark:bg-white/[0.07]" /></label>)}
            </div>
          </>}
          {import.meta.env.DEV && data.sceneAnalysis && (
            <details className="mt-3 border-t border-black/[0.07] pt-2 dark:border-white/[0.08]">
              <summary className="cursor-pointer font-black text-stone-500 dark:text-white/52">Scene Debug</summary>
              <div className="mt-2 text-[8px] font-bold text-stone-400">SceneAnalysisV1</div>
              <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-[7px] bg-black/[0.05] p-1.5 text-[7px] leading-3 dark:bg-black/25">{JSON.stringify(data.sceneAnalysis, null, 2)}</pre>
              <div className="mt-2 text-[8px] font-bold text-stone-400">Mapped SceneSpecV1</div>
              <pre className="mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all rounded-[7px] bg-black/[0.05] p-1.5 text-[7px] leading-3 dark:bg-black/25">{JSON.stringify(data.sceneSpec, null, 2)}</pre>
            </details>
          )}
        </aside>
      )}
    </section>
  );
}
