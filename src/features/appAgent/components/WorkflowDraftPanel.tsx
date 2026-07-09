import { useState } from 'react';
import type { WorkflowRecipeDraft, WorkflowOutputSpec, WorkflowLanguage } from '../workflows/workflowRecipeTypes';

interface WorkflowDraftPanelProps {
  draft: WorkflowRecipeDraft;
  onUpdate: (patch: Partial<WorkflowRecipeDraft>) => void;
  onSave: () => void;
  onDiscard: () => void;
}

const LANGUAGE_LABELS: Record<WorkflowLanguage, string> = {
  follow_user: '跟随用户语言',
  'zh-CN': '中文',
  en: '英文',
  bilingual: '中英双语',
};

// 预设可选节点模板
const ADD_NODE_PRESETS: Array<{ id: string; title: string; prompt: string }> = [
  { id: 'exploded_view', title: '爆炸结构图', prompt: '生成产品爆炸结构图，展示零部件分解、装配关系和结构层次。图中文字以中文为主，可保留结构术语。' },
  { id: 'dimension_view', title: '尺寸标注图', prompt: '生成产品尺寸标注图，标注关键外形尺寸、功能区间距和人机工学数据。图中标注文字使用中文。' },
  { id: 'brand_poster', title: '品牌海报图', prompt: '生成品牌风格产品海报，突出产品轮廓和品牌调性，背景简洁，构图居中。' },
  { id: 'color_variant', title: '配色变体图', prompt: '生成产品多配色方案展示图，展示3-4种颜色方案，每种配色保持产品造型一致。' },
  { id: 'custom', title: '自定义节点', prompt: '' },
];

