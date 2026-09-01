import type { BrowserExtensionStatusKind } from './types';

export const browserExtensionStatusLabel = (status: BrowserExtensionStatusKind) => {
  switch (status) {
    case 'browser_not_installed': return '未检测到浏览器';
    case 'extension_not_installed': return '未安装';
    case 'installing': return '正在准备';
    case 'waiting_for_browser_confirmation': return '等待浏览器确认';
    case 'waiting_for_pairing': return '等待连接';
    case 'connected': return '已连接';
    case 'temporarily_disconnected': return '暂时断开';
    case 'outdated': return '需要更新';
    case 'error': return '连接异常';
    default: return '未检测';
  }
};

export const browserExtensionStatusTone = (status: BrowserExtensionStatusKind) => {
  if (status === 'connected') return 'connected';
  if (status === 'outdated' || status === 'error') return 'warning';
  if (status === 'waiting_for_browser_confirmation' || status === 'waiting_for_pairing' || status === 'installing') return 'pending';
  return 'muted';
};

export const browserExtensionPrimaryAction = (status: BrowserExtensionStatusKind) => {
  if (status === 'connected') return 'open';
  if (status === 'temporarily_disconnected' || status === 'waiting_for_pairing') return 'reconnect';
  if (status === 'browser_not_installed' || status === 'installing' || status === 'waiting_for_browser_confirmation') return 'none';
  return 'install';
};
