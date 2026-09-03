import {
  AlertTriangle,
  ArrowRight,
  Check,
  Copy,
  FileText,
  Image as ImageIcon,
  Layers3,
  Lightbulb,
  LoaderCircle,
  Sparkles,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import type { WorkflowResultCardData, WorkflowResultStage } from '../features/agentModel';

type WorkflowResultCardProps = {
  result: WorkflowResultCardData;
  compact?: boolean;
};

const STATUS_STYLE: Record<WorkflowResultCardData['status'], {
  label: string;
  badge: string;
}> = {
  running: {
    label: '分析中',
    badge: 'bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200',
  },
  success: {
    label: '已完成',
    badge: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-400/10 dark:text-emerald-200',
  },
  partial: {
    label: '部分完成',
    badge: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-100',
  },
  error: {
    label: '执行失败',
    badge: 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-200',
  },
};

const STAGE_LABELS: Record<WorkflowResultStage['stage'], string> = {
  requirement: '需求分析',
  research: '灵感 / 参考分析',
  concept: '设计策略与概念',
  refinement: '方案评审与深化',
  delivery: '交付整理',
};

const TextAsset = ({ title, content }: { title: string; content: string }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const copyContent = async (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await writeText(content);
      setCopied(true);
    } catch (error) {
      console.warn('复制工作流分析结果失败:', error);
    }
  };

  return (
    <details className="group/asset rounded-[12px] border border-stone-100 bg-white/72 px-2.5 py-2 dark:border-white/[0.07] dark:bg-white/[0.035]">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[9px] font-bold text-stone-600 dark:text-stone-200">
        <FileText className="h-3 w-3 shrink-0 text-blue-500" />
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span
          role="button"
          tabIndex={0}
          title="复制全文"
          className="flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[8px] font-medium text-stone-400 transition-colors hover:bg-stone-100 hover:text-blue-600 dark:hover:bg-white/[0.07] dark:hover:text-blue-200"
          onClick={copyContent}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            void copyContent(event);
          }}
        >
          {copied ? <Check className="h-2.5 w-2.5" /> : <Copy className="h-2.5 w-2.5" />}
          {copied ? '已复制' : '复制'}
        </span>
        <span className="shrink-0 text-[8px] font-medium text-stone-400 group-open/asset:hidden">展开</span>
        <span className="hidden shrink-0 text-[8px] font-medium text-stone-400 group-open/asset:inline">收起</span>
      </summary>
      <div
        data-no-drag="true"
        className="mt-2 max-h-52 cursor-text select-text overflow-y-auto whitespace-pre-wrap text-[9px] leading-4.5 text-stone-500 [scrollbar-width:thin] dark:text-stone-400"
        onPointerDown={(event) => event.stopPropagation()}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        {content}
      </div>
    </details>
  );
};

