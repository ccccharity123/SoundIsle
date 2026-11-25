export function viewport(w){const v=w.visualViewport;const positive=(n,f)=>Number.isFinite(n)&&n>0?n:f;return {x:Number.isFinite(v?.offsetLeft)?v.offsetLeft:0,y:Number.isFinite(v?.offsetTop)?v.offsetTop:0,w:positive(v?.width,positive(w.innerWidth,1)),h:positive(v?.height,positive(w.innerHeight,1))};}
export function clampIsland(v,x,y,w,h){const axis=(o,s,n,p)=>Math.max(o+Math.min(8,s/2),Math.min(o+Math.max(Math.min(8,s/2),s-n-8),p));return {x:axis(v.x,v.w,w,x),y:axis(v.y,v.h,h,y)};}
export function playerRect(v, size, insets = {}, bilingual = false) {
  const mx = Math.min(12, v.w / 4);
  const my = Math.min(12, v.h / 4);
  const left = Math.max(mx, Math.min(v.w / 3, insets.left || 0));
  const right = Math.max(mx, Math.min(v.w / 3, insets.right || 0));
  const top = Math.max(my, Math.min(v.h / 3, insets.top || 0));
  const reserved = Math.max(insets.bottom || 0, insets.composer || 0);
  const bottom = Math.min(v.h - top, my + reserved);
  const available = Math.max(0, v.h - top - bottom);
  const desired = size === 'compact' ? (bilingual ? 170 : 152) :
    size === 'large' ? v.h * .85 : Math.max(340, v.h * .5);
  const w = Math.min(480, v.w - left - right);
  const h = Math.min(desired, available);
  return { x: v.x + left + (v.w - left - right - w) / 2, y: v.y + v.h - h - bottom, w, h };
}
