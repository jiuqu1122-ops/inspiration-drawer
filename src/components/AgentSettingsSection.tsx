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
  Wallet,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentApiBalanceResult,
  AgentApiConnectionResult,
  AgentSettings,
  CodexInstallProgress,
  CodexLoginInfo,
  CodexRuntimeStatus,
} from '../features/agentModel';
import { XAIS_CHAT_ENDPOINT_DEFAULT } from '../features/canvasAiImage';

type AgentSettingsSectionProps = {
  expanded: boolean;
  embedded?: boolean;
  settings: AgentSettings;
  loading: boolean;
  codexStatus: CodexRuntimeStatus | null;
  codexInstallProgress: CodexInstallProgress | null;
  codexLoginInfo: CodexLoginInfo | null;
  apiLockedByLicense?: boolean;
  onToggle?: () => void;
  onSave: (settings: AgentSettings & { apiKey?: string; clearApiKey?: boolean }) => Promise<AgentSettings>;
  onListModels: () => Promise<string[]>;
  onTestConnection?: () => Promise<AgentApiConnectionResult>;
  onQueryBalance?: () => Promise<AgentApiBalanceResult>;
  onRefreshCodexStatus: () => Promise<CodexRuntimeStatus>;
  onInstallCodex: () => Promise<CodexRuntimeStatus>;
  onStartCodexLogin: (mode: 'chatgpt' | 'chatgptDeviceCode') => Promise<CodexLoginInfo>;
  onOpenCodexLoginUrl: (url: string) => Promise<void>;
  onLogoutCodex: () => Promise<void>;
};

