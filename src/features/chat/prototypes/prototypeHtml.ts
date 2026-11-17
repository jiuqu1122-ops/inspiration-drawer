import { parsePrototype, type PrototypeDocument, type PrototypeNode } from './prototypeSchema';
const escape = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
export const prototypeFileName = (name: string) => (name.replace(/[<>:"/\\|?*]/g, '_').split('').filter(char => char.charCodeAt(0) >= 32).join('').trim().slice(0, 90) || '交互原型');
export function renderPrototypeHtml(value: PrototypeDocument): string {
  const doc = parsePrototype(value);
  const children = new Map<string, PrototypeNode[]>();
  for (const node of doc.nodes) children.set(node.parentId, [...(children.get(node.parentId) || []), node]);
  const actions = new Set(doc.interactions.map(action => action.sourceId));
  const aligns = { start: 'flex-start', center: 'center', end: 'flex-end', 'space-between': 'space-between' };
  const renderNode = (node: PrototypeNode, parentLayout = 'absolute'): string => {
    const container = ['frame', 'state', 'stateGroup'].includes(node.kind);
    const layout = node.kind === 'stateGroup' ? 'absolute' : node.layout || 'absolute';
    const css = [
      `position:${parentLayout === 'absolute' ? 'absolute' : 'relative'}`, `left:${parentLayout === 'absolute' ? node.x || 0 : 0}px`, `top:${parentLayout === 'absolute' ? node.y || 0 : 0}px`,
      `width:${node.width}px`, `height:${node.height}px`, 'flex-shrink:0', `opacity:${node.opacity ?? 1}`,
      `background:${node.fill || (node.kind === 'button' ? '#e8e8e8' : 'transparent')}`, `color:${node.color || '#262626'}`,
      `border:${node.strokeWidth ?? (node.stroke ? 1 : 0)}px solid ${node.stroke || 'transparent'}`, `border-radius:${node.radius || 0}px`,
      `font-family:"${(node.fontFamily || 'Inter').replace(/["\\]/g, '')}",system-ui,sans-serif`, `font-size:${node.fontSize || 14}px`, `font-weight:${node.fontWeight || 400}`,
      `line-height:${node.lineHeight || Math.round((node.fontSize || 14) * 1.4)}px`, `text-align:${node.textAlign || (node.kind === 'button' ? 'center' : 'left')}`,
      container ? 'overflow:hidden' : '', container && layout !== 'absolute' ? `display:flex;flex-direction:${layout === 'vertical' ? 'column' : 'row'};gap:${node.gap || 0}px;padding:${node.padding || 0}px;align-items:${aligns[node.align || 'start']};justify-content:${aligns[node.justify || 'start']}` : '',
      node.kind === 'text' ? 'white-space:pre-wrap;overflow:hidden' : '', node.kind === 'button' ? 'display:flex;align-items:center;justify-content:center;padding:0' : '', actions.has(node.id) ? 'cursor:pointer' : '',
    ].filter(Boolean).join(';');
    const attrs = `data-node="${node.id}" data-kind="${node.kind}" style="${escape(css)}"${actions.has(node.id) && node.kind !== 'button' ? ' tabindex="0" role="button"' : ''}`;
    if (node.kind === 'image') return `<img ${attrs} src="${node.imageData}" alt="${escape(node.name || '')}" draggable="false" />`;
    const tag = node.kind === 'button' ? 'button' : 'div';
    const content = ['text', 'button'].includes(node.kind) ? escape(node.text || '') : (children.get(node.id) || []).map(child => {
      const rendered = renderNode(child, layout);
      return node.kind === 'stateGroup' ? `<div data-state="${child.id}"${child.id === node.initialStateId ? '' : ' hidden'}>${rendered}</div>` : rendered;
    }).join('');
    return `<${tag} ${attrs}${node.kind === 'button' ? ' type="button"' : ''}>${content}</${tag}>`;
  };
  const screens = doc.screens.map(screen => `<section data-screen="${screen.id}" data-overlay="${Boolean(screen.overlay)}" style="position:relative;width:${screen.width}px;height:${screen.height}px;background:${screen.background || '#ffffff'};flex-shrink:0;overflow:hidden" hidden>${(children.get(screen.id) || []).map(child => renderNode(child)).join('')}</section>`).join('');
  const json = JSON.stringify({ start: doc.startScreenId, actions: doc.interactions, groups: doc.nodes.filter(node => node.kind === 'stateGroup').map(group => ({ id: group.id, state: group.initialStateId })) }).replace(/</g, '\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(doc.name)}</title><style>*{box-sizing:border-box}body{margin:0;background:#efefed;font-family:system-ui,sans-serif}button{font:inherit}img{object-fit:cover}[hidden]{display:none!important}#prototype-root{min-height:100vh;display:flex;justify-content:center;align-items:flex-start;position:relative;overflow:auto}#prototype-overlay{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.32);z-index:2;overflow:auto;padding:16px}#prototype-overlay section{max-width:100%}button:focus-visible,[role=button]:focus-visible{outline:2px solid #4267df;outline-offset:2px}</style></head><body><main id="prototype-root">${screens}</main><div id="prototype-overlay" hidden></div><script>
(()=>{'use strict';const data=${json};const root=document.getElementById('prototype-root');const overlay=document.getElementById('prototype-overlay');const history=[];let current=data.start;
const screens=new Map(Array.from(document.querySelectorAll('[data-screen]')).map(node=>[node.dataset.screen,node]));
function close(){const screen=overlay.querySelector('[data-screen]');if(screen){screen.hidden=true;root.appendChild(screen)}overlay.hidden=true}
function reset(screen){for(const group of data.groups){const el=screen.querySelector('[data-node="'+group.id+'"]');if(el)for(const state of el.children)state.hidden=state.dataset.state!==group.state}}
function show(id,remember=true,resetState=true){const next=screens.get(id);if(!next||next.dataset.overlay==='true')return;if(remember&&id!==current)history.push(current);close();current=id;for(const screen of screens.values())screen.hidden=screen!==next;if(resetState)reset(next)}
function run(id){const action=data.actions.find(item=>item.sourceId===id);if(!action)return;
if(action.action==='navigate')show(action.targetId);else if(action.action==='back'){if(!overlay.hidden)close();else if(history.length)show(history.pop(),false,false)}
else if(action.action==='openOverlay'){close();const target=screens.get(action.targetId);target.hidden=false;overlay.appendChild(target);reset(target);overlay.hidden=false}
else if(action.action==='closeOverlay')close();else if(action.action==='setState'){const group=document.querySelector('[data-node="'+action.targetId+'"]');for(const state of group.children)state.hidden=state.dataset.state!==action.stateId}}
document.addEventListener('click',event=>{const node=event.target.closest('[data-node]');if(node){const actionNode=node.closest('[data-node]');let cursor=actionNode;while(cursor){if(data.actions.some(a=>a.sourceId===cursor.dataset.node)){run(cursor.dataset.node);return}cursor=cursor.parentElement?.closest('[data-node]')}}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')close();else if((event.key==='Enter'||event.key===' ')&&event.target.matches('[role=button]')){event.preventDefault();event.target.click()}});show(current,false);
})();</script></body></html>`;
}
