import { useEffect, useState, type MouseEvent, type PointerEvent } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  CalendarDays,
  Copy,
  FileKey2,
  FilePlus2,
  KeyRound,
  ListChecks,
  Minus,
  Moon,
  RefreshCw,
  Save,
  ShieldCheck,
  Square,
  Sun,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import {
  buildRenewalExpireAt,
  LicenseManagementPanel,
  type AuthorizationRecord,
  type LicenseEdition,
} from './LicenseManagementPanel';

type LicensePayload = {
  product: string;
  customer: string;
  machine_id: string;
  edition: LicenseEdition;
  features: string[];
  expire_at: string;
};

type GeneratedLicense = {
  licenseJson: string;
  publicKeyB64: string;
  payload: LicensePayload;
};

type SigningIdentityStatus = {
  configured: boolean;
  publicKeyB64: string;
  keyPath: string;
  message?: string | null;
};

type AuthorizationRegistrySnapshot = {
  records: AuthorizationRecord[];
  dataPath: string;
};

type ImportedLicensesResult = {
  importedCount: number;
  addedCount: number;
  updatedCount: number;
  failedCount: number;
  failures: Array<{ path: string; message: string }>;
};

const FULL_LICENSE_FEATURES = ['*'];
const EDITION_OPTIONS: Array<{ value: LicenseEdition; label: string }> = [
  { value: 'trial', label: '试用版' },
  { value: 'pro', label: '专业版' },
  { value: 'enterprise', label: '企业版' },
];

const todayPlusOneYear = () => {
  const date = new Date();
  date.setFullYear(date.getFullYear() + 1);
  return date.toISOString().slice(0, 10);
};

const buildOutputName = (customer: string, machineId: string) => {
  const base = (customer || machineId.slice(0, 10) || 'customer')
    .replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_')
    .trim()
    .slice(0, 48) || 'customer';
  return `${base}.license.json`;
};

const appWindow = getCurrentWindow();