export function AgentSettingsSection({
  expanded,
  embedded = false,
  settings,
  loading,
  codexStatus,
  codexInstallProgress,
  codexLoginInfo,
  apiLockedByLicense: forceApiLockedByLicense = false,
  onToggle,
  onSave,
  onListModels,
  onTestConnection,
  onQueryBalance,
  onRefreshCodexStatus,
  onInstallCodex,
  onStartCodexLogin,
  onOpenCodexLoginUrl,
  onLogoutCodex,
}: AgentSettingsSectionProps) {
  const [draft, setDraft] = useState(settings);
  const [apiKey, setApiKey] = useState('');
  const [headersText, setHeadersText] = useState('{}');
  const [models, setModels] = useState<string[]>([]);
  const [working, setWorking] = useState('');
  const [message, setMessage] = useState('');
  const [balanceText, setBalanceText] = useState('');
  const modelsRequestedRef = useRef(false);
  const apiLockedByLicense = forceApiLockedByLicense || draft.apiEditable === false;
  const effectiveProvider = draft.provider;
  const hideXaisBaseUrl = draft.apiGatewayKind === 'xais';
  const canQueryAgentBalance = !!onQueryBalance
    && (draft.hasApiKey || apiKey.trim().length > 0);
  const gatewayLabel = draft.apiGatewayKind === 'new_api'
    ? 'NewAPI'
    : draft.apiGatewayKind === 'xais'
      ? 'XAIS'
      : draft.apiGatewayKind === 'custom'
        ? '自定义'
        : 'OpenAI Compatible';

  useEffect(() => {
    setDraft(settings);
    setHeadersText(JSON.stringify(settings.apiHeaders || {}, null, 2));
  }, [settings]);

  useEffect(() => {
    if (expanded && !codexStatus) void onRefreshCodexStatus().catch(() => {});
  }, [codexStatus, expanded, onRefreshCodexStatus]);

  useEffect(() => {
    if (!draft.hasApiKey) {
      modelsRequestedRef.current = false;
      return;
    }
    if (!expanded || modelsRequestedRef.current) return;
    modelsRequestedRef.current = true;
    setWorking('models');
    setMessage('');
    void onListModels()
      .then(values => setModels(values))
      .catch(error => setMessage(String(error)))
      .finally(() => setWorking(''));
  }, [draft.hasApiKey, expanded, onListModels]);

  const statusLabel = useMemo(() => {
    if (!codexStatus) return '未检查';
    if (!codexStatus.installed) return '未安装';
    if (codexStatus.authenticated) return '已登录';
    return '未登录';
  }, [codexStatus]);

  const saveDraft = async (clearApiKey = false, propagateError = false, showWorking = true) => {
    if (showWorking) setWorking('save');
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
        apiBaseUrl: draft.apiGatewayKind === 'xais'
          ? draft.apiBaseUrl.trim() || XAIS_CHAT_ENDPOINT_DEFAULT
          : draft.apiBaseUrl,
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
      if (showWorking) setWorking('');
    }
  };

  const refreshModels = async () => {
    setWorking('models');
    setMessage('');
    try {
      if (!apiLockedByLicense) await saveDraft(false, true, false);
      const values = await onListModels();
      setModels(values);
      setMessage(`已读取 ${values.length} 个模型`);
    } catch (error) {
      setMessage(String(error));
    } finally {
      setWorking('');
    }
  };

  const testConnection = async () => {
    if (!onTestConnection) return;
    setWorking('connection');
    setMessage('');
    try {
      if (!apiLockedByLicense) await saveDraft(false, true, false);
      const result = await onTestConnection();
      setMessage(result.message || '连接成功');
    } catch (error) {
      setMessage(String(error));
    } finally {
      setWorking('');
    }
  };

  const queryBalance = async () => {
    if (!onQueryBalance) return;
    setWorking('balance');
    setMessage('');
    setBalanceText('');
    try {
      if (!apiLockedByLicense) await saveDraft(false, true, false);
      const result = await onQueryBalance();
      const balance = result.display || (result.totalAvailable != null
        ? `${result.totalAvailable}${result.currency ? ` ${result.currency}` : ''}`
        : '已读取余额');
      const expiresAt = result.expiresAt != null
        ? new Date(result.expiresAt < 1_000_000_000_000 ? result.expiresAt * 1000 : result.expiresAt)
        : null;
      const text = expiresAt && !Number.isNaN(expiresAt.getTime())
        ? `${balance} · Token 到期 ${expiresAt.toLocaleString('zh-CN')}`
        : balance;
      setBalanceText(text);
      setMessage(`Agent API 余额：${text}`);
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
      await saveDraft(false, true, false);
      await action();
      setMessage(key === 'logout'
        ? '已退出 Codex'
        : key === 'install'
          ? 'Codex 运行时已安装'
          : key === 'refresh'
            ? 'Codex 状态已刷新'
            : '已打开 Codex 登录页面');
    } catch (error) {
      setMessage(String(error));
    } finally {
      setWorking('');
    }
  };

  return (
    <div className={embedded
      ? "overflow-hidden rounded-[18px] border border-blue-100 bg-blue-50/35 dark:border-blue-400/20 dark:bg-blue-400/5"
      : "overflow-hidden rounded-[22px] border border-white/60 bg-white/75 shadow-[0_8px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl dark:border-stone-700/60 dark:bg-stone-800/75"}
    >
      {!embedded && (
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
      )}
      {embedded && (
        <div className="flex items-center gap-2 px-3 pt-3 text-[11px] font-black text-blue-800 dark:text-blue-100">
          <Bot className="h-3.5 w-3.5" />
          Agent 设置
        </div>
      )}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.16, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className={`flex flex-col gap-3 px-3 pb-3 pt-2 ${embedded ? '' : 'border-t border-stone-100 dark:border-stone-700/50'}`}>
              <label className="flex flex-col gap-1">
                <span className="text-[11px] font-medium text-stone-600 dark:text-stone-300">Agent 引擎</span>
                <select
                  value={effectiveProvider}
                  disabled={apiLockedByLicense}
                  onChange={event => setDraft(current => ({
                    ...current,
                    provider: event.target.value === 'codex' ? 'codex' : 'openai-compatible',
                  }))}
                  className="w-full rounded-[14px] border border-blue-100 bg-white/82 px-3 py-1.5 text-xs text-stone-700 outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-blue-900/45 dark:bg-stone-800/70 dark:text-stone-200"
                >
                  <option value="openai-compatible">自定义 API（独立 Codex 运行时）</option>
                  <option value="codex">ChatGPT 登录（独立 Codex 运行时）</option>
                </select>
              </label>

              {effectiveProvider === 'openai-compatible' ? (
                apiLockedByLicense ? (
                  <div className="flex flex-col gap-2 rounded-[18px] border border-blue-100 bg-blue-50/55 p-3 dark:border-blue-400/20 dark:bg-blue-400/8">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-[11px] font-black text-blue-800 dark:text-blue-100">
                        <Server className="h-3.5 w-3.5" /> API 配置由高级版授权提供
                      </span>
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200">
                        {draft.hasApiKey ? `Key ****${draft.apiKeyLast4 || ''}` : 'Key 不可用'}
                      </span>
                    </div>
                    <div className="grid gap-1.5 rounded-[14px] bg-white/70 p-2 text-[10px] font-bold text-stone-600 dark:bg-stone-900/35 dark:text-stone-300">
                      <div className="flex justify-between gap-2"><span>配置来源</span><span className="truncate text-right">高级版授权</span></div>
                      <div className="flex justify-between gap-2"><span>Gateway</span><span className="truncate text-right">{gatewayLabel}</span></div>
                      {!hideXaisBaseUrl && <div className="flex justify-between gap-2"><span>Base URL</span><span className="truncate text-right">{draft.apiBaseUrl || '-'}</span></div>}
                      <div className="flex justify-between gap-2"><span>Provider</span><span className="truncate text-right">{draft.apiProvider || '-'}</span></div>
                    </div>
                    <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                      LLM 模型
                      <select
                        value={draft.apiModel}
                        onChange={event => setDraft(current => ({ ...current, apiModel: event.target.value }))}
                        className="w-full rounded-[13px] border border-blue-100 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none dark:border-blue-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                      >
                        {!draft.apiModel && <option value="">{working === 'models' ? '读取模型中…' : '暂无可用模型'}</option>}
                        {draft.apiModel && !models.includes(draft.apiModel) && <option value={draft.apiModel}>{draft.apiModel}（当前）</option>}
                        {models.map(model => <option key={model} value={model}>{model}</option>)}
                      </select>
                    </label>
                     {draft.apiError && (
                      <div className="rounded-[12px] bg-red-50 px-2 py-1.5 text-[9px] leading-4 text-red-600 dark:bg-red-400/10 dark:text-red-200">
                        {draft.apiError}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={() => void testConnection()}
                        disabled={!!working || !draft.hasApiKey || !onTestConnection}
                        className="flex items-center gap-1 rounded-[12px] bg-violet-100 px-2.5 py-1.5 text-[10px] font-black text-violet-700 disabled:opacity-50 dark:bg-violet-400/15 dark:text-violet-100"
                      >
                        {working === 'connection' ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        测试连接
                      </button>
                      <button
                        type="button"
                        onClick={() => void queryBalance()}
                        disabled={!!working || !canQueryAgentBalance}
                        className="flex items-center gap-1 rounded-[12px] bg-emerald-100 px-2.5 py-1.5 text-[10px] font-black text-emerald-700 disabled:opacity-50 dark:bg-emerald-400/15 dark:text-emerald-100"
                      >
                        {working === 'balance' ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Wallet className="h-3 w-3" />}
                        查余额
                      </button>
                    </div>
                  </div>
                ) : (
                <div className="flex flex-col gap-2 rounded-[18px] border border-blue-100 bg-blue-50/55 p-3 dark:border-blue-400/20 dark:bg-blue-400/8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-[11px] font-black text-blue-800 dark:text-blue-100">
                      <Server className="h-3.5 w-3.5" /> 自定义 API · Codex App Server
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${draft.hasApiKey ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200' : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300'}`}>
                      {draft.hasApiKey ? 'Key 已保存' : '未配置 Key'}
                    </span>
                  </div>
                  <p className="text-[9px] leading-4 text-blue-700/75 dark:text-blue-100/65">
                    Gateway 配置同时用于 Agent 对话、工作流规划和 API Runtime；API Key 仅通过运行时环境变量传入。
                  </p>
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    Gateway
                    <select
                      value={draft.apiGatewayKind}
                      onChange={event => {
                        const apiGatewayKind = event.target.value as AgentSettings['apiGatewayKind'];
                        const apiProvider = apiGatewayKind === 'new_api'
                          ? 'new-api'
                          : apiGatewayKind === 'xais'
                            ? 'xais-chat'
                            : apiGatewayKind === 'custom'
                              ? 'custom'
                              : 'openai-compatible';
                        setDraft(current => ({
                          ...current,
                          apiGatewayKind,
                          apiProvider,
                          apiBaseUrl: apiGatewayKind === 'xais'
                            ? (current.apiGatewayKind === 'xais' && current.apiBaseUrl.trim() ? current.apiBaseUrl : XAIS_CHAT_ENDPOINT_DEFAULT)
                            : current.apiBaseUrl,
                        }));
                      }}
                      className="rounded-[13px] border border-blue-100 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none dark:border-blue-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                    >
                      <option value="new_api">NewAPI</option>
                      <option value="xais">XAIS</option>
                      <option value="openai_compatible">OpenAI Compatible</option>
                      <option value="custom">自定义</option>
                    </select>
                  </label>
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    Provider
                    <input
                      value={draft.apiProvider}
                      onChange={event => setDraft(current => ({ ...current, apiProvider: event.target.value }))}
                      placeholder="例如 new-api、xais-chat、openai-compatible"
                      className="rounded-[13px] border border-blue-100 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none dark:border-blue-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                    />
                  </label>
                  {!hideXaisBaseUrl && (
                    <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                      API Base URL
                      <input
                        value={draft.apiBaseUrl}
                        onChange={event => setDraft(current => ({ ...current, apiBaseUrl: event.target.value }))}
                        placeholder="https://api.openai.com/v1"
                        className="rounded-[13px] border border-blue-100 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none dark:border-blue-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                      />
                    </label>
                  )}
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
                      <select
                        value={draft.apiModel}
                        onChange={event => setDraft(current => ({ ...current, apiModel: event.target.value }))}
                        className="min-w-0 flex-1 rounded-[13px] border border-blue-100 bg-white/85 px-2.5 py-1.5 text-xs font-medium text-stone-700 outline-none dark:border-blue-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                      >
                        {!draft.apiModel && <option value="">请先读取模型</option>}
                        {draft.apiModel && !models.includes(draft.apiModel) && (
                          <option value={draft.apiModel}>{draft.apiModel}（当前）</option>
                        )}
                        {models.map(model => <option key={model} value={model}>{model}</option>)}
                      </select>
                      <button
                        type="button"
                        onClick={() => void testConnection()}
                        disabled={!!working || !onTestConnection}
                        className="flex items-center gap-1 rounded-[12px] bg-violet-100 px-2 text-[10px] font-black text-violet-700 disabled:opacity-50 dark:bg-violet-400/15 dark:text-violet-100"
                        title="测试当前 Gateway 连接"
                      >
                        {working === 'connection' ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        测试
                      </button>
                      <button
                        type="button"
                        onClick={() => void refreshModels()}
                        disabled={!!working}
                        className="rounded-[12px] bg-blue-100 px-2 text-[10px] font-black text-blue-700 disabled:opacity-50 dark:bg-blue-400/15 dark:text-blue-100"
                      >
                        {working === 'models' ? '读取中' : '模型'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void queryBalance()}
                        disabled={!!working || !canQueryAgentBalance}
                        className="flex items-center gap-1 rounded-[12px] bg-emerald-100 px-2 text-[10px] font-black text-emerald-700 disabled:opacity-50 dark:bg-emerald-400/15 dark:text-emerald-100"
                        title="查询当前 Agent API 余额"
                      >
                        {working === 'balance' ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Wallet className="h-3 w-3" />}
                        余额
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
                    <span className="text-[9px] font-medium leading-4 text-blue-700/70 dark:text-blue-100/60">
                      {draft.apiGatewayKind === 'new_api'
                        ? 'NewAPI 使用 Bearer Token，余额读取 /api/usage/token/。'
                        : draft.apiGatewayKind === 'xais'
                          ? 'XAIS 保留 X-Linggan-NewAPI-* Headers，并使用 /xais/userProfile 查询余额。'
                          : 'OpenAI Compatible/自定义 Gateway 会依次探测服务支持的余额接口。'}
                    </span>
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
                )
              ) : (
                <div className="flex flex-col gap-2 rounded-[18px] border border-violet-100 bg-violet-50/55 p-3 dark:border-violet-400/20 dark:bg-violet-400/8">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black text-violet-800 dark:text-violet-100">ChatGPT · Codex App Server</span>
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${codexStatus?.authenticated ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-200' : 'bg-stone-100 text-stone-500 dark:bg-stone-700 dark:text-stone-300'}`}>
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-[9px] leading-4 text-violet-700/75 dark:text-violet-100/65">
                    登录信息保存在应用专属的 chatgpt 运行目录，不读取或修改 ~/.codex/config.toml。
                  </p>
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    Codex 可执行文件
                    <input
                      value={draft.codexExecutable}
                      onChange={event => setDraft(current => ({ ...current, codexExecutable: event.target.value }))}
                      placeholder="codex（自动使用内置运行时）"
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
                  <label className="flex flex-col gap-1 text-[10px] font-bold text-stone-500 dark:text-stone-400">
                    推理强度
                    <select
                      value={draft.codexReasoningEffort}
                      onChange={event => setDraft(current => ({
                        ...current,
                        codexReasoningEffort: event.target.value as AgentSettings['codexReasoningEffort'],
                      }))}
                      className="rounded-[12px] border border-violet-100 bg-white/85 px-2 py-1.5 text-[10px] text-stone-700 dark:border-violet-400/20 dark:bg-stone-900/45 dark:text-stone-200"
                    >
                      <option value="">跟随模型默认</option>
                      <option value="minimal">最低</option>
                      <option value="low">低</option>
                      <option value="medium">中</option>
                      <option value="high">高</option>
                      <option value="xhigh">超高</option>
                    </select>
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
                      ? `${codexStatus.version || 'Codex CLI'} · ${codexStatus.managed ? '应用管理' : '系统安装'} · ${codexStatus.authDetail || statusLabel}`
                      : codexStatus?.installAvailable
                        ? `尚未安装 Codex 运行时。点击登录时会自动下载官方 v${codexStatus.managedVersion || '0.142.5'}。`
                        : '未检测到系统 Codex CLI；当前平台不提供托管安装，请先安装 Codex 或配置可执行文件路径。'}
                  </div>
                  {codexInstallProgress && ['downloading', 'verifying', 'extracting'].includes(codexInstallProgress.stage) && (
                    <div className="rounded-[12px] border border-violet-200/70 bg-white/72 px-2 py-1.5 dark:border-violet-400/20 dark:bg-stone-900/40">
                      <div className="flex items-center justify-between gap-2 text-[9px] font-bold text-violet-700 dark:text-violet-100">
                        <span>{codexInstallProgress.message}</span>
                        <span>{Math.round(codexInstallProgress.progress || 0)}%</span>
                      </div>
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-violet-100 dark:bg-violet-950/60">
                        <div className="h-full rounded-full bg-violet-500 transition-[width]" style={{ width: `${Math.max(2, codexInstallProgress.progress || 0)}%` }} />
                      </div>
                    </div>
                  )}
                  {codexInstallProgress?.stage === 'error' && (
                    <div className="rounded-[12px] bg-red-50 px-2 py-1.5 text-[9px] leading-4 text-red-600 dark:bg-red-400/10 dark:text-red-200">
                      {codexInstallProgress.message}
                    </div>
                  )}
                  {codexLoginInfo?.userCode && (
                    <div className="rounded-[12px] bg-white/75 px-2 py-1.5 text-[10px] font-bold text-violet-700 dark:bg-stone-900/45 dark:text-violet-200">
                      设备码：<span className="font-mono text-xs">{codexLoginInfo.userCode}</span>
                    </div>
                  )}
                  {(codexLoginInfo?.authUrl || codexLoginInfo?.verificationUrl) && (
                    <button
                      type="button"
                      onClick={() => void onOpenCodexLoginUrl(codexLoginInfo.authUrl || codexLoginInfo.verificationUrl || '')}
                      className="flex items-center justify-center gap-1 rounded-[12px] border border-violet-200 bg-white/78 px-2.5 py-1.5 text-[10px] font-bold text-violet-700 dark:border-violet-400/20 dark:bg-stone-900/40 dark:text-violet-100"
                    >
                      <ExternalLink className="h-3 w-3" /> 重新打开登录页面
                    </button>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {!codexStatus?.installed && codexStatus?.installAvailable && (
                      <button
                        type="button"
                        onClick={() => void runCodexAction('install', onInstallCodex)}
                        disabled={!!working}
                        className="flex items-center gap-1 rounded-[12px] bg-blue-500 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                      >
                        <Server className="h-3 w-3" /> 安装 Codex
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void runCodexAction('login', () => onStartCodexLogin('chatgpt'))}
                      disabled={!!working}
                      className="flex items-center gap-1 rounded-[12px] bg-violet-500 px-2.5 py-1.5 text-[10px] font-bold text-white disabled:opacity-50"
                    >
                      {working === 'login' ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <LogIn className="h-3 w-3" />} ChatGPT 登录
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
                  软件操作审批
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

              {balanceText && (
                <div className="flex items-center gap-1.5 rounded-[12px] border border-emerald-100 bg-emerald-50 px-2 py-1.5 text-[10px] font-bold leading-4 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100">
                  <Wallet className="h-3 w-3 shrink-0" />
                  <span className="min-w-0 truncate">{balanceText}</span>
                </div>
              )}
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
                {working === 'save' ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : effectiveProvider === settings.provider ? <Save className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
                保存 Agent 设置
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
