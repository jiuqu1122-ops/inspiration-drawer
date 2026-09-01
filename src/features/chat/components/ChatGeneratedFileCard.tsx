import { invoke } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { Check, Download, ExternalLink, FileText, FolderOpen, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import type { ChatGeneratedFile } from '../model/chatTypes';

const FORMAT_LABELS: Record<string, string> = {
  txt: 'TXT',
  md: 'Markdown',
  csv: 'CSV',
  json: 'JSON',
  docx: 'Word',
  xlsx: 'Excel',
  pdf: 'PDF',
};

const formatBytes = (value?: number) => {
  if (!value || value < 1) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 102.4) / 10} KB`;
  return `${Math.round(value / 1024 / 102.4) / 10} MB`;
};

export function ChatGeneratedFileCard({ file }: { file: ChatGeneratedFile }) {
  const [busy, setBusy] = useState<'open' | 'save' | 'folder' | ''>('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const run = async (action: 'open' | 'save' | 'folder') => {
    if (busy) return;
    setBusy(action);
    setError('');
    try {
      if (action === 'open') {
        await invoke('open_file', { path: file.path });
      } else if (action === 'folder') {
        await invoke('show_in_folder', { path: file.path });
      } else {
        const extension = file.format || file.name.split('.').pop() || 'txt';
        const destination = await save({
          defaultPath: file.name,
          filters: [{ name: FORMAT_LABELS[extension] || extension.toUpperCase(), extensions: [extension] }],
        });
        if (!destination) return;
        await invoke('chat_copy_generated_file', {
          sourcePath: file.path,
          destinationPath: destination,
        });
        setSaved(true);
        window.setTimeout(() => setSaved(false), 1600);
      }
    } catch (reason) {
      setError(String(reason || '文件操作失败'));
    } finally {
      setBusy('');
    }
  };
  const format = file.format || file.name.split('.').pop()?.toLowerCase() || 'file';
  return (
    <div className="chat-generated-file">
      <div className={`chat-generated-file__icon is-${format}`}><FileText size={18} /></div>
      <div className="chat-generated-file__info">
        <strong title={file.name}>{file.name}</strong>
        <span>{FORMAT_LABELS[format] || format.toUpperCase()}{file.size ? ` · ${formatBytes(file.size)}` : ''}</span>
        {error && <small title={error}>{error}</small>}
      </div>
      <div className="chat-generated-file__actions">
        <button type="button" onClick={() => void run('open')} disabled={Boolean(busy)} title="打开文件">
          {busy === 'open' ? <LoaderCircle size={13} className="chat-spin" /> : <ExternalLink size={13} />}
          <span>打开</span>
        </button>
        <button type="button" onClick={() => void run('save')} disabled={Boolean(busy)} title="另存为">
          {busy === 'save' ? <LoaderCircle size={13} className="chat-spin" /> : saved ? <Check size={13} /> : <Download size={13} />}
          <span>{saved ? '已保存' : '另存为'}</span>
        </button>
        <button type="button" className="is-icon" onClick={() => void run('folder')} disabled={Boolean(busy)} title="打开所在位置">
          {busy === 'folder' ? <LoaderCircle size={13} className="chat-spin" /> : <FolderOpen size={13} />}
        </button>
      </div>
    </div>
  );
}
