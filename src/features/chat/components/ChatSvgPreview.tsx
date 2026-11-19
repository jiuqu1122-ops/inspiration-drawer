import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Copy, X } from 'lucide-react';
export function ChatSvgPreview({name,source,url,onClose}:{name:string;source:string;url:string;onClose:()=>void}){
  const close=useRef<HTMLButtonElement>(null);const[copied,setCopied]=useState(false);
  useEffect(()=>{const previous=document.activeElement;close.current?.focus();const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.stopPropagation();onClose();}};window.addEventListener('keydown',key,true);return()=>{window.removeEventListener('keydown',key,true);if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};},[onClose]);
  return createPortal(<div className="chat-svg-preview-backdrop" onClick={event=>{if(event.target===event.currentTarget)onClose();}}><section className="chat-svg-preview" role="dialog" aria-modal="true" aria-label="SVG 矢量图预览"><header><span>{name}</span><div><button type="button" onClick={()=>void navigator.clipboard.writeText(source).then(()=>setCopied(true)).catch(()=>setCopied(false))}><Copy size={13}/>{copied?'已复制':'复制 SVG'}</button><button type="button" ref={close} onClick={onClose} aria-label="关闭 SVG 预览"><X size={15}/></button></div></header><div className="chat-svg-preview__image"><img src={url} alt={name}/></div><footer>真正的 SVG 矢量文件，可无损缩放。下载或另存为请使用聊天文件卡片；无需进入交互原型。</footer></section></div>,document.body);
}
