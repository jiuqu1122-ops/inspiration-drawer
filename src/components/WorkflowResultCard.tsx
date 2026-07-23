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
  const columns = compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3';
  return (
    <article className="overflow-hidden rounded-[18px] border border-blue-100/90 bg-gradient-to-br from-white via-blue-50/35 to-violet-50/30 shadow-[0_10px_28px_rgba(37,99,235,0.10)] dark:border-blue-300/15 dark:from-[#202124] dark:via-blue-950/20 dark:to-violet-950/15">
      <header className="flex items-start gap-2.5 border-b border-blue-100/70 px-3 py-3 dark:border-white/[0.07]">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-blue-500 text-white shadow-sm shadow-blue-500/25">
          <Layers3 className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-[11px] font-black text-stone-800 dark:text-white/88">
              {result.title || result.workflowName}
            </h3>
            <span className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[8px] font-bold ${status.badge}`}>
              {isRunning && <LoaderCircle className="h-2.5 w-2.5 animate-spin" />}
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-[9px] leading-4 text-stone-500 dark:text-white/48">{result.summary}</p>
          <div className="mt-1 text-[8px] text-stone-400 dark:text-white/30">
            完成 {result.completedSteps}/{result.totalSteps} 个步骤
          </div>
          {isRunning && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[8px] font-medium text-blue-500 dark:text-blue-200/75">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
              正在分析下一节点，结果会实时更新
            </div>
          )}
        </div>
      </header>

      <div className="space-y-3 p-3">
        {result.stages.length > 0 ? (
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black text-stone-600 dark:text-white/65">
              <Lightbulb className="h-3.5 w-3.5 text-amber-500" />完整设计过程
            </div>
            <div className="space-y-2">
              {result.stages.map((stage, index) => (
                <div key={`${stage.stage}:${stage.nodeId || index}`} className="flex items-start gap-2">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500 text-[8px] font-black text-white shadow-sm shadow-blue-500/20">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-[8px] font-bold text-blue-600 dark:text-blue-200/80">
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