export function WorkflowResultCard({ result, compact = false }: WorkflowResultCardProps) {
  const status = STATUS_STYLE[result.status];
  const isRunning = result.status === 'running';
  const columns = compact ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3';
  const resultMeta = [
    `${result.completedSteps}/${result.totalSteps} 步骤`,
    result.analysisResults.length > 0 ? `${result.analysisResults.length} 份文本` : '',
    result.inspirationReferences.length > 0 ? `${result.inspirationReferences.length} 个参考` : '',
    result.generationResults.length > 0 ? `${result.generationResults.length} 个结果` : '',
  ].filter(Boolean).join(' · ');
  const progress = result.totalSteps > 0
    ? Math.min(100, Math.max(0, result.completedSteps / result.totalSteps * 100))
    : 0;
  return (
    <article className="overflow-hidden rounded-[12px] border border-stone-200/85 bg-white shadow-none dark:border-white/[0.09] dark:bg-[#20201f]">
      <header className="relative flex items-start gap-2.5 border-b border-stone-100 px-3 py-2.5 dark:border-white/[0.07]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-200">
          <Layers3 className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[11px] font-semibold tracking-[-0.015em] text-stone-800 dark:text-white/88">
              {result.title || result.workflowName}
            </h3>
            <span className={`flex shrink-0 items-center gap-1 rounded-[5px] px-1.5 py-0.5 text-[8px] font-semibold ${status.badge}`}>
              {isRunning && <LoaderCircle className="h-2.5 w-2.5 animate-spin" />}
              {status.label}
            </span>
          </div>
          <div className="mt-1 text-[8px] tabular-nums text-stone-400 dark:text-white/35">{resultMeta}</div>
        </div>
        <span className="absolute inset-x-0 bottom-[-1px] h-px bg-stone-100 dark:bg-white/[0.05]">
          <span className="block h-full bg-blue-500 transition-[width] duration-300" style={{ width: `${progress}%` }} />
        </span>
      </header>

      <div className="space-y-4 px-3 pb-3 pt-2.5">
        {result.tasks && result.tasks.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-center justify-between text-[8px] font-semibold text-stone-500 dark:text-white/55">
              <span>任务进度</span>
              <span className="tabular-nums text-stone-400 dark:text-white/30">{result.completedSteps}/{result.totalSteps}</span>
            </div>
            <div className="overflow-hidden rounded-[9px] border border-stone-100 bg-stone-50/45 dark:border-white/[0.07] dark:bg-white/[0.025]">
              {result.tasks.map((task, index) => {
                const isDone = task.status === 'success';
                const isActive = task.status === 'running';
                const isFailed = task.status === 'failed' || task.status === 'skipped';
                return (
                  <div key={task.id} className={`flex min-h-7 items-center gap-2 border-b border-stone-100 px-2 py-1.5 last:border-b-0 dark:border-white/[0.06] ${isActive ? 'bg-blue-50/70 dark:bg-blue-400/[0.06]' : ''}`}>
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] text-[7px] font-semibold ${
                      isDone
                        ? 'bg-emerald-500 text-white'
                        : isActive
                          ? 'bg-blue-500 text-white'
                          : isFailed
                            ? 'bg-red-100 text-red-600 dark:bg-red-400/15 dark:text-red-200'
                            : 'bg-stone-100 text-stone-400 dark:bg-white/[0.07] dark:text-white/35'
                    }`}>
                      {isDone ? <Check className="h-2.5 w-2.5" /> : isActive ? <LoaderCircle className="h-2.5 w-2.5 animate-spin" /> : isFailed ? <AlertTriangle className="h-2.5 w-2.5" /> : index + 1}
                    </span>
                    <span className={`min-w-0 flex-1 truncate text-[8px] font-semibold ${isActive ? 'text-blue-600 dark:text-blue-200' : 'text-stone-600 dark:text-white/62'}`}>
                      {task.label}
                    </span>
                    <span className={`shrink-0 text-[7px] font-medium ${isFailed ? 'text-red-500 dark:text-red-300' : isActive ? 'text-blue-500 dark:text-blue-200' : 'text-stone-400 dark:text-white/30'}`}>
                      {isDone ? '已完成' : isActive ? '运行中' : isFailed ? (task.status === 'skipped' ? '已跳过' : '失败') : task.status === 'ready' ? '准备中' : '等待中'}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        {result.stages.length > 0 ? (
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[8px] font-semibold text-stone-500 dark:text-white/55">
              <Lightbulb className="h-3 w-3 text-amber-500" />文字节点结果
            </div>
            <div className="space-y-2">
              {result.stages.map((stage, index) => (
                <div key={`${stage.stage}:${stage.nodeId || index}`} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-[5px] bg-stone-100 text-[7px] font-semibold text-stone-500 dark:bg-white/[0.07] dark:text-white/45">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-[8px] font-semibold text-stone-500 dark:text-white/45">
                      {STAGE_LABELS[stage.stage]}
                    </div>
                    <TextAsset title={stage.title} content={stage.summary} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <>
            {result.designStrategy && (
              <section>
                <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black text-stone-600 dark:text-white/65">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-500" />设计策略
                </div>
                <TextAsset title={result.designStrategy.title} content={result.designStrategy.content} />
              </section>
            )}
            {result.analysisResults.length > 0 && (
              <section>
                <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black text-stone-600 dark:text-white/65">
                  <FileText className="h-3.5 w-3.5 text-violet-500" />分析结果
                </div>
                <div className="space-y-1.5">
                  {result.analysisResults.map(asset => (
                    <TextAsset key={`${asset.nodeId}:${asset.artifactType || asset.title}`} title={asset.title} content={asset.content} />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {result.inspirationReferences.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black text-stone-600 dark:text-white/65">
              <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />参考资料
            </div>
            <div className={`grid ${columns} gap-1.5`}>
              {result.inspirationReferences.map(reference => (
                <div key={reference.id} className="overflow-hidden rounded-[11px] border border-stone-100 bg-white/72 dark:border-white/[0.07] dark:bg-white/[0.035]">
                  <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-stone-100 dark:bg-white/[0.04]">
                    {reference.thumbnail ? (
                      <img src={reference.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <ImageIcon className="h-4 w-4 text-stone-300 dark:text-white/25" />
                    )}
                  </div>
                  <div className="px-2 py-1.5">
                    <div className="truncate text-[8px] font-bold text-stone-600 dark:text-white/62">{reference.name}</div>
                    {reference.role && <div className="mt-0.5 truncate font-mono text-[7px] text-fuchsia-500">{reference.role}</div>}
                    {reference.reason && (
                      <div className="mt-0.5 line-clamp-2 text-[7px] leading-3 text-stone-400 dark:text-white/34" title={reference.reason}>
                        {reference.reason}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {result.generationResults.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black text-stone-600 dark:text-white/65">
              <ImageIcon className="h-3.5 w-3.5 text-cyan-500" />生成结果
            </div>
            <div className={`grid ${columns} gap-1.5`}>
              {result.generationResults.map(output => {
                const source = output.thumbnail || output.url;
                return (
                  <div key={output.id} className="overflow-hidden rounded-[11px] border border-stone-100 bg-white/72 dark:border-white/[0.07] dark:bg-white/[0.035]">
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-stone-100 dark:bg-white/[0.04]">
                      {source ? (
                        output.mediaType === 'video'
                          ? <video src={source} muted preload="metadata" className="h-full w-full object-cover" />
                          : <img src={source} alt="" loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <ImageIcon className="h-4 w-4 text-stone-300 dark:text-white/25" />
                      )}
                    </div>
                    <div className="truncate px-2 py-1.5 text-[8px] font-bold text-stone-600 dark:text-white/62">{output.name}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {result.nextSteps.length > 0 && (
          <section className="rounded-[13px] border border-blue-100/80 bg-blue-50/65 px-2.5 py-2 dark:border-blue-300/12 dark:bg-blue-400/[0.055]">
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black text-blue-700 dark:text-blue-200">
              <ArrowRight className="h-3.5 w-3.5" />下一步建议
            </div>
            <ul className="space-y-1 text-[9px] leading-4 text-stone-600 dark:text-white/55">
              {result.nextSteps.map((step, index) => <li key={`${index}:${step}`}>• {step}</li>)}
            </ul>
          </section>
        )}

        {result.error && (
          <div className="flex items-start gap-1.5 rounded-[12px] bg-red-50 px-2.5 py-2 text-[8px] leading-4 text-red-600 dark:bg-red-400/8 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
            <span>{result.error}</span>
          </div>
        )}
      </div>
    </article>
  );
}