function AddNodeForm({ onAdd, onCancel }: { onAdd: (spec: WorkflowOutputSpec) => void; onCancel: () => void }) {
  const [selectedPresetId, setSelectedPresetId] = useState('exploded_view');
  const [title, setTitle] = useState(ADD_NODE_PRESETS[0].title);
  const [prompt, setPrompt] = useState(ADD_NODE_PRESETS[0].prompt);

  const selectPreset = (presetId: string) => {
    setSelectedPresetId(presetId);
    const preset = ADD_NODE_PRESETS.find(p => p.id === presetId);
    if (preset) {
      setTitle(preset.title);
      setPrompt(preset.prompt);
    }
  };

  const handleAdd = () => {
    if (!title.trim()) return;
    const id = selectedPresetId === 'custom'
      ? `custom_${Date.now().toString(36)}`
      : selectedPresetId;
    onAdd({
      id,
      title: title.trim(),
      type: 'image_generator',
      enabled: true,
      order: 99,
      aspectRatio: '16:9',
      prompt: prompt.trim() || title.trim(),
      inputRoles: ['product_reference_image'],
      requiresReferenceImages: true,
      editable: true,
    });
  };

  return (
    <div className="rounded-[12px] border border-blue-200 bg-blue-50/60 p-3 space-y-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-600">新增输出节点</div>

      {/* Preset picker */}
      <div className="flex flex-wrap gap-1.5">
        {ADD_NODE_PRESETS.map(p => (
          <button
            key={p.id}
            onClick={() => selectPreset(p.id)}
            className={`px-2 py-1 rounded-[8px] text-[10px] font-medium transition-colors border ${
              selectedPresetId === p.id
                ? 'bg-blue-500 text-white border-blue-500'
                : 'bg-white text-stone-600 border-stone-200 hover:border-blue-300 hover:text-blue-600'
            }`}
          >
            {p.title}
          </button>
        ))}
      </div>

      {/* Title input */}
      <div>
        <div className="mb-1 text-[10px] text-stone-500 font-medium">节点名称</div>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="输入节点名称"
          className="w-full h-7 rounded-[8px] border border-stone-200 bg-white px-2.5 text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </div>

      {/* Prompt input */}
      <div>
        <div className="mb-1 text-[10px] text-stone-500 font-medium">Prompt</div>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="描述这个节点要生成什么内容"
          rows={3}
          className="w-full rounded-[8px] border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] leading-relaxed text-stone-600 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleAdd}
          disabled={!title.trim()}
          className="flex-1 h-8 rounded-[10px] bg-blue-500 hover:bg-blue-600 disabled:bg-stone-200 disabled:text-stone-400 text-white text-xs font-semibold transition-colors"
        >
          添加
        </button>
        <button
          onClick={onCancel}
          className="h-8 px-3 rounded-[10px] border border-stone-200 text-stone-500 hover:border-stone-300 text-xs transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}

export function WorkflowDraftPanel({ draft, onUpdate, onSave, onDiscard }: WorkflowDraftPanelProps) {
  const [expandedOutputId, setExpandedOutputId] = useState<string | null>(null);
  const [showAddNode, setShowAddNode] = useState(false);

  const toggleOutput = (id: string) => {
    onUpdate({
      outputs: draft.outputs.map(o => o.id === id ? { ...o, enabled: !o.enabled } : o),
    });
  };

  const updatePrompt = (id: string, prompt: string) => {
    onUpdate({
      outputs: draft.outputs.map(o => o.id === id ? { ...o, prompt } : o),
    });
  };

  const updateTitle = (id: string, title: string) => {
    onUpdate({
      outputs: draft.outputs.map(o => o.id === id ? { ...o, title } : o),
    });
  };

  const removeOutput = (id: string) => {
    onUpdate({ outputs: draft.outputs.filter(o => o.id !== id) });
    if (expandedOutputId === id) setExpandedOutputId(null);
  };

  const addOutput = (spec: WorkflowOutputSpec) => {
    // 如果已有同 id 的节点，替换；否则追加
    const existing = draft.outputs.some(o => o.id === spec.id);
    onUpdate({
      outputs: existing
        ? draft.outputs.map(o => o.id === spec.id ? { ...spec, enabled: true } : o)
        : [...draft.outputs, spec],
    });
    setShowAddNode(false);
    setExpandedOutputId(spec.id);
  };

  const toggleStrategy = () => {
    onUpdate({
      strategy: draft.strategy
        ? { ...draft.strategy, enabled: !draft.strategy.enabled, mode: draft.strategy.enabled ? 'disabled' : 'enabled' }
        : { enabled: true, mode: 'enabled', title: '设计策略', prompt: '' },
    });
  };

  const setLanguage = (lang: WorkflowLanguage) => {
    onUpdate({ languagePolicy: { ...draft.languagePolicy, imageTextLanguage: lang } });
  };

  const enabledCount = draft.outputs.filter(o => o.enabled !== false).length;

  return (
    <div className="fixed inset-0 z-[9000] pointer-events-none">
      <div
        data-canvas-floating-layer="true"
        className="absolute right-0 top-0 h-full w-[300px] pointer-events-auto flex flex-col bg-white border-l border-stone-200 shadow-2xl shadow-black/10"
        onMouseDown={e => e.stopPropagation()}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-200 shrink-0 bg-stone-50">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-stone-900 leading-tight">工作流草稿</div>
            <div className="text-xs text-stone-400 truncate mt-0.5">{draft.name}</div>
          </div>
          <button
            onClick={onDiscard}
            className="ml-2 shrink-0 flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors"
            title="关闭"
          >
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
              <path d="M1 1L10 10M10 1L1 10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-4 [&::-webkit-scrollbar]:hidden">

          {/* 图片语言 */}
          <div>
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-stone-400">图片文字语言</div>
            <select
              value={draft.languagePolicy.imageTextLanguage}
              onChange={e => setLanguage(e.target.value as WorkflowLanguage)}
              className="w-full h-8 rounded-[10px] border border-stone-200 bg-white px-2.5 text-xs text-stone-700 appearance-none cursor-pointer hover:border-stone-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            >
              {(Object.keys(LANGUAGE_LABELS) as WorkflowLanguage[]).map(lang => (
                <option key={lang} value={lang}>{LANGUAGE_LABELS[lang]}</option>
              ))}
            </select>
          </div>

          {/* Strategy */}
          {draft.strategy !== undefined && (
            <label className="flex items-center gap-2.5 cursor-pointer select-none group">
              <div
                role="switch"
                aria-checked={draft.strategy?.enabled}
                onClick={toggleStrategy}
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
                  draft.strategy?.enabled ? 'bg-blue-500' : 'bg-stone-300'
                }`}
              >
                <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                  draft.strategy?.enabled ? 'translate-x-[18px]' : 'translate-x-0.5'
                }`} />
              </div>
              <span className="text-xs text-stone-600 group-hover:text-stone-900 transition-colors">先分析设计策略</span>
            </label>
          )}

          {/* 输出节点 */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
                输出节点 ({enabledCount}/{draft.outputs.length})
              </div>
              <button
                onClick={() => setShowAddNode(v => !v)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-[7px] text-[10px] font-semibold transition-colors ${
                  showAddNode
                    ? 'bg-blue-100 text-blue-600'
                    : 'bg-stone-100 text-stone-500 hover:bg-stone-200 hover:text-stone-700'
                }`}
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" className={`transition-transform ${showAddNode ? 'rotate-45' : ''}`}>
                  <path d="M4.5 1V8M1 4.5H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                {showAddNode ? '收起' : '新增'}
              </button>
            </div>

            {/* Add node form */}
            {showAddNode && (
              <div className="mb-3">
                <AddNodeForm
                  onAdd={addOutput}
                  onCancel={() => setShowAddNode(false)}
                />
              </div>
            )}

            {/* Output list */}
            <div className="space-y-1.5">
              {draft.outputs.map((output: WorkflowOutputSpec) => {
                const isExpanded = expandedOutputId === output.id;
                const isEnabled = output.enabled !== false;
                return (
                  <div
                    key={output.id}
                    className={`rounded-[12px] border transition-colors ${
                      isEnabled
                        ? 'border-stone-200 bg-stone-50 hover:border-stone-300'
                        : 'border-stone-100 bg-stone-50/30 opacity-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 px-3 py-2">
                      <button
                        onClick={() => toggleOutput(output.id)}
                        className={`shrink-0 w-4 h-4 rounded-[4px] border-2 flex items-center justify-center transition-colors ${
                          isEnabled
                            ? 'bg-blue-500 border-blue-500'
                            : 'border-stone-300 bg-white hover:border-stone-400'
                        }`}
                      >
                        {isEnabled && (
                          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                            <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <span
                        className="flex-1 min-w-0 text-xs font-medium text-stone-700 truncate cursor-pointer"
                        onClick={() => setExpandedOutputId(isExpanded ? null : output.id)}
                      >
                        {output.title}
                      </span>
                      {output.aspectRatio && (
                        <span className="shrink-0 text-[9px] text-stone-400 bg-stone-200/70 rounded-[5px] px-1.5 py-0.5 font-medium">
                          {output.aspectRatio}
                        </span>
                      )}
                      <button
                        onClick={() => setExpandedOutputId(isExpanded ? null : output.id)}
                        className="shrink-0 text-stone-400 hover:text-stone-600 transition-colors p-0.5"
                      >
                        <svg
                          width="10" height="10" viewBox="0 0 10 10" fill="none"
                          className={`transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                        >
                          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </div>

                    {isExpanded && (
                      <div className="px-3 pb-3 pt-2 space-y-2.5 border-t border-stone-200/60">
                        <div>
                          <div className="mb-1 text-[10px] text-stone-400 font-medium">标题</div>
                          <input
                            value={output.title}
                            onChange={e => updateTitle(output.id, e.target.value)}
                            className="w-full h-7 rounded-[8px] border border-stone-200 bg-white px-2.5 text-xs text-stone-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                          />
                        </div>
                        <div>
                          <div className="mb-1 text-[10px] text-stone-400 font-medium">Prompt</div>
                          <textarea
                            value={output.prompt}
                            onChange={e => updatePrompt(output.id, e.target.value)}
                            rows={3}
                            className="w-full rounded-[8px] border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] leading-relaxed text-stone-600 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                          />
                        </div>
                        <button
                          onClick={() => removeOutput(output.id)}
                          className="w-full h-7 rounded-[8px] border border-red-200 text-red-500 hover:bg-red-50 text-[11px] transition-colors"
                        >
                          删除此节点
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Footer ──────────────────────────────────────── */}
        <div className="shrink-0 px-4 py-3 border-t border-stone-200 flex gap-2 bg-stone-50">
          <button
            onClick={onSave}
            className="flex-1 h-9 rounded-[12px] bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-xs font-semibold transition-colors shadow-sm shadow-blue-500/20"
          >
            保存为工作流
          </button>
          <button
            onClick={onDiscard}
            className="h-9 px-3 rounded-[12px] border border-stone-200 text-stone-500 hover:text-stone-700 hover:border-stone-300 hover:bg-white text-xs transition-colors"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
}

export default WorkflowDraftPanel;
