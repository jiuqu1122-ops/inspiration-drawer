import type { PrototypeNode } from './prototypeSchema';
export function prototypeGradientCss(node: PrototypeNode): string | undefined {
  const g = node.gradient; if (!g) return undefined;
  const dx=(g.toX-g.fromX)*node.width, dy=(g.toY-g.fromY)*node.height;
  const length=Math.hypot(dx,dy); if (!length) return g.stops[g.stops.length-1].color;
  const ux=dx/length,uy=dy/length,extent=Math.abs(ux)*node.width+Math.abs(uy)*node.height;
  const start=((g.fromX-.5)*node.width*ux+(g.fromY-.5)*node.height*uy+extent/2)/extent;
  return 'linear-gradient('+ (Math.atan2(dx,-dy)*180/Math.PI)+'deg,'+g.stops.map(s=>s.color+' '+((start+s.offset*length/extent)*100)+'%').join(',')+')';
}
export const prototypeShadowCss = (node: PrototypeNode) => node.shadows?.map(s=>[s.inset?'inset':'',s.x+'px',s.y+'px',s.blur+'px',s.spread+'px',s.color].filter(Boolean).join(' ')).join(',');
export function prototypeVectorPath(node: PrototypeNode) {
  const points=node.points!.map(p=>({...p,x:p.x*node.width,y:p.y*node.height,inX:p.inX===undefined?undefined:p.inX*node.width,inY:p.inY===undefined?undefined:p.inY*node.height,outX:p.outX===undefined?undefined:p.outX*node.width,outY:p.outY===undefined?undefined:p.outY*node.height}));const [first]=points;
  let d='M '+first.x+' '+first.y;
  const segment=(from: typeof first,to: typeof first)=>from.outX!==undefined||to.inX!==undefined
    ? ' C '+(from.outX??from.x)+' '+(from.outY??from.y)+' '+(to.inX??to.x)+' '+(to.inY??to.y)+' '+to.x+' '+to.y
    : ' L '+to.x+' '+to.y;
  for(let i=1;i<points.length;i++)d+=segment(points[i-1],points[i]);
  if(node.closed)d+=segment(points[points.length-1],first)+' Z';
  return d;
}
