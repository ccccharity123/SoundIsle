import {viewport,clampIsland} from './viewport.js';
export function mountMobile({root,island,nav,onResume}){
 const W=window,D=document;let start=null,moved=false,suppress=false,raf=0;
 const key='capricorn_island_position';
 function clamp(x,y){const r=island.getBoundingClientRect();return clampIsland(viewport(W),x,y,r.width,r.height)}
 function place(x,y){const p=clamp(x,y);root.style.left=p.x+'px';root.style.top=p.y+'px';root.style.right='auto';return p}
 function fit(){if(!nav.hidden)return;const r=island.getBoundingClientRect();place(r.left,r.top)}
 try{const p=JSON.parse(localStorage.getItem(key));if(Number.isFinite(p?.x)&&Number.isFinite(p?.y))place(p.x,p.y)}catch{}
 function down(e){if(!nav.hidden||e.button!==0)return;const r=island.getBoundingClientRect();start={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};moved=false;suppress=false;try{island.setPointerCapture(e.pointerId)}catch{}}
 function move(e){if(!start||e.pointerId!==start.id)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(!moved&&Math.hypot(dx,dy)<8)return;moved=true;place(start.left+dx,start.top+dy)}
 function end(e){if(!start||e.pointerId!==start.id)return;if(moved){suppress=true;const r=island.getBoundingClientRect();try{localStorage.setItem(key,JSON.stringify({x:r.left,y:r.top}))}catch{}}start=null}
 function resize(){cancelAnimationFrame(raf);raf=requestAnimationFrame(fit)}
 function visible(){if(!D.hidden){resize();onResume()}}
 let ro=null;
 if(typeof ResizeObserver!=='undefined'){ro=new ResizeObserver(()=>{if(!start&&nav.hidden&&root.style.left)resize()});ro.observe(island)}
 island.addEventListener('pointerdown',down);island.addEventListener('pointermove',move);island.addEventListener('pointerup',end);island.addEventListener('pointercancel',end);W.addEventListener('resize',resize);W.visualViewport?.addEventListener('resize',resize);W.visualViewport?.addEventListener('scroll',resize);D.addEventListener('visibilitychange',visible);
 return {fit,consumeDrag(){const v=suppress;suppress=false;return v},destroy(){ro?.disconnect();cancelAnimationFrame(raf);island.removeEventListener('pointerdown',down);island.removeEventListener('pointermove',move);island.removeEventListener('pointerup',end);island.removeEventListener('pointercancel',end);W.removeEventListener('resize',resize);W.visualViewport?.removeEventListener('resize',resize);W.visualViewport?.removeEventListener('scroll',resize);D.removeEventListener('visibilitychange',visible)}}
}
