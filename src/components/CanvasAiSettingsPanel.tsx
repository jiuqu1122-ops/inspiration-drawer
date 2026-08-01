import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCw, Settings, Wallet, X } from 'lucide-react';
import { RoundedSelect, type RoundedSelectOption } from './RoundedSelect';

const PANEL_SELECT_CLASS = 'h-[34px] w-full rounded-[14px] border border-stone-200/80 bg-white/76 px-3 text-xs font-medium text-stone-700 shadow-sm shadow-black/[0.02] hover:bg-white dark:border-stone-700 dark:bg-stone-950/36 dark:text-stone-100 dark:hover:bg-stone-900/70';

type CanvasAiSettingsPanelProps = {
  licenseManaged: boolean;
  managedProviderLabel: string;
  providerValue: string;
  providerOptions: RoundedSelectOption[];
  onProviderChange: (value: string) => void;
  apiProviderValue: string;
  onApiProviderChange: (value: string) => void;
  apiKeyType: 'text' | 'password';
  apiKeyValue: string;
  onApiKeyChange: (value: string) => void;
  apiKeyPlaceholder: string;
  showVideoKey: boolean;
  videoKeyValue: string;
  onVideoKeyChange: (value: string) => void;
  showBalance: boolean;
  balanceStatus: string;
  balanceText: string;
  canCheckBalance: boolean;
  onCheckBalance: () => void;
  showEndpoint: boolean;
  endpointValue: string;
  onEndpointChange: (value: string) => void;
  endpointPlaceholder: string;
  showRemoteModels: boolean;
  isRefreshingModels: boolean;
  canRefreshModels: boolean;
  onRefreshModels: () => void;
  modelHint: string;
  modelError: boolean;
  showHeaders: boolean;
  headersValue: string;
  onHeadersChange: (value: string) => void;
  onClose: () => void;
};

