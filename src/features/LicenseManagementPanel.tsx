import { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  FolderInput,
  RefreshCw,
  Search,
  ShieldAlert,
  UsersRound,
} from 'lucide-react';
import type { AiGatewayKind } from './agentModel';

export type LicenseEdition = 'trial' | 'pro' | 'enterprise';

export type AuthorizationRecord = {
  product: string;
  customer: string;
  machineId: string;
  edition: LicenseEdition;
  features: string[];
  expireAt: string;
  createdAt: string;
  updatedAt: string;
  issueCount: number;
  lastOutputPath?: string | null;
  aiMode?: string | null;
  managedGatewayKind?: AiGatewayKind | null;
  managedProvider?: string | null;
  managedBaseUrl?: string | null;
  managedModel?: string | null;
  apiKeyLast4?: string | null;
  apiKeyFingerprint?: string | null;
  canvasGatewayKind?: AiGatewayKind | null;
  canvasProvider?: string | null;
  canvasBaseUrl?: string | null;
  canvasModel?: string | null;
  canvasApiKeyLast4?: string | null;
  canvasApiKeyFingerprint?: string | null;
};

type AuthorizationFilter = 'all' | 'valid' | 'expiring' | 'expired';
type AuthorizationHealth = Exclude<AuthorizationFilter, 'all'>;

type LicenseManagementPanelProps = {
  records: AuthorizationRecord[];
  dataPath: string;
  loading: boolean;
  importing: boolean;
  onRefresh: () => Promise<unknown> | void;
  onImport: () => Promise<unknown> | void;
  onRenew: (record: AuthorizationRecord) => void;
};

const DAY_MS = 24 * 60 * 60 * 1000;

const parseInputDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const daysUntilExpiry = (value: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((parseInputDate(value).getTime() - today.getTime()) / DAY_MS);
};

const authorizationHealth = (record: AuthorizationRecord): AuthorizationHealth => {
  const days = daysUntilExpiry(record.expireAt);
  if (days < 0) return 'expired';
  if (days <= 30) return 'expiring';
  return 'valid';
};

const EDITION_LABELS: Record<LicenseEdition, string> = {
  trial: '试用版',
  pro: '专业版',
  enterprise: '高级版',
};

const apiModeLabel = (mode?: string | null) => (
  mode === 'license_managed' ? '高级版托管 API' : mode === 'byok' ? '用户 BYOK' : ''
);

const gatewayLabel = (gateway?: AiGatewayKind | null) => (
  gateway === 'new_api'
    ? 'NewAPI'
    : gateway === 'xais'
      ? 'XAIS'
      : gateway === 'custom'
        ? 'Custom'
        : gateway === 'openai_compatible'
          ? 'OpenAI Compatible'
          : ''
);

const recordApiSummary = (record: AuthorizationRecord) => {
  const mode = apiModeLabel(record.aiMode);
  if (!mode) return '';
  const parts = [mode];
  if (record.managedProvider || record.managedModel || record.apiKeyLast4) {
    parts.push(`Agent ${[gatewayLabel(record.managedGatewayKind), record.managedBaseUrl, record.managedProvider, record.managedModel, record.apiKeyLast4 ? `****${record.apiKeyLast4}` : ''].filter(Boolean).join(' / ')}`);
  }
  if (record.canvasProvider || record.canvasModel || record.canvasApiKeyLast4) {
    parts.push(`画布 ${[gatewayLabel(record.canvasGatewayKind), record.canvasBaseUrl, record.canvasProvider, record.canvasModel, record.canvasApiKeyLast4 ? `****${record.canvasApiKeyLast4}` : ''].filter(Boolean).join(' / ')}`);
  }
  return parts.join(' · ');
};

const HEALTH_STYLES: Record<AuthorizationHealth, { label: string; className: string }> = {
  valid: {
    label: '有效',
    className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-400/10 dark:text-emerald-300',
  },
  expiring: {
    label: '即将到期',
    className: 'bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-400/10 dark:text-amber-200',
  },
  expired: {
    label: '已过期',
    className: 'bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-400/10 dark:text-red-300',
  },
};

const formatUpdatedAt = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

