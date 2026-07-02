import { AnimatePresence, motion } from 'framer-motion';
import {
  Bot,
  Check,
  ChevronDown,
  CircleAlert,
  ExternalLink,
  LoaderCircle,
  LogIn,
  LogOut,
  RefreshCw,
  Save,
  Server,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type {
  AgentSettings,
  CodexLoginInfo,
  CodexRuntimeStatus,
} from '../features/agentModel';

type AgentSettingsSectionProps = {
  expanded: boolean;
  settings: AgentSettings;
  loading: boolean;
  codexStatus: CodexRuntimeStatus | null;
  codexLoginInfo: CodexLoginInfo | null;
  onToggle: () => void;
  onSave: (settings: AgentSettings & { apiKey?: string; clearApiKey?: boolean }) => Promise<AgentSettings>;
  onListModels: () => Promise<string[]>;
  onRefreshCodexStatus: () => Promise<CodexRuntimeStatus>;
  onStartCodexLogin: (mode: 'chatgpt' | 'chatgptDeviceCode') => Promise<CodexLoginInfo>;
  onLogoutCodex: () => Promise<void>;
};

export function AgentSettingsSection({
  expanded,
  settings,
  loading,
  codexStatus,
  codexLoginInfo,
  onToggle,
  onSave,
  onListModels,
  onRefreshCodexStatus,
  onStartCodexLogin,
  onLogoutCodex,
}: AgentSettingsSectionProps) {
  const [draft, setDraft] = useState(settings);
  const [apiKey, setApiKey] = useState('');
  const [headersText, setHeadersText] = useState('{}');
  const [models, setModels] = useState<string[]>([]);
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    setDraft(settings);
    setHeadersText(JSON.stringify(settings.apiHeaders || {}, null, 2));
  }, [settings]);

  useEffect(() => {
    if (expanded && !codexStatus) void onRefreshCodexStatus().catch(() => {});
  }, [codexStatus, expanded, onRefreshCodexStatus]);

  const statusLabel = useMemo(() => {
    if (!codexStatus) return '未检查';
    if (!codexStatus.installed) return '未安装';
    if (codexStatus.authenticated) return '已登录';
    return '未登录';
  }, [codexStatus]);

  const saveDraft = async (clearApiKey = false, propagateError = false) => {
    setWorking('save');
    setMessage('');
    try {
      let apiHeaders: Record<string, string> = {};
      try {
        const parsed = JSON.parse(headersText || '{}');
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
        apiHeaders = Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, String(value)]));
      } catch (_) {
        throw new Error('附加 Header 必须是 JSON 对象');
      }
      const saved = await onSave({
        ...draft,
        apiHeaders,
        apiKey: apiKey.trim() || undefined,
        clearApiKey,
      });
      setDraft(saved);
      setApiKey('');
      setMessage('Agent 设置已保存');
    } catch (error) {
      setMessage(String(error));
      if (propagateError) throw error;
    } finally {
      setWorking('');
    }
  };

  const refreshModels = async () => {
    setWorking('models');
    setMessage('');
    try {
      await saveDraft(false, true);
      const values = await onListModels();
      setModels(values);
      setMessage(`已读取 ${values.length} 个模型`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setWorking('');
    }
  };

  const runCodexAction = async (key: string, action: () => Promise<unknown>) => {
    setWorking(key);
    setMessage('');
    try {
      await saveDraft(false, true);
      await action();
      setMessage(key === 'logout' ? '已退出 Codex' : '已打开 Codex 登录页面');
    } catch (error) {
      setMessage(String(error));
    } finally {
      setWorking('');
    }
  };

  return (
    <div className="overflow-hidden rounded-[22px] border border-white/60 bg-white/75 shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl dark:border-stone-700/60 dark:bg-stone-800/75">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between p-3 transition-colors hover:bg-stone-50 dark:hover:bg-stone-700/50"
      >
        <span className="flex items-center gap-2 text-xs font-bold text-stone-700 dark:text-stone-200">
          <Bot className="h-4 w-4 text-blue-500" />
          AGENT 设置
        </span>
        <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 border-t border-stone-100 px-3 pb-3 pt-2 dark:border-stone-700/50">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">Agent 引擎</span>
                <select
                  value={draft.provider}
                  onChange={event => setDraft(current => ({
                    ...current,
                    provider: event.target.value === 'codex' ? 'codex' : 'openai-compatible',
                  }))}
                  className="w-full rounded-[14px] border border-blue-100 bg-white/82 px-3 py-1.5 text-xs text-stone-700 outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-blue-900/45 dark:bg-stone-800/70 dark:text-stone-200"
                >
                  <option value="openai-compatible">OpenAI-compatible API</option>
                  <option value="codex">Codex App Server</option>
                </select>
              </label>

              {draft.provider === 'openai-compatible' ? (
                <div className="flex flex-col gap-2 rounded-[18px] border border-blue-100 bg-blue-50/55 p-3 dark:border-blue-400/20 dark:bg-blue-400/8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-black text-blue-800 dark:text-blue-100">
                      <Server className="h-3.5 w-3.5" /> API 接口
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${draft.hasApiKey ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200' : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300'}`}>
                      {draft.hasApiKey ? 'Key 已保存' : '未配置 Key'}
                    </span>
                  </div>
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    API Base URL
                    <input
                      value={draft.apiBaseUrl}
                      onChange={event => setDraft(current => ({ ...current, apiBaseUrl: event.target.value }))}
                      placeholder="https://api.openai.com/v1"
                      className="rounded-[13px] border border-blue-100 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none dark:border-blue-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    API Key
                    <input
                      type="password"
                      value={apiKey}
                      onChange={event => setApiKey(event.target.value)}
                      placeholder={draft.hasApiKey ? '已保存，留空表示不修改' : '输入 API Key'}
                      className="rounded-[13px] border border-blue-100 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none dark:border-blue-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    模型
                    <div className="flex gap-1.5">
                      <input
                        value={draft.apiModel}
                        onChange={event => setDraft(current => ({ ...current, apiModel: event.target.value }))}
                        list="agent-model-options"
                        placeholder="模型 ID"
                        className="min-w-0 flex-1 rounded-[13px] border border-blue-100 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none dark:border-blue-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                      />
                      <datalist id="agent-model-options">
                        {models.map(model => <option key={model} value={model} />)}
                      </datalist>
                      <button
                        type="button"
                        onClick={() => void refreshModels()}
                        disabled={!!working}
                        className="rounded-[12px] bg-blue-100 px-2 text-[10px] font-black text-blue-700 disabled:opacity-50 dark:bg-blue-400/15 dark:text-blue-100"
                      >
                        {working === 'models' ? '读取中' : '模型'}
                      </button>
                    </div>
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    附加 Header（JSON，可选）
                    <textarea
                      value={headersText}
                      onChange={event => setHeadersText(event.target.value)}
                      rows={2}
                      className="resize-y rounded-[13px] border border-blue-100 bg-white/85 px-2.5 py-1.5 font-mono text-[10px] font-medium text-stone-700 outline-none dark:border-blue-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                    />
                  </label>
                  {draft.hasApiKey && (
                    <button
                      type="button"
                      onClick={() => void saveDraft(true)}
                      className="self-start text-[10px] font-bold text-red-500 hover:text-red-600"
                    >
                      清除已保存的 API Key
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2 rounded-[18px] border border-violet-100 bg-violet-50/55 p-3 dark:border-violet-400/20 dark:bg-violet-400/8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-violet-800 dark:text-violet-100">Codex App Server</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${codexStatus?.authenticated ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200' : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300'}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    Codex 可执行文件
                    <input
                      value={draft.codexExecutable}
                      onChange={event => setDraft(current => ({ ...current, codexExecutable: event.target.value }))}
                      placeholder="codex"
                      className="rounded-[13px] border border-violet-100 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none dark:border-violet-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    Codex 模型（留空使用账户默认）
                    <input
                      value={draft.codexModel}
                      onChange={event => setDraft(current => ({ ...current, codexModel: event.target.value }))}
                      placeholder="留空即可"
                      className="rounded-[13px] border border-violet-100 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none dark:border-violet-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                      沙箱
                      <select
                        value={draft.codexSandbox}
                        onChange={event => setDraft(current => ({ ...current, codexSandbox: event.target.value as AgentSettings['codexSandbox'] }))}
                        className="rounded-[12px] border border-violet-100 bg-white/85 px-2 py-1.5 text-[10px] text-stone-700 dark:border-violet-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                      >
                        <option value="read-only">只读</option>
                        <option value="workspace-write">工作区可写</option>
                        <option value="danger-full-access">完全访问</option>
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                      Codex 审批
                      <select
                        value={draft.codexApprovalPolicy}
                        onChange={event => setDraft(current => ({ ...current, codexApprovalPolicy: event.target.value as AgentSettings['codexApprovalPolicy'] }))}
                        className="rounded-[12px] border border-violet-100 bg-white/85 px-2 py-1.5 text-[10px] text-stone-700 dark:border-violet-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                      >
                        <option value="on-request">需要时询问</option>
                        <option value="untrusted">未信任操作询问</option>
                        <option value="on-failure">失败时询问</option>
                        <option value="never">从不询问</option>
                      </select>
                    </label>
                  </div>
                  {draft.codexSandbox === 'danger-full-access' && (
                    <div className="flex gap-1.5 rounded-[12px] border border-amber-200 bg-amber-50 px-2 py-1.5 text-[9px] leading-4 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100">
                      <CircleAlert className="mt-0.5 h-3 w-3 shrink-0" />
                      完全访问会允许 Codex 操作本机文件。仅控制画布时建议保持只读。
                    </div>
                  )}
                  <div className="text-[9px] leading-4 text-stone-500 dark:text-stone-400">
                    {codexStatus?.installed
                      ? `${codexStatus.version || 'Codex CLI'} · ${codexStatus.authDetail || statusLabel}`
                      : '需要安装 Codex CLI，或填写它的完整路径。'}
                  </div>
                  {codexLoginInfo?.userCode && (
                    <div className="rounded-[12px] bg-white/75 px-2 py-1.5 text-[10px] font-bold text-violet-700 dark:bg-stone-900/45 dark:text-violet-200">
                      设备码：<span className="font-mono text-xs">{codexLoginInfo.userCode}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => void runCodexAction('login', () => onStartCodexLogin('chatgpt'))}
                      disabled={!!working}
                      className="flex items-center gap-1 rounded-[12px] bg-violet-500 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                    >
                      <LogIn className="h-3 w-3" /> ChatGPT 登录
                    </button>
                    <button
                      type="button"
                      onClick={() => void runCodexAction('device', () => onStartCodexLogin('chatgptDeviceCode'))}
                      disabled={!!working}
                      className="flex items-center gap-1 rounded-[12px] border border-violet-200 bg-white/80 px-2.5 py-1.5 text-[10px] font-bold text-violet-700 disabled:opacity-50 dark:border-violet-400/20 dark:bg-stone-900/40 dark:text-violet-200"
                    >
                      <ExternalLink className="h-3 w-3" /> 设备码
                    </button>
                    <button
                      type="button"
                      onClick={() => void runCodexAction('refresh', onRefreshCodexStatus)}
                      disabled={!!working}
                      className="flex items-center gap-1 rounded-[12px] border border-stone-200 bg-white/80 px-2.5 py-1.5 text-[10px] font-bold text-stone-600 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900/40 dark:text-stone-300"
                    >
                      <RefreshCw className="h-3 w-3" /> 刷新
                    </button>
                    {codexStatus?.authenticated && (
                      <button
                        type="button"
                        onClick={() => void runCodexAction('logout', onLogoutCodex)}
                        disabled={!!working}
                        className="flex items-center gap-1 rounded-[12px] px-2 py-1.5 text-[10px] font-bold text-red-500 disabled:opacity-50"
                      >
                        <LogOut className="h-3 w-3" /> 退出
                      </button>
                    )}
                  </div>
                </div>
              )}

              <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                Agent 系统提示词
                <textarea
                  value={draft.systemPrompt}
                  onChange={event => setDraft(current => ({ ...current, systemPrompt: event.target.value }))}
                  rows={3}
                  className="resize-y rounded-[14px] border border-stone-200 bg-white/82 px-2.5 py-2 text-[10px] font-medium leading-4 text-stone-700 outline-none dark:border-stone-700 dark:bg-stone-900/42 dark:text-stone-200"
                />
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                  画布操作审批
                  <select
                    value={draft.approvalMode}
                    onChange={event => setDraft(current => ({ ...current, approvalMode: event.target.value === 'auto' ? 'auto' : 'ask' }))}
                    className="rounded-[12px] border border-stone-200 bg-white/82 px-2 py-1.5 text-[10px] text-stone-700 dark:border-stone-700 dark:bg-stone-900/42 dark:text-stone-200"
                  >
                    <option value="ask">每次修改前确认</option>
                    <option value="auto">安全操作自动执行</option>
                  </select>
                </label>
                <label className="flex items-center justify-between gap-2 self-end rounded-[12px] border border-stone-200 bg-white/70 px-2 py-1.5 text-[10px] font-bold text-stone-600 dark:border-stone-700 dark:bg-stone-900/35 dark:text-stone-300">
                  保存历史
                  <input
                    type="checkbox"
                    checked={draft.retainHistory}
                    onChange={event => setDraft(current => ({ ...current, retainHistory: event.target.checked }))}
                    className="accent-blue-500"
                  />
                </label>
              </div>

              {message && (
                <div className={`rounded-[12px] px-2 py-1.5 text-[10px] leading-4 ${message.includes('失败') || message.includes('Error') || message.includes('必须') ? 'bg-red-50 text-red-600 dark:bg-red-400/10 dark:text-red-200' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-200'}`}>
                  {message}
                </div>
              )}
              <button
                type="button"
                onClick={() => void saveDraft(false)}
                disabled={loading || !!working}
                className="flex h-8 items-center justify-center gap-1.5 rounded-[14px] bg-stone-900 text-[11px] font-bold text-white transition-colors hover:bg-black disabled:cursor-wait disabled:opacity-55 dark:bg-stone-100 dark:text-stone-900"
              >
                {working === 'save' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : draft.provider === settings.provider ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                保存 Agent 设置
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