export function CanvasAiSettingsPanel({
  licenseManaged,
  managedProviderLabel,
  providerValue,
  providerOptions,
  onProviderChange,
  apiProviderValue,
  onApiProviderChange,
  apiKeyType,
  apiKeyValue,
  onApiKeyChange,
  apiKeyPlaceholder,
  showVideoKey,
  videoKeyValue,
  onVideoKeyChange,
  showBalance,
  balanceStatus,
  balanceText,
  canCheckBalance,
  onCheckBalance,
  showEndpoint,
  endpointValue,
  onEndpointChange,
  endpointPlaceholder,
  showRemoteModels,
  isRefreshingModels,
  canRefreshModels,
  onRefreshModels,
  modelHint,
  modelError,
  showHeaders,
  headersValue,
  onHeadersChange,
  onClose,
}: CanvasAiSettingsPanelProps) {
  const stopCanvasEditEvent = (event: React.SyntheticEvent) => {
    event.stopPropagation();
  };

  return (
    <motion.div
      data-no-drag="true"
      data-canvas-floating-layer="true"
      data-canvas-soft-panel="true"
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      className="absolute left-4 top-4 z-[100050] w-[320px] rounded-[22px] border border-white/60 bg-white/86 p-3 text-stone-700 shadow-[0_16px_42px_rgba(0,0,0,0.16)] backdrop-blur-2xl dark:border-stone-700/70 dark:bg-stone-900/84 dark:text-stone-200"
      onPointerDown={stopCanvasEditEvent}
      onMouseDown={stopCanvasEditEvent}
      onWheel={stopCanvasEditEvent}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-black">
          <Settings className="h-4 w-4 text-cyan-500" />
          <span>AI API 设置</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-red-500 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-red-300"
          title="关闭"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid gap-2">
        {licenseManaged ? (
          <div
            data-no-drag="true"
            data-canvas-edit-control="true"
            className="rounded-[14px] border border-stone-200/80 bg-white/76 px-3 py-1.5 text-xs font-bold text-stone-700 dark:border-stone-700 dark:bg-stone-950/36 dark:text-stone-100"
          >
            {managedProviderLabel}
          </div>
        ) : (
          <RoundedSelect
            data-no-drag="true"
            data-canvas-edit-control="true"
            value={providerValue}
            options={providerOptions}
            onChange={onProviderChange}
            className={PANEL_SELECT_CLASS}
            menuMinWidth={220}
          />
        )}
        <input
          data-no-drag="true"
          data-canvas-edit-control="true"
          value={apiProviderValue}
          onPointerDown={stopCanvasEditEvent}
          onMouseDown={stopCanvasEditEvent}
          onDoubleClick={stopCanvasEditEvent}
          onKeyDown={stopCanvasEditEvent}
          onChange={event => onApiProviderChange(event.target.value)}
          disabled={licenseManaged}
          placeholder="Provider"
          className="w-full rounded-[14px] border border-stone-200/80 bg-white/76 px-3 py-1.5 text-xs text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 disabled:opacity-75 dark:border-stone-700 dark:bg-stone-950/36 dark:text-stone-100"
        />
        <input
          data-no-drag="true"
          data-canvas-edit-control="true"
          type={apiKeyType}
          value={apiKeyValue}
          onPointerDown={stopCanvasEditEvent}
          onMouseDown={stopCanvasEditEvent}
          onDoubleClick={stopCanvasEditEvent}
          onKeyDown={stopCanvasEditEvent}
          onChange={event => onApiKeyChange(event.target.value)}
          disabled={licenseManaged}
          placeholder={apiKeyPlaceholder}
          className="w-full rounded-[14px] border border-stone-200/80 bg-white/76 px-3 py-1.5 text-xs text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 dark:border-stone-700 dark:bg-stone-950/36 dark:text-stone-100 dark:focus:border-cyan-700 dark:focus:ring-cyan-900/30"
        />
        {showVideoKey && (
          <input
            data-no-drag="true"
            data-canvas-edit-control="true"
            type="password"
            value={videoKeyValue}
            onPointerDown={stopCanvasEditEvent}
            onMouseDown={stopCanvasEditEvent}
            onDoubleClick={stopCanvasEditEvent}
            onKeyDown={stopCanvasEditEvent}
            onChange={event => onVideoKeyChange(event.target.value)}
            placeholder="视频 API Key（可留空，默认复用主 Key）"
            className="w-full rounded-[14px] border border-stone-200/80 bg-white/76 px-3 py-1.5 text-xs text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 dark:border-stone-700 dark:bg-stone-950/36 dark:text-stone-100 dark:focus:border-cyan-700 dark:focus:ring-cyan-900/30"
          />
        )}
        {showBalance && (
          <div className="flex items-center justify-between gap-2 rounded-[14px] border border-stone-200/80 bg-white/64 px-2.5 py-2 dark:border-stone-700 dark:bg-stone-950/34">
            <div className="flex min-w-0 items-center gap-2">
              <Wallet className="h-3.5 w-3.5 shrink-0 text-cyan-600 dark:text-cyan-300" />
              <span className={`truncate text-[10px] font-bold ${balanceStatus === 'error' ? 'text-red-500 dark:text-red-300' : 'text-stone-500 dark:text-stone-300'}`}>
                {balanceText}
              </span>
            </div>
            <button
              type="button"
              data-no-drag="true"
              data-canvas-edit-control="true"
              onPointerDown={stopCanvasEditEvent}
              onMouseDown={stopCanvasEditEvent}
              onClick={onCheckBalance}
              disabled={balanceStatus === 'loading' || !canCheckBalance}
              className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-cyan-100 px-2 text-[10px] font-black text-cyan-700 transition-colors hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-cyan-900/42 dark:text-cyan-100 dark:hover:bg-cyan-900/70"
              title="查询 Gateway 余额"
            >
              <RefreshCw className={`h-3 w-3 ${balanceStatus === 'loading' ? 'animate-spin' : ''}`} />
              查询
            </button>
          </div>
        )}
        {showRemoteModels && (
          <div className="grid gap-1">
            <div className="flex items-center gap-1.5">
              {showEndpoint && (
                <input
                  data-no-drag="true"
                  data-canvas-edit-control="true"
                  value={endpointValue}
                  onPointerDown={stopCanvasEditEvent}
                  onMouseDown={stopCanvasEditEvent}
                  onDoubleClick={stopCanvasEditEvent}
                  onKeyDown={stopCanvasEditEvent}
                  onChange={event => onEndpointChange(event.target.value)}
                  disabled={licenseManaged}
                  placeholder={endpointPlaceholder}
                  className="min-w-0 flex-1 rounded-[14px] border border-stone-200/80 bg-white/76 px-3 py-1.5 text-xs text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 dark:border-stone-700 dark:bg-stone-950/36 dark:text-stone-100 dark:focus:border-cyan-700 dark:focus:ring-cyan-900/30"
                />
              )}
              <button
                type="button"
                data-no-drag="true"
                data-canvas-edit-control="true"
                onPointerDown={stopCanvasEditEvent}
                onMouseDown={stopCanvasEditEvent}
                onClick={onRefreshModels}
                disabled={isRefreshingModels || !canRefreshModels}
                className="h-[30px] shrink-0 rounded-[13px] bg-cyan-100 px-2 text-[10px] font-bold text-cyan-700 disabled:opacity-45 dark:bg-cyan-900/35 dark:text-cyan-200"
              >
                {isRefreshingModels ? '刷新中' : '模型'}
              </button>
            </div>
            <span className={`px-1 text-[10px] leading-4 ${modelError ? 'text-red-500 dark:text-red-300' : 'text-stone-400 dark:text-stone-500'}`}>
              {modelHint}
            </span>
          </div>
        )}
        {showHeaders && (
          <textarea
            data-no-drag="true"
            data-canvas-edit-control="true"
            value={headersValue}
            onPointerDown={stopCanvasEditEvent}
            onMouseDown={stopCanvasEditEvent}
            onDoubleClick={stopCanvasEditEvent}
            onKeyDown={stopCanvasEditEvent}
            onChange={event => onHeadersChange(event.target.value)}
            rows={2}
            spellCheck={false}
            placeholder='Headers JSON，例如 {"X-Tenant":"demo"}'
            className="w-full resize-y rounded-[14px] border border-stone-200/80 bg-white/76 px-3 py-2 font-mono text-[10px] text-stone-700 outline-none transition focus:border-cyan-300 focus:ring-2 focus:ring-cyan-200/50 dark:border-stone-700 dark:bg-stone-950/36 dark:text-stone-100"
          />
        )}
      </div>
    </motion.div>
  );
}