export const buildRenewalExpireAt = (currentExpireAt: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const current = parseInputDate(currentExpireAt);
  const base = current.getTime() > today.getTime() ? current : today;
  base.setFullYear(base.getFullYear() + 1);
  const year = base.getFullYear();
  const month = String(base.getMonth() + 1).padStart(2, '0');
  const day = String(base.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function LicenseManagementPanel({
  records,
  dataPath,
  loading,
  importing,
  onRefresh,
  onImport,
  onRenew,
}: LicenseManagementPanelProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AuthorizationFilter>('all');

  const stats = useMemo(() => {
    const expiring = records.filter(record => authorizationHealth(record) === 'expiring').length;
    const expired = records.filter(record => authorizationHealth(record) === 'expired').length;
    return {
      total: records.length,
      valid: records.length - expired,
      expiring,
      expired,
    };
  }, [records]);

  const visibleRecords = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase();
    return records
      .filter(record => {
        const health = authorizationHealth(record);
        if (filter === 'all') return true;
        if (filter === 'valid') return health !== 'expired';
        return health === filter;
      })
      .filter(record => {
        if (!keyword) return true;
        return [record.customer, record.machineId, record.product, record.edition]
          .some(value => value.toLocaleLowerCase().includes(keyword));
      })
      .sort((left, right) => left.expireAt.localeCompare(right.expireAt));
  }, [filter, query, records]);

  const statCards = [
    { label: '授权总数', value: stats.total, icon: UsersRound, tone: 'text-stone-900 dark:text-white' },
    { label: '当前有效', value: stats.valid, icon: CheckCircle2, tone: 'text-emerald-600 dark:text-emerald-300' },
    { label: '30 天内到期', value: stats.expiring, icon: Clock3, tone: 'text-amber-600 dark:text-amber-300' },
    { label: '已经过期', value: stats.expired, icon: ShieldAlert, tone: 'text-red-600 dark:text-red-300' },
  ];

  return (
    <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-4">
      <div className="grid grid-cols-4 gap-3">
        {statCards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="rounded-[10px] border border-slate-200/70 bg-white/50 p-3 shadow-sm shadow-blue-950/[0.02] backdrop-blur-xl dark:border-white/10 dark:bg-stone-950/28">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold text-stone-500 dark:text-stone-400">{card.label}</p>
                  <p className={`mt-1 text-2xl font-black ${card.tone}`}>{card.value}</p>
                </div>
                <Icon className={`h-5 w-5 ${card.tone}`} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="搜索客户、机器码或产品"
            className="h-10 w-full rounded-[8px] border border-stone-200 bg-stone-50 pl-9 pr-3 text-sm outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950"
          />
        </label>
        <select
          value={filter}
          onChange={event => setFilter(event.target.value as AuthorizationFilter)}
          className="h-10 rounded-[8px] border border-stone-200 bg-stone-50 px-3 text-sm font-bold outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950"
        >
          <option value="all">全部状态</option>
          <option value="valid">有效（含即将到期）</option>
          <option value="expiring">30 天内到期</option>
          <option value="expired">已过期</option>
        </select>
        <button
          type="button"
          onClick={() => void onImport()}
          disabled={importing}
          className="license-button license-button-primary inline-flex h-10 items-center gap-2 px-3 text-sm font-black disabled:cursor-wait disabled:opacity-50"
        >
          <FolderInput className={`h-4 w-4 ${importing ? 'animate-pulse' : ''}`} />
          {importing ? '正在核验' : '导入历史授权'}
        </button>
        <button
          type="button"
          onClick={() => void onRefresh()}
          disabled={loading}
          className="license-button license-button-secondary inline-flex h-10 items-center gap-2 px-3 text-sm font-bold disabled:cursor-wait disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      <div className="min-h-0 overflow-auto rounded-[10px] border border-slate-200/70 bg-white/42 shadow-inner shadow-blue-950/[0.02] dark:border-white/10 dark:bg-stone-950/24">
        <div className="sticky top-0 z-10 grid grid-cols-[minmax(170px,1.15fr)_minmax(160px,1fr)_100px_100px_84px] gap-3 border-b border-slate-200/70 bg-white/88 px-4 py-2.5 text-[11px] font-black text-stone-500 backdrop-blur-xl dark:border-white/10 dark:bg-stone-900/88 dark:text-stone-300">
          <span>客户 / 产品</span>
          <span>机器码</span>
          <span>到期时间</span>
          <span>状态</span>
          <span className="text-right">操作</span>
        </div>

        {visibleRecords.length > 0 ? visibleRecords.map(record => {
          const health = authorizationHealth(record);
          const healthStyle = HEALTH_STYLES[health];
          const days = daysUntilExpiry(record.expireAt);
          const apiSummary = recordApiSummary(record);
          return (
            <div
              key={`${record.product}:${record.machineId}`}
              className="grid grid-cols-[minmax(170px,1.15fr)_minmax(160px,1fr)_100px_100px_84px] items-center gap-3 border-b border-slate-200/55 px-4 py-3 last:border-b-0 hover:bg-white/78 dark:border-white/8 dark:hover:bg-white/5"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-black">{record.customer}</div>
                <div className="mt-0.5 truncate text-[11px] font-medium text-stone-500 dark:text-stone-400">
                  {record.product} · {EDITION_LABELS[record.edition]} · 签发 {record.issueCount} 次
                </div>
                {apiSummary && (
                  <div className="mt-1 truncate text-[10px] font-bold text-cyan-700 dark:text-cyan-200" title={apiSummary}>
                    {apiSummary}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate font-mono text-xs font-bold" title={record.machineId}>{record.machineId}</div>
                <div className="mt-0.5 text-[10px] text-stone-400">更新于 {formatUpdatedAt(record.updatedAt)}</div>
              </div>
              <div>
                <div className="text-xs font-black">{record.expireAt}</div>
                <div className="mt-0.5 text-[10px] text-stone-400">
                  {days < 0 ? `已过 ${Math.abs(days)} 天` : `剩余 ${days} 天`}
                </div>
              </div>
              <div>
                <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black ring-1 ring-inset ${healthStyle.className}`}>
                  {healthStyle.label}
                </span>
              </div>
              <div className="text-right">
                <button
                  type="button"
                  onClick={() => onRenew(record)}
                  className="license-button license-button-primary inline-flex h-8 items-center gap-1 px-2.5 text-xs font-bold"
                >
                  <CalendarClock className="h-3.5 w-3.5" />
                  续费
                </button>
              </div>
            </div>
          );
        }) : (
          <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
            <UsersRound className="h-8 w-8 text-stone-300 dark:text-stone-600" />
            <p className="mt-3 text-sm font-black">{records.length === 0 ? '还没有授权记录' : '没有匹配的授权'}</p>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              {records.length === 0 ? '生成第一份 license 后，会自动出现在这里。' : '换个关键词或状态筛选试试。'}
            </p>
          </div>
        )}
      </div>

      <p className="truncate text-[10px] font-medium text-stone-400" title={dataPath}>
        台账保存在本机：{dataPath || '正在读取数据位置...'}
      </p>
    </div>
  );
}
