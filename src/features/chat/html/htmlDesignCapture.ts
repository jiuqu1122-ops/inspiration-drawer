import { parsePrototype, type PrototypeDocument } from '../prototypes/prototypeSchema';

/** Runs only inside the existing opaque-origin sandbox; no app APIs or external reads. */
export function installHtmlDesignCapture() {
  const channel='drawer-static-design-v1';
  const split=(value:string)=>{const parts:string[]=[];let depth=0,start=0;for(let i=0;i<value.length;i++){if(value[i]==='(')depth++;if(value[i]===')')depth--;if(value[i]===','&&depth===0){parts.push(value.slice(start,i).trim());start=i+1;}}parts.push(value.slice(start).trim());return parts;};
  const color=(value:string):string=>{
    if(value==='transparent')return 'transparent';
    if(/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value))return value;
    const match=value.match(/^rgba?\(([^)]+)\)$/);if(!match)return 'transparent';
    const n=match[1].split(/[\s,/]+/).filter(Boolean).map(Number);if(n.some(v=>!Number.isFinite(v)))return 'transparent';
    return '#'+n.slice(0,3).map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('')+(n.length>3?Math.round(Math.max(0,Math.min(1,n[3]))*255).toString(16).padStart(2,'0'):'');
  };
  const transparent=(c:string)=>c==='transparent'||c.endsWith('00')&&c.length===9;
  window.addEventListener('message',async event=>{
    if(event.source!==parent||!event.data||event.data.channel!==channel||event.data.kind!=='request'||typeof event.data.id!=='string'||event.data.id.length>100)return;
    const id=event.data.id;
    try{
      if(document.fonts)await Promise.race([document.fonts.ready,new Promise(resolve=>setTimeout(resolve,1000))]);
      const width=Math.ceil(Math.max(document.documentElement.clientWidth,document.body.scrollWidth));
      const height=Math.ceil(Math.max(document.documentElement.clientHeight,document.body.scrollHeight));
      if(width>8192||height>8192||width<1||height<1)throw Error('页面尺寸超出 1～8192px 导出范围，请切换到较小尺寸或分页面导出');
      const nodes:Record<string,any>[]=[];const warnings=new Set<string>();let sequence=0;
      const add=(node:Record<string,any>)=>{if(nodes.length>=2000)throw Error('当前页面超过 2000 图层，请拆分页面；未生成不完整设计稿');nodes.push(node);return node.id as string;};
      const shadows=(s:string)=>s==='none'?[]:split(s).slice(0,4).flatMap(part=>{
        const c=part.match(/rgba?\([^)]+\)|#[0-9a-f]{6,8}/i);const lengths=part.replace(c?.[0]||'','').match(/-?[\d.]+px/g)?.map(parseFloat)||[];
        if(lengths.length<2)return [];
        if(Math.abs(lengths[0])>256||Math.abs(lengths[1])>256||(lengths[2]||0)>256||Math.abs(lengths[3]||0)>128){warnings.add('部分超大阴影未导出');return [];}
        return [{x:lengths[0],y:lengths[1],blur:lengths[2]||0,spread:lengths[3]||0,color:color(c?.[0]||'rgb(0,0,0)'),inset:part.includes('inset')}];
      });
      const gradient=(s:string,w:number,h:number)=>{
        if(s==='none')return undefined;
        const match=s.match(/^linear-gradient\((.*)\)$/);if(!match){warnings.add('非线性/多重渐变或 CSS 背景图片未转换，请核对');return undefined;}
        const parts=split(match[1]);let deg=180;
        if(/^-?[\d.]+deg$/.test(parts[0]))deg=parseFloat(parts.shift()!);
        else if(parts[0].startsWith('to ')){const direction=parts.shift()!;deg=direction.includes('right')?(direction.includes('top')?45:direction.includes('bottom')?135:90):direction.includes('left')?(direction.includes('top')?315:direction.includes('bottom')?225:270):direction.includes('top')?0:180;}
        const stops=parts.map((p,i)=>{const c=p.match(/rgba?\([^)]+\)|#[0-9a-f]{6,8}/i);const offset=p.slice(c?.[0].length||0).trim();if(!c||offset&&!/^[\d.]+%$/.test(offset))return null;return {color:color(c[0]),offset:offset?parseFloat(offset)/100:i/(parts.length-1)};});
        if(stops.length<2||stops.length>12||stops.some(s=>!s||s.offset<0||s.offset>1)){warnings.add('复杂渐变色标未转换，请核对');return undefined;}
        const radians=deg*Math.PI/180,dx=Math.sin(radians),dy=-Math.cos(radians),length=Math.abs(dx)*w+Math.abs(dy)*h;
        const fromX=.5-dx*length/(2*w),fromY=.5-dy*length/(2*h),toX=.5+dx*length/(2*w),toY=.5+dy*length/(2*h);
        if([fromX,fromY,toX,toY].some(v=>v<0||v>1)){warnings.add('斜向渐变按当前矩形方向近似，请核对');return {fromX:Math.max(0,Math.min(1,fromX)),fromY:Math.max(0,Math.min(1,fromY)),toX:Math.max(0,Math.min(1,toX)),toY:Math.max(0,Math.min(1,toY)),stops};}
        return {fromX,fromY,toX,toY,stops};
      };
      const image=async(el:Element,rect:DOMRect)=>{
        if(el instanceof HTMLImageElement){const src=el.currentSrc||el.src;if(/^data:image\/(png|jpeg);base64,/i.test(src)&&src.length<=1400000)return src;warnings.add('远程/本地路径图片未读取；请使用内嵌 PNG/JPEG');return undefined;}
        if(el instanceof HTMLCanvasElement){try{if(el.width>1024||el.height>1024)throw Error();warnings.add('Canvas 图表按当前状态保存为图片，不是可编辑图元');return el.toDataURL('image/png');}catch{warnings.add('Canvas 图表不可读取或过大，未导出');return undefined;}}
        if(el instanceof SVGSVGElement){
          if(el.querySelector('script,foreignObject,image,use,style')||Array.from(el.querySelectorAll('*')).some(n=>Array.from(n.attributes).some(a=>/(?:href|src)/i.test(a.name)&&!a.value.startsWith('#')))){warnings.add('包含外部引用或不安全内容的 SVG 未导出');return undefined;}
          const clone=el.cloneNode(true) as SVGSVGElement;clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width',String(rect.width));clone.setAttribute('height',String(rect.height));
          const original=[el,...Array.from(el.querySelectorAll('*'))],copies=[clone,...Array.from(clone.querySelectorAll('*'))];
          copies.forEach((n,i)=>{for(const a of Array.from(n.attributes))if(/^on/i.test(a.name))n.removeAttribute(a.name);const s=getComputedStyle(original[i]);for(const k of ['fill','stroke','stroke-width','opacity'])n.setAttribute(k,s.getPropertyValue(k));});
          const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.min(1024,Math.ceil(rect.width*2)));canvas.height=Math.max(1,Math.min(1024,Math.ceil(rect.height*2)));
          const url='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(new XMLSerializer().serializeToString(clone))));
          const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(Error('SVG 渲染失败'));img.src=url;});canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);warnings.add('HTML 中的 SVG 图标保留为单独图片图层；其余文字/形状仍可编辑');return canvas.toDataURL('image/png');
        }
        return undefined;
      };
      const visit=async(el:Element,parentId:string,parentRect:{left:number;top:number})=>{
        if(['SCRIPT','STYLE','LINK','META','NOSCRIPT','TEMPLATE','HEAD'].includes(el.tagName))return;
        const s=getComputedStyle(el),r=el.getBoundingClientRect();if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0)return;
        if(r.width<1||r.height<1){for(const child of Array.from(el.children))await visit(child,parentId,parentRect);return;}
        if(r.width>8192||r.height>8192)throw Error('部分容器超出尺寸上限，请缩小或分页面导出');
        if(s.transform!=='none'&&!/^matrix\(1, 0, 0, 1,/.test(s.transform))warnings.add('旋转/缩放按当前包围盒保存，请核对');
        if(s.filter!=='none'||s.backdropFilter!=='none')warnings.add('模糊或滤镜不转换，保留底层可编辑图层');
        for(const pseudo of ['::before','::after']){const c=getComputedStyle(el,pseudo).content;if(c&&c!=='none'&&c!=='normal')warnings.add('伪元素内容可能未导出，请核对图标和装饰');}
        const id='html-node-'+(++sequence);const name=(el.getAttribute('aria-label')||el.id||el.tagName.toLowerCase()).slice(0,120);
        const base={id,parentId,name,x:r.left-parentRect.left,y:r.top-parentRect.top,width:r.width,height:r.height,opacity:Number(s.opacity),radius:Math.min(parseFloat(s.borderTopLeftRadius)||0,r.width/2,r.height/2),fill:color(s.backgroundColor),stroke:color(s.borderTopColor),strokeWidth:Math.min(24,parseFloat(s.borderTopWidth)||0),shadows:shadows(s.boxShadow),gradient:gradient(s.backgroundImage,r.width,r.height)};
        const data=await image(el,r);
        if(data){if(data.length>1400000)throw Error('单张图标/图片导出超限');add({...base,kind:'image',imageData:data});return;}
        if(el instanceof SVGSVGElement||el instanceof HTMLCanvasElement||el instanceof HTMLImageElement)return;
        add({...base,kind:'frame',clip:s.overflowX!=='visible'||s.overflowY!=='visible'});
        const textStyle={fontFamily:s.fontFamily.split(',')[0].replace(/["']/g,'').slice(0,80),fontSize:Math.max(8,Math.min(256,parseFloat(s.fontSize)||14)),fontWeight:([400,500,600,700].reduce((a,b)=>Math.abs(b-Number(s.fontWeight))<Math.abs(a-Number(s.fontWeight))?b:a,400)),color:color(s.color),lineHeight:Math.min(512,parseFloat(s.lineHeight)||parseFloat(s.fontSize)*1.4),letterSpacing:Math.max(-20,Math.min(100,parseFloat(s.letterSpacing)||0))};
        if(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement||el instanceof HTMLSelectElement){warnings.add('表单控件导出当前值/占位文本，不保留原生控件行为');const text=el instanceof HTMLInputElement&&el.type==='password'?'••••':el.value||('placeholder' in el?el.placeholder:'');if(text)add({id:id+'-value',kind:'text',parentId:id,x:parseFloat(s.paddingLeft)||0,y:parseFloat(s.paddingTop)||0,width:r.width,height:r.height,text,...textStyle});return;}
        for(const child of Array.from(el.childNodes)){
          if(child.nodeType===Node.ELEMENT_NODE){await visit(child as Element,id,r);continue;}
          if(child.nodeType!==Node.TEXT_NODE||!child.textContent?.trim())continue;
          const range=document.createRange();range.selectNodeContents(child);const tr=range.getBoundingClientRect();if(tr.width<1||tr.height<1)continue;
          const text=s.whiteSpace.startsWith('pre')?child.textContent:child.textContent.replace(/\s+/g,' ');
          add({id:'html-text-'+(++sequence),kind:'text',parentId:id,x:tr.left-r.left,y:tr.top-r.top,width:Math.min(8192,tr.width+.5),height:Math.min(8192,Math.max(tr.height,textStyle.lineHeight)),text,...textStyle});
        }
      };
      await visit(document.body,'html-screen',{left:-scrollX,top:-scrollY});
      const bg=color(getComputedStyle(document.body).backgroundColor);
      const doc={schemaVersion:1,id:'html-capture',name:(document.title||'HTML 当前静态设计').slice(0,120),startScreenId:'html-screen',screens:[{id:'html-screen',name:'当前页面 / 静态状态',width,height,background:transparent(bg)?'#ffffff':bg}],nodes,interactions:[]};
      const result={channel,kind:'result',id,prototype:doc,warnings:['仅导出当前页面和当前可见状态；隐藏页面、动效与事件逻辑仍保留在原 HTML 中。',...warnings]};
      if(JSON.stringify(result).length>2100000)throw Error('当前页面设计数据过大，请拆分后导出');
      parent.postMessage(result,'*');
    }catch(error){parent.postMessage({channel,kind:'result',id,error:String(error).slice(0,1000)},'*');}
  });
}
export const HTML_DESIGN_CAPTURE_SCRIPT='('+installHtmlDesignCapture.toString()+')();';
export type CapturedHtmlDesign = { prototype:PrototypeDocument; warnings:string[] };
/** Correlated request/response only. A frame response grants no native/file/tool permission. */
export function captureHtmlDesign(frame:HTMLIFrameElement):Promise<CapturedHtmlDesign>{
  const source=frame.contentWindow;if(!source)return Promise.reject(Error('预览尚未加载'));
  const id=crypto.randomUUID();return new Promise((resolve,reject)=>{
    const timer=window.setTimeout(()=>{cleanup();reject(Error('页面未响应静态导出，请刷新预览后重试'));},10000);
    const cleanup=()=>{window.clearTimeout(timer);window.removeEventListener('message',receive);};
    const receive=(event:MessageEvent)=>{
      if(event.source!==source||event.origin!=='null'||event.data?.channel!=='drawer-static-design-v1'||event.data?.kind!=='result'||event.data?.id!==id)return;
      cleanup();try{
        if(event.data.error)throw Error(String(event.data.error).slice(0,1000));
        if(JSON.stringify(event.data).length>2100000)throw Error('导出响应超限');
        const prototype=parsePrototype(event.data.prototype);
        const warnings=Array.isArray(event.data.warnings)?event.data.warnings.filter((w:unknown):w is string=>typeof w==='string').slice(0,16).map((w:string)=>w.slice(0,500)):[];
        resolve({prototype,warnings});
      }catch(error){reject(error);}
    };
    window.addEventListener('message',receive);source.postMessage({channel:'drawer-static-design-v1',kind:'request',id},'*');
  });
}
