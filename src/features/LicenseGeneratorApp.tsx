import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import {
  CalendarDays,
  Copy,
  FileKey2,
  KeyRound,
  RefreshCw,
  Save,
  ShieldCheck,
  Upload,
  UserRound,
} from 'lucide-react';

type LicenseEdition = 'trial' | 'pro' | 'enterprise';

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

export function LicenseGeneratorApp() {
  const [signingStatus, setSigningStatus] = useState<SigningIdentityStatus | null>(null);
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
      setError('');
      return next;
    } catch (err) {
      setError(String(err || '读取签发密钥状态失败'));
      return null;
    }
  };

  useEffect(() => {
    void refreshSigningStatus();
  }, []);

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
      setError('');
      showToast(saveToFile ? 'license 已保存' : 'license 已生成');
    } catch (err) {
      setError(String(err || '生成失败'));
      await refreshSigningStatus();
    } finally {
      setBusy(false);
    }
  };

  const publicKey = signingStatus?.publicKeyB64 || '';
  const signingReady = signingStatus?.configured === true;

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900 dark:bg-stone-950 dark:text-stone-50">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)] gap-4 p-5">
        <section className="flex min-h-0 flex-col rounded-[8px] border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
          <header className="flex items-center justify-between border-b border-stone-200 px-5 py-4 dark:border-stone-800">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-stone-900 text-white dark:bg-white dark:text-stone-950">
                <FileKey2 className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-base font-black">授权生成器</h1>
                <p className="text-xs font-medium text-stone-500 dark:text-stone-400">Ed25519 离线机器码授权</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void copyText(publicKey, '公钥')}
              disabled={!publicKey || busy}
              className="inline-flex h-9 items-center gap-2 rounded-[8px] bg-stone-900 px-3 text-xs font-bold text-white transition-colors hover:bg-stone-700 disabled:cursor-not-allowed disabled:opacity-45 dark:bg-white dark:text-stone-950 dark:hover:bg-stone-200"
            >
              <Copy className="h-4 w-4" />
              复制公钥
            </button>
          </header>

          <div className="grid gap-4 overflow-auto p-5">
            <div className={`rounded-[8px] border p-3 ${
              signingReady
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-100'
                : 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100'
            }`}>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-sm font-black">
                  <KeyRound className="h-4 w-4" />
                  {signingReady ? '签发密钥已配置' : '尚未配置签发密钥'}
                </span>
                <button
                  type="button"
                  onClick={() => void importSigningKey()}
                  disabled={busy}
                  className="inline-flex h-8 items-center gap-1.5 rounded-[8px] bg-white px-2.5 text-xs font-bold shadow-sm transition-colors hover:bg-stone-100 disabled:cursor-wait disabled:opacity-50 dark:bg-stone-950/45 dark:hover:bg-stone-950/70"
                >
                  <Upload className="h-3.5 w-3.5" />
                  导入签发密钥
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
                <span className="flex items-center gap-1.5 text-xs font-bold text-stone-600 dark:text-stone-300">
                  <UserRound className="h-3.5 w-3.5" />
                  客户名称
                </span>
                <input
                  value={customer}
                  onChange={event => setCustomer(event.target.value)}
                  placeholder="例如：某某工作室"
                  className="h-10 rounded-[8px] border border-stone-200 bg-stone-50 px-3 text-sm outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-bold text-stone-600 dark:text-stone-300">产品名</span>
                <input
                  value={product}
                  onChange={event => setProduct(event.target.value)}
                  className="h-10 rounded-[8px] border border-stone-200 bg-stone-50 px-3 text-sm outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950"
                />
              </label>
            </div>

            <label className="grid gap-1.5">
              <span className="text-xs font-bold text-stone-600 dark:text-stone-300">客户机器码</span>
              <input
                value={machineId}
                onChange={event => setMachineId(event.target.value)}
                spellCheck={false}
                placeholder="从客户软件的离线授权页面复制"
                className="h-10 rounded-[8px] border border-stone-200 bg-stone-50 px-3 font-mono text-xs outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-bold text-stone-600 dark:text-stone-300">版本类型</span>
                <select
                  value={edition}
                  onChange={event => setEdition(event.target.value as LicenseEdition)}
                  className="h-10 rounded-[8px] border border-stone-200 bg-stone-50 px-3 text-sm outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950"
                >
                  {EDITION_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5">
                <span className="flex items-center gap-1.5 text-xs font-bold text-stone-600 dark:text-stone-300">
                  <CalendarDays className="h-3.5 w-3.5" />
                  到期时间
                </span>
                <input
                  type="date"
                  value={expireAt}
                  onChange={event => setExpireAt(event.target.value)}
                  className="h-10 rounded-[8px] border border-stone-200 bg-stone-50 px-3 text-sm outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-950"
                />
              </label>
            </div>

            <div className="grid gap-1.5">
              <span className="text-xs font-bold text-stone-600 dark:text-stone-300">授权范围</span>
              <div className="flex h-12 items-center justify-between rounded-[8px] border border-emerald-200 bg-emerald-50 px-3 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-100">
                <span className="inline-flex items-center gap-2 text-sm font-black">
                  <ShieldCheck className="h-4 w-4" />
                  全部功能
                </span>
                <span className="rounded-[8px] bg-emerald-600 px-2.5 py-1 font-mono text-xs font-bold text-white">*</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => void generateLicense(false)}
                disabled={busy || !signingReady}
                className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-stone-300 dark:disabled:bg-stone-700"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                生成预览
              </button>
              <button
                type="button"
                onClick={() => void generateLicense(true)}
                disabled={busy || !signingReady}
                className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-300 dark:disabled:bg-stone-700"
              >
                <Save className="h-4 w-4" />
                生成并保存
              </button>
            </div>
          </div>
        </section>

        <aside className="flex min-h-0 flex-col gap-4">
          <section className="rounded-[8px] border border-amber-200 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
            <h2 className="text-sm font-black text-amber-900 dark:text-amber-100">签发身份</h2>
            <div className="mt-3 grid gap-2">
              <div>
                <div className="mb-1 text-[11px] font-bold text-amber-800 dark:text-amber-100">PUBLIC_KEY_B64</div>
                <div className="min-h-12 break-all rounded-[8px] bg-white/80 p-2 font-mono text-[11px] text-amber-950 dark:bg-stone-950/40 dark:text-amber-50">
                  {publicKey || '未配置'}
                </div>
              </div>
              <div className="rounded-[8px] bg-white/70 p-2 text-[11px] font-bold leading-4 text-amber-900 dark:bg-stone-950/40 dark:text-amber-100">
                私钥只由 Rust 后端从本机密钥文件读取，不会进入网页、剪贴板或主程序安装包。请离线备份密钥文件，不要发给客户。
              </div>
            </div>
          </section>

          <section className="flex min-h-0 flex-1 flex-col rounded-[8px] border border-stone-200 bg-white shadow-sm dark:border-stone-800 dark:bg-stone-900">
            <header className="flex items-center justify-between border-b border-stone-200 px-4 py-3 dark:border-stone-800">
              <h2 className="text-sm font-black">生成结果</h2>
              <button
                type="button"
                onClick={() => void copyText(generated?.licenseJson || '', 'license')}
                disabled={!generated}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-stone-200 px-2.5 text-xs font-bold text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-45 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
              >
                <Copy className="h-3.5 w-3.5" />
                复制
              </button>
            </header>
            <div className="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-3 p-4">
              <div className="grid gap-2 rounded-[8px] border border-stone-200 bg-stone-50 p-3 text-xs dark:border-stone-700 dark:bg-stone-950">
                <div className="flex items-center justify-between gap-3"><span className="text-stone-500">客户</span><span className="truncate font-bold">{generated?.payload.customer || '-'}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-stone-500">版本</span><span className="font-bold">{generated?.payload.edition || '-'}</span></div>
                <div className="flex items-center justify-between gap-3"><span className="text-stone-500">到期</span><span className="font-bold">{generated?.payload.expire_at || '-'}</span></div>
                <div className="flex items-start justify-between gap-3"><span className="text-stone-500">功能</span><span className="text-right font-bold">{generated?.payload.features.map(feature => (feature === '*' ? '全部功能' : feature)).join(', ') || '-'}</span></div>
              </div>
              <textarea
                value={generated?.licenseJson || ''}
                readOnly
                spellCheck={false}
                placeholder="生成后的 license JSON 会显示在这里"
                className="min-h-0 resize-none rounded-[8px] border border-stone-200 bg-stone-50 p-3 font-mono text-xs leading-5 text-stone-800 outline-none dark:border-stone-700 dark:bg-stone-950 dark:text-stone-100"
              />
            </div>
          </section>
        </aside>

        {(toast || error) && (
          <div className={`fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-[8px] px-4 py-2 text-sm font-bold shadow-lg ${
            error ? 'bg-red-600 text-white' : 'bg-stone-900 text-white dark:bg-white dark:text-stone-950'
          }`}>
            {error || toast}
          </div>
        )}
      </div>
    </main>
  );
}
