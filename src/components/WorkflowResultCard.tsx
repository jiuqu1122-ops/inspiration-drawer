import {
  AlertTriangle,
  ArrowRight,
  FileText,
  Image as ImageIcon,
  Layers3,
  Lightbulb,
  Sparkles,
} from 'lucide-react';
import type { WorkflowResultCardData } from '../features/agentModel';

type WorkflowResultCardProps = {
  result: WorkflowResultCardData;
  compact?: boolean;
};

const STATUS_STYLE: Record<WorkflowResultCardData['status'], {
  label: string;
  badge: string;
}> = {
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

const TextAsset = ({ title, content }: { title: string; content: string }) => (
  <details className="group/asset rounded-[12px] border border-stone-100 bg-white/72 px-2.5 py-2 dark:border-white/[0.07] dark:bg-white/[0.035]">
    <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[9px] font-bold text-stone-600 dark:text-stone-200">
      <FileText className="h-3 w-3 shrink-0 text-blue-500" />
      <span className="min-w-0 flex-1 truncate">{title}</span>
      <span className="text-[8px] font-medium text-stone-400 group-open/asset:hidden">展开</span>
    </summary>
    <div className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap text-[9px] leading-4.5 text-stone-500 [scrollbar-width:thin] dark:text-stone-400">
      {content}
    </div>
  </details>
);

export function WorkflowResultCard({ result, compact = false }: WorkflowResultCardProps) {
  const status = STATUS_STYLE[result.status];
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
              {result.workflowName}
            </h3>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[8px] font-bold ${status.badge}`}>
              {status.label}
            </span>
          </div>
          <p className="mt-1 text-[9px] leading-4 text-stone-500 dark:text-white/48">{result.summary}</p>
          <div className="mt-1 text-[8px] text-stone-400 dark:text-white/30">
            完成 {result.completedSteps}/{result.totalSteps} 个步骤
          </div>
        </div>
      </header>

      <div className="space-y-3 p-3">
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

        {result.inspirationReferences.length > 0 && (
          <section>
            <div className="mb-1.5 flex items-center gap-1.5 text-[9px] font-black text-stone-600 dark:text-white/65">
              <Sparkles className="h-3.5 w-3.5 text-fuchsia-500" />灵感参考
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
