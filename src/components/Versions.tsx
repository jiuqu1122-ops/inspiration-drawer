import React, { useState, useEffect } from 'react';
// 🌟 引入 Tauri 提供的 App API
import { getVersion, getTauriVersion } from '@tauri-apps/api/app';

function Versions(): React.JSX.Element {
  const [appVer, setAppVer] = useState('');
  const [tauriVer, setTauriVer] = useState('');

  useEffect(() => {
    // 异步获取应用版本和 Tauri 框架版本，加上错误打印方便排查
    getVersion().then(setAppVer).catch((e) => console.warn('获取App版本失败:', e));
    getTauriVersion().then(setTauriVer).catch((e) => console.warn('获取Tauri版本失败:', e));
  }, []);

  return (
    <ul 
      // 🌟 加上 cursor-default，让鼠标移上去是普通箭头
      className="versions flex gap-4 text-[10px] text-stone-400 dark:text-stone-500 font-mono cursor-default"
      // 🌟 防穿透装甲：防止点击文字时导致抽屉意外收回
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* 🌟 兜底装甲：如果 Tauri 权限没开导致获取失败，默认显示 2.0 */}
      <li className="app-version">灵感抽屉 v{appVer || '2.0.0'}</li>
      <li className="tauri-version">Tauri v{tauriVer || '2.0'}</li>
      <li className="webview-version">System WebView</li>
    </ul>
  );
}

export default Versions;