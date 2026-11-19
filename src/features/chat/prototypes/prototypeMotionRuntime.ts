/** Fixed, data-only animation player. It never evaluates model JavaScript. */
export const PROTOTYPE_MOTION_RUNTIME = String.raw`
const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
const activeMotion=new Map();
const easingNames={standard:'cubic-bezier(.2,0,.2,1)','ease-in':'ease-in','ease-out':'ease-out','ease-in-out':'ease-in-out',linear:'linear'};
function playMotion(el,m){
 if(!el||reducedMotion.matches||!el.getClientRects().length||m.duration===0)return;
 const old=activeMotion.get(el);if(old)old();
 const distance=m.distance??16;
 if(m.effect==='count-up'){
  const final=el.textContent;const match=final.match(/^([^0-9]*)([0-9][0-9,]*(?:\.[0-9]+)?)([^0-9]*)$/);if(!match)return;
  const value=Number(match[2].replace(/,/g,''));if(!Number.isFinite(value))return;
  const decimals=(match[2].split('.')[1]||'').length;if(decimals>20)return;let raf=0,cancelled=false,start=null;
  const finish=()=>{cancelled=true;cancelAnimationFrame(raf);el.textContent=final;activeMotion.delete(el)};
  const tick=now=>{if(cancelled)return;if(start===null)start=now+(m.delay||0);if(now<start){raf=requestAnimationFrame(tick);return}
    const p=Math.min(1,(now-start)/m.duration);el.textContent=match[1]+(value*(1-Math.pow(1-p,3))).toLocaleString('en-US',{minimumFractionDigits:decimals,maximumFractionDigits:decimals,useGrouping:match[2].includes(',')})+match[3];
    if(p<1)raf=requestAnimationFrame(tick);else finish()};activeMotion.set(el,finish);raf=requestAnimationFrame(tick);return;
 }
 let first={opacity:0},last={opacity:1};
 if(m.effect.startsWith('slide-')){const transforms={'slide-up':'translateY('+distance+'px)','slide-down':'translateY(-'+distance+'px)','slide-left':'translateX('+distance+'px)','slide-right':'translateX(-'+distance+'px)'};first={opacity:0,transform:transforms[m.effect]};last={opacity:1,transform:'none'}}
 if(m.effect==='scale'){first={transform:'scale(.94)'};last={transform:'scale(1)'}}
 if(m.effect==='grow-x'||m.effect==='grow-y'){first={transform:m.effect==='grow-x'?'scaleX(0)':'scaleY(0)',transformOrigin:m.effect==='grow-x'?'left center':'center bottom'};last={transform:'none'}}
 if(m.trigger!=='enter'&&m.effect==='fade')first={opacity:.7};
 const frames=m.trigger==='enter'?[first,last]:[last,first,last];
 const animation=el.animate(frames,{duration:m.duration,delay:m.delay||0,easing:easingNames[m.easing||'standard'],fill:'none'});
 const finish=()=>{animation.cancel();activeMotion.delete(el)};activeMotion.set(el,finish);animation.onfinish=finish;
}
function enterMotion(scope){for(const m of data.motions||[]){if(m.trigger!=='enter')continue;const el=scope.matches('[data-node="'+m.targetId+'"]')?scope:scope.querySelector('[data-node="'+m.targetId+'"]');playMotion(el,m)}}
function eventMotion(event,trigger){const node=event.target.closest('[data-node]');if(!node)return;for(const m of data.motions||[])if(m.trigger===trigger){const target=node.closest('[data-node="'+m.targetId+'"]');if(target)playMotion(target,m)}}
document.addEventListener('pointerdown',event=>eventMotion(event,'press'));
document.addEventListener('pointerover',event=>{if(!event.relatedTarget||!event.target.contains(event.relatedTarget))eventMotion(event,'hover')});
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)for(const finish of Array.from(activeMotion.values()))finish()});
`;
