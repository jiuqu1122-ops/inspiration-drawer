import { SKETCH_EXPORT_NOTICE, SKETCH_EXPORT_LIMITATIONS } from '../prototypes/prototypeSketch';
import { savePrototypePackage } from '../prototypes/prototypePackage';
import { Check, Code2, Copy, Download, Eye, Maximize2, Minimize2, Monitor, RefreshCw, Smartphone, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { MAX_CHAT_HTML_LENGTH, type ChatHtmlArtifact } from '../html/chatHtmlArtifacts';
import { buildChatHtmlPreviewDocument, CHAT_HTML_PREVIEW_CSP, CHAT_HTML_PREVIEW_SANDBOX } from '../html/chatHtmlPreviewDocument';
import { saveChatHtmlArtifact } from '../html/saveChatHtmlArtifact';
import './chatHtmlPreview.css';

export type ChatHtmlPreviewProps = {
  artifacts: ChatHtmlArtifact[];
  selectedId?: string;
  followLatest: boolean;
  conversationId: string;
  onSelect: (id: string) => void;
  onFollowLatest: (follow: boolean) => void;
  onClose: () => void;
};

export function ChatHtmlPreview({ artifacts, selectedId, followLatest, conversationId, onSelect, onFollowLatest, onClose }: ChatHtmlPreviewProps) {
  const artifact = (followLatest ? artifacts[artifacts.length - 1] : artifacts.find(item => item.id === selectedId)) || artifacts[artifacts.length - 1];
  const [mode, setMode] = useState<'preview' | 'code'>('preview');
  const [mobile, setMobile] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [live, setLive] = useState(true);
  const [snapshot, setSnapshot] = useState({ id: artifact?.id, source: artifact?.source || '' });
  const latestRef = useRef(artifact);
  latestRef.current = artifact;
  const [reload, setReload] = useState(0);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState(false);
  const [error, setError] = useState('');
  const [position, setPosition] = useState({ x: 16, y: 56 });
  const panelRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ x: number; y: number; pointerX: number; pointerY: number } | null>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    setSnapshot({ id: artifact?.id, source: artifact?.source || '' });
    setError(''); setSaved(false); setExported(false);
  }, [artifact?.id]); // A different artifact always starts a separate document.
  useEffect(() => {
    if (live && artifact && !artifact.streaming) setSnapshot({ id: artifact.id, source: artifact.source });
  }, [artifact, live]);
  useEffect(() => {
    if (!live || !artifact?.streaming) return;
    // Throttle, rather than trailing debounce: continuous token streams must
    // still paint. Unchanged source never reloads an interactive document.
    const timer = window.setInterval(() => {
      const next = latestRef.current;
      if (next) setSnapshot(previous => previous.id === next.id && previous.source === next.source
        ? previous : { id: next.id, source: next.source });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [live, artifact?.id, artifact?.streaming]);
  useEffect(() => {
    const resize = () => setPosition(previous => ({
      x: Math.max(8, Math.min(previous.x, window.innerWidth - (panelRef.current?.offsetWidth || 320) - 8)),
      y: Math.max(8, Math.min(previous.y, window.innerHeight - (panelRef.current?.offsetHeight || 320) - 8)),
    }));
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);
  const source = snapshot.id === artifact?.id ? snapshot.source : artifact?.source || '';
  const tooLarge = source.length > MAX_CHAT_HTML_LENGTH;
  const srcDoc = useMemo(() => source && !tooLarge ? buildChatHtmlPreviewDocument(source) : '', [source, tooLarge]);
  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if (expanded || event.button !== 0 || (event.target as HTMLElement).closest('button,select,input,label')) return;
    dragRef.current = { ...position, pointerX: event.clientX, pointerY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const moveDrag = (event: PointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    setPosition({
      x: Math.max(8, Math.min(drag.x + event.clientX - drag.pointerX, window.innerWidth - (panelRef.current?.offsetWidth || 320) - 8)),
      y: Math.max(8, Math.min(drag.y + event.clientY - drag.pointerY, window.innerHeight - (panelRef.current?.offsetHeight || 320) - 8)),
    });
  };
  const save = async () => {
    if (!artifact || saving) return;
    setSaving(true); setError('');
    try { setSaved(await saveChatHtmlArtifact(artifact, conversationId)); }
    catch (cause) { setError(String(cause || 'HTML 保存失败')); }
    finally { setSaving(false); }
  };
  const exportFigma = async () => {
    if (!artifact?.prototype || exporting) return;
    setExporting(true); setError('');
    try { setExported(await savePrototypePackage(artifact.prototype, conversationId, artifact.file)); }
    catch (cause) { setError(String(cause || 'Figma 设计文件导出失败')); }
    finally { setExporting(false); }
  };
  return createPortal(
    <section ref={panelRef} className={`chat-html-preview ${expanded ? 'is-expanded' : ''}`} role="dialog" aria-label="Canvas HTML 预览"
      style={expanded ? undefined : { left: position.x, top: position.y }}
      onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } }}>
      <header className="chat-html-preview__header" onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={() => { dragRef.current = null; }} onPointerCancel={() => { dragRef.current = null; }}>
        <div className="chat-html-preview__title"><Code2 size={16} /><strong>Canvas</strong><span>交互预览</span></div>
        <div className="chat-html-preview__actions">
          <button type="button" onClick={() => setExpanded(value => !value)} aria-label={expanded ? '还原预览窗口' : '展开预览窗口'}>{expanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}</button>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭预览"><X size={15} /></button>
        </div>
      </header>
      <div className="chat-html-preview__toolbar">
        <div className="chat-html-preview__tabs" role="group" aria-label="预览模式">
          <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}><Eye size={13} />预览</button>
          <button type="button" aria-pressed={mode === 'code'} onClick={() => setMode('code')}><Code2 size={13} />代码</button>
        </div>
        <div className="chat-html-preview__actions">
          <button type="button" aria-label={mobile ? '切换桌面宽度' : '切换手机宽度'} onClick={() => setMobile(value => !value)}>{mobile ? <Monitor size={14} /> : <Smartphone size={14} />}</button>
          <button type="button" disabled={!artifact} aria-label="刷新预览" onClick={() => { if (artifact) setSnapshot({ id: artifact.id, source: artifact.source }); setReload(value => value + 1); }}><RefreshCw size={13} /></button>
          <button type="button" disabled={!artifact} aria-label="复制 HTML" onClick={() => { if (artifact) void navigator.clipboard.writeText(artifact.source).catch(() => setError('复制失败，请在代码页手动复制')); }}><Copy size={13} /></button>
          <button type="button" disabled={!artifact?.prototype || exporting || artifact.streaming} onClick={() => void exportFigma()} title={artifact?.prototype ? SKETCH_EXPORT_NOTICE : '普通 HTML 不能无损转换；请让 Chat 制作可导入 Figma 的交互原型'} aria-label="导出 Figma 设计文件"><Download size={13} />{exporting ? '导出中' : exported ? '已导出' : '导出 Figma'}</button>
          <button type="button" disabled={!artifact || saving || artifact.streaming} onClick={() => void save()}><Download size={13} />{saving ? '保存中' : saved ? <><Check size={12} />已保存</> : '保存 HTML'}</button>
        </div>
      </div>
      {artifact && <div className="chat-html-preview__versions">
        <select aria-label="HTML 版本" value={artifact.id} onChange={event => { setSaved(false); onSelect(event.target.value); }}>
          {artifacts.map((item, index) => <option key={item.id} value={item.id}>{index + 1}. {item.name}</option>)}
        </select>
        <label><input type="checkbox" checked={followLatest} onChange={event => onFollowLatest(event.target.checked)} />跟随最新</label>
        <label><input type="checkbox" checked={live} onChange={event => setLive(event.target.checked)} />自动刷新</label>
      </div>}
      <div className={`chat-html-preview__body ${mobile && mode === 'preview' ? 'is-mobile' : ''}`}>
        {!artifact ? <div className="chat-html-preview__empty"><Code2 size={28} /><strong>把想法做成可点击的页面</strong><p>在聊天中描述网页或交互原型。需要可编辑 Figma 设计时，请说明“制作可导入 Figma 的原型”，生成后可在这里预览并导出。</p></div>
          : tooLarge ? <p role="alert" className="chat-html-preview__empty">HTML 超过 2 MB，请精简后再预览。</p>
          : mode === 'code' ? <textarea className="chat-html-preview__source" aria-label="HTML 源代码" value={artifact.source} readOnly spellCheck={false} />
          : <iframe key={`${artifact.id}:${reload}`} title="HTML 交互预览" sandbox={CHAT_HTML_PREVIEW_SANDBOX} srcDoc={srcDoc}
            {...{ csp: CHAT_HTML_PREVIEW_CSP }} referrerPolicy="no-referrer"
            allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; payment 'none'" />}
      </div>
      {artifact?.prototype && <div className="chat-html-preview__prototype-info">{artifact.prototype.screens.length} 个页面 · {artifact.prototype.interactions.length} 个交互 · 预览交互保留 · 导出可编辑图层<span>{SKETCH_EXPORT_NOTICE}<br />{SKETCH_EXPORT_LIMITATIONS}</span></div>}
      {error && <div className="chat-html-preview__error" role="alert">{error}</div>}
      <footer className="chat-html-preview__footer"><span>{artifact?.streaming ? '生成中 · 每秒更新' : !live ? '自动刷新已暂停' : '可直接点击页面进行交互'}</span><span title="预览脚本与应用隔离，不能访问本地文件、MCP 或联网 API。外部资源可能无法显示。">隔离预览 · 仅内联资源</span></footer>
    </section>, document.body,
  );
}