export function LicenseGeneratorApp() {
  const [isDark, setIsDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const [activeView, setActiveView] = useState<'issue' | 'manage'>('issue');
  const [signingStatus, setSigningStatus] = useState<SigningIdentityStatus | null>(null);
  const [authorizationRecords, setAuthorizationRecords] = useState<AuthorizationRecord[]>([]);
  const [authorizationDataPath, setAuthorizationDataPath] = useState('');
  const [registryLoading, setRegistryLoading] = useState(false);
  const [importingLicenses, setImportingLicenses] = useState(false);
  const [renewingRecord, setRenewingRecord] = useState<AuthorizationRecord | null>(null);
  const [machineId, setMachineId] = useState('');
  const [customer, setCustomer] = useState('');
  const [product, setProduct] = useState('Inspiration Drawer');
  const [edition, setEdition] = useState<LicenseEdition>('pro');
  const [expireAt, setExpireAt] = useState(todayPlusOneYear);
  const [generated, setGenerated] = useState<GeneratedLicense | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 2200);
  };

  const refreshSigningStatus = async () => {
    try {
      const next = await invoke<SigningIdentityStatus>('get_generator_signing_status');
      setSigningStatus(next);
      return next;
    } catch (err) {
      setError(String(err || '读取签发密钥状态失败'));
      return null;
    }
  };

  const refreshAuthorizationRegistry = async () => {
    try {
      setRegistryLoading(true);
      const next = await invoke<AuthorizationRegistrySnapshot>('get_authorization_registry');
      setAuthorizationRecords(next.records);
      setAuthorizationDataPath(next.dataPath);
      return next;
    } catch (err) {
      setError(String(err || '读取授权台账失败'));
      return null;
    } finally {
      setRegistryLoading(false);
    }
  };

  useEffect(() => {
    void refreshSigningStatus();
    void refreshAuthorizationRegistry();
  }, []);

  useEffect(() => {
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const copyText = async (value: string, label: string) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast(`${label}已复制`);
    } catch (_) {
      setError('复制失败，请手动选中复制');
    }
  };

  const importSigningKey = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: 'Signing key', extensions: ['json', 'key', 'txt'] }],
      });
      if (!selected || Array.isArray(selected)) return;
      setBusy(true);
      const next = await invoke<SigningIdentityStatus>('import_generator_signing_key', {
        sourcePath: selected,
      });
      setSigningStatus(next);
      setGenerated(null);
      setError('');
      showToast('签发密钥已导入');
    } catch (err) {
      setError(String(err || '导入签发密钥失败'));
    } finally {
      setBusy(false);
    }
  };

  const importIssuedLicenses = async () => {
    if (!signingStatus?.configured) {
      setError('请先导入签发密钥，才能核验历史 license');
      return;
    }

    try {
      const selected = await open({
        multiple: true,
        filters: [{ name: '已签发 License', extensions: ['json', 'license'] }],
      });
      if (!selected) return;
      const sourcePaths = Array.isArray(selected) ? selected : [selected];
      if (sourcePaths.length === 0) return;

      setImportingLicenses(true);
      setError('');
      const result = await invoke<ImportedLicensesResult>('import_issued_licenses', { sourcePaths });
      await refreshAuthorizationRegistry();
      if (result.failedCount > 0) {
        const firstFailure = result.failures[0];
        setError(
          `已导入 ${result.importedCount} 份，${result.failedCount} 份失败：${firstFailure?.message || '文件无效'}`,
        );
        return;
      }
      showToast(`历史授权已导入：新增 ${result.addedCount}，更新 ${result.updatedCount}`);
    } catch (err) {
      setError(String(err || '导入历史授权失败'));
    } finally {
      setImportingLicenses(false);
    }
  };

  const buildInput = () => {
    setError('');
    if (!signingStatus?.configured) {
      setError('请先导入签发密钥文件');
      return null;
    }
    if (!machineId.trim()) {
      setError('请填写客户机器码');
      return null;
    }
    if (!customer.trim()) {
      setError('请填写客户名称');
      return null;
    }
    if (!expireAt.trim()) {
      setError('请选择到期时间');
      return null;
    }

    return {
      machineId: machineId.trim(),
      customer: customer.trim(),
      product: product.trim() || 'Inspiration Drawer',
      edition,
      expireAt,
      features: FULL_LICENSE_FEATURES,
    };
  };

  const generateLicense = async (saveToFile: boolean) => {
    const input = buildInput();
    if (!input) return;

    try {
      setBusy(true);
      let outPath: string | null = null;
      if (saveToFile) {
        const selected = await save({
          defaultPath: buildOutputName(customer.trim(), machineId.trim()),
          filters: [{ name: 'License', extensions: ['json', 'license'] }],
        });
        if (!selected) return;
        outPath = selected;
      }

      const next = await invoke<GeneratedLicense>('generate_license_file', { input, outPath });
      setGenerated(next);
      const wasRenewal = renewingRecord !== null;
      setRenewingRecord(null);
      const refreshedRegistry = await refreshAuthorizationRegistry();
      if (!refreshedRegistry) return;
      setError('');
      showToast(wasRenewal
        ? (saveToFile ? '续费 license 已保存，台账已更新' : '续费 license 已生成，台账已更新')
        : (saveToFile ? 'license 已保存，台账已更新' : 'license 已生成，台账已更新'));
    } catch (err) {
      setError(String(err || '生成失败'));
      await refreshSigningStatus();
    } finally {
      setBusy(false);
    }
  };

  const publicKey = signingStatus?.publicKeyB64 || '';
  const signingReady = signingStatus?.configured === true;

  const beginRenewal = (record: AuthorizationRecord) => {
    setCustomer(record.customer);
    setMachineId(record.machineId);
    setProduct(record.product);
    setEdition(record.edition);
    setExpireAt(buildRenewalExpireAt(record.expireAt));
    setGenerated(null);
    setRenewingRecord(record);
    setActiveView('issue');
    setError('');
    showToast(`已带入 ${record.customer}，到期时间顺延一年`);
  };

  const isWindowInteractiveTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement
    && !!target.closest('button, input, textarea, select, a, [role="button"], [data-no-drag="true"]');

  const startWindowDrag = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || isWindowInteractiveTarget(event.target)) return;
    void appWindow.startDragging().catch(err => {
      console.warn('授权生成器窗口拖拽失败:', err);
    });
  };

  const toggleWindowMaximizeFromChrome = (event: MouseEvent<HTMLElement>) => {
    if (isWindowInteractiveTarget(event.target)) return;
    void appWindow.toggleMaximize().catch(err => {
      console.warn('授权生成器窗口最大化失败:', err);
      setError(`窗口最大化失败：${String(err || '权限不足')}`);
    });
  };

  const runWindowAction = (action: 'minimize' | 'maximize' | 'close') => {
    const task = action === 'minimize'
      ? appWindow.minimize()
      : action === 'maximize'
        ? appWindow.toggleMaximize()
        : appWindow.close();
    void task.catch(err => {
      const label = action === 'minimize' ? '最小化' : action === 'maximize' ? '最大化' : '关闭';
      console.warn(`授权生成器窗口${label}失败:`, err);
      setError(`窗口${label}失败：${String(err || '权限不足')}`);
    });
  };

  return (
    <main className={`${isDark ? 'dark ' : ''}license-generator-theme min-h-screen overflow-hidden font-sans`}>
      <div className="license-window-frame flex h-screen min-h-screen flex-col overflow-hidden">
        <div className="license-app-shell mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col p-3">
          <section className="license-main-surface flex min-h-0 flex-1 flex-col overflow-hidden">
        <header
          className="license-topbar flex shrink-0 items-center justify-between gap-4 px-5"
          onPointerDown={startWindowDrag}
          onDoubleClick={toggleWindowMaximizeFromChrome}
        >
          <div className="license-topbar-drag-zone flex min-w-0 flex-1 items-center gap-3 self-stretch">
            <div className="license-app-mark flex h-11 w-11 shrink-0 items-center justify-center text-white">
              <FileKey2 className="h-5 w-5" strokeWidth={2.2} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[17px] font-black tracking-[-0.025em]">授权工作台</h1>
                <span className={`license-status-dot ${signingReady ? 'is-ready' : ''}`} />
              </div>
              <p className="truncate text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                {signingReady ? '签发身份可用' : '等待配置签发身份'} · Ed25519
              </p>
            </div>
          </div>

          <nav className="license-view-switch" data-no-drag="true" aria-label="授权器视图">
            <button
              type="button"
              onClick={() => setActiveView('issue')}
              className={activeView === 'issue' ? 'is-active' : ''}
            >
              <FilePlus2 className="h-4 w-4" />
              签发授权
            </button>
            <button
              type="button"
              onClick={() => setActiveView('manage')}
              className={activeView === 'manage' ? 'is-active' : ''}
            >
              <ListChecks className="h-4 w-4" />
              授权管理
              <span className="license-count-badge">{authorizationRecords.length}</span>
            </button>
          </nav>

          <div className="flex shrink-0 items-center gap-2" data-no-drag="true">
            {activeView === 'issue' && (
              <button
                type="button"
                onClick={() => void copyText(publicKey, '公钥')}
                disabled={!publicKey || busy}
                className="license-button license-button-secondary inline-flex h-9 items-center gap-2 px-3 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Copy className="h-3.5 w-3.5" />
                复制公钥
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsDark(value => !value)}
              title={isDark ? '切换浅色' : '切换深色'}
              aria-label={isDark ? '切换浅色' : '切换深色'}
              className="license-button license-button-secondary flex h-9 w-9 items-center justify-center p-0"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="license-window-controls ml-1 flex h-9 shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="最小化"
                onPointerDown={event => event.stopPropagation()}
                onClick={() => runWindowAction('minimize')}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="最大化"
                onPointerDown={event => event.stopPropagation()}
                onClick={() => runWindowAction('maximize')}
              >
                <Square className="h-3 w-3" />
              </button>
              <button
                type="button"
                aria-label="关闭"
                className="is-close"
                onPointerDown={event => event.stopPropagation()}
                onClick={() => runWindowAction('close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        {activeView === 'issue' ? (
          <div className="license-workspace grid min-h-0 flex-1">
            <section className="license-issue-panel flex min-h-0 flex-col overflow-hidden">
              <div className="license-panel-heading shrink-0 px-5 pb-4 pt-5">
                <p className="license-eyebrow">NEW LICENSE</p>
                <div className="mt-1 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-black tracking-[-0.03em]">签发新授权</h2>
                    <p className="mt-1 text-xs font-medium text-stone-500 dark:text-stone-400">填写客户信息，生成仅绑定该设备的离线授权。</p>
                  </div>
                  <span className="license-step-label">01 / 签发</span>
                </div>
              </div>

              <div className="grid gap-4 overflow-auto px-5 pb-5">
            {renewingRecord && (
              <div className="license-notice is-renewal flex items-center justify-between gap-3 p-3">
                <div>
                  <p className="text-xs font-black">正在为 {renewingRecord.customer} 续费</p>
                  <p className="mt-1 text-[11px] font-medium opacity-75">
                    原到期日 {renewingRecord.expireAt}，新到期日已自动顺延一年
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRenewingRecord(null)}
                  className="license-button license-button-secondary h-8 px-2.5 text-xs font-bold"
                >
                  取消续费
                </button>
              </div>
            )}
            <div className={`license-notice ${signingReady ? 'is-ready' : 'is-warning'} p-3`}>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-black">
                  <KeyRound className="h-4 w-4" />
                  {signingReady ? '签发密钥已配置' : '尚未配置签发密钥'}
                </span>
                <button
                  type="button"
                  onClick={() => void importSigningKey()}
                  disabled={busy}
                  className="license-button license-button-secondary inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-bold disabled:cursor-wait disabled:opacity-50"
                >
                  <Upload className="h-3.5 w-3.5" />
                  {signingReady ? '更换密钥' : '导入密钥'}
                </button>
              </div>
              <p className="mt-2 break-all text-[10px] font-medium opacity-75">
                {signingStatus?.keyPath || '正在读取密钥位置...'}
              </p>
              {!signingReady && signingStatus?.message && (
                <p className="mt-2 text-[11px] font-bold">{signingStatus.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <span className="license-field-label flex items-center gap-1.5">
                  <UserRound className="h-3.5 w-3.5" />
                  客户名称
                </span>
                <input
                  value={customer}
                  onChange={event => setCustomer(event.target.value)}
                  placeholder="例如：某某工作室"
                  className="license-input h-10 px-3 text-sm"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="license-field-label">产品名称</span>
                <input
                  value={product}
                  onChange={event => setProduct(event.target.value)}
                  className="license-input h-10 px-3 text-sm"
                />
              </label>
            </div>

            <label className="grid gap-1.5">
              <span className="license-field-label">客户机器码</span>
              <input
                value={machineId}
                onChange={event => setMachineId(event.target.value)}
                spellCheck={false}
                placeholder="从客户软件的离线授权页面复制"
                className="license-input h-10 px-3 font-mono text-xs tracking-[0.02em]"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <span className="license-field-label">授权版本</span>
                <select
                  value={edition}
                  onChange={event => setEdition(event.target.value as LicenseEdition)}
                  className="license-input h-10 px-3 text-sm"
                >
                  {EDITION_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="license-field-label flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5" />
                  到期时间
                </span>
                <input
                  type="date"
                  value={expireAt}
                  onChange={event => setExpireAt(event.target.value)}
                  className="license-input h-10 px-3 text-sm"
                />
              </label>
            </div>

            <div className="grid gap-1.5">
              <span className="license-field-label">授权范围</span>
              <div className="license-scope-row flex h-12 items-center justify-between px-3.5">
                <span className="inline-flex items-center gap-2 text-sm font-black">
                  <ShieldCheck className="h-4 w-4" />
                  全部功能
                </span>
                <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400">FULL ACCESS</span>
              </div>
            </div>

            <div className="grid grid-cols-[0.82fr_1.18fr] gap-2 pt-1">
              <button
                type="button"
                onClick={() => void generateLicense(false)}
                disabled={busy || !signingReady}
                className="license-button license-button-secondary inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                生成预览
              </button>
              <button
                type="button"
                onClick={() => void generateLicense(true)}
                disabled={busy || !signingReady}
                className="license-button license-button-primary inline-flex h-11 items-center justify-center gap-2 px-4 text-sm font-black disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Save className="h-4 w-4" />
                {renewingRecord ? '续费并保存' : '生成并保存'}
              </button>
            </div>
              </div>
            </section>

            <aside className="license-side-panel flex min-h-0 flex-col">
              <section className="license-side-section shrink-0 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="license-eyebrow">SIGNING IDENTITY</p>
                    <h2 className="mt-1 text-sm font-black">签发身份</h2>
                  </div>
                  <span className={`license-status-pill ${signingReady ? 'is-ready' : ''}`}>
                    <span />{signingReady ? '可用' : '未配置'}
                  </span>
                </div>
                <div className="mt-3 grid gap-2.5">
                  <div>
                    <div className="mb-1 text-[11px] font-bold text-stone-500 dark:text-stone-400">PUBLIC_KEY_B64</div>
                    <div className="license-code-block min-h-12 break-all p-3 font-mono text-[10px] leading-4">
                      {publicKey || '未配置签发公钥'}
                    </div>
                  </div>
                  <div className="license-security-note text-[10px] font-medium leading-[1.65]">
                    私钥仅由本机后端读取，不进入页面或安装包。请离线备份，切勿发送给客户。
                  </div>
                </div>
              </section>

              <section className="license-side-section license-output-section flex min-h-0 flex-1 flex-col overflow-hidden">
                <header className="license-result-header flex items-center justify-between px-4 py-3.5">
                  <div>
                    <p className="license-eyebrow">OUTPUT</p>
                    <h2 className="mt-1 text-sm font-black">生成结果</h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyText(generated?.licenseJson || '', 'license')}
                    disabled={!generated}
                    className="license-button license-button-secondary inline-flex h-8 items-center gap-1.5 px-2.5 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    复制
                  </button>
                </header>
                {generated ? (
                  <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
                    <div className="license-result-summary grid gap-2 p-3 text-xs">
                      <div className="flex items-center justify-between gap-3"><span className="text-stone-500">客户</span><span className="truncate font-bold">{generated.payload.customer}</span></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-stone-500">版本</span><span className="font-bold">{generated.payload.edition}</span></div>
                      <div className="flex items-center justify-between gap-3"><span className="text-stone-500">到期</span><span className="font-bold">{generated.payload.expire_at}</span></div>
                      <div className="flex items-start justify-between gap-3"><span className="text-stone-500">功能</span><span className="text-right font-bold">{generated.payload.features.map(feature => (feature === '*' ? '全部功能' : feature)).join(', ')}</span></div>
                    </div>
                    <textarea
                      value={generated.licenseJson}
                      readOnly
                      spellCheck={false}
                      className="license-code-block min-h-0 resize-none p-3 font-mono text-[10px] leading-4 outline-none"
                    />
                  </div>
                ) : (
                  <div className="license-empty-result flex min-h-0 flex-1 flex-col items-center justify-center px-8 text-center">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full">
                      <FileKey2 className="h-5 w-5" />
                    </div>
                    <p className="mt-3 text-sm font-black">等待生成授权</p>
                    <p className="mt-1 max-w-[240px] text-[11px] font-medium leading-5 text-stone-500 dark:text-stone-400">
                      完成左侧信息后生成预览，签名结果会安全地显示在这里。
                    </p>
                  </div>
                )}
              </section>
            </aside>
          </div>
        ) : (
          <section className="license-management-panel-shell flex min-h-0 flex-1 flex-col overflow-hidden">
            <LicenseManagementPanel
              records={authorizationRecords}
              dataPath={authorizationDataPath}
              loading={registryLoading}
              importing={importingLicenses}
              onRefresh={refreshAuthorizationRegistry}
              onImport={importIssuedLicenses}
              onRenew={beginRenewal}
            />
          </section>
        )}
          </section>

        {(toast || error) && (
          <div className={`license-toast fixed bottom-5 left-1/2 z-50 -translate-x-1/2 px-4 py-2.5 text-sm font-bold ${
            error ? 'bg-red-600 text-white' : 'bg-stone-900 text-white dark:bg-white dark:text-stone-950'
          }`}>
            {error || toast}
          </div>
        )}
        </div>
      </div>
    </main>
  );
}
